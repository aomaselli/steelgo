#Requires -Version 5.1
<#
================================================================================
 fcg_run_privilege_closure.ps1
================================================================================
 Executa os dois testes sinteticos do fechamento de acesso da Fase 1A:

   fcg_privilege_closure.sql    as cinco tabelas novas estao fechadas a anon,
                                a authenticated para escrita e a PUBLIC, e a
                                unica funcao da 1/3 nao tem EXECUTE aberto.
                                Detecta a fase; serve antes e depois da 2/3.

   fcg_migration_atomicity.sql  a 1/3 permanece aplicada e sem residuo depois
                                que uma migration posterior falha. Exige a
                                orquestracao de -ComprovarAtomicidade.

 DESTINO: validado pelo guarda existente (fcg_target_guard.ps1). Nenhum ID de
 container esta escrito aqui -- todos vem por parametro, como nas demais
 suites. O projeto protegido e recusado pelo guarda.

 SAIDA DE PROCESSO: lida pelo modulo validado fcg_process.ps1, onde ausencia de
 codigo de saida NUNCA e tratada como sucesso.

 Uso tipico, em instancia descartavel com somente a 1/3 aplicada:

   powershell -NoProfile -File .\fcg_run_privilege_closure.ps1 `
     -Container supabase_db_<projeto> -ExpectedProject <projeto> `
     -ExpectedPort <porta> -ExpectedContainerId <64 hexadecimais> `
     -ComprovarAtomicidade -ProjectDirectory <dir do projeto descartavel>

 Sem -ComprovarAtomicidade, roda apenas o teste de fechamento e nao toca em
 nenhum diretorio de migrations.
================================================================================
#>
[CmdletBinding()]
param(
    [string]$Container = '',
    [string]$ExpectedProject = '',
    [int]$ExpectedPort = 0,
    [string]$ExpectedContainerId = '',
    [switch]$VerifyOnly,
    [switch]$ComprovarAtomicidade,
    # Diretorio do projeto Supabase DESCARTAVEL (o que contem supabase/config.toml).
    # Exigido apenas por -ComprovarAtomicidade, que precisa aplicar a fixture de
    # falha por `supabase migration up`.
    [string]$ProjectDirectory = '',
    # Como lancar o CLI do Supabase. O padrao passa por cmd.exe porque `npx` no
    # Windows e script (.cmd/.ps1) e CreateProcess nao executa script -- o
    # modulo de processos usa System.Diagnostics com UseShellExecute=false, de
    # proposito, para que o codigo de saida seja confiavel. Substitua por
    # @('<caminho>\supabase.exe') se houver binario direto.
    [string[]]$SupabaseCommand = @('cmd.exe', '/c', 'npx', 'supabase'),
    [int]$TimeoutMs = 300000,
    [string]$LogDirectory = (Join-Path ([IO.Path]::GetTempPath()) ('fcg-closure-' + [guid]::NewGuid().ToString('N')))
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. "$PSScriptRoot\fcg_target_guard.ps1"
. "$PSScriptRoot\fcg_process.ps1"

# Versao da fixture de falha: entre a 1/3 (20260925120000) e a 2/3 (20260925120100).
$script:FixtureVersao = '20260925120050'
$script:FixtureNome   = $script:FixtureVersao + '_fcg_failure_fixture.sql'

$id = Assert-FcgTarget -Container $Container -ExpectedProject $ExpectedProject `
                       -ExpectedPort $ExpectedPort -ExpectedContainerId $ExpectedContainerId
if ($VerifyOnly) { Write-Host 'Destino validado; nenhum SQL executado'; exit 0 }

if (Test-Path -LiteralPath $LogDirectory) { throw 'Diretorio de logs ja existe; escolha um novo.' }
New-Item -ItemType Directory -Path $LogDirectory | Out-Null

function Assert-FcgDisposableProject {
    <#
      Amarra o diretorio de migrations ao container ja validado. Sem isso, um
      -ProjectDirectory errado faria a fixture de falha ser aplicada em outro
      lugar.
    #>
    param([string]$Directory, [string]$Project)
    if ([string]::IsNullOrWhiteSpace($Directory)) {
        throw '-ComprovarAtomicidade exige -ProjectDirectory'
    }
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        throw "ProjectDirectory inexistente: $Directory"
    }
    $resolved = (Resolve-Path -LiteralPath $Directory).ProviderPath.TrimEnd('\', '/')

    # Nunca na arvore do repositorio: a fixture de falha nao entra em
    # supabase/migrations/ versionado, em nenhuma circunstancia.
    $repoRoot = (Resolve-Path -LiteralPath (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))).ProviderPath.TrimEnd('\', '/')
    if ($resolved -eq $repoRoot -or $resolved.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "ProjectDirectory esta dentro do repositorio ($repoRoot); recusado"
    }

    $config = Join-Path $resolved 'supabase\config.toml'
    if (-not (Test-Path -LiteralPath $config)) { throw "config.toml ausente em $config" }
    $declarado = ''
    foreach ($linha in (Get-Content -LiteralPath $config)) {
        $m = [regex]::Match($linha, '^\s*project_id\s*=\s*"([^"]+)"')
        if ($m.Success) { $declarado = $m.Groups[1].Value; break }
    }
    if ($declarado -eq '') { throw "project_id nao declarado em $config" }
    if ($declarado -eq 'iaabxrclxpsagdijkrcx') { throw 'project_id na lista de negacao; recusado' }
    if ($declarado -ne $Project) {
        throw "project_id do diretorio ($declarado) difere do destino validado ($Project)"
    }
    $migrations = Join-Path $resolved 'supabase\migrations'
    if (-not (Test-Path -LiteralPath $migrations -PathType Container)) {
        throw "diretorio de migrations ausente em $migrations"
    }
    return [pscustomobject]@{ Root = $resolved; Migrations = $migrations }
}

