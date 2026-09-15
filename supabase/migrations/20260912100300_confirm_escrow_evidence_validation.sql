-- =============================================================================
-- MODULO 1 (4/6) : validacao do comprovante nas atestacoes manuais
-- =============================================================================
-- confirm_escrow_funding e confirm_escrow_release (20260903100740) ja exigiam
-- p_evidence_ref e p_evidence_hash, mas nao conferiam nada sobre o objeto. A
-- partir daqui, ANTES de marcar a transacao como confirmada, a funcao interna
-- public.assert_payment_evidence confere o que o banco consegue conferir:
--
--   * o objeto existe no bucket payment-evidence com exatamente aquele nome;
--   * o caminho pertence ao contrato E a transacao que esta sendo confirmada,
--     e o segmento final tem o kind certo, o padrao de nome exigido pela policy
--     e os 16 primeiros hex do hash declarado;
--   * user_metadata.sha256 (declarado pelo navegador no upload) e igual a
--     p_evidence_hash (declarado na chamada): COERENCIA entre duas declaracoes
--     do mesmo administrador, nao verificacao independente;
--   * metadata.mimetype registrado pelo Storage esta na lista do bucket;
--   * metadata.size observado pelo Storage esta entre 1 byte e 10 MB.
--
-- O QUE NAO E VERIFICADO, DECLARADAMENTE: o PostgreSQL nao le os bytes do
-- objeto. O SHA-256 nao e recalculado. O eTag e um identificador opaco do
-- Storage (nao e tratado como MD5). O MIME e o tipo registrado, nao inspecao
-- de conteudo. Tudo isso e atestacao humana do administrador, com trilha.
--
-- ASSINATURAS: as duas RPCs sao recriadas com CREATE OR REPLACE e a MESMA
-- assinatura - nenhum overload novo, retornos inalterados, replay idempotente
-- inalterado. Corpo = homologado + a validacao + gravacao dos tres fatos.
--
-- ACL: assert_payment_evidence fica SEM EXECUTE para public, anon,
-- authenticated e service_role. Os default privileges do schema concedem
-- EXECUTE a esses papeis em toda funcao nova; por isso o REVOKE e explicito.
-- As RPCs SECURITY DEFINER, executadas como postgres (dono), continuam
-- podendo chama-la - verificado por execucao no banco local.
-- =============================================================================

