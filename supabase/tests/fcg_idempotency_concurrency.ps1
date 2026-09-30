#Requires -Version 5.1
<#
================================================================================
 fcg_idempotency_concurrency.ps1  -  F1 sob CONCORRENCIA REAL
================================================================================
 Duas sessoes PostgreSQL simultaneas e independentes, porque chamadas
 sequenciais nao exercitam a janela entre "nao encontrei" e o INSERT.

 Cada sessao roda em um processo proprio, com stdout e stderr redirecionados
 para arquivo. Capturar o stderr do psql importa: e nele que o conflito aparece.

 Cenarios:
   C1) MESMO request_id e MESMO payload, em paralelo
       -> exatamente UMA operacao; nenhuma sessao recebe erro.
   C2) request_ids DIFERENTES para o MESMO contrato, payloads DIFERENTES
       -> exatamente UMA operacao; a perdedora falha com conflito de
          parametros, NUNCA com 23505 cru nem com sucesso silencioso.
   C3) request_ids DIFERENTES para o MESMO contrato, payload IGUAL
       -> exatamente UMA operacao; nenhuma sessao recebe erro.

 Uso: powershell -ExecutionPolicy Bypass -File .\fcg_idempotency_concurrency.ps1 -Container <nome> -ExpectedProject <projeto> -ExpectedPort <porta> -ExpectedContainerId <id-completo>
 Saida 0 se todos passarem; 1 caso contrario.
