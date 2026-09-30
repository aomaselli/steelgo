#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Container = '', [string]$ExpectedProject = '', [int]$ExpectedPort = 0,
    [string]$ExpectedContainerId = '', [switch]$VerifyOnly,
    [string]$LogDirectory = (Join-Path ([IO.Path]::GetTempPath()) ('fcg-suites-' + [guid]::NewGuid().ToString('N')))
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. "$PSScriptRoot\fcg_target_guard.ps1"
$id = Assert-FcgTarget -Container $Container -ExpectedProject $ExpectedProject -ExpectedPort $ExpectedPort -ExpectedContainerId $ExpectedContainerId
if ($VerifyOnly) { Write-Host 'Destino validado; nenhum SQL executado'; exit 0 }
if (Test-Path -LiteralPath $LogDirectory) { throw 'Diretorio de logs ja existe; escolha um novo.' }
New-Item -ItemType Directory -Path $LogDirectory | Out-Null
$suites = @('fcg_phase1_checks.sql','fcg_behavioral.sql','fcg_rls_matrix.sql','fcg_observational_mode.sql','fcg_idempotency.sql','fcg_failure_containment.sql')
$failures = 0
$results = @()
foreach ($suite in $suites) {
    $reason = ''; $processExit = $null; $copyExit = $null
    $expected = @(); $approved = 0
    try {
        $source = Join-Path $PSScriptRoot $suite
        $sql = Get-Content -LiteralPath $source -Raw
        # Every numbered assertion must emit one successful NOTICE. B3 declares
        # the audit failure limit and must explicitly report "confirmado".
        $expected = @([regex]::Matches($sql, "(?im)raise\s+notice\s+'([A-Z]?\d+(?:\.\d+)*)\.?\s") | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
        if ($expected.Count -eq 0) { throw 'Suite sem assercoes identificadas' }
        # Only the execution copy changes; unexpected SQL errors stop psql.
        $sql = [regex]::Replace($sql, '(?im)^\s*\\set\s+ON_ERROR_STOP\s+off\s*$', '\set ON_ERROR_STOP on')
        $sql += "`n\echo FCG_SUITE_COMPLETED`n"
        $executionFile = Join-Path $LogDirectory $suite
        [IO.File]::WriteAllText($executionFile, $sql, (New-Object Text.UTF8Encoding($false)))
        $remote = '/tmp/fcg-' + [guid]::NewGuid().ToString('N') + '.sql'
        & docker cp $executionFile "${id}:$remote" 2>&1 | Out-File (Join-Path $LogDirectory "$suite.copy.log")
        $copyExit = $LASTEXITCODE
        if ($copyExit -ne 0) { throw "docker cp falhou (exit $copyExit); suite nao executada" }
        $stdout = Join-Path $LogDirectory "$suite.out.log"
        $stderr = Join-Path $LogDirectory "$suite.err.log"
        $p = Start-Process -FilePath docker -PassThru -Wait -NoNewWindow -ArgumentList @('exec',$id,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f',$remote) -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        $processExit = $p.ExitCode
        $outText = [string](Get-Content -LiteralPath $stdout -Raw)
        $errText = [string](Get-Content -LiteralPath $stderr -Raw)
        if ($processExit -ne 0) { throw "processo falhou (exit $processExit)" }
        $text = $outText + "`n" + $errText
        # Erro do SERVIDOR e resultado de ASSERCAO sao coisas distintas e
        # passam a ser avaliados separadamente.
        #
        # Por que -cmatch: o operador -match do PowerShell ignora caixa POR
        # PADRAO, entao retirar (?i) nao resolveria nada. Com -match, a palavra
        # "falhou" minuscula do WARNING legitimo do produto
        #   WARNING:  fcg observacional falhou (contrato ...): 22000 ...
        # que fcg_failure_containment.sql provoca de proposito, reprovava a
        # suite inteira embora as nove assercoes tivessem passado.
        if ($text -cmatch '(?m)^[^\r\n]*?\b(?:ERROR|FATAL|PANIC):') { throw 'Erro do servidor na saida' }
        # Os marcadores das suites sao MAIUSCULOS. WARNING do produto nao entra,
        # e uma assercao realmente reprovada continua bloqueando.
        if ($errText -cmatch '(?m)\bFALHOU\b') { throw 'Assercao reprovada na saida' }
        if ($errText -cmatch '(?m)\bSEM DADOS\b') { throw 'Verificacao nao exercitada (SEM DADOS)' }
        if ($outText -notmatch '(?m)^FCG_SUITE_COMPLETED\r?$') { throw 'Marcador de conclusao ausente' }
        foreach ($assertion in $expected) {
            $pattern = '(?m)^.*NOTICE:\s+' + [regex]::Escape($assertion) + '\.?\s[^\r\n]*\r?$'
            $lines = @([regex]::Matches($errText, $pattern))
            $success = if ($suite -eq 'fcg_failure_containment.sql' -and $assertion -eq 'B3') { '\bconfirmado\b' } else { '\bOK\b' }
            if ($lines.Count -ne 1 -or $lines[0].Value -notmatch $success) { throw "Assercao $assertion ausente, duplicada ou nao aprovada" }
            $approved++
        }
    } catch { $reason = $_.Exception.Message; $failures++ }
    $results += [pscustomobject]@{ Suite=$suite; CopyExit=$copyExit; ProcessExit=$processExit; Expected=$expected.Count; Approved=$approved; Failure=$reason }
    Write-Host "$suite : $approved/$($expected.Count) $reason"
}
$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $LogDirectory 'results.json') -Encoding utf8
Write-Host "Logs preservados: $LogDirectory"
if ($failures -gt 0) { Write-Host "VEREDITO: $failures suite(s) falharam ou ficaram incompletas"; exit 1 }
Write-Host 'VEREDITO: seis suites completas e aprovadas'
exit 0
