#Requires -Version 5.1
param([string]$Case = '')
$ErrorActionPreference='Stop'
# Integration tests execute the actual runner, replacing Docker and process
# launch with local doubles. Never contact a real Docker daemon.
if($Case){
    $global:FcgMockMode=$Case
    $global:FcgMockSource=''
    function docker {
        $global:LASTEXITCODE=0
        switch($args[0]){
            'ps' { return ((('a'*64))+'|fixture|running') }
            'inspect' {
                if($args[-1] -match 'Labels'){return '{"com.supabase.cli.project":"isolated"}'}
                return '{"5432/tcp":[{"HostPort":"56322"}]}'
            }
            'cp' {
                $global:FcgMockSource=$args[1]
                if($global:FcgMockMode -eq 'copy-failed'){$global:LASTEXITCODE=1;return 'copy failed'}
                return
            }
            default { throw 'Unexpected Docker call' }
        }
    }
    function Start-Process {
        param($FilePath,[switch]$PassThru,[switch]$Wait,[switch]$NoNewWindow,$ArgumentList,$RedirectStandardOutput,$RedirectStandardError)
        if($global:FcgMockMode -eq 'copy-failed'){throw 'Process launched after copy failure'}
        if($ArgumentList -notcontains 'ON_ERROR_STOP=1' -or $ArgumentList[1] -ne ('a'*64)){throw 'Missing strict SQL mode or pinned ID'}
        $sql=Get-Content -LiteralPath $global:FcgMockSource -Raw
        if($sql -match '(?im)^\s*\\set\s+ON_ERROR_STOP\s+off'){throw 'Suite overrides strict SQL mode'}
        $ids=@([regex]::Matches($sql,"(?im)raise\s+notice\s+'([A-Z]?\d+(?:\.\d+)*)\.?\s")|ForEach-Object{$_.Groups[1].Value}|Sort-Object -Unique)
        # Formato REAL do log do psql, com prefixo de arquivo e linha.
        $lines=@($ids | ForEach-Object {"psql:/tmp/fcg-mock.sql:42: NOTICE:  $_. assertion $(if($_ -eq 'B3' -and $global:FcgMockSource -match 'failure_containment'){'confirmado'}else{'OK'})"})
        $out='FCG_SUITE_COMPLETED';$ec=0
        switch($global:FcgMockMode){
            'empty' {$lines=@();$out=''}
            'exit-error' {$ec=2}
            'fatal' {$lines+= 'FATAL: connection failed'}
            # WARNING legitimo do produto, no formato exato do log real, com
            # TODAS as assercoes aprovadas: precisa PASSAR.
            'warning-esperado' {$lines=@('psql:/tmp/fcg-mock.sql:86: WARNING:  fcg observacional falhou (contrato 1912f834-a521-4f38-848d-cc887ad5d693): 22000 falha injetada pelo teste')+$lines}
            # Erro do servidor no formato real: precisa REPROVAR.
            'erro-servidor' {$lines+= 'psql:/tmp/fcg-mock.sql:33: ERROR:  null value in column "trip_id" violates not-null constraint'}
            # Saida incompleta: assercoes aprovadas, marcador final ausente.
            'saida-incompleta' {$out=''}
            'missing-assertion' {$lines=@($lines | Select-Object -Skip 1)}
            'duplicate-assertion' {$lines+=$lines[0]}
            'assertion-failed' {$lines[0]=$lines[0] -replace ' OK$',' FALHOU'}
            'skipped' {$lines[0]='NOTICE: SEM DADOS'}
            'no-completion' {$out=''}
            'audit-limit-unexpected' {$lines=@($lines|ForEach-Object{$_ -replace 'confirmado','inesperado'})}
        }
        Set-Content -LiteralPath $RedirectStandardOutput -Value $out
        Set-Content -LiteralPath $RedirectStandardError -Value ($lines -join "`n")
        return [pscustomobject]@{ExitCode=$ec}
    }
    & "$PSScriptRoot\fcg_run_suites.ps1" -Container fixture -ExpectedProject isolated -ExpectedPort 56322 -ExpectedContainerId ('a'*64)
    exit $LASTEXITCODE
}
$shell=(Get-Process -Id $PID).Path
# Casos que DEVEM terminar com exit 0. 'warning-esperado' e a regressao do
# falso negativo: aviso legitimo do produto nao pode reprovar suite aprovada.
$aprovados=@('pass','warning-esperado')
$cases=@('pass','warning-esperado','copy-failed','empty','exit-error','fatal','erro-servidor','missing-assertion','duplicate-assertion','assertion-failed','skipped','no-completion','saida-incompleta','audit-limit-unexpected')
foreach($c in $cases){
    $output=& $shell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Case $c 2>&1
    $code=$LASTEXITCODE
    $deveAprovar = $aprovados -contains $c
    if(($deveAprovar -and $code -ne 0) -or ((-not $deveAprovar) -and $code -eq 0)){ $output | Write-Output; throw "Incorrect verdict for $c (exit $code)" }
    Write-Host "PASS runner $c (exit $code, esperado $(if($deveAprovar){'aprovacao'}else{'reprovacao'}))"
}
Write-Host "$($cases.Count) offline runner scenarios passed"