================================================================================
#>
[CmdletBinding()]
param(
    [AllowEmptyString()] [string]$Container = '',
    [AllowEmptyString()] [string]$ExpectedProject = '',
    [int]$ExpectedPort = 0,
    [string]$ExpectedContainerId = "",
    [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. "$PSScriptRoot\fcg_target_guard.ps1"
. "$PSScriptRoot\fcg_process.ps1"

if ($VerifyOnly) {
    $v = Test-FcgTarget -Container $Container -ExpectedProject $ExpectedProject -ExpectedPort $ExpectedPort -ExpectedContainerId $ExpectedContainerId
    if ($v.Ok) { Write-Host ("VERIFICACAO: destino aceito -- projeto={0} porta={1}" -f $v.Projeto, $v.Porta); exit 0 }
    Write-Host "VERIFICACAO: destino RECUSADO -- $($v.Motivo)"; exit 1
}

# Validacao ANTES de qualquer escrita. Devolve o ID completo; daqui em diante
# tudo roda contra o ID, nunca resolvendo o nome de novo.
$DbContainer = Assert-FcgTarget -Container $Container -ExpectedProject $ExpectedProject -ExpectedPort $ExpectedPort -ExpectedContainerId $ExpectedContainerId

$falhas = 0
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("fcgconc_" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null

function Resultado([string]$nome, [bool]$ok, [string]$detalhe) {
    $marca = if ($ok) { 'APROVADO' } else { 'REPROVADO' }
    if (-not $ok) { $script:falhas++ }
    Write-Host ("  [{0}] {1}  {2}" -f $marca, $nome, $detalhe)
}

function Invoke-Psql([string]$Sql) {
    $f = Join-Path $tmp ("q_" + [guid]::NewGuid().ToString('N') + ".sql")
    Set-Content -Path $f -Value $Sql -Encoding utf8
    & docker cp $f "${DbContainer}:/tmp/q.sql" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker cp falhou; SQL nao executado" }
    $o = Join-Path $tmp ("q_" + [guid]::NewGuid().ToString("N") + ".out"); $e = Join-Path $tmp ("q_" + [guid]::NewGuid().ToString("N") + ".err")
    $p = Start-Process -FilePath docker -PassThru -Wait -NoNewWindow `
        -ArgumentList @('exec', $DbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-f', '/tmp/q.sql') `
        -RedirectStandardOutput $o -RedirectStandardError $e
    if ($p.ExitCode -ne 0) { throw "psql falhou (exit $($p.ExitCode)); logs: $o $e" }
    $saida = (Get-Content $o -Raw -ErrorAction SilentlyContinue)
    $erro = (Get-Content $e -Raw -ErrorAction SilentlyContinue)
    return @{ out = [string]$saida; err = [string]$erro; code = $p.ExitCode }
}

# Dispara as duas sessoes ao mesmo tempo, cada uma com sua saida em arquivo.
function Executar-Par([string]$sqlA, [string]$sqlB) {
    $fa = Join-Path $tmp "a.sql"; $fb = Join-Path $tmp "b.sql"
    Set-Content -Path $fa -Value $sqlA -Encoding utf8
    Set-Content -Path $fb -Value $sqlB -Encoding utf8
    & docker cp $fa "${DbContainer}:/tmp/sa.sql" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker cp falhou; SQL nao executado" }
    & docker cp $fb "${DbContainer}:/tmp/sb.sql" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker cp falhou; SQL nao executado" }
    $ao = Join-Path $tmp "a.out"; $ae = Join-Path $tmp "a.err"
    $bo = Join-Path $tmp "b.out"; $be = Join-Path $tmp "b.err"

    # Lancamento por fcg_process.ps1. Start-Process -PassThru SEM -Wait devolve
    # ExitCode vazio no Windows PowerShell 5.1, e foi assim que a rodada de
    # 2026-09-29 abortou no C1 sem exercitar nada. O modulo le stdout e stderr
    # de forma assincrona (senao um buffer cheio travaria o filho), exige o
    # codigo de saida e trata ausencia de codigo como falha, nunca como sucesso.
    $psqlArgs = @('exec', $DbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-f')
    $sa = Start-FcgProcess -FilePath docker -Arguments ($psqlArgs + '/tmp/sa.sql') -Rotulo 'A'
    $sb = Start-FcgProcess -FilePath docker -Arguments ($psqlArgs + '/tmp/sb.sql') -Rotulo 'B'

    # psql devolve 3 quando ON_ERROR_STOP interrompe: e o desfecho esperado da
    # sessao perdedora no C2, entao 0 e 3 sao os codigos aceitos.
    $ra = Wait-FcgProcess -Sessao $sa -TimeoutMs 120000 -Aceitos @(0, 3)
    $rb = Wait-FcgProcess -Sessao $sb -TimeoutMs 120000 -Aceitos @(0, 3)

    # Logs preservados em arquivo, como antes.
    Set-Content -LiteralPath $ao -Value $ra.Out -Encoding utf8
    Set-Content -LiteralPath $ae -Value $ra.Err -Encoding utf8
    Set-Content -LiteralPath $bo -Value $rb.Out -Encoding utf8
    Set-Content -LiteralPath $be -Value $rb.Err -Encoding utf8

    return (@($ra.Out, $ra.Err, $rb.Out, $rb.Err) -join "`n")
}

Write-Host ("instancia alvo (id validado): {0}" -f $DbContainer.Substring(0, 12))

# Committed fixtures are never deleted. Require a newly prepared disposable DB.
$fresh = (Invoke-Psql 'select (select count(*) from auth.users)+(select count(*) from public.contracts)+(select count(*) from public.operational_trips);').out.Trim()
if ($fresh -ne '0') { throw 'Exige instancia descartavel nova. Fixtures existentes serao preservadas.' }
$U   = 'c0000000-0000-4000-8000-000000000001'
$EMB = 'c0000000-0000-4000-8000-000000000011'
$TRA = 'c0000000-0000-4000-8000-000000000012'
$FRT = 'c0000000-0000-4000-8000-000000000021'

$null = Invoke-Psql @"
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('$U','00000000-0000-0000-0000-000000000000','authenticated','authenticated','conc@fcg.invalid','',now(),now(),now())
on conflict (id) do nothing;
insert into public.companies (id, owner_id, name) values
  ('$EMB','$U','Conc Embarcadora'), ('$TRA','$U','Conc Transportadora')
on conflict (id) do nothing;
insert into public.freights (id, company_id, created_by) values ('$FRT','$EMB','$U')
on conflict (id) do nothing;
commit;
"@

function Novo-Contrato([string]$id) {
    $null = Invoke-Psql @"
insert into public.contracts (id, freight_id, shipper_company_id, carrier_company_id,
                              total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
values ('$id','$FRT','$EMB','$TRA', 1000, 50, 950, 'draft')
on conflict (id) do nothing;
"@
}

function Chamada([string]$contrato, [string]$req, [string]$cat, [string]$trat, [string]$ev) {
    return @"
begin;
select pg_sleep(0.4);
select public.create_transport_operation_from_contract_core(
  '$contrato'::uuid, '$req'::uuid, '$U'::uuid,
  '$cat', '$trat', '$ev'::jsonb, '$TRA'::uuid, null, null);
commit;
"@
}

$EV_A = '{"rntrc":"11111111","fonte":"A"}'
$EV_B = '{"rntrc":"22222222","fonte":"B"}'

Write-Host ""
Write-Host "=== C1) mesmo request_id, mesmo payload, em paralelo ==="
$ctr = 'c0000000-0000-4000-8000-0000000000a1'; Novo-Contrato $ctr
$req = [guid]::NewGuid().ToString()
$txt = Executar-Par (Chamada $ctr $req 'etc' 'standard' $EV_A) (Chamada $ctr $req 'etc' 'standard' $EV_A)
$n = (Invoke-Psql "select count(*) from public.transport_operations where contract_id='$ctr';").out.Trim()
Resultado 'C1 exatamente uma operacao' ($n -eq '1') "operacoes=$n"
Resultado 'C1 nenhuma sessao recebeu erro' (-not ($txt -match 'ERROR')) $(if ($txt -match 'ERROR') { 'houve ERROR' } else { 'sem ERROR' })

Write-Host ""
Write-Host "=== C2) request_ids diferentes, MESMO contrato, payloads DIFERENTES ==="
$ctr = 'c0000000-0000-4000-8000-0000000000a2'; Novo-Contrato $ctr
$txt = Executar-Par (Chamada $ctr ([guid]::NewGuid().ToString()) 'etc' 'standard' $EV_A) `
                    (Chamada $ctr ([guid]::NewGuid().ToString()) 'ctc' 'tac_equivalent' $EV_B)
$n = (Invoke-Psql "select count(*) from public.transport_operations where contract_id='$ctr';").out.Trim()
$conflito = $txt -match 'parametros diferentes'
$cru = $txt -match 'duplicate key'
Resultado 'C2 exatamente uma operacao' ($n -eq '1') "operacoes=$n"
Resultado 'C2 a perdedora falhou por conflito de parametros' $conflito $(if ($conflito) { 'conflito sinalizado' } else { 'NENHUM conflito sinalizado' })
Resultado 'C2 sem erro cru de chave duplicada' (-not $cru) $(if ($cru) { '23505 vazou' } else { 'sem 23505' })

Write-Host ""
Write-Host "=== C3) request_ids diferentes, MESMO contrato, payload IGUAL ==="
$ctr = 'c0000000-0000-4000-8000-0000000000a3'; Novo-Contrato $ctr
$txt = Executar-Par (Chamada $ctr ([guid]::NewGuid().ToString()) 'etc' 'standard' $EV_A) `
                    (Chamada $ctr ([guid]::NewGuid().ToString()) 'etc' 'standard' $EV_A)
$n = (Invoke-Psql "select count(*) from public.transport_operations where contract_id='$ctr';").out.Trim()
Resultado 'C3 exatamente uma operacao' ($n -eq '1') "operacoes=$n"
Resultado 'C3 nenhuma sessao recebeu erro' (-not ($txt -match 'ERROR')) $(if ($txt -match 'ERROR') { 'houve ERROR' } else { 'sem ERROR' })

Write-Host ""
Write-Host "Fixtures preservadas. Use outra instancia descartavel para repetir; logs: $tmp"

Write-Host ""
if ($falhas -eq 0) { Write-Host "VEREDITO: todos os cenarios aprovados"; exit 0 }
else { Write-Host "VEREDITO: $falhas assercao(oes) reprovada(s)"; exit 1 }
