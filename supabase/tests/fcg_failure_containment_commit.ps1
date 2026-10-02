#Requires -Version 5.1
<#
================================================================================
 fcg_failure_containment_commit.ps1  -  F2 apos COMMIT, lido de outra conexao
================================================================================
 fcg_failure_containment.sql termina em ROLLBACK e por isso prova apenas
 persistencia OBSERVAVEL DENTRO DA TRANSACAO. Durabilidade e outra coisa.

 Aqui a sessao 1 COMITA de verdade e a sessao 2 -- conexao separada, aberta
 depois do commit -- confere o que sobreviveu:
   - o contrato existe;
   - existe uma linha infrastructure_error para ele;
   - nao existe operacao, avaliacao nem resultado;
   - nao existe nenhum compliant.

 AVISO: exige instancia DESCARTAVEL. O script cria um trigger de falha, comita,
 e o remove no bloco finally. O destino e validado por fcg_target_guard.ps1
 (projeto + porta publicada + lista de proibidos) antes de qualquer escrita.

 Uso: powershell -ExecutionPolicy Bypass -File .\fcg_failure_containment_commit.ps1 -Container <nome> -ExpectedProject <projeto> -ExpectedPort <porta> -ExpectedContainerId <id-completo>
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

if ($VerifyOnly) {
    $v = Test-FcgTarget -Container $Container -ExpectedProject $ExpectedProject -ExpectedPort $ExpectedPort -ExpectedContainerId $ExpectedContainerId
    if ($v.Ok) { Write-Host ("VERIFICACAO: destino aceito -- projeto={0} porta={1}" -f $v.Projeto, $v.Porta); exit 0 }
    Write-Host "VERIFICACAO: destino RECUSADO -- $($v.Motivo)"; exit 1
}

# Validacao ANTES de qualquer escrita. Devolve o ID completo; daqui em diante
# tudo roda contra o ID, nunca resolvendo o nome de novo.
$DbContainer = Assert-FcgTarget -Container $Container -ExpectedProject $ExpectedProject -ExpectedPort $ExpectedPort -ExpectedContainerId $ExpectedContainerId

