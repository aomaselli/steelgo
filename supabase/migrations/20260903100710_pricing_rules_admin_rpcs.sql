-- =============================================================================
-- REV8.1 8/13 : RPCs ADMINISTRATIVAS DE PRECIFICACAO
-- =============================================================================
-- Unica via de escrita em public.pricing_rules. Todas:
--   * autenticam;
--   * exigem has_role(admin) apurado NO SERVIDOR - nunca papel de banco, nunca
--     current_user, nunca GUC de sessao;
--   * sao idempotentes por public.rpc_idempotency_probe;
--   * gravam vigencia explicita;
--   * registram evento append-only em public.pricing_rule_events;
--   * nunca alteram regra historica: correcao e NOVA VERSAO.
--
-- NAO EXISTE RPC QUE EDITE A TAXA DE UMA REGRA. Isso e proposital: se existisse,
-- o contrato que ja citou aquela regra passaria a apontar para um numero que
-- nao foi o cobrado.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Guarda comum de administrador.
-- -----------------------------------------------------------------------------
create function public.require_steelgo_admin(p_rpc_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = p_rpc_name || ': chamador nao autenticado';
  end if;
  if not coalesce(public.has_role(v_actor, 'admin'::public.app_role), false) then
    raise exception using errcode = '42501',
      message = p_rpc_name || ': operacao restrita a administrador SteelGo';
  end if;
  return v_actor;
end;
$fn$;

revoke execute on function public.require_steelgo_admin(text)
  from public, anon, authenticated;

comment on function public.require_steelgo_admin(text) is
  'Guarda comum das operacoes administrativas. coalesce(..., false) e '
  'obrigatorio: has_role nulo faria "if not NULL then raise" NAO levantar, e a '
  'autorizacao falharia ABERTA.';

-- -----------------------------------------------------------------------------
-- CHAVE DE SERIALIZACAO POR ESCOPO COMERCIAL (correcao 8.1/b4).
-- -----------------------------------------------------------------------------
-- A verificacao de vigencia sobreposta em admin_create_pricing_rule e um
-- SELECT seguido de um INSERT. Sob READ COMMITTED, duas sessoes simultaneas
-- fazem o SELECT antes de qualquer INSERT ficar visivel: as duas nao encontram
-- conflito, as duas inserem, e o escopo termina com DUAS regras ativas com
-- vigencia sobreposta - exatamente a ambiguidade de taxa que a funcao existe
-- para impedir. Nenhum indice unico pode substituir esta verificacao, porque
-- sobreposicao de intervalos nao e igualdade de chave (seria preciso EXCLUDE
-- com btree_gist, extensao que este projeto nao instala).
--
-- A serializacao e por ESCOPO NORMALIZADO - o mesmo trio que define "a mesma
-- regra comercial": pais, moeda e transportadora, com NULL (condicao geral)
-- reduzido a um literal estavel. Duas criacoes no MESMO escopo esperam uma pela
-- outra; criacoes em escopos DIFERENTES nao se bloqueiam.
--
-- Esta funcao existe para que a chave seja calculada em UM lugar so: se
-- create e supersede normalizassem o escopo de formas diferentes, as duas
-- pegariam travas diferentes e a serializacao nao existiria de fato.
create function public.pricing_rule_scope_lock_key(
  p_country_code  text,
  p_currency_code text,
  p_carrier_id    uuid
)
returns bigint
language sql
immutable
set search_path = ''
as $fn$
  select pg_catalog.hashtextextended(
    'steelgo.pricing_rule_scope:'
    || coalesce(upper(btrim(p_country_code)),  '?')  || '|'
    || coalesce(upper(btrim(p_currency_code)), '?')  || '|'
    || coalesce(p_carrier_id::text, 'geral'), 0);
$fn$;

revoke execute on function public.pricing_rule_scope_lock_key(text, text, uuid)
  from public, anon, authenticated;

comment on function public.pricing_rule_scope_lock_key(text, text, uuid) is
  'Chave determinista de serializacao por escopo comercial (pais, moeda, '
  'transportadora). Normaliza caixa, espaco e o NULL de condicao geral, para '
  'que criacao e substituicao no mesmo escopo peguem sempre a MESMA trava.';

-- -----------------------------------------------------------------------------
-- Criacao de regra.
-- -----------------------------------------------------------------------------
create function public.admin_create_pricing_rule(
  p_country_code    text,
  p_currency_code   text,
  p_fee_percentage  numeric,
  p_effective_from  timestamptz,
  p_effective_until timestamptz,
  p_carrier_id      uuid,
  p_reason          text,
  p_request_id      uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('admin_create_pricing_rule');
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_id    uuid;
  v_conf  record;
begin
  if p_country_code is null or p_country_code !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023',
      message = 'admin_create_pricing_rule: country_code deve ter duas letras maiusculas';
  end if;
  if p_currency_code is null or p_currency_code !~ '^[A-Z]{3}$' then
    raise exception using errcode = '22023',
      message = 'admin_create_pricing_rule: currency_code deve ter tres letras maiusculas';
  end if;
  if p_fee_percentage is null or p_fee_percentage < 0 or p_fee_percentage > 100 then
    raise exception using errcode = '22023',
      message = 'admin_create_pricing_rule: taxa fora do intervalo 0 a 100';
  end if;
  if p_effective_from is null then
    raise exception using errcode = '22004',
      message = 'admin_create_pricing_rule: vigencia inicial e obrigatoria';
  end if;
  if p_effective_until is not null and p_effective_until <= p_effective_from then
    raise exception using errcode = '22023',
      message = 'admin_create_pricing_rule: vigencia final deve ser posterior a inicial';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception using errcode = '22023',
      message = 'admin_create_pricing_rule: justificativa comercial e obrigatoria '
                'e precisa de ao menos 10 caracteres';
  end if;
  if p_carrier_id is not null
     and not exists (select 1 from public.carriers c where c.id = p_carrier_id) then
    raise exception using errcode = 'P0002',
      message = 'admin_create_pricing_rule: transportadora inexistente';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'country_code',   p_country_code,
    'currency_code',  p_currency_code,
    'fee_percentage', p_fee_percentage::text,
    'effective_from', p_effective_from,
    'effective_until', p_effective_until,
    'carrier_id',     p_carrier_id));

  v_log := public.rpc_idempotency_probe(
    'admin_create_pricing_rule', p_request_id, v_actor, null, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;

  -- SERIALIZACAO POR ESCOPO (correcao 8.1/b4). Tomada ANTES do SELECT de
  -- conflito e mantida ate o fim da transacao: a segunda sessao so chega ao
  -- SELECT depois que a primeira comitou, portanto ENXERGA a regra dela e falha
  -- com o erro controlado abaixo - com id, taxa e vigencia da regra que
  -- venceu - em vez de inserir uma vigencia sobreposta.
  --
  -- Ordem deliberada: trava consultiva SEMPRE antes de trava de linha, aqui e
  -- em admin_supersede_pricing_rule. Ordem invertida entre as duas funcoes
  -- produziria deadlock entre uma criacao e uma substituicao concorrentes no
  -- mesmo escopo.
  perform pg_catalog.pg_advisory_xact_lock(
    public.pricing_rule_scope_lock_key(p_country_code, p_currency_code, p_carrier_id));

  -- CONFLITO DE VIGENCIA. Duas regras do mesmo escopo vigentes ao mesmo tempo
  -- tornam a taxa ambigua. Recusa, nunca escolha automatica.
  select pr.id, pr.platform_fee_percentage, pr.effective_from, pr.effective_until
    into v_conf
    from public.pricing_rules pr
   where pr.is_active
     and pr.country_code  = p_country_code
     and pr.currency_code = p_currency_code
     and pr.carrier_id is not distinct from p_carrier_id
     and pr.effective_from < coalesce(p_effective_until, 'infinity'::timestamptz)
     and coalesce(pr.effective_until, 'infinity'::timestamptz) > p_effective_from
   order by pr.effective_from
   limit 1;
  if found then
    raise exception using errcode = '22023',
      message = format('admin_create_pricing_rule: ja existe regra ativa do mesmo '
                       'escopo com vigencia sobreposta - id %s, taxa %s%%, de %s '
                       'ate %s. Use admin_supersede_pricing_rule.',
                       v_conf.id, v_conf.platform_fee_percentage,
                       v_conf.effective_from,
                       coalesce(v_conf.effective_until::text, 'indeterminado'));
  end if;

  insert into public.pricing_rules (
    carrier_id, country_code, currency_code, platform_fee_percentage,
    risk_percentage, insurance_percentage,
    effective_from, effective_until, version, priority, is_active,
    created_by_admin, change_reason, parameters
  ) values (
    p_carrier_id, p_country_code, p_currency_code, p_fee_percentage,
    0, 0,
    p_effective_from, p_effective_until, 1, 100, true,
    v_actor, p_reason,
    jsonb_build_object(
      'natureza', 'taxa comercial da plataforma SteelGo',
      'nao_e',    'piso minimo da ANTT nem qualquer piso regulatorio',
      'origem',   'admin_create_pricing_rule')
  )
  returning id into v_id;

  insert into public.pricing_rule_events (
    pricing_rule_id, event_type, previous_rule_id, country_code, currency_code,
    carrier_id, fee_percentage, effective_from, effective_until, is_active,
    actor_kind, actor_id, reason, rpc_name, request_id, params_fingerprint
  ) values (
    v_id, 'created', null, p_country_code, p_currency_code,
    p_carrier_id, p_fee_percentage, p_effective_from, p_effective_until, true,
    'admin', v_actor, p_reason, 'admin_create_pricing_rule', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('admin_create_pricing_rule', p_request_id, v_actor, v_id, v_fp, 'accepted',
          format('regra %s criada: %s/%s taxa %s%% carrier %s',
                 v_id, p_country_code, p_currency_code, p_fee_percentage,
                 coalesce(p_carrier_id::text, 'geral')));

  return v_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Substituicao por NOVA VERSAO. A regra antiga e encerrada para a frente; seus
-- campos economicos permanecem exatamente como estavam.
-- -----------------------------------------------------------------------------
create function public.admin_supersede_pricing_rule(
  p_rule_id            uuid,
  p_new_fee_percentage numeric,
  p_effective_from     timestamptz,
  p_reason             text,
  p_request_id         uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('admin_supersede_pricing_rule');
  v_old   public.pricing_rules%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_new   uuid;
  v_scope record;
begin
  if p_rule_id is null then
    raise exception using errcode = '22004',
      message = 'admin_supersede_pricing_rule: p_rule_id e obrigatorio';
  end if;
  if p_new_fee_percentage is null or p_new_fee_percentage < 0 or p_new_fee_percentage > 100 then
    raise exception using errcode = '22023',
      message = 'admin_supersede_pricing_rule: taxa fora do intervalo 0 a 100';
  end if;
  if p_effective_from is null then
    raise exception using errcode = '22004',
      message = 'admin_supersede_pricing_rule: vigencia inicial da nova versao e obrigatoria';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception using errcode = '22023',
      message = 'admin_supersede_pricing_rule: justificativa comercial e obrigatoria '
                'e precisa de ao menos 10 caracteres';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'rule_id',        p_rule_id,
    'fee_percentage', p_new_fee_percentage::text,
    'effective_from', p_effective_from));

  v_log := public.rpc_idempotency_probe(
    'admin_supersede_pricing_rule', p_request_id, v_actor, p_rule_id, v_fp);
  if v_log.id is not null then
    -- CORRECAO 8.1: o sucessor e DERIVADO por consulta reversa.
    select r.id into v_new
      from public.pricing_rules r where r.supersedes_id = p_rule_id;
    return v_new;
  end if;

  -- SERIALIZACAO POR ESCOPO (correcao 8.1/b4). Uma substituicao TAMBEM cria uma
  -- vigencia nova no escopo, entao disputa a mesma trava que a criacao. O escopo
  -- e lido antes, sem trava de linha, so para calcular a chave: a trava
  -- consultiva vem PRIMEIRO e a trava de linha depois, na mesma ordem de
  -- admin_create_pricing_rule. Inverter a ordem aqui produziria deadlock entre
  -- uma criacao e uma substituicao concorrentes no mesmo escopo.
  select r.country_code, r.currency_code, r.carrier_id into v_scope
    from public.pricing_rules r where r.id = p_rule_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'admin_supersede_pricing_rule: regra inexistente';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    public.pricing_rule_scope_lock_key(
      v_scope.country_code, v_scope.currency_code, v_scope.carrier_id));

  select * into v_old from public.pricing_rules r where r.id = p_rule_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'admin_supersede_pricing_rule: regra inexistente';
  end if;
  -- Ja substituida? A pergunta se responde pela consulta reversa; o indice
  -- unico parcial em supersedes_id e a garantia estrutural por tras dela.
  select r.id into v_new
    from public.pricing_rules r where r.supersedes_id = p_rule_id;
  if v_new is not null then
    raise exception using errcode = '23505',
      message = format('admin_supersede_pricing_rule: regra %s ja foi substituida '
                       'pela regra %s', p_rule_id, v_new);
  end if;
  v_new := null;
  if not v_old.is_active or v_old.closed_at is not null then
    raise exception using errcode = '22023',
      message = 'admin_supersede_pricing_rule: regra ja encerrada nao e substituida';
  end if;
  if p_effective_from <= v_old.effective_from then
    raise exception using errcode = '22023',
      message = 'admin_supersede_pricing_rule: a nova versao precisa comecar depois '
                'do inicio da versao substituida';
  end if;

  -- Nova versao PRIMEIRO, para que a antiga possa apontar para ela.
  insert into public.pricing_rules (
    carrier_id, country_code, currency_code, platform_fee_percentage,
    risk_percentage, insurance_percentage,
    effective_from, effective_until, version, priority, is_active,
    created_by_admin, change_reason, supersedes_id, parameters
  ) values (
    v_old.carrier_id, v_old.country_code, v_old.currency_code, p_new_fee_percentage,
    v_old.risk_percentage, v_old.insurance_percentage,
    p_effective_from, null, v_old.version + 1, v_old.priority, true,
    v_actor, p_reason, p_rule_id,
    jsonb_build_object(
      'natureza', 'taxa comercial da plataforma SteelGo',
      'nao_e',    'piso minimo da ANTT nem qualquer piso regulatorio',
      'origem',   'admin_supersede_pricing_rule',
      'substitui', p_rule_id)
  )
  returning id into v_new;

  -- ENCERRAMENTO PARA A FRENTE. A taxa da regra antiga NAO e tocada: o contrato
  -- que a citou continua apontando para o numero que foi de fato cobrado.
  -- Nao se grava ponteiro de sucessao: a nova versao ja aponta para esta, e a
  -- relacao existe uma unica vez no schema.
  update public.pricing_rules r
     set effective_until  = p_effective_from,
         is_active        = false,
         closed_at        = now(),
         closed_by_admin  = v_actor
   where r.id = p_rule_id
     and r.closed_at is null;
  if not found then
    raise exception using errcode = '40001',
      message = 'admin_supersede_pricing_rule: a regra mudou durante a operacao';
  end if;

  insert into public.pricing_rule_events (
    pricing_rule_id, event_type, previous_rule_id, country_code, currency_code,
    carrier_id, fee_percentage, effective_from, effective_until, is_active,
    actor_kind, actor_id, reason, rpc_name, request_id, params_fingerprint
  ) values (
    v_new, 'superseded', p_rule_id, v_old.country_code, v_old.currency_code,
    v_old.carrier_id, p_new_fee_percentage, p_effective_from, null, true,
    'admin', v_actor, p_reason, 'admin_supersede_pricing_rule', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('admin_supersede_pricing_rule', p_request_id, v_actor, p_rule_id, v_fp,
          'accepted',
          format('regra %s (taxa %s%%) encerrada em %s e substituida por %s (taxa %s%%)',
                 p_rule_id, v_old.platform_fee_percentage, p_effective_from,
                 v_new, p_new_fee_percentage));

  return v_new;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- Encerramento sem substituta.
-- -----------------------------------------------------------------------------
create function public.admin_close_pricing_rule(
  p_rule_id        uuid,
  p_effective_until timestamptz,
  p_reason         text,
  p_request_id     uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := public.require_steelgo_admin('admin_close_pricing_rule');
  v_old   public.pricing_rules%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
begin
  if p_rule_id is null then
    raise exception using errcode = '22004',
      message = 'admin_close_pricing_rule: p_rule_id e obrigatorio';
  end if;
  if p_effective_until is null then
    raise exception using errcode = '22004',
      message = 'admin_close_pricing_rule: data de encerramento e obrigatoria';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception using errcode = '22023',
      message = 'admin_close_pricing_rule: justificativa e obrigatoria e precisa '
                'de ao menos 10 caracteres';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'rule_id', p_rule_id, 'effective_until', p_effective_until));

  v_log := public.rpc_idempotency_probe(
    'admin_close_pricing_rule', p_request_id, v_actor, p_rule_id, v_fp);
  if v_log.id is not null then
    return p_rule_id;
  end if;

  select * into v_old from public.pricing_rules r where r.id = p_rule_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'admin_close_pricing_rule: regra inexistente';
  end if;
  if v_old.closed_at is not null then
    raise exception using errcode = '23505',
      message = 'admin_close_pricing_rule: regra ja encerrada';
  end if;
  if p_effective_until <= v_old.effective_from then
    raise exception using errcode = '22023',
      message = 'admin_close_pricing_rule: encerramento precisa ser posterior ao '
                'inicio da vigencia';
  end if;

  update public.pricing_rules r
     set effective_until = p_effective_until,
         is_active       = false,
         closed_at       = now(),
         closed_by_admin = v_actor
   where r.id = p_rule_id and r.closed_at is null;
  if not found then
    raise exception using errcode = '40001',
      message = 'admin_close_pricing_rule: a regra mudou durante a operacao';
  end if;

  insert into public.pricing_rule_events (
    pricing_rule_id, event_type, previous_rule_id, country_code, currency_code,
    carrier_id, fee_percentage, effective_from, effective_until, is_active,
    actor_kind, actor_id, reason, rpc_name, request_id, params_fingerprint
  ) values (
    p_rule_id, 'closed', null, v_old.country_code, v_old.currency_code,
    v_old.carrier_id, v_old.platform_fee_percentage, v_old.effective_from,
    p_effective_until, false,
    'admin', v_actor, p_reason, 'admin_close_pricing_rule', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('admin_close_pricing_rule', p_request_id, v_actor, p_rule_id, v_fp,
          'accepted',
          format('regra %s encerrada em %s; taxa historica %s%% preservada',
                 p_rule_id, p_effective_until, v_old.platform_fee_percentage));

  return p_rule_id;
end;
$fn$;

-- -----------------------------------------------------------------------------
-- GRANTS
-- -----------------------------------------------------------------------------
revoke execute on function public.admin_create_pricing_rule(text, text, numeric, timestamptz, timestamptz, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.admin_supersede_pricing_rule(uuid, numeric, timestamptz, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.admin_close_pricing_rule(uuid, timestamptz, text, uuid)
  from public, anon, authenticated;

-- EXECUTE a authenticated porque nao existe papel de banco correspondente a
-- admin neste projeto. A restricao a administrador e feita DENTRO da funcao,
-- por public.has_role apurado no servidor. Conceder aqui NAO amplia privilegio.
grant execute on function public.admin_create_pricing_rule(text, text, numeric, timestamptz, timestamptz, uuid, text, uuid) to authenticated;
grant execute on function public.admin_supersede_pricing_rule(uuid, numeric, timestamptz, text, uuid) to authenticated;
grant execute on function public.admin_close_pricing_rule(uuid, timestamptz, text, uuid) to authenticated;

commit;