function Invoke-FcgSqlSuite {
    <#
      Copia a suite para o container, executa com ON_ERROR_STOP ativo e exige
      todas as assercoes numeradas aprovadas mais o marcador final.

      A validacao espelha fcg_run_suites.ps1 de proposito, incluindo o uso de
      -cmatch: o operador -match do PowerShell ignora caixa por padrao, e o
      produto emite avisos legitimos em minusculas que nao podem reprovar uma
      suite cujas assercoes passaram.
    #>
    param([string]$Suite, [string]$ContainerId, [string]$Logs, [string]$Rotulo, [int]$Timeout)

    $source = Join-Path $PSScriptRoot $Suite
    if (-not (Test-Path -LiteralPath $source)) { throw "Suite ausente: $source" }
    $sql = Get-Content -LiteralPath $source -Raw

    $expected = @([regex]::Matches($sql, "(?im)raise\s+notice\s+'([A-Z]?\d+(?:\.\d+)*)\.?\s") |
                  ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    if ($expected.Count -eq 0) { throw "Suite sem assercoes identificadas: $Suite" }

    $sql = [regex]::Replace($sql, '(?im)^\s*\\set\s+ON_ERROR_STOP\s+off\s*$', '\set ON_ERROR_STOP on')
    $sql += "`n\echo FCG_SUITE_COMPLETED`n"

    $executionFile = Join-Path $Logs ("$Rotulo-$Suite")
    [IO.File]::WriteAllText($executionFile, $sql, (New-Object Text.UTF8Encoding($false)))

    $remote = '/tmp/fcg-' + [guid]::NewGuid().ToString('N') + '.sql'
    $cp = Start-FcgProcess -FilePath docker -Arguments @('cp', $executionFile, "${ContainerId}:$remote") -Rotulo "cp-$Rotulo"
    $rcp = Wait-FcgProcess -Sessao $cp -TimeoutMs $Timeout -Aceitos @(0)

    $run = Start-FcgProcess -FilePath docker -Arguments @(
        'exec', $ContainerId, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
        '-U', 'postgres', '-d', 'postgres', '-f', $remote) -Rotulo "psql-$Rotulo"
    $r = Wait-FcgProcess -Sessao $run -TimeoutMs $Timeout -Aceitos @(0)

    [IO.File]::WriteAllText((Join-Path $Logs "$Rotulo-$Suite.out.log"), $r.Out, (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $Logs "$Rotulo-$Suite.err.log"), $r.Err, (New-Object Text.UTF8Encoding($false)))

    $text = $r.Out + "`n" + $r.Err
    if ($text -cmatch '(?m)^[^\r\n]*?\b(?:ERROR|FATAL|PANIC):') { throw 'Erro do servidor na saida' }
    if ($r.Err -cmatch '(?m)\bFALHOU\b') { throw 'Assercao reprovada na saida' }
    if ($r.Err -cmatch '(?m)\bSEM DADOS\b') { throw 'Verificacao nao exercitada (SEM DADOS)' }
    if ($r.Out -notmatch '(?m)^FCG_SUITE_COMPLETED\r?$') { throw 'Marcador de conclusao ausente' }

    $approved = 0
    foreach ($assertion in $expected) {
        $pattern = '(?m)^.*NOTICE:\s+' + [regex]::Escape($assertion) + '\.?\s[^\r\n]*\r?$'
        $lines = @([regex]::Matches($r.Err, $pattern))
        if ($lines.Count -ne 1 -or $lines[0].Value -notmatch '\bOK\b') {
            throw "Assercao $assertion ausente, duplicada ou nao aprovada"
        }
        $approved++
    }
    return [pscustomobject]@{
        Etapa = $Rotulo; Suite = $Suite; CopyExit = $rcp.ExitCode
        ProcessExit = $r.ExitCode; Expected = $expected.Count; Approved = $approved
    }
}

$resultados = @()
$falhas = 0

function Add-FcgResultado {
    param([string]$Etapa, [string]$Suite, [scriptblock]$Acao)
    try {
        $r = & $Acao
        $script:resultados += $r
        Write-Host ("{0,-22} {1,-34} {2}/{3}" -f $r.Etapa, $r.Suite, $r.Approved, $r.Expected)
    } catch {
        $script:falhas++
        $script:resultados += [pscustomobject]@{
            Etapa = $Etapa; Suite = $Suite; CopyExit = $null; ProcessExit = $null
            Expected = $null; Approved = 0; Failure = $_.Exception.Message
        }
        Write-Host ("{0,-22} {1,-34} FALHA: {2}" -f $Etapa, $Suite, $_.Exception.Message)
    }
}

# --- 1. Fechamento, no estado atual do banco -------------------------------
Add-FcgResultado -Etapa 'fechamento' -Suite 'fcg_privilege_closure.sql' -Acao {
    Invoke-FcgSqlSuite -Suite 'fcg_privilege_closure.sql' -ContainerId $id `
                       -Logs $LogDirectory -Rotulo 'fechamento' -Timeout $TimeoutMs
}

# --- 2. Atomicidade, com falha deliberada ---------------------------------
if ($ComprovarAtomicidade) {
    $proj = Assert-FcgDisposableProject -Directory $ProjectDirectory -Project $ExpectedProject
    Write-Host "projeto descartavel conferido: $($proj.Root)"

    $fixtureOrigem  = Join-Path $PSScriptRoot ('fixtures\fcg_failure_fixture.sql')
    if (-not (Test-Path -LiteralPath $fixtureOrigem)) { throw "Fixture ausente: $fixtureOrigem" }
    $fixtureDestino = Join-Path $proj.Migrations $script:FixtureNome
    if (Test-Path -LiteralPath $fixtureDestino) { throw "Fixture residual em $fixtureDestino; remova antes de repetir" }

    try {
        Copy-Item -LiteralPath $fixtureOrigem -Destination $fixtureDestino
        if ($SupabaseCommand.Count -lt 1) { throw '-SupabaseCommand vazio' }
        $launcher = $SupabaseCommand[0]
        $prefixo = @()
        if ($SupabaseCommand.Count -gt 1) { $prefixo = $SupabaseCommand[1..($SupabaseCommand.Count - 1)] }
        # --workdir e "usado exatamente como dado, sem busca em diretorio
        # ancestral", conforme o help do CLI: nenhuma dependencia do diretorio
        # corrente do executor.
        $up = Start-FcgProcess -FilePath $launcher -Arguments (
            $prefixo + @('migration', 'up', '--local', '--workdir', $proj.Root)) -Rotulo 'migration-up'
        # Aceita QUALQUER codigo: o proprio desfecho e a assercao, avaliada abaixo.
        $rup = Wait-FcgProcess -Sessao $up -TimeoutMs $TimeoutMs -Aceitos @(0, 1, 2, 3)
        [IO.File]::WriteAllText((Join-Path $LogDirectory 'migration-up.out.log'), $rup.Out, (New-Object Text.UTF8Encoding($false)))
        [IO.File]::WriteAllText((Join-Path $LogDirectory 'migration-up.err.log'), $rup.Err, (New-Object Text.UTF8Encoding($false)))

        if ($rup.ExitCode -eq 0) {
            $falhas++
            Write-Host 'FALHA: migration up devolveu 0; a fixture de falha nao falhou e o cenario nao foi exercitado'
        } else {
            Write-Host "migration up falhou como esperado (exit $($rup.ExitCode))"
        }
    } finally {
        # Remove a injecao mesmo se algo acima falhar: fixture residual
        # contaminaria qualquer `migration up` posterior no projeto.
        if (Test-Path -LiteralPath $fixtureDestino) { Remove-Item -LiteralPath $fixtureDestino -Force }
        if (Test-Path -LiteralPath $fixtureDestino) { throw "Nao foi possivel remover $fixtureDestino" }
    }

    Add-FcgResultado -Etapa 'atomicidade' -Suite 'fcg_migration_atomicity.sql' -Acao {
        Invoke-FcgSqlSuite -Suite 'fcg_migration_atomicity.sql' -ContainerId $id `
                           -Logs $LogDirectory -Rotulo 'atomicidade' -Timeout $TimeoutMs
    }

    # O ponto do exercicio: o fechamento continua valendo DEPOIS da falha.
    Add-FcgResultado -Etapa 'fechamento-pos-falha' -Suite 'fcg_privilege_closure.sql' -Acao {
        Invoke-FcgSqlSuite -Suite 'fcg_privilege_closure.sql' -ContainerId $id `
                           -Logs $LogDirectory -Rotulo 'fechamento-pos-falha' -Timeout $TimeoutMs
    }
}

$resultados | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $LogDirectory 'results.json') -Encoding utf8
Write-Host "Logs preservados: $LogDirectory"
if ($falhas -gt 0) { Write-Host "VEREDITO: $falhas etapa(s) falharam ou ficaram incompletas"; exit 1 }
Write-Host 'VEREDITO: fechamento de acesso comprovado'
exit 0