$falhas = 0
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("fcgcommit_" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null

function Resultado([string]$nome, [bool]$ok, [string]$detalhe) {
    $marca = if ($ok) { 'APROVADO' } else { 'REPROVADO' }
    if (-not $ok) { $script:falhas++ }
    Write-Host ("  [{0}] {1}  {2}" -f $marca, $nome, $detalhe)
}

# Cada chamada abre uma CONEXAO NOVA: e isso que torna a sessao 2 independente.
function Invoke-Psql([string]$Sql) {
    $f = Join-Path $tmp ("q_" + [guid]::NewGuid().ToString('N') + ".sql")
    Set-Content -Path $f -Value $Sql -Encoding utf8
    & docker cp $f "${DbContainer}:/tmp/qc.sql" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker cp falhou; SQL nao executado" }
    $o = Join-Path $tmp ("q_" + [guid]::NewGuid().ToString("N") + ".out"); $e = Join-Path $tmp ("q_" + [guid]::NewGuid().ToString("N") + ".err")
    $process = Start-Process -FilePath docker -PassThru -Wait -NoNewWindow `
        -ArgumentList @('exec', $DbContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-f', '/tmp/qc.sql') `
        -RedirectStandardOutput $o -RedirectStandardError $e
    if ($process.ExitCode -ne 0) { throw "psql falhou (exit $($process.ExitCode)); logs: $o $e" }
    return @{
        out = [string](Get-Content $o -Raw -ErrorAction SilentlyContinue)
        err = [string](Get-Content $e -Raw -ErrorAction SilentlyContinue)
    }
}

# A protecao por substring do nome foi REMOVIDA: nome nao prova isolamento.
# O validador compartilhado ja amarrou o destino ao projeto e a porta publicada.
Write-Host ("instancia alvo (id validado): {0}" -f $DbContainer.Substring(0, 12))

# Committed fixtures are never deleted. Require a newly prepared disposable DB.
$fresh = (Invoke-Psql 'select (select count(*) from auth.users)+(select count(*) from public.contracts)+(select count(*) from public.operational_trips);').out.Trim()
if ($fresh -ne '0') { throw 'Exige instancia descartavel nova. Fixtures existentes serao preservadas.' }
$U   = 'e0000000-0000-4000-8000-000000000001'
$EMB = 'e0000000-0000-4000-8000-000000000011'
$TRA = 'e0000000-0000-4000-8000-000000000012'
$FRT = 'e0000000-0000-4000-8000-000000000021'
# Contrato novo a cada execucao: a linha de auditoria dele e APPEND-ONLY e nao
# pode ser apagada, portanto reaproveitar o mesmo id quebraria a segunda rodada.
$CTR = 'e0000000-0000-4000-8000-' + [guid]::NewGuid().ToString('N').Substring(0, 12)

try {
    Write-Host ""
    Write-Host "=== SESSAO 1: injeta a falha, insere o contrato e COMITA ==="
    $r1 = Invoke-Psql @"
begin;
create or replace function public.fcg_test_only_boom()
returns trigger language plpgsql as `$fn`$
begin
  raise exception using errcode = '22000', message = 'falha injetada pelo teste';
end;
`$fn`$;
create trigger fcg_test_only_boom_trg
  before insert on public.transport_operations
  for each row execute function public.fcg_test_only_boom();
update public.operational_flags set value = true where key = 'freight_compliance_gate_enabled';
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('$U','00000000-0000-0000-0000-000000000000','authenticated','authenticated','commit@fcg.invalid','',now(),now(),now())
on conflict (id) do nothing;
insert into public.companies (id, owner_id, name) values ('$EMB','$U','Commit Emb'), ('$TRA','$U','Commit Tra')
on conflict (id) do nothing;
insert into public.freights (id, company_id, created_by) values ('$FRT','$EMB','$U') on conflict (id) do nothing;
insert into public.contracts (id, freight_id, shipper_company_id, carrier_company_id,
                              total_amount_brl, platform_fee_brl, carrier_payout_brl, status)
values ('$CTR','$FRT','$EMB','$TRA', 8000, 400, 7600, 'draft');
commit;
"@
    $comitou = ($r1.err -notmatch 'ERROR')
    Resultado 'sessao 1 comitou sem erro' $comitou $(if ($comitou) { 'commit ok' } else { ($r1.err -split "`n" | Select-Object -First 1) })
    if ($r1.err -match 'WARNING') { Write-Host ("  (warning esperado do hook: " + (($r1.err -split "`n" | Where-Object { $_ -match 'WARNING' } | Select-Object -First 1)).Trim() + ")") }

    Write-Host ""
    Write-Host "=== SESSAO 2: conexao NOVA, aberta depois do commit ==="
    $q = Invoke-Psql @"
select (select count(*) from public.contracts where id='$CTR')
  || '|' || (select count(*) from public.fcg_observational_log where contract_id='$CTR' and event='infrastructure_error')
  || '|' || (select count(*) from public.transport_operations where contract_id='$CTR')
  || '|' || (select count(*) from public.regulatory_assessments)
  || '|' || (select count(*) from public.regulatory_compliance_results)
  || '|' || (select count(*) from public.regulatory_compliance_results where compliance_status='compliant')
  || '|' || coalesce((select left(detail,40) from public.fcg_observational_log where contract_id='$CTR' and event='infrastructure_error' limit 1),'(nenhum)');
"@
    $p = ($q.out.Trim() -split '\|')
    if ($p.Count -lt 7) {
        Resultado 'sessao 2 leu o estado' $false ("saida inesperada: " + $q.out.Trim() + " " + $q.err)
    } else {
        Resultado 'contrato DURAVEL apos commit'            ($p[0] -eq '1') "contratos=$($p[0])"
        Resultado 'infrastructure_error DURAVEL apos commit' ($p[1] -eq '1') "linhas=$($p[1])  detalhe=$($p[6])"
        Resultado 'nenhuma operacao parcial durou'           ($p[2] -eq '0') "operacoes=$($p[2])"
        Resultado 'nenhuma avaliacao ou resultado durou'     (($p[3] -eq '0') -and ($p[4] -eq '0')) "avaliacoes=$($p[3]) resultados=$($p[4])"
        Resultado 'nenhum compliant no banco'                ($p[5] -eq '0') "compliant=$($p[5])"
    }
}
finally {
    Write-Host ""
    Write-Host "removendo a injecao de falha e restaurando a flag..."
    # A injecao e a flag SAO removidas. O contrato e sua linha de auditoria NAO:
    # fcg_observational_log e append-only (fcg_obs_log_block_delete/update), e a
    # FK on delete set null do contrato tambem esbarraria no bloqueio de UPDATE.
    # Apagar aqui exigiria enfraquecer a trilha -- que e exatamente o que ela
    # existe para impedir. Por isso este teste so roda em instancia descartavel.
    $null = Invoke-Psql @"
begin;
drop trigger if exists fcg_test_only_boom_trg on public.transport_operations;
drop function if exists public.fcg_test_only_boom();
update public.operational_flags set value = false where key = 'freight_compliance_gate_enabled';
commit;
"@
    $v = (Invoke-Psql @"
select (select count(*) from pg_trigger where tgname='fcg_test_only_boom_trg')
  || '|' || (select count(*) from pg_proc where proname='fcg_test_only_boom')
  || '|' || (select value::text from public.operational_flags where key='freight_compliance_gate_enabled');
"@).out.Trim()
    if ($v -ne "0|0|false") { throw "Restauracao da injecao/flag nao confirmada: $v" }
    Write-Host "estado apos limpeza (trigger|funcao|flag): $v  (esperado 0|0|false)"
    Write-Host "residuo DELIBERADO: 1 contrato e 1 linha append-only de auditoria, que nao podem ser apagados."
    Write-Host "Logs preservados em $tmp"
}

Write-Host ""
if ($falhas -eq 0) { Write-Host "VEREDITO: durabilidade apos COMMIT comprovada"; exit 0 }
else { Write-Host "VEREDITO: $falhas assercao(oes) reprovada(s)"; exit 1 }
