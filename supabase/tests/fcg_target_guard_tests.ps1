#Requires -Version 5.1
# Offline tests: every Docker call is intercepted. No daemon or database used.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\fcg_target_guard.ps1"
$script:id = 'a' * 64
$script:mode = 'ok'
$script:calls = 0
function docker {
    $script:calls++
    $global:LASTEXITCODE = 0
    if ($script:mode -eq 'offline') { $global:LASTEXITCODE=1; return 'offline' }
    if ($args[0] -eq 'ps') {
        if ($script:mode -eq 'empty') { return }
        if ($script:mode -eq 'ambiguous') { "$script:id|fixture|running"; "$script:id|fixture|running"; return }
        "$script:id|fixture|$(if($script:mode -eq 'stopped'){'exited'}else{'running'})"; return
    }
    if ($args[0] -eq 'inspect') {
        if ($args[-1] -match 'Labels') {
            if ($script:mode -eq 'badjson') { return 'not json' }
            $project = if($script:mode -eq 'protected'){'iaabxrclxpsagdijkrcx'}else{'isolated'}
            return (@{'com.supabase.cli.project'=$project} | ConvertTo-Json -Compress)
        }
        return '{"5432/tcp":[{"HostPort":"56322"}]}'
    }
    throw 'Unexpected Docker operation: no writes allowed in guard tests'
}
$base=@{Container='fixture';ExpectedProject='isolated';ExpectedPort=56322;ExpectedContainerId=$script:id}
$cases=@(
 @{Name='valid';Mode='ok';Change=@{};Ok=$true;Why='destino validado'},
 @{Name='empty container';Mode='ok';Change=@{Container=''};Why='nao informado'},
 @{Name='empty project';Mode='ok';Change=@{ExpectedProject=''};Why='nao informado'},
 @{Name='port invalid';Mode='ok';Change=@{ExpectedPort=0};Why='invalida'},
 @{Name='missing pinned ID';Mode='ok';Change=@{ExpectedContainerId=''};Why='ID completo'},
 @{Name='ID mismatch';Mode='ok';Change=@{ExpectedContainerId=('b'*64)};Why='ID divergente'},
 @{Name='protected name';Mode='ok';Change=@{Container='supabase_db_iaabxrclxpsagdijkrcx'};Why='proibido';NoDocker=$true},
 @{Name='protected project';Mode='ok';Change=@{ExpectedProject='iaabxrclxpsagdijkrcx'};Why='proibido';NoDocker=$true},
 @{Name='offline';Mode='offline';Change=@{};Why='falhou'},
 @{Name='empty inventory';Mode='empty';Change=@{};Why='vazio'},
 @{Name='ambiguous';Mode='ambiguous';Change=@{};Why='ambiguidade'},
 @{Name='absent';Mode='ok';Change=@{Container='missing'};Why='nenhum container'},
 @{Name='wrong label';Mode='protected';Change=@{};Why='divergente'},
 @{Name='bad JSON';Mode='badjson';Change=@{};Why='falhou'},
 @{Name='wrong port';Mode='ok';Change=@{ExpectedPort=5432};Why='divergente'},
 @{Name='stopped';Mode='stopped';Change=@{};Why='nao esta em execucao'}
)
foreach($c in $cases){
    $script:mode=$c.Mode; $script:calls=0
    $p=$base.Clone(); foreach($k in $c.Change.Keys){$p[$k]=$c.Change[$k]}
    $r=Test-FcgTarget @p
    $expectedOk=$c.ContainsKey('Ok') -and $c.Ok
    if($r.Ok -ne $expectedOk -or $r.Motivo -notmatch $c.Why){throw "$($c.Name): unexpected result $($r.Motivo)"}
    if($c.ContainsKey('NoDocker') -and $script:calls -ne 0){throw 'Protected target queried Docker'}
    Write-Host "PASS $($c.Name)"
}
Write-Host "$($cases.Count) offline target checks passed"