create function public.assert_payment_evidence(
  p_contract_id    uuid,
  p_transaction_id uuid,
  p_kind           public.payment_transaction_kind,
  p_evidence_ref   text,
  p_evidence_hash  text
)
returns table (etag text, size_bytes bigint, mime text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_o      record;
  v_name   text;
  v_pat    text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
                || '(funding|release)-[0-9]{8}T[0-9]{6}\.[0-9]{3}Z-'
                || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-'
                || '[0-9a-f]{16}\.(pdf|jpg|jpeg|png)$';
  v_size   bigint;
  v_mime   text;
  v_etag   text;
begin
  if p_evidence_ref is null or length(btrim(p_evidence_ref)) = 0
     or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'comprovante: referencia e hash sha-256 (64 hex) sao obrigatorios';
  end if;
  if p_evidence_ref !~ v_pat then
    raise exception using errcode = '22023',
      message = 'comprovante: caminho fora do padrao exigido para payment-evidence';
  end if;

  select o.name, o.path_tokens, o.metadata, o.user_metadata
    into v_o
    from storage.objects o
   where o.bucket_id = 'payment-evidence' and o.name = p_evidence_ref;
  if not found then
    raise exception using errcode = '22023',
      message = 'comprovante: objeto nao encontrado no bucket payment-evidence. '
                'A atestacao NAO foi registrada.';
  end if;

  if v_o.path_tokens[1] is distinct from p_contract_id::text then
    raise exception using errcode = '22023',
      message = 'comprovante: o caminho nao pertence a este contrato';
  end if;
  if v_o.path_tokens[2] is distinct from p_transaction_id::text then
    raise exception using errcode = '22023',
      message = 'comprovante: o caminho nao pertence a transacao que esta sendo confirmada';
  end if;
  v_name := v_o.path_tokens[3];
  if v_name !~ ('^' || p_kind::text || '-') then
    raise exception using errcode = '22023',
      message = format('comprovante: o arquivo e de %s, mas a transacao e de %s',
                       split_part(v_name, '-', 1), p_kind);
  end if;
  if position(('-' || substr(p_evidence_hash, 1, 16) || '.') in v_name) = 0 then
    raise exception using errcode = '22023',
      message = 'comprovante: o nome do arquivo nao carrega o prefixo do hash declarado';
  end if;

  if (v_o.user_metadata ->> 'sha256') is distinct from p_evidence_hash then
    raise exception using errcode = '22023',
      message = 'comprovante: o sha-256 declarado no upload difere do declarado na '
                'atestacao. Nada foi registrado.';
  end if;

  v_mime := v_o.metadata ->> 'mimetype';
  if v_mime is null or v_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception using errcode = '22023',
      message = format('comprovante: tipo registrado pelo Storage nao permitido (%s)',
                       coalesce(v_mime, 'ausente'));
  end if;
  begin
    v_size := (v_o.metadata ->> 'size')::bigint;
  exception when others then
    v_size := null;
  end;
  if v_size is null or v_size < 1 or v_size > 10485760 then
    raise exception using errcode = '22023',
      message = format('comprovante: tamanho observado pelo Storage invalido (%s)',
                       coalesce(v_size::text, 'ausente'));
  end if;
  v_etag := nullif(btrim(coalesce(v_o.metadata ->> 'eTag', '')), '');
  if v_etag is null then
    raise exception using errcode = '22023',
      message = 'comprovante: o Storage nao registrou identificador (eTag) para o objeto';
  end if;

  return query select v_etag, v_size, v_mime;
end;
$fn$;

comment on function public.assert_payment_evidence(uuid, uuid, public.payment_transaction_kind, text, text) is
  'Interna. Confere existencia, caminho, coerencia do sha-256 declarado, MIME '
  'registrado e tamanho observado de um comprovante em payment-evidence. Nao '
  'recalcula hash nem le bytes: nao e verificacao independente. Sem EXECUTE para '
  'papeis de cliente; chamada apenas por RPCs SECURITY DEFINER.';

revoke all on function public.assert_payment_evidence(
  uuid, uuid, public.payment_transaction_kind, text, text)
  from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- confirm_escrow_funding: corpo homologado em 20260903100740 + validacao + fatos
-- -----------------------------------------------------------------------------
create or replace function public.confirm_escrow_funding(
  p_contract_id        uuid,
  p_external_reference text,
  p_note               text,
  p_evidence_ref       text,
  p_evidence_hash      text,
  p_request_id         uuid
)
returns table (
  affected_contract_id uuid,
  intent_id            uuid,
  new_internal_status  public.payment_internal_status,
  new_escrow_status    text,
  was_replayed         boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ev    record;
  v_actor uuid := public.require_steelgo_admin('confirm_escrow_funding');
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_tx    public.payment_transactions%rowtype;
  v_now   timestamptz := now();
begin
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'confirm_escrow_funding: p_contract_id e obrigatorio';
  end if;
  if p_external_reference is null or length(btrim(p_external_reference)) = 0 then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_funding: referencia externa e obrigatoria. Uma '
                'atestacao sem prova documental nao e registrada.';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_funding: nota da atestacao e obrigatoria e precisa '
                'de ao menos 10 caracteres';
  end if;
  -- COMPROVANTE VINCULADO. Atestacao sem artefato nao e atestacao.
  if p_evidence_ref is null or length(btrim(p_evidence_ref)) = 0
     or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_funding: comprovante e obrigatorio - referencia do '
                'arquivo e sha-256 hexadecimal de 64 caracteres. Uma atestacao '
                'manual sem documento anexado nao e registrada.';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'external_reference', p_external_reference,
    'evidence_hash', p_evidence_hash));
  v_log := public.rpc_idempotency_probe(
    'confirm_escrow_funding', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_c from public.contracts c where c.id = p_contract_id;
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    return query select p_contract_id, v_i.id, v_i.internal_status, v_c.escrow_status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_funding: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi
    where pi.contract_id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_funding: nao existe intencao de pagamento para '
                'este contrato';
  end if;
  if v_i.internal_status is distinct from 'awaiting_funding'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = format('confirm_escrow_funding: pagamento em %s; a confirmacao so '
                       'parte de awaiting_funding', v_i.internal_status);
  end if;

  select * into v_tx from public.payment_transactions t
   where t.intent_id = v_i.id and t.kind = 'funding' and t.status = 'requested'
   order by t.requested_at desc limit 1 for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_funding: nao ha transacao de aporte solicitada';
  end if;


  -- COMPROVANTE: o que o banco consegue conferir e conferido aqui (1/6, 2/6).
  -- O SHA-256 e declarado pelo navegador do administrador; a funcao confere a
  -- coerencia com o objeto e devolve os fatos registrados pelo Storage.
  select * into v_ev from public.assert_payment_evidence(
    p_contract_id, v_tx.id, 'funding'::public.payment_transaction_kind,
    p_evidence_ref, p_evidence_hash);
  if v_ev.size_bytes is null then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_funding: comprovante nao pode ser verificado';
  end if;

  update public.payment_transactions t
     set status              = 'confirmed',
         confirmed_by        = v_actor,
         confirmed_at        = v_now,
         confirmation_method = 'manual_admin',
         confirmation_note   = p_note,
         confirmation_evidence_ref  = p_evidence_ref,
         confirmation_evidence_hash = p_evidence_hash,
         external_reference  = p_external_reference,
         confirmation_evidence_size_bytes = v_ev.size_bytes,
         confirmation_evidence_etag       = v_ev.etag,
         confirmation_evidence_mime       = v_ev.mime
   where t.id = v_tx.id and t.status = 'requested';
  if not found then
    raise exception using errcode = '40001',
      message = 'confirm_escrow_funding: a transacao mudou de estado durante a operacao';
  end if;

  update public.payment_intents pi
     set funding_confirmed_at = v_now
   where pi.id = v_i.id;

  update public.contracts c
     set escrow_external_ref = p_external_reference
   where c.id = p_contract_id;

  perform public.payment_event_append(
    v_i.id, 'funding_confirmed', 'funding_confirmed'::public.payment_internal_status,
    v_tx.id, null, v_i.gross_amount, v_i.currency_code,
    'admin', v_actor, 'admin', 'manual_admin', p_external_reference, null, null,
    p_note, 'confirm_escrow_funding', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'escrow_funding_confirmed'::public.contract_lifecycle_transition,
    v_c.status, 'funding_confirmed', null, v_now, v_i.id, null, v_i.gross_amount,
    v_actor, 'admin',
    'Aporte ATESTADO por administrador SteelGo, fora de provedor integrado.',
    'confirm_escrow_funding', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('confirm_escrow_funding', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('aporte ATESTADO manualmente; referencia externa %s', p_external_reference));

  return query select p_contract_id, v_i.id,
                      'funding_confirmed'::public.payment_internal_status,
                      'funding_confirmed'::text, false;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- confirm_escrow_release: corpo homologado em 20260903100740 + validacao + fatos
-- -----------------------------------------------------------------------------
create or replace function public.confirm_escrow_release(
  p_contract_id        uuid,
  p_external_reference text,
  p_note               text,
  p_evidence_ref       text,
  p_evidence_hash      text,
  p_request_id         uuid
)
returns table (
  affected_contract_id uuid,
  intent_id            uuid,
  new_internal_status  public.payment_internal_status,
  new_contract_status  public.contract_status,
  contract_completed   boolean,
  was_replayed         boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ev    record;
  v_actor uuid := public.require_steelgo_admin('confirm_escrow_release');
  v_c     public.contracts%rowtype;
  v_i     public.payment_intents%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_tx    public.payment_transactions%rowtype;
  v_now   timestamptz := now();
  v_done  boolean := false;
begin
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'confirm_escrow_release: p_contract_id e obrigatorio';
  end if;
  if p_external_reference is null or length(btrim(p_external_reference)) = 0 then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_release: referencia externa e obrigatoria';
  end if;
  if p_note is null or length(btrim(p_note)) < 10 then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_release: nota da atestacao e obrigatoria e precisa '
                'de ao menos 10 caracteres';
  end if;
  if p_evidence_ref is null or length(btrim(p_evidence_ref)) = 0
     or p_evidence_hash is null or p_evidence_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_release: comprovante e obrigatorio - referencia do '
                'arquivo e sha-256 hexadecimal de 64 caracteres. Uma atestacao '
                'manual sem documento anexado nao e registrada.';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id', p_contract_id, 'external_reference', p_external_reference,
    'evidence_hash', p_evidence_hash));
  v_log := public.rpc_idempotency_probe(
    'confirm_escrow_release', p_request_id, v_actor, p_contract_id, v_fp);
  if v_log.id is not null then
    select * into v_c from public.contracts c where c.id = p_contract_id;
    select * into v_i from public.payment_intents pi where pi.contract_id = p_contract_id;
    return query select p_contract_id, v_i.id, v_i.internal_status, v_c.status,
                        v_c.status = 'completed'::public.contract_status, true;
    return;
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_release: contrato inexistente';
  end if;
  select * into v_i from public.payment_intents pi
    where pi.contract_id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_release: nao existe intencao de pagamento';
  end if;
  if v_i.internal_status is distinct from 'release_requested'::public.payment_internal_status then
    raise exception using errcode = '22023',
      message = format('confirm_escrow_release: pagamento em %s; a confirmacao so '
                       'parte de release_requested', v_i.internal_status);
  end if;
  if v_i.release_blocked_by_dispute then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_release: liberacao suspensa por disputa aberta';
  end if;

  select * into v_tx from public.payment_transactions t
   where t.intent_id = v_i.id and t.kind = 'release' and t.status = 'requested'
   order by t.requested_at desc limit 1 for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'confirm_escrow_release: nao ha transacao de liberacao solicitada';
  end if;


  -- COMPROVANTE: o que o banco consegue conferir e conferido aqui (1/6, 2/6).
  -- O SHA-256 e declarado pelo navegador do administrador; a funcao confere a
  -- coerencia com o objeto e devolve os fatos registrados pelo Storage.
  select * into v_ev from public.assert_payment_evidence(
    p_contract_id, v_tx.id, 'release'::public.payment_transaction_kind,
    p_evidence_ref, p_evidence_hash);
  if v_ev.size_bytes is null then
    raise exception using errcode = '22023',
      message = 'confirm_escrow_release: comprovante nao pode ser verificado';
  end if;

  update public.payment_transactions t
     set status              = 'confirmed',
         confirmed_by        = v_actor,
         confirmed_at        = v_now,
         confirmation_method = 'manual_admin',
         confirmation_note   = p_note,
         confirmation_evidence_ref  = p_evidence_ref,
         confirmation_evidence_hash = p_evidence_hash,
         external_reference  = p_external_reference,
         confirmation_evidence_size_bytes = v_ev.size_bytes,
         confirmation_evidence_etag       = v_ev.etag,
         confirmation_evidence_mime       = v_ev.mime
   where t.id = v_tx.id and t.status = 'requested';
  if not found then
    raise exception using errcode = '40001',
      message = 'confirm_escrow_release: a transacao mudou de estado durante a operacao';
  end if;

  update public.payment_intents pi
     set released_confirmed_at = v_now
   where pi.id = v_i.id;

  update public.contracts c
     set escrow_external_ref = p_external_reference
   where c.id = p_contract_id;

  perform public.payment_event_append(
    v_i.id, 'release_confirmed', 'released_confirmed'::public.payment_internal_status,
    v_tx.id, null, v_i.gross_amount, v_i.currency_code,
    'admin', v_actor, 'admin', 'manual_admin', p_external_reference, null, null,
    p_note, 'confirm_escrow_release', p_request_id, v_fp);

  perform public.contract_lifecycle_append(
    p_contract_id, 'escrow_release_confirmed'::public.contract_lifecycle_transition,
    v_c.status, 'released_confirmed', null, v_now, v_i.id, null, v_i.gross_amount,
    v_actor, 'admin',
    'Liberacao ATESTADA por administrador SteelGo, fora de provedor integrado.',
    'confirm_escrow_release', p_request_id, v_fp);

  -- SEGUNDA CONDICAO? Se a entrega ja estiver concluida, o contrato fecha AGORA.
  v_done := public.try_complete_contract(
    p_contract_id, v_actor, 'admin', 'confirm_escrow_release', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('confirm_escrow_release', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('liberacao ATESTADA manualmente, referencia %s; contrato %s',
                 p_external_reference,
                 case when v_done then 'CONCLUIDO na mesma transacao'
                      else 'segue active, aguardando conclusao da entrega' end));

  select * into v_c from public.contracts c where c.id = p_contract_id;
  return query select p_contract_id, v_i.id,
                      'released_confirmed'::public.payment_internal_status,
                      v_c.status, v_done, false;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- ACL das RPCs recriadas (reemitida por inteiro; CREATE OR REPLACE preserva a
-- anterior, mas o estado final fica declarado aqui e verificado abaixo).
-- -----------------------------------------------------------------------------
revoke all on function public.confirm_escrow_funding(uuid, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_escrow_release(uuid, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.confirm_escrow_funding(uuid, text, text, text, text, uuid)
  to authenticated, service_role;
grant execute on function public.confirm_escrow_release(uuid, text, text, text, text, uuid)
  to authenticated, service_role;

do $$
declare
  v_helper text := 'public.assert_payment_evidence(uuid, uuid, public.payment_transaction_kind, text, text)';
  v_f      text := 'public.confirm_escrow_funding(uuid, text, text, text, text, uuid)';
  v_r      text := 'public.confirm_escrow_release(uuid, text, text, text, text, uuid)';
  v_fn     text;
begin
  -- helper: nenhum papel de cliente; PUBLIC lido da ACL (grantee 0)
  if has_function_privilege('anon', v_helper, 'execute')
     or has_function_privilege('authenticated', v_helper, 'execute')
     or has_function_privilege('service_role', v_helper, 'execute')
     or not has_function_privilege('postgres', v_helper, 'execute')
     or exists (select 1 from pg_proc p
                 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_helper::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'assert_payment_evidence: ACL inesperada';
  end if;
  -- RPCs: authenticated e service_role sim; anon e PUBLIC nao; um overload cada
  foreach v_fn in array array[v_f, v_r] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or not has_function_privilege('authenticated', v_fn, 'execute')
       or not has_function_privilege('service_role', v_fn, 'execute')
       or not has_function_privilege('postgres', v_fn, 'execute')
       or exists (select 1 from pg_proc p
                   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception '%: ACL inesperada', v_fn;
    end if;
  end loop;
  if (select count(*) from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in ('confirm_escrow_funding', 'confirm_escrow_release')) <> 2 then
    raise exception 'confirm_escrow_*: quantidade de overloads inesperada';
  end if;
end $$;
