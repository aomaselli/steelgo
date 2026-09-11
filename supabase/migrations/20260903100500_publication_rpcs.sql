-- =============================================================================
-- L2a - migration 6/7 : RPCs SECURITY DEFINER do ciclo de vida do frete
-- =============================================================================
-- REGRAS OBSERVADAS EM TODAS AS FUNCOES DESTE ARQUIVO:
--
--  * search_path = '' e TODOS os nomes totalmente qualificados.
--  * SECURITY DEFINER NAO e autorizacao. Cada RPC publica verifica autor, papel
--    e vinculo com a empresa, reproduzindo a policy freights_update_owner ja
--    vigente (created_by OR dono da empresa OR admin). Nenhum privilegio novo.
--  * NENHUM parametro de identidade e aceito como prova. Nao existe p_actor_id
--    nem p_role. O ator e (select auth.uid()); a empresa do frete e lida de
--    public.freights.company_id; o papel e apurado por public.has_role no
--    servidor. Na criacao, p_company_id e um PEDIDO, verificado no servidor
--    contra a titularidade real - nunca aceito como autorizacao.
--  * auth.uid() le a claim do JWT VERIFICADO pelo PostgREST. Nao e GUC de sessao
--    definido por codigo de aplicacao; um chamador authenticated nao a forja.
--  * IDEMPOTENCIA CUMULATIVA EM QUATRO DIMENSOES, via
--    public.rpc_idempotency_probe: ator, nome da operacao, alvo e impressao
--    digital canonica dos parametros relevantes. O indice unico parcial
--    rpc_call_log_accepted_request_unique consome o request_id UMA vez em toda a
--    base, de modo que o mesmo request_id em publish, withdraw, reprice ou
--    qualquer outra RPC NAO devolve o evento de operacao diferente: levanta
--    42501. Valor, motivo, empresa, preview ou lista de ids diferentes mudam a
--    impressao digital e tambem falham. Numericos passam por trim_scale, para que
--    1.50 e 1.5 sejam a mesma chamada; listas de ids sao ordenadas antes de
--    digerir, para que a mesma lista em outra ordem seja a mesma chamada.
--  * REVOKE EXECUTE de PUBLIC, anon e authenticated ANTES dos grants finais.
--  * Ordem invariavel: (1) trava da linha, (2) INSERT do evento, (3) UPDATE do
--    frete. Prova no cabecalho de 20260903100200.
--  * LEGADOS ALCANCADOS. public.ensure_offer_version captura, para anuncio
--    pre-L2a sem versao de oferta, uma versao raiz 'legacy_unassessed' com os
--    valores REAIS - inclusive budget nulo - e classifica value_basis como
--    legacy_known_positive ou legacy_unknown conforme o que existe. Retirada
--    unitaria, em massa e emergencial funcionam sobre legados sem inventar valor.
--  * COBERTURA TOTAL. As seis escritas diretas em public.freights.status hoje
--    existentes no frontend, mais o INSERT de criacao, mais os dois UPDATE
--    diretos em public.bids e o INSERT direto em public.contracts do aceite de
--    proposta, tem substituta aqui. Nao resta fluxo sem RPC.
--  * UMA VIA PUBLICA POR TRANSICAO. mark_freight_contract_pending foi REMOVIDA:
--    a transicao para contract_pending pertence a
--    accept_bid_and_create_contract, que e a unica que consegue mante-la
--    coerente com public.bids e public.contracts na mesma transacao.
-- =============================================================================

begin;

-- =============================================================================
-- 0. Autorizacao compartilhada
-- =============================================================================
create function public.can_govern_freight(p_created_by uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select p_created_by = (select auth.uid())
      or public.is_current_user_company_owner(p_company_id)
      or public.has_role((select auth.uid()), 'admin'::public.app_role)
$fn$;

revoke execute on function public.can_govern_freight(uuid, uuid)
  from public, anon, authenticated;

comment on function public.can_govern_freight(uuid, uuid) is
  'Reproduz exatamente a policy freights_update_owner. Nenhuma RPC concede mais '
  'do que o papel authenticated ja podia fazer antes do L2a.';

-- =============================================================================
-- 1. NUCLEOS INTERNOS  (sem probe de idempotencia, sem log; os chamadores fazem)
-- =============================================================================

create function public.create_freight_draft_core(
  p_company_id  uuid,
  p_payload     jsonb,
  p_actor_id    uuid,
  p_rpc_name    text,
  p_request_id  uuid,
  p_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_allowed text[] := array[
    'steel_type','weight_tons','volume_m3',
    'cargo_value_brl','cargo_value_amount','distance_km',
    'origin_name','origin_city','origin_state',
    'origin_lat','origin_lng','origin_country_code',
    'origin_subdivision_code','origin_postal_code','origin_timezone',
    'dest_name','dest_city','dest_state',
    'dest_lat','dest_lng','destination_country_code',
    'destination_subdivision_code','destination_postal_code','destination_timezone',
    'waypoints','operation_scope','toll_included',
    'required_truck','category','goods_type_code',
    'requires_mopp','regulatory_requirements','handling_requirements',
    'pickup_date','delivery_date','pickup_window',
    'bid_deadline','cargo_description','notes',
    'internal_reference','budget_brl','search_radius_km'
  ];
  v_key text;
  v_rec public.freights%rowtype;
  v_row public.freights%rowtype;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023',
      message = 'create_freight_draft: payload tem de ser um objeto jsonb';
  end if;

  -- Lista branca explicita, derivada da particao de colunas. Uma chave fora dela
  -- FALHA - nunca e ignorada em silencio. status, published_at, budget_amount,
  -- currency_code, last_publication_event_id, company_id, created_by, created_at,
  -- id, final_price_* e matched_* NAO estao na lista e nao podem vir do cliente.
  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any (v_allowed)) then
      raise exception using errcode = '42501',
        message = format('create_freight_draft: campo nao permitido no payload: %s',
                         v_key);
    end if;
  end loop;

  v_rec := jsonb_populate_record(null::public.freights, p_payload);

  if v_rec.budget_brl is not null and v_rec.budget_brl <= 0 then
    raise exception using errcode = '22023',
      message = 'create_freight_draft: budget_brl proposto tem de ser positivo ou nulo';
  end if;

  -- DUAS ETAPAS, DELIBERADAMENTE.
  -- O INSERT cria a linha com as colunas de identidade e estado fixadas no
  -- servidor e deixa TODAS as demais receberem o DEFAULT da propria coluna.
  -- O UPDATE seguinte aplica o payload com coalesce(payload, default). Assim os
  -- valores-padrao NAO sao reescritos aqui e nao ha risco de divergirem do
  -- schema: onze colunas de public.freights sao NOT NULL COM default
  -- (operation_scope, origin_country_code, waypoints, requires_mopp e outras) e
  -- enumera-las com null no INSERT violaria a restricao. Este e o motivo do
  -- desenho em duas etapas, e nao economia de digitacao.
  insert into public.freights (
    company_id, created_by, status, published_at, last_publication_event_id
  ) values (
    p_company_id, p_actor_id, 'draft'::public.freight_status, null, null
  )
  returning * into v_row;

  update public.freights f
     set
         steel_type               = coalesce(v_rec.steel_type, v_row.steel_type),
         weight_tons              = coalesce(v_rec.weight_tons, v_row.weight_tons),
         volume_m3                = coalesce(v_rec.volume_m3, v_row.volume_m3),
         cargo_value_brl          = coalesce(v_rec.cargo_value_brl, v_row.cargo_value_brl),
         cargo_value_amount       = coalesce(v_rec.cargo_value_amount, v_row.cargo_value_amount),
         distance_km              = coalesce(v_rec.distance_km, v_row.distance_km),
         origin_name              = coalesce(v_rec.origin_name, v_row.origin_name),
         origin_city              = coalesce(v_rec.origin_city, v_row.origin_city),
         origin_state             = coalesce(v_rec.origin_state, v_row.origin_state),
         origin_lat               = coalesce(v_rec.origin_lat, v_row.origin_lat),
         origin_lng               = coalesce(v_rec.origin_lng, v_row.origin_lng),
         origin_country_code      = coalesce(v_rec.origin_country_code, v_row.origin_country_code),
         origin_subdivision_code  = coalesce(v_rec.origin_subdivision_code, v_row.origin_subdivision_code),
         origin_postal_code       = coalesce(v_rec.origin_postal_code, v_row.origin_postal_code),
         origin_timezone          = coalesce(v_rec.origin_timezone, v_row.origin_timezone),
         dest_name                = coalesce(v_rec.dest_name, v_row.dest_name),
         dest_city                = coalesce(v_rec.dest_city, v_row.dest_city),
         dest_state               = coalesce(v_rec.dest_state, v_row.dest_state),
         dest_lat                 = coalesce(v_rec.dest_lat, v_row.dest_lat),
         dest_lng                 = coalesce(v_rec.dest_lng, v_row.dest_lng),
         destination_country_code = coalesce(v_rec.destination_country_code, v_row.destination_country_code),
         destination_subdivision_code = coalesce(v_rec.destination_subdivision_code, v_row.destination_subdivision_code),
         destination_postal_code  = coalesce(v_rec.destination_postal_code, v_row.destination_postal_code),
         destination_timezone     = coalesce(v_rec.destination_timezone, v_row.destination_timezone),
         waypoints                = coalesce(v_rec.waypoints, v_row.waypoints),
         operation_scope          = coalesce(v_rec.operation_scope, v_row.operation_scope),
         toll_included            = coalesce(v_rec.toll_included, v_row.toll_included),
         required_truck           = coalesce(v_rec.required_truck, v_row.required_truck),
         category                 = coalesce(v_rec.category, v_row.category),
         goods_type_code          = coalesce(v_rec.goods_type_code, v_row.goods_type_code),
         requires_mopp            = coalesce(v_rec.requires_mopp, v_row.requires_mopp),
         regulatory_requirements  = coalesce(v_rec.regulatory_requirements, v_row.regulatory_requirements),
         handling_requirements    = coalesce(v_rec.handling_requirements, v_row.handling_requirements),
         pickup_date              = coalesce(v_rec.pickup_date, v_row.pickup_date),
         delivery_date            = coalesce(v_rec.delivery_date, v_row.delivery_date),
         pickup_window            = coalesce(v_rec.pickup_window, v_row.pickup_window),
         bid_deadline             = coalesce(v_rec.bid_deadline, v_row.bid_deadline),
         cargo_description        = coalesce(v_rec.cargo_description, v_row.cargo_description),
         notes                    = coalesce(v_rec.notes, v_row.notes),
         internal_reference       = coalesce(v_rec.internal_reference, v_row.internal_reference),
         budget_brl               = coalesce(v_rec.budget_brl, v_row.budget_brl),
         search_radius_km         = coalesce(v_rec.search_radius_km, v_row.search_radius_km),
         budget_amount            = coalesce(v_rec.budget_brl, v_row.budget_amount)
   where f.id = v_row.id;

  return v_row.id;
end;
$fn$;

revoke execute on function
  public.create_freight_draft_core(uuid, jsonb, uuid, text, uuid, text)
  from public, anon, authenticated;

comment on function public.create_freight_draft_core(uuid, jsonb, uuid, text, uuid, text) is
  'Insercao de frete SEMPRE como draft. status, published_at, budget_amount, '
  'last_publication_event_id, company_id e created_by sao fixados no servidor e '
  'nao aceitam valor do cliente. Fecha a publicacao por INSERT sem transformar '
  'published em draft silenciosamente: um payload que tente trazer status FALHA '
  'com 42501. Executa em duas etapas para preservar os DEFAULT das colunas NOT '
  'NULL - ver comentario no corpo. budget_brl E aceito no payload, e isso e '
  'deliberado: em rascunho ele e valor PROPOSTO, nao valor anunciado; o anunciado '
  'so passa a existir quando publish_freight o declara e o registra em '
  'freight_offer_versions com provenance rpc_declared. Depois da criacao '
  'budget_brl deixa de ser gravavel: a migration 7/7 o retira do GRANT UPDATE.';

-- -----------------------------------------------------------------------------

create function public.publish_freight_core(
  p_freight_id  uuid,
  p_budget_brl  numeric,
  p_actor_id    uuid,
  p_is_admin    boolean,
  p_reason      text,
  p_rpc_name    text,
  p_request_id  uuid,
  p_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_f          public.freights%rowtype;
  v_prev_offer uuid;
  v_offer_id   uuid;
  v_event_id   uuid;
  v_now        timestamptz := now();
begin
  -- (1) trava
  select * into v_f from public.freights f where f.id = p_freight_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'publish_freight: frete inexistente';
  end if;

  if not (v_f.status is null
          or v_f.status = 'draft'::public.freight_status
          or v_f.status = 'withdrawn'::public.freight_status) then
    raise exception using errcode = '22023',
      message = 'publish_freight: publicacao so a partir de draft, withdrawn ou status nulo';
  end if;

  if p_budget_brl is null or p_budget_brl <= 0 then
    raise exception using errcode = '22023',
      message = 'publish_freight: valor anunciado tem de ser positivo';
  end if;

  if v_f.currency_code <> 'BRL' then
    raise exception using errcode = '0A000',
      message = 'publish_freight: moeda diferente de BRL nao suportada pelo L2a; '
                'budget_brl e budget_amount deixariam de ser comparaveis';
  end if;

  select o.id into v_prev_offer
    from public.freight_offer_versions o
   where o.freight_id = p_freight_id
     and not exists (select 1 from public.freight_offer_versions s
                      where s.supersedes_offer_version_id = o.id);

  -- Snapshot montado da PROPRIA linha travada: versao e realidade coincidem por
  -- construcao, e a migration 7/7 congela essas colunas enquanto publicado.
  insert into public.freight_offer_versions (
    freight_id, supersedes_offer_version_id,
    provenance, value_basis, snapshot_basis,
    budget_brl, budget_amount, currency_code, weight_tons, distance_km,
    offer_snapshot, created_by, rpc_name, request_id, params_fingerprint
  ) values (
    p_freight_id, v_prev_offer,
    'rpc_declared', 'declared_positive', 'declared_at_publication',
    p_budget_brl, p_budget_brl, v_f.currency_code, v_f.weight_tons, v_f.distance_km,
    public.freight_offer_snapshot(v_f) || jsonb_build_object(
      'budget_brl', p_budget_brl, 'budget_amount', p_budget_brl),
    p_actor_id, p_rpc_name, p_request_id, p_fingerprint
  )
  returning id into v_offer_id;

  -- (2) evento
  insert into public.freight_publication_events (
    freight_id, offer_version_id, previous_event_id, transition,
    previous_status, new_status, previous_published_at, new_published_at,
    previous_budget_brl, new_budget_brl, previous_budget_amount, new_budget_amount,
    previous_final_price_brl, new_final_price_brl,
    previous_final_price_amount, new_final_price_amount,
    previous_matched_carrier_id, new_matched_carrier_id,
    previous_matched_driver_id, new_matched_driver_id,
    previous_matched_truck_id, new_matched_truck_id,
    actor_id, actor_was_admin, actor_company_id, reason,
    rpc_name, request_id, params_fingerprint
  ) values (
    p_freight_id, v_offer_id, v_f.last_publication_event_id, 'publish',
    v_f.status, 'published'::public.freight_status, v_f.published_at, v_now,
    v_f.budget_brl, p_budget_brl, v_f.budget_amount, p_budget_brl,
    v_f.final_price_brl, v_f.final_price_brl,
    v_f.final_price_amount, v_f.final_price_amount,
    v_f.matched_carrier_id, v_f.matched_carrier_id,
    v_f.matched_driver_id, v_f.matched_driver_id,
    v_f.matched_truck_id, v_f.matched_truck_id,
    p_actor_id, p_is_admin, v_f.company_id, p_reason,
    p_rpc_name, p_request_id, p_fingerprint
  )
  returning id into v_event_id;

  -- (3) estado
  update public.freights f
     set status                    = 'published'::public.freight_status,
         published_at              = v_now,
         budget_brl                = p_budget_brl,
         budget_amount             = p_budget_brl,
         last_publication_event_id = v_event_id
   where f.id = p_freight_id;

  return v_event_id;
end;
$fn$;

revoke execute on function
  public.publish_freight_core(uuid, numeric, uuid, boolean, text, text, uuid, text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------

create function public.withdraw_freight_core(
  p_freight_id  uuid,
  p_actor_id    uuid,
  p_is_admin    boolean,
  p_reason      text,
  p_rpc_name    text,
  p_request_id  uuid,
  p_fingerprint text,
  p_preview_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_f        public.freights%rowtype;
  v_offer_id uuid;
  v_event_id uuid;
begin
  select * into v_f from public.freights f where f.id = p_freight_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = format('withdraw: frete %s inexistente', p_freight_id);
  end if;

  if v_f.status is distinct from 'published'::public.freight_status then
    raise exception using errcode = '22023',
      message = format('withdraw: frete %s nao esta publicado; nenhuma retirada aplicada',
                       p_freight_id);
  end if;

  -- Legado alcancado aqui: captura versao raiz legacy_unassessed com os valores
  -- REAIS, inclusive null. Nao inventa valor.
  v_offer_id := public.ensure_offer_version(
    p_freight_id, p_actor_id, p_rpc_name, p_request_id, p_fingerprint);

  insert into public.freight_publication_events (
    freight_id, offer_version_id, previous_event_id, transition,
    previous_status, new_status, previous_published_at, new_published_at,
    previous_budget_brl, new_budget_brl, previous_budget_amount, new_budget_amount,
    previous_final_price_brl, new_final_price_brl,
    previous_final_price_amount, new_final_price_amount,
    previous_matched_carrier_id, new_matched_carrier_id,
    previous_matched_driver_id, new_matched_driver_id,
    previous_matched_truck_id, new_matched_truck_id,
    actor_id, actor_was_admin, actor_company_id, reason,
    rpc_name, request_id, params_fingerprint, bulk_withdrawal_preview_id
  ) values (
    p_freight_id, v_offer_id, v_f.last_publication_event_id, 'withdraw',
    v_f.status, 'withdrawn'::public.freight_status, v_f.published_at, v_f.published_at,
    v_f.budget_brl, v_f.budget_brl, v_f.budget_amount, v_f.budget_amount,
    v_f.final_price_brl, v_f.final_price_brl,
    v_f.final_price_amount, v_f.final_price_amount,
    v_f.matched_carrier_id, v_f.matched_carrier_id,
    v_f.matched_driver_id, v_f.matched_driver_id,
    v_f.matched_truck_id, v_f.matched_truck_id,
    p_actor_id, p_is_admin, v_f.company_id, p_reason,
    p_rpc_name, p_request_id, p_fingerprint, p_preview_id
  )
  returning id into v_event_id;

  update public.freights f
     set status                    = 'withdrawn'::public.freight_status,
         last_publication_event_id = v_event_id
   where f.id = p_freight_id;

  return v_event_id;
end;
$fn$;

revoke execute on function
  public.withdraw_freight_core(uuid, uuid, boolean, text, text, uuid, text, uuid)
  from public, anon, authenticated;

comment on function
  public.withdraw_freight_core(uuid, uuid, boolean, text, text, uuid, text, uuid) is
  'Nucleo unico de retirada, compartilhado por withdraw_freight, '
  'execute_bulk_withdrawal e emergency_withdraw_offers_by_ids. Alcanca anuncio '
  'legado via public.ensure_offer_version, preservando os valores reais.';

-- =============================================================================
-- 2. RPCs DE CRIACAO  (fecham a publicacao por INSERT)
-- =============================================================================

create function public.create_freight_draft(
  p_company_id uuid,
  p_payload    jsonb,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_id    uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'create_freight_draft: chamador nao autenticado';
  end if;
  if p_company_id is null then
    raise exception using errcode = '22004',
      message = 'create_freight_draft: p_company_id e obrigatorio';
  end if;

  v_fp := public.rpc_params_fingerprint(
    jsonb_build_object('company_id', p_company_id, 'payload', p_payload));

  v_log := public.rpc_idempotency_probe(
    'create_freight_draft', p_request_id, v_actor, null, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;

  -- p_company_id e PEDIDO, nao prova. Verificacao no servidor contra a
  -- titularidade real. Fecha a brecha da policy freights_insert_owner, que
  -- exigia apenas created_by = auth.uid() e deixava o cliente escolher a
  -- empresa livremente.
  if not (public.is_current_user_company_owner(p_company_id)
          or public.is_current_user_company_member(p_company_id)
          or public.has_role(v_actor, 'admin'::public.app_role)) then
    raise exception using errcode = '42501',
      message = 'create_freight_draft: ator nao pertence a empresa informada';
  end if;

  v_id := public.create_freight_draft_core(
    p_company_id, p_payload, v_actor, 'create_freight_draft', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values
    ('create_freight_draft', p_request_id, v_actor, v_id, v_fp, 'accepted');

  return v_id;
end;
$fn$;

comment on function public.create_freight_draft(uuid, jsonb, uuid) is
  'Unica via de criacao de frete. Sempre draft. Um payload contendo status, '
  'published_at, budget_amount, currency_code, company_id, created_by ou '
  'qualquer coluna governada FALHA com 42501 - nao ha conversao silenciosa.';

-- -----------------------------------------------------------------------------

create function public.create_and_publish_freight(
  p_company_id uuid,
  p_payload    jsonb,
  p_budget_brl numeric,
  p_request_id uuid,
  p_reason     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_id    uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'create_and_publish_freight: chamador nao autenticado';
  end if;
  if p_company_id is null then
    raise exception using errcode = '22004',
      message = 'create_and_publish_freight: p_company_id e obrigatorio';
  end if;
  if p_budget_brl is null or p_budget_brl <= 0 then
    raise exception using errcode = '22023',
      message = 'create_and_publish_freight: valor anunciado tem de ser positivo';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'company_id', p_company_id,
    'payload',    p_payload,
    'budget_brl', trim_scale(p_budget_brl),
    'reason',     p_reason));

  v_log := public.rpc_idempotency_probe(
    'create_and_publish_freight', p_request_id, v_actor, null, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;

  if not (public.is_current_user_company_owner(p_company_id)
          or public.is_current_user_company_member(p_company_id)
          or public.has_role(v_actor, 'admin'::public.app_role)) then
    raise exception using errcode = '42501',
      message = 'create_and_publish_freight: ator nao pertence a empresa informada';
  end if;

  v_admin := public.has_role(v_actor, 'admin'::public.app_role);

  -- UMA transacao: ou nasce publicado com versao de oferta, evento e ponteiro
  -- coerentes, ou nao nasce. Nao existe janela em que o frete esteja publicado
  -- sem trilha.
  v_id := public.create_freight_draft_core(
    p_company_id, p_payload, v_actor, 'create_and_publish_freight', p_request_id, v_fp);

  perform public.publish_freight_core(
    v_id, p_budget_brl, v_actor, v_admin, p_reason,
    'create_and_publish_freight', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values
    ('create_and_publish_freight', p_request_id, v_actor, v_id, v_fp, 'accepted');

  return v_id;
end;
$fn$;

comment on function public.create_and_publish_freight(uuid, jsonb, numeric, uuid, text) is
  'Via transacional de criacao e publicacao, substituta do INSERT com '
  'status = published. Retorna o id do frete.';

-- =============================================================================
-- 3. RPCs DE TRANSICAO
-- =============================================================================

create function public.publish_freight(
  p_freight_id uuid,
  p_budget_brl numeric,
  p_request_id uuid,
  p_reason     text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean;
  v_f     public.freights%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_event uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'publish_freight: chamador nao autenticado';
  end if;
  if p_freight_id is null then
    raise exception using errcode = '22004',
      message = 'publish_freight: p_freight_id e obrigatorio';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'freight_id', p_freight_id,
    'budget_brl', trim_scale(p_budget_brl),
    'reason',     p_reason));

  v_log := public.rpc_idempotency_probe(
    'publish_freight', p_request_id, v_actor, p_freight_id, v_fp);
  if v_log.id is not null then
    select e.id into v_event from public.freight_publication_events e
     where e.request_id = p_request_id and e.freight_id = p_freight_id;
    return v_event;
  end if;

  select * into v_f from public.freights f where f.id = p_freight_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'publish_freight: frete inexistente';
  end if;
  if not public.can_govern_freight(v_f.created_by, v_f.company_id) then
    raise exception using errcode = '42501',
      message = 'publish_freight: ator nao autorizado sobre este frete';
  end if;
  v_admin := public.has_role(v_actor, 'admin'::public.app_role);

  v_event := public.publish_freight_core(
    p_freight_id, p_budget_brl, v_actor, v_admin, p_reason,
    'publish_freight', p_request_id, v_fp);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('publish_freight', p_request_id, v_actor, p_freight_id, v_fp, 'accepted');

  return v_event;
end;
$fn$;

-- -----------------------------------------------------------------------------

create function public.withdraw_freight(
  p_freight_id uuid,
  p_reason     text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean;
  v_f     public.freights%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_event uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'withdraw_freight: chamador nao autenticado';
  end if;
  if p_freight_id is null then
    raise exception using errcode = '22004',
      message = 'withdraw_freight: p_freight_id e obrigatorio';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception using errcode = '22004',
      message = 'withdraw_freight: motivo da retirada e obrigatorio';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'freight_id', p_freight_id, 'reason', p_reason));

  v_log := public.rpc_idempotency_probe(
    'withdraw_freight', p_request_id, v_actor, p_freight_id, v_fp);
  if v_log.id is not null then
    select e.id into v_event from public.freight_publication_events e
     where e.request_id = p_request_id and e.freight_id = p_freight_id;
    return v_event;
  end if;

  select * into v_f from public.freights f where f.id = p_freight_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'withdraw_freight: frete inexistente';
  end if;
  if not public.can_govern_freight(v_f.created_by, v_f.company_id) then
    raise exception using errcode = '42501',
      message = 'withdraw_freight: ator nao autorizado sobre este frete';
  end if;
  v_admin := public.has_role(v_actor, 'admin'::public.app_role);

  v_event := public.withdraw_freight_core(
    p_freight_id, v_actor, v_admin, p_reason,
    'withdraw_freight', p_request_id, v_fp, null);

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('withdraw_freight', p_request_id, v_actor, p_freight_id, v_fp, 'accepted');

  return v_event;
end;
$fn$;

comment on function public.withdraw_freight(uuid, text, uuid) is
  'Retirada unitaria. Preserva published_at e o valor anunciado: a retirada nao '
  'apaga o fato de a oferta ter estado publicada. Alcanca anuncio legado.';

-- -----------------------------------------------------------------------------

create function public.reprice_published_freight(
  p_freight_id uuid,
  p_budget_brl numeric,
  p_reason     text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean;
  v_f     public.freights%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_prev  uuid;
  v_offer uuid;
  v_event uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'reprice_published_freight: chamador nao autenticado';
  end if;
  if p_freight_id is null then
    raise exception using errcode = '22004',
      message = 'reprice_published_freight: p_freight_id e obrigatorio';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception using errcode = '22004',
      message = 'reprice_published_freight: motivo e obrigatorio';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'freight_id', p_freight_id,
    'budget_brl', trim_scale(p_budget_brl),
    'reason',     p_reason));

  v_log := public.rpc_idempotency_probe(
    'reprice_published_freight', p_request_id, v_actor, p_freight_id, v_fp);
  if v_log.id is not null then
    select e.id into v_event from public.freight_publication_events e
     where e.request_id = p_request_id and e.freight_id = p_freight_id;
    return v_event;
  end if;

  select * into v_f from public.freights f where f.id = p_freight_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'reprice_published_freight: frete inexistente';
  end if;
  if not public.can_govern_freight(v_f.created_by, v_f.company_id) then
    raise exception using errcode = '42501',
      message = 'reprice_published_freight: ator nao autorizado sobre este frete';
  end if;
  if v_f.status is distinct from 'published'::public.freight_status then
    raise exception using errcode = '22023',
      message = 'reprice_published_freight: somente frete publicado pode ser reprecificado';
  end if;
  if p_budget_brl is null or p_budget_brl <= 0 then
    raise exception using errcode = '22023',
      message = 'reprice_published_freight: valor anunciado tem de ser positivo';
  end if;
  if p_budget_brl is not distinct from v_f.budget_brl then
    raise exception using errcode = '22023',
      message = 'reprice_published_freight: valor identico ao vigente; nada a registrar';
  end if;
  if v_f.currency_code <> 'BRL' then
    raise exception using errcode = '0A000',
      message = 'reprice_published_freight: moeda diferente de BRL nao suportada pelo L2a';
  end if;

  v_admin := public.has_role(v_actor, 'admin'::public.app_role);

  -- Legado tambem pode ser reprecificado: a captura legacy_unassessed vira a
  -- antecessora da nova versao rpc_declared.
  v_prev := public.ensure_offer_version(
    p_freight_id, v_actor, 'reprice_published_freight', p_request_id, v_fp);

  insert into public.freight_offer_versions (
    freight_id, supersedes_offer_version_id,
    provenance, value_basis, snapshot_basis,
    budget_brl, budget_amount, currency_code, weight_tons, distance_km,
    offer_snapshot, created_by, rpc_name, request_id, params_fingerprint
  ) values (
    p_freight_id, v_prev,
    'rpc_declared', 'declared_positive', 'declared_at_publication',
    p_budget_brl, p_budget_brl, v_f.currency_code, v_f.weight_tons, v_f.distance_km,
    public.freight_offer_snapshot(v_f) || jsonb_build_object(
      'budget_brl', p_budget_brl, 'budget_amount', p_budget_brl),
    v_actor, 'reprice_published_freight', p_request_id, v_fp
  )
  returning id into v_offer;

  -- Releitura: ensure_offer_version nao muda public.freights, mas o ponteiro e
  -- lido de novo por disciplina de ordem (1)(2)(3).
  select * into v_f from public.freights f where f.id = p_freight_id for update;

  insert into public.freight_publication_events (
    freight_id, offer_version_id, previous_event_id, transition,
    previous_status, new_status, previous_published_at, new_published_at,
    previous_budget_brl, new_budget_brl, previous_budget_amount, new_budget_amount,
    previous_final_price_brl, new_final_price_brl,
    previous_final_price_amount, new_final_price_amount,
    previous_matched_carrier_id, new_matched_carrier_id,
    previous_matched_driver_id, new_matched_driver_id,
    previous_matched_truck_id, new_matched_truck_id,
    actor_id, actor_was_admin, actor_company_id, reason,
    rpc_name, request_id, params_fingerprint
  ) values (
    p_freight_id, v_offer, v_f.last_publication_event_id, 'reprice',
    v_f.status, 'published'::public.freight_status, v_f.published_at, v_f.published_at,
    v_f.budget_brl, p_budget_brl, v_f.budget_amount, p_budget_brl,
    v_f.final_price_brl, v_f.final_price_brl,
    v_f.final_price_amount, v_f.final_price_amount,
    v_f.matched_carrier_id, v_f.matched_carrier_id,
    v_f.matched_driver_id, v_f.matched_driver_id,
    v_f.matched_truck_id, v_f.matched_truck_id,
    v_actor, v_admin, v_f.company_id, p_reason,
    'reprice_published_freight', p_request_id, v_fp
  )
  returning id into v_event;

  update public.freights f
     set budget_brl                = p_budget_brl,
         budget_amount             = p_budget_brl,
         last_publication_event_id = v_event
   where f.id = p_freight_id;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('reprice_published_freight', p_request_id, v_actor, p_freight_id, v_fp, 'accepted');

  return v_event;
end;
$fn$;

comment on function public.reprice_published_freight(uuid, numeric, text, uuid) is
  'Unica via de alteracao do valor anunciado de oferta publicada. Cria nova '
  'versao de oferta encadeada. Nao altera published_at.';

-- -----------------------------------------------------------------------------

create function public.cancel_freight(
  p_freight_id uuid,
  p_reason     text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean;
  v_f     public.freights%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_offer uuid;
  v_event uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'cancel_freight: chamador nao autenticado';
  end if;
  if p_freight_id is null then
    raise exception using errcode = '22004',
      message = 'cancel_freight: p_freight_id e obrigatorio';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception using errcode = '22004',
      message = 'cancel_freight: motivo do cancelamento e obrigatorio';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'freight_id', p_freight_id, 'reason', p_reason));

  v_log := public.rpc_idempotency_probe(
    'cancel_freight', p_request_id, v_actor, p_freight_id, v_fp);
  if v_log.id is not null then
    select e.id into v_event from public.freight_publication_events e
     where e.request_id = p_request_id and e.freight_id = p_freight_id;
    return v_event;
  end if;

  select * into v_f from public.freights f where f.id = p_freight_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'cancel_freight: frete inexistente';
  end if;
  if not public.can_govern_freight(v_f.created_by, v_f.company_id) then
    raise exception using errcode = '42501',
      message = 'cancel_freight: ator nao autorizado sobre este frete';
  end if;
  -- ALLOWLIST EXPLICITA DE ESTADO DE ORIGEM. Antes era "qualquer estado menos
  -- cancelled", o que permitia cancelar frete em execucao ou ja entregue. Os
  -- estados recusados abaixo NAO comportam cancelamento comum:
  --   contract_pending, contracted : existe contrato em public.contracts, com
  --     assinatura pendente ou ja colhida. Encerrar esse vinculo e RESCISAO, com
  --     efeitos comerciais proprios - precisa de RPC dedicada, que registre a
  --     parte que rescinde, o motivo contratual e o desfecho do contrato. Nao
  --     existe no L2a; e escopo de L2b.
  --   in_transit, delivered, completed : a execucao comecou ou terminou.
  --     Cancelar apagaria um fato ocorrido; o registro correto e disputa ou
  --     ocorrencia, nao cancelamento.
  --   disputed : ja esta em tratamento proprio.
  -- A mesma allowlist esta no CHECK da matriz de transicao (20260903100200),
  -- portanto vale tambem para quem escrever direto na tabela.
  if not (v_f.status is null
          or v_f.status in ('draft'::public.freight_status,
                            'published'::public.freight_status,
                            'withdrawn'::public.freight_status,
                            'bidding'::public.freight_status,
                            'matched'::public.freight_status)) then
    if v_f.status = 'cancelled'::public.freight_status then
      raise exception using errcode = '22023',
        message = 'cancel_freight: frete ja cancelado';
    end if;
    if v_f.status in ('contract_pending'::public.freight_status,
                      'contracted'::public.freight_status) then
      raise exception using errcode = '22023',
        message = format('cancel_freight: frete em %s possui contrato; encerrar '
                         'esse vinculo e rescisao, nao cancelamento, e exige '
                         'fluxo proprio ainda nao implementado', v_f.status);
    end if;
    raise exception using errcode = '22023',
      message = format('cancel_freight: frete em %s nao pode ser cancelado; a '
                       'execucao ja comecou ou terminou', v_f.status);
  end if;

  v_admin := public.has_role(v_actor, 'admin'::public.app_role);

  -- Frete que ja esteve anunciado cita a versao vigente (capturando o legado se
  -- for o caso). Rascunho nunca publicado nao tem oferta a citar: null.
  if v_f.published_at is not null
     or v_f.status = 'published'::public.freight_status
     or v_f.last_publication_event_id is not null then
    v_offer := public.ensure_offer_version(
      p_freight_id, v_actor, 'cancel_freight', p_request_id, v_fp);
  else
    v_offer := null;
  end if;

  insert into public.freight_publication_events (
    freight_id, offer_version_id, previous_event_id, transition,
    previous_status, new_status, previous_published_at, new_published_at,
    previous_budget_brl, new_budget_brl, previous_budget_amount, new_budget_amount,
    previous_final_price_brl, new_final_price_brl,
    previous_final_price_amount, new_final_price_amount,
    previous_matched_carrier_id, new_matched_carrier_id,
    previous_matched_driver_id, new_matched_driver_id,
    previous_matched_truck_id, new_matched_truck_id,
    actor_id, actor_was_admin, actor_company_id, reason,
    rpc_name, request_id, params_fingerprint
  ) values (
    p_freight_id, v_offer, v_f.last_publication_event_id, 'cancel',
    v_f.status, 'cancelled'::public.freight_status, v_f.published_at, v_f.published_at,
    v_f.budget_brl, v_f.budget_brl, v_f.budget_amount, v_f.budget_amount,
    v_f.final_price_brl, v_f.final_price_brl,
    v_f.final_price_amount, v_f.final_price_amount,
    v_f.matched_carrier_id, v_f.matched_carrier_id,
    v_f.matched_driver_id, v_f.matched_driver_id,
    v_f.matched_truck_id, v_f.matched_truck_id,
    v_actor, v_admin, v_f.company_id, p_reason,
    'cancel_freight', p_request_id, v_fp
  )
  returning id into v_event;

  update public.freights f
     set status                    = 'cancelled'::public.freight_status,
         last_publication_event_id = v_event
   where f.id = p_freight_id;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values ('cancel_freight', p_request_id, v_actor, p_freight_id, v_fp, 'accepted');

  return v_event;
end;
$fn$;

comment on function public.cancel_freight(uuid, text, uuid) is
  'Substituta das quatro chamadas diretas de status = cancelled hoje existentes '
  'no frontend (FreightDetailPage e admin.freights). Sem ela o endurecimento da '
  'migration 7/7 quebraria o cancelamento.';

-- -----------------------------------------------------------------------------

-- =============================================================================
-- 3-bis. TAXA DA PLATAFORMA - lida do repositorio, nunca inventada
-- =============================================================================
-- FATO COMPROVADO. A coluna public.pricing_rules.platform_fee_percentage
-- existe desde 20260812140000 linha 186, como numeric(8,4) not null default
-- 3.5. Existe tambem, em HEAD, o literal 0.035 escrito a mao em
-- FreightDetailPage.tsx:181, sem lastro nenhum - e ele deixa de existir com
-- esta revisao.
--
-- FATO COMPROVADO, SEGUNDA PARTE. Nenhuma migration do repositorio insere
-- linha alguma em public.pricing_rules. Verificado por varredura das 36
-- migrations: zero ocorrencias de INSERT nessa tabela. Numa base recem
-- construida a tabela esta VAZIA.
--
-- CORRECAO DA REVISAO 6. A revisao 5 afirmava aqui que "os 3,5% ja estao
-- aprovados NO REPOSITORIO, como padrao daquela coluna". Essa afirmacao esta
-- RETIRADA: um default de coluna e uma conveniencia de schema, nao um registro
-- de decisao comercial. Nao existe linha aprovada, nao existe created_by, nao
-- existe effective_from que alguem tenha assinado. Tratar o default como
-- aprovacao seria inventar a taxa por outro caminho.
--
-- PENDENCIA ABERTA, REGISTRADA E NAO RESOLVIDA POR ESTA MIGRATION. Nenhum seed
-- e aplicado aqui. Enquanto public.pricing_rules estiver vazia para o par
-- (pais, moeda) do frete, accept_bid_and_create_contract LEVANTA 22023 e o
-- aceite de proposta nao acontece. A migration de seed esta redigida no
-- relatorio F4.4, secao "Pendencia comercial", pronta para aplicacao APOS
-- aprovacao explicita da porcentagem pela SteelGo.
--
-- A taxa da plataforma e COMERCIAL. Nao e piso regulatorio, nao deriva de piso
-- regulatorio e nao tem qualquer relacao com ele.
--
-- FAIL-CLOSED DELIBERADO. Se nenhuma regra aplicavel existir, esta funcao
-- LEVANTA em vez de assumir 3,5. Assumir seria exatamente inventar a taxa.
--
-- SELECAO DETERMINISTICA. Regra especifica da transportadora vence a geral;
-- depois menor priority; depois a vigencia mais recente. Empate residual e
-- desempatado pelo id, para que a escolha nao dependa da ordem fisica das
-- linhas.
-- =============================================================================
create function public.platform_pricing_rule_for(
  p_country_code text,
  p_currency_code text,
  p_carrier_id    uuid
)
returns public.pricing_rules
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v public.pricing_rules%rowtype;
begin
  select * into v
    from public.pricing_rules pr
   where pr.is_active
     and pr.country_code  = p_country_code
     and pr.currency_code = p_currency_code
     and pr.effective_from <= now()
     and (pr.effective_until is null or pr.effective_until > now())
     and (pr.carrier_id is null or pr.carrier_id = p_carrier_id)
   order by (pr.carrier_id is not null) desc,
            pr.priority asc,
            pr.effective_from desc,
            pr.id asc
   limit 1;

  if not found then
    raise exception using errcode = '22023',
      message = format('nenhuma regra de precificacao ativa para pais %s e moeda %s; '
                       'a taxa da plataforma NAO e assumida - configure '
                       'public.pricing_rules antes de aceitar propostas',
                       p_country_code, p_currency_code);
  end if;

  return v;
end;
$fn$;

revoke execute on function public.platform_pricing_rule_for(text, text, uuid)
  from public, anon, authenticated;

comment on function public.platform_pricing_rule_for(text, text, uuid) is
  'Devolve a regra de precificacao aplicavel. Levanta 22023 quando nao existe - '
  'a taxa da plataforma nunca e assumida no codigo. A coluna '
  'pricing_rules.platform_fee_percentage tem default 3.5 desde 20260812140000, '
  'mas NENHUMA migration insere linha nessa tabela: o default e conveniencia de '
  'schema, nao aprovacao comercial. Taxa comercial nao e piso regulatorio.';

-- =============================================================================
-- accept_bid_and_create_contract  -  UMA transacao para o aceite inteiro
-- =============================================================================
-- SUBSTITUI TRES CHAMADAS HTTP SEPARADAS que a tela fazia em sequencia:
--   1. UPDATE bids SET status='accepted'  WHERE id = <escolhida>
--   2. UPDATE bids SET status='rejected'  WHERE freight_id = <frete> AND id <> <escolhida>
--   3. RPC de transicao do frete
--   4. INSERT direto em public.contracts
--
-- Dois bloqueios funcionais confirmados nesse desenho, ambos resolvidos aqui:
--
--   BLOQUEIO 1 - a tela marcava a proposta como 'accepted' ANTES de chamar a
--   RPC, e a RPC exige 'pending'. O fluxo real portanto rejeitava sempre a
--   propria proposta recem-aceita, com 22023. Aqui a ordem e invertida e
--   interna: a proposta so muda de estado DEPOIS de validada e usada.
--
--   BLOQUEIO 2 - o INSERT em public.contracts esbarrava em
--   contracts_insert_admin, cujo WITH CHECK e has_role(auth.uid(),'admin'):
--   embarcador comum recebia falha de RLS. Aqui o INSERT ocorre dentro de
--   SECURITY DEFINER, cujo dono e o dono da tabela, de modo que a policy
--   continua valendo para escrita direta do cliente - e o teste G11 comprova
--   que continua bloqueando - enquanto a via legitima funciona.
--
-- E, sendo tudo uma unica transacao, nao existe mais estado parcial: ou o frete
-- reserva, as propostas se ajustam, o evento e gravado e o contrato nasce, ou
-- nada disso acontece.
--
-- ORDEM DE OPERACOES, deliberada:
--   (1) autenticar e serializar idempotencia (advisory lock dentro da probe)
--   (2) travar o frete FOR UPDATE
--   (3) travar a proposta escolhida FOR UPDATE
--   (4) validar governanca do chamador sobre o frete
--   (5) validar frete published
--   (6) validar proposta deste frete
--   (7) validar proposta pending, nao expirada, com valor positivo e transportadora
--   (8) travar as DEMAIS propostas do frete em ordem crescente de id
--   (9) registrar a transicao para contract_pending (evento + estado)
--  (10) derivar preco, carrier, driver e truck EXCLUSIVAMENTE da proposta
--  (11) marcar a escolhida accepted
--  (12) marcar rejected apenas as demais AINDA pending
--  (13) calcular taxa a partir de public.pricing_rules e criar o contrato
--  (14) registrar rpc_call_log
--
-- O passo (8) usa ordem crescente de id pela mesma razao do lote de emergencia:
-- duas sessoes concorrentes travam as mesmas linhas na mesma ordem e nao formam
-- ciclo de espera.
-- =============================================================================
create function public.accept_bid_and_create_contract(
  p_freight_id uuid,
  p_bid_id     uuid,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor    uuid := (select auth.uid());
  v_admin    boolean;
  v_f        public.freights%rowtype;
  v_b        public.bids%rowtype;
  v_rule     public.pricing_rules%rowtype;
  v_fp       text;
  v_log      public.rpc_call_log%rowtype;
  v_offer    uuid;
  v_event    uuid;
  v_contract uuid;
  v_carrier_company uuid;
  v_amount   numeric;
  v_fee      numeric;
  v_payout   numeric;
  v_other    uuid;
  v_rejected integer := 0;
begin
  -- (1) ------------------------------------------------------------------
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'accept_bid_and_create_contract: chamador nao autenticado';
  end if;
  if p_freight_id is null or p_bid_id is null then
    raise exception using errcode = '22004',
      message = 'accept_bid_and_create_contract: frete e proposta sao obrigatorios';
  end if;

  -- A impressao digital cobre apenas o que o cliente informa. Preco, taxa,
  -- carrier, driver, truck e status do contrato NAO entram porque nao vem do
  -- cliente - sao derivados ou calculados no servidor.
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'freight_id', p_freight_id,
    'bid_id',     p_bid_id));

  v_log := public.rpc_idempotency_probe(
    'accept_bid_and_create_contract', p_request_id, v_actor, p_freight_id, v_fp);
  if v_log.id is not null then
    -- Replay: devolve SEMPRE o mesmo contrato, localizado pelo evento daquela
    -- chamada. Nao cria contrato, nao reescreve proposta, nao duplica evento.
    select c.id into v_contract
      from public.freight_publication_events e
      join public.contracts c
        on c.freight_id = e.freight_id and c.bid_id = e.source_bid_id
     where e.request_id = p_request_id
       and e.freight_id = p_freight_id;
    return v_contract;
  end if;

  -- (2) ------------------------------------------------------------------
  select * into v_f from public.freights f where f.id = p_freight_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'accept_bid_and_create_contract: frete inexistente';
  end if;

  -- (3) ------------------------------------------------------------------
  select * into v_b from public.bids b where b.id = p_bid_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'accept_bid_and_create_contract: proposta inexistente';
  end if;

  -- (4) ------------------------------------------------------------------
  if not public.can_govern_freight(v_f.created_by, v_f.company_id) then
    raise exception using errcode = '42501',
      message = 'accept_bid_and_create_contract: ator nao autorizado sobre este frete';
  end if;

  -- (5) ------------------------------------------------------------------
  -- Tambem e o que impede duas propostas diferentes do mesmo frete de serem
  -- contratadas em paralelo: a primeira transacao move o frete para
  -- contract_pending e a segunda, ja com a linha destravada, nao encontra mais
  -- 'published'.
  if v_f.status is distinct from 'published'::public.freight_status then
    raise exception using errcode = '22023',
      message = format('accept_bid_and_create_contract: frete em %s; somente frete '
                       'publicado pode ser contratado', coalesce(v_f.status::pg_catalog.text,'nulo'));
  end if;
  if v_f.currency_code <> 'BRL' then
    raise exception using errcode = '0A000',
      message = 'accept_bid_and_create_contract: moeda diferente de BRL nao suportada pelo L2a';
  end if;

  -- (6) e (7) -------------------------------------------------------------
  if v_b.freight_id is distinct from p_freight_id then
    raise exception using errcode = '42501',
      message = 'accept_bid_and_create_contract: proposta pertence a outro frete';
  end if;
  if v_b.status is distinct from 'pending'::public.bid_status then
    raise exception using errcode = '22023',
      message = format('accept_bid_and_create_contract: proposta em estado %s nao e '
                       'elegivel', coalesce(v_b.status::pg_catalog.text, 'nulo'));
  end if;
  if v_b.expires_at is not null and v_b.expires_at <= now() then
    raise exception using errcode = '22023',
      message = 'accept_bid_and_create_contract: proposta expirada';
  end if;
  if v_f.bid_deadline is not null and v_f.bid_deadline <= now() then
    raise exception using errcode = '22023',
      message = 'accept_bid_and_create_contract: prazo de propostas do anuncio encerrado';
  end if;
  if v_b.carrier_id is null then
    raise exception using errcode = '22023',
      message = 'accept_bid_and_create_contract: proposta sem transportadora';
  end if;
  if v_b.amount_brl is null or v_b.amount_brl <= 0 then
    raise exception using errcode = '22023',
      message = 'accept_bid_and_create_contract: proposta sem valor positivo';
  end if;

  select ca.company_id into v_carrier_company
    from public.carriers ca where ca.id = v_b.carrier_id;
  if v_carrier_company is null then
    raise exception using errcode = '22023',
      message = 'accept_bid_and_create_contract: transportadora sem empresa vinculada';
  end if;

  -- (8) ------------------------------------------------------------------
  for v_other in
    select b.id from public.bids b
     where b.freight_id = p_freight_id and b.id <> p_bid_id
     order by b.id
  loop
    perform 1 from public.bids b where b.id = v_other for update;
  end loop;

  v_admin  := public.has_role(v_actor, 'admin'::public.app_role);
  v_amount := v_b.amount_brl;

  -- (9) e (10) ------------------------------------------------------------
  v_offer := public.ensure_offer_version(
    p_freight_id, v_actor, 'accept_bid_and_create_contract', p_request_id, v_fp);

  select * into v_f from public.freights f where f.id = p_freight_id for update;

  insert into public.freight_publication_events (
    freight_id, offer_version_id, previous_event_id, transition,
    previous_status, new_status, previous_published_at, new_published_at,
    previous_budget_brl, new_budget_brl, previous_budget_amount, new_budget_amount,
    previous_final_price_brl, new_final_price_brl,
    previous_final_price_amount, new_final_price_amount,
    previous_matched_carrier_id, new_matched_carrier_id,
    previous_matched_driver_id, new_matched_driver_id,
    previous_matched_truck_id, new_matched_truck_id,
    source_bid_id,
    actor_id, actor_was_admin, actor_company_id, reason,
    rpc_name, request_id, params_fingerprint
  ) values (
    p_freight_id, v_offer, v_f.last_publication_event_id, 'contract_pending',
    v_f.status, 'contract_pending'::public.freight_status,
    v_f.published_at, v_f.published_at,
    v_f.budget_brl, v_f.budget_brl, v_f.budget_amount, v_f.budget_amount,
    v_f.final_price_brl, v_amount,
    v_f.final_price_amount, v_amount,
    v_f.matched_carrier_id, v_b.carrier_id,
    v_f.matched_driver_id, v_b.driver_id,
    v_f.matched_truck_id, v_b.truck_id,
    p_bid_id,
    v_actor, v_admin, v_f.company_id, null,
    'accept_bid_and_create_contract', p_request_id, v_fp
  )
  returning id into v_event;

  update public.freights f
     set status                    = 'contract_pending'::public.freight_status,
         final_price_brl           = v_amount,
         final_price_amount        = v_amount,
         matched_carrier_id        = v_b.carrier_id,
         matched_driver_id         = v_b.driver_id,
         matched_truck_id          = v_b.truck_id,
         last_publication_event_id = v_event
   where f.id = p_freight_id;

  -- (11) -----------------------------------------------------------------
  update public.bids b
     set status = 'accepted'::public.bid_status
   where b.id = p_bid_id;

  -- (12) -----------------------------------------------------------------
  -- APENAS as ainda pending. Propostas ja withdrawn, rejected, expired ou
  -- accepted NAO sao reescritas: seu estado e um fato anterior e nao pertence a
  -- esta decisao.
  update public.bids b
     set status = 'rejected'::public.bid_status
   where b.freight_id = p_freight_id
     and b.id <> p_bid_id
     and b.status = 'pending'::public.bid_status;
  get diagnostics v_rejected = row_count;

  -- (13) -----------------------------------------------------------------
  v_rule := public.platform_pricing_rule_for(
    coalesce(v_f.origin_country_code, 'BR'), v_f.currency_code, v_b.carrier_id);

  -- Taxa comercial da plataforma - NAO e o piso regulatorio e nao tem relacao
  -- com ele. O repasse e derivado por SUBTRACAO, de modo que
  -- taxa + repasse = total exatamente, sem centavo perdido no arredondamento.
  v_fee    := round(v_amount * v_rule.platform_fee_percentage / 100, 2);
  v_payout := v_amount - v_fee;

  -- REVISAO 8: o contrato cita a linha EXATA de public.pricing_rules que
  -- produziu a taxa. Aquela linha e imutavel nos campos economicos desde
  -- 20260903100610, entao a taxa historica continua recuperavel mesmo que a
  -- regra seja encerrada ou substituida depois.
  insert into public.contracts (
    bid_id, freight_id, shipper_company_id, carrier_company_id,
    driver_id, truck_id,
    total_amount_brl, platform_fee_brl, carrier_payout_brl,
    status, pickup_window, pricing_rule_id, escrow_status
  ) values (
    p_bid_id, p_freight_id, v_f.company_id, v_carrier_company,
    v_b.driver_id, v_b.truck_id,
    v_amount, v_fee, v_payout,
    'awaiting_shipper_signature'::public.contract_status, v_f.pickup_window,
    v_rule.id, 'pending'
  )
  returning id into v_contract;

  -- (14) -----------------------------------------------------------------
  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('accept_bid_and_create_contract', p_request_id, v_actor, p_freight_id, v_fp,
          'accepted',
          format('contrato %s; taxa %s%% da regra %s; %s proposta(s) rejeitada(s)',
                 v_contract, v_rule.platform_fee_percentage, v_rule.id, v_rejected));

  return v_contract;
end;
$fn$;

comment on function public.accept_bid_and_create_contract(uuid, uuid, uuid) is
  'Via unica e transacional do aceite de proposta. Substitui os dois UPDATE '
  'diretos em public.bids, a RPC de transicao e o INSERT direto em '
  'public.contracts que a tela fazia como chamadas HTTP separadas. Corrige dois '
  'bloqueios funcionais: a tela marcava a proposta accepted antes de chamar a '
  'RPC que exigia pending, e o INSERT em contracts esbarrava em '
  'contracts_insert_admin. NAO aceita do cliente carrier, driver, truck, preco, '
  'taxa, repasse nem status do contrato: tudo derivado da proposta ou calculado '
  'a partir de public.pricing_rules. Devolve o contract_id, e o mesmo no replay.';

-- =============================================================================
-- 3-ter. ASSINATURA DE CONTRATO  -  a parte signataria e DERIVADA, nao informada
-- =============================================================================
-- BLOQUEIO CORRIGIDO (confirmado por leitura do codigo e por consulta ao
-- catalogo, nao hipotese):
--
--   SignaturePad.tsx:76 fazia UPDATE direto em public.contracts. A policy
--   contracts_update_party (20260521014520) autoriza UPDATE da LINHA para
--   qualquer embarcador ou transportadora participante, e nao havia privilegio
--   de coluna nenhum - authenticated tinha UPDATE nas 29 colunas da tabela.
--   Logo, qualquer parte podia preencher diretamente shipper_signed_at,
--   carrier_signed_at, status='active', activated_at e os dois pares
--   hash/URL de assinatura. Em seguida, mark_freight_contracted lia esses
--   mesmos campos como prova suficiente para mover o frete para contracted.
--   A autoridade usada pela RPC era, portanto, FABRICAVEL pelo proprio cliente.
--
--   O componente ainda recebia party: "shipper" | "carrier" como PROPRIEDADE e
--   usava esse valor como autoridade para escolher quais campos preencher.
--
-- DESENHO DA CORRECAO:
--   * a parte signataria e derivada de auth.uid() contra
--     contracts.shipper_company_id / contracts.carrier_company_id. O cliente
--     nao informa party, status, carimbo de tempo nem identidade;
--   * o contrato e travado FOR UPDATE antes de qualquer decisao;
--   * cada parte so escreve os PROPRIOS campos - nao existe caminho no corpo
--     desta funcao que escreva os campos da outra parte;
--   * assinatura repetida e recusada, nunca substituida em silencio;
--   * a transicao de status do contrato e decidida no servidor;
--   * a segunda assinatura valida ativa o contrato E move o frete para
--     contracted NA MESMA TRANSACAO;
--   * auditoria em freight_publication_events e idempotencia em rpc_call_log.
--
-- ADMINISTRADOR NAO ASSINA. has_role(uid,'admin') aparece em
-- contracts_update_party, mas administrador nao e PARTE do contrato. Assinar
-- pelo embarcador ou pela transportadora nao e ato de governanca; e ato
-- juridico da parte. Decisao registrada, nao acidental.
-- =============================================================================
create function public.contract_party_of(
  p_shipper_company_id uuid,
  p_carrier_company_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_ship  boolean;
  v_carr  boolean;
begin
  if v_actor is null then
    return null;
  end if;

  -- Mesmo predicado de contracts_select_party e contracts_update_party:
  -- companies.owner_id = auth.uid(). Nao concede nada que a policy ja nao
  -- reconhecesse; apenas separa QUAL das duas pontas o ator representa.
  v_ship := public.is_current_user_company_owner(p_shipper_company_id);
  v_carr := public.is_current_user_company_owner(p_carrier_company_id);

  -- AMBIGUIDADE E RECUSA, NAO ESCOLHA. Se o mesmo usuario responde pelas duas
  -- empresas, nao existe resposta correta para "qual parte assinou": qualquer
  -- escolha aqui permitiria auto-contratacao com as duas assinaturas colhidas
  -- pelo mesmo ator. Fail-closed.
  if coalesce(v_ship, false) and coalesce(v_carr, false) then
    raise exception using errcode = '22023',
      message = 'contract_party_of: o mesmo usuario responde pelas duas pontas '
                'deste contrato; a parte signataria nao e determinavel e a '
                'assinatura e recusada';
  end if;

  if coalesce(v_ship, false) then return 'shipper'; end if;
  if coalesce(v_carr, false) then return 'carrier'; end if;
  return null;
end;
$fn$;

revoke execute on function public.contract_party_of(uuid, uuid)
  from public, anon, authenticated;

comment on function public.contract_party_of(uuid, uuid) is
  'Deriva do usuario autenticado qual ponta do contrato ele representa. Devolve '
  'shipper, carrier ou nulo. Levanta 22023 quando o mesmo usuario responde pelas '
  'duas empresas - ambiguidade e recusa, nunca escolha arbitraria. Nao recebe '
  'party do cliente e nao consulta current_user nem GUC de sessao.';

-- -----------------------------------------------------------------------------
-- ORDEM DE OPERACOES, deliberada:
--   (1)  autenticar e validar formato dos artefatos
--   (2)  impressao digital e probe de idempotencia (advisory lock dentro dela)
--   (3)  replay: le o estado atual e devolve, sem escrever nada
--   (4)  ler o contrato SEM trava apenas para descobrir o frete
--   (5)  travar o FRETE e depois o CONTRATO - sempre nesta ordem
--   (6)  derivar a parte signataria no servidor
--   (7)  amarrar contrato -> proposta aceita -> frete (requisito 5)
--   (8)  decidir a transicao de status no servidor e recusar duplicata
--   (9)  gravar SOMENTE os campos da propria parte, com guarda otimista
--   (10) segunda assinatura: ativar o contrato e mover o frete, mesma transacao
--   (11) registrar rpc_call_log
--
-- O passo (5) usa a ordem freights -> contracts, a mesma de
-- accept_bid_and_create_contract, que trava freights, depois bids e so entao
-- insere o contrato. Duas sessoes concorrentes travam os mesmos recursos na
-- mesma ordem e nao formam ciclo de espera.
--
-- POR QUE A VERIFICACAO DO FRETE VEM DEPOIS DO UPDATE DO CONTRATO. Ela e a
-- guarda da propria transicao, aplicada no ponto em que a transicao ocorre. Se
-- falhar, a transacao inteira aborta e a assinatura ja gravada e desfeita - e
-- exatamente isso que o teste 'falha deliberada na transicao do frete reverte
-- assinatura e contrato' comprova. Antecipar a verificacao daria uma mensagem
-- um passo mais cedo e removeria a prova de atomicidade.
-- -----------------------------------------------------------------------------
create function public.sign_contract(
  p_contract_id    uuid,
  p_signature_hash text,
  p_signature_url  text,
  p_request_id     uuid
)
returns table (
  signed_contract_id  uuid,
  signed_party        text,
  new_contract_status public.contract_status,
  signed_freight_id   uuid,
  new_freight_status  public.freight_status,
  was_replayed        boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor   uuid := (select auth.uid());
  v_admin   boolean;
  v_c       public.contracts%rowtype;
  v_f       public.freights%rowtype;
  v_b       public.bids%rowtype;
  v_party   text;
  v_fid     uuid;
  v_fstatus public.freight_status;
  v_new_cs  public.contract_status;
  v_fp      text;
  v_log     public.rpc_call_log%rowtype;
  v_offer   uuid;
  v_event   uuid;
  v_now     timestamptz := now();
begin
  -- (1) ------------------------------------------------------------------
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'sign_contract: chamador nao autenticado';
  end if;
  if p_contract_id is null then
    raise exception using errcode = '22004',
      message = 'sign_contract: p_contract_id e obrigatorio';
  end if;
  -- O hash e REFERENCIA DE ARTEFATO, nunca autoridade. Exigir o formato
  -- sha-256 hexadecimal impede que a coluna vire campo de texto livre.
  if p_signature_hash is null then
    raise exception using errcode = '22004',
      message = 'sign_contract: p_signature_hash e obrigatorio';
  end if;
  if p_signature_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'sign_contract: p_signature_hash deve ser sha-256 hexadecimal '
                'de 64 caracteres minusculos';
  end if;
  if p_signature_url is not null
     and p_signature_url !~ '^https://' then
    raise exception using errcode = '22023',
      message = 'sign_contract: p_signature_url, quando informada, deve ser https';
  end if;

  -- (2) ------------------------------------------------------------------
  -- A impressao digital cobre APENAS o que o cliente informa. party, status,
  -- carimbo de tempo e identidade das partes nao entram porque nao vem do
  -- cliente - sao derivados no servidor.
  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'contract_id',    p_contract_id,
    'signature_hash', p_signature_hash,
    'signature_url',  p_signature_url));

  v_log := public.rpc_idempotency_probe(
    'sign_contract', p_request_id, v_actor, p_contract_id, v_fp);

  -- (3) ------------------------------------------------------------------
  if v_log.id is not null then
    select * into v_c from public.contracts c where c.id = p_contract_id;
    if not found then
      raise exception using errcode = 'P0002',
        message = 'sign_contract: contrato inexistente no replay';
    end if;
    select f.status into v_fstatus
      from public.freights f where f.id = v_c.freight_id;
    return query select v_c.id,
                        public.contract_party_of(v_c.shipper_company_id,
                                                 v_c.carrier_company_id),
                        v_c.status, v_c.freight_id, v_fstatus, true;
    return;
  end if;

  -- (4) ------------------------------------------------------------------
  select c.freight_id into v_fid from public.contracts c where c.id = p_contract_id;
  if v_fid is null then
    raise exception using errcode = 'P0002',
      message = 'sign_contract: contrato inexistente ou sem frete vinculado';
  end if;

  -- (5) ------------------------------------------------------------------
  select * into v_f from public.freights f where f.id = v_fid for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'sign_contract: frete do contrato inexistente';
  end if;

  select * into v_c from public.contracts c where c.id = p_contract_id for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'sign_contract: contrato inexistente';
  end if;
  -- O vinculo nao pode ter mudado entre a leitura sem trava e a trava. Com o
  -- privilegio de UPDATE revogado na migration 7/7 isso e estruturalmente
  -- impossivel pelo cliente; a verificacao permanece porque service_role e
  -- postgres continuam escrevendo direto e nao sao adversarios contidos.
  if v_c.freight_id is distinct from v_fid then
    raise exception using errcode = '40001',
      message = 'sign_contract: o frete do contrato mudou durante a operacao';
  end if;

  -- (6) ------------------------------------------------------------------
  v_party := public.contract_party_of(v_c.shipper_company_id, v_c.carrier_company_id);
  if v_party is null then
    raise exception using errcode = '42501',
      message = 'sign_contract: ator nao e parte deste contrato';
  end if;

  -- (7) ------------------------------------------------------------------
  -- REQUISITO 5. A transicao depende do contrato EXATO ligado ao frete e a
  -- proposta aceita. Nao existe aqui nenhuma selecao do tipo "o contrato ativo
  -- mais recente do frete": o contrato e o argumento, e a cadeia
  -- contrato -> proposta -> frete e verificada elo a elo.
  if v_c.bid_id is null then
    raise exception using errcode = '22023',
      message = 'sign_contract: contrato sem proposta de origem; a cadeia '
                'contrato-proposta-frete nao e comprovavel';
  end if;
  select * into v_b from public.bids b where b.id = v_c.bid_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'sign_contract: proposta de origem do contrato inexistente';
  end if;
  if v_b.freight_id is distinct from v_c.freight_id then
    raise exception using errcode = '42501',
      message = 'sign_contract: a proposta de origem do contrato pertence a '
                'outro frete';
  end if;
  if v_b.status is distinct from 'accepted'::public.bid_status then
    raise exception using errcode = '22023',
      message = format('sign_contract: proposta de origem em %s; somente '
                       'proposta aceita sustenta assinatura',
                       coalesce(v_b.status::pg_catalog.text, 'nulo'));
  end if;

  -- (8) ------------------------------------------------------------------
  -- SEQUENCIA COM LASTRO NO PROPRIO REPOSITORIO, nao inventada aqui:
  --   * o enum contract_status (20260521014520) ordena
  --     awaiting_shipper_signature antes de awaiting_carrier_signature;
  --   * accept_bid_and_create_contract cria o contrato em
  --     awaiting_shipper_signature;
  --   * SignaturePad.tsx, em HEAD, levava shipper -> awaiting_carrier_signature
  --     e carrier -> active.
  -- O servidor passa a IMPOR essa sequencia em vez de aceita-la do cliente.
  if v_party = 'shipper' then
    if v_c.shipper_signed_at is not null
       or v_c.shipper_signature_hash is not null then
      raise exception using errcode = '23505',
        message = 'sign_contract: o embarcador ja assinou este contrato; '
                  'assinatura nao e substituida';
    end if;
    if v_c.status is distinct from 'awaiting_shipper_signature'::public.contract_status then
      raise exception using errcode = '22023',
        message = format('sign_contract: contrato em %s; a assinatura do '
                         'embarcador so e aceita em awaiting_shipper_signature',
                         coalesce(v_c.status::pg_catalog.text, 'nulo'));
    end if;
    v_new_cs := 'awaiting_carrier_signature'::public.contract_status;
  else
    if v_c.carrier_signed_at is not null
       or v_c.carrier_signature_hash is not null then
      raise exception using errcode = '23505',
        message = 'sign_contract: a transportadora ja assinou este contrato; '
                  'assinatura nao e substituida';
    end if;
    if v_c.status is distinct from 'awaiting_carrier_signature'::public.contract_status then
      raise exception using errcode = '22023',
        message = format('sign_contract: contrato em %s; a assinatura da '
                         'transportadora so e aceita em '
                         'awaiting_carrier_signature',
                         coalesce(v_c.status::pg_catalog.text, 'nulo'));
    end if;
    -- Defensivo: o status ja implica isto, mas a implicacao depende de nunca
    -- existir outro escritor do status. Verificar o FATO custa nada.
    if v_c.shipper_signed_at is null then
      raise exception using errcode = '22023',
        message = 'sign_contract: assinatura do embarcador ausente; o contrato '
                  'nao pode ser ativado';
    end if;
    v_new_cs := 'active'::public.contract_status;
  end if;

  -- (9) ------------------------------------------------------------------
  -- Dois UPDATE separados, cada um enumerando SOMENTE os campos da propria
  -- parte. Nao existe caminho neste corpo em que a clausula SET do embarcador
  -- alcance uma coluna carrier_*, nem o contrario. A clausula WHERE repete as
  -- pre-condicoes como guarda otimista: se outra sessao venceu a corrida entre
  -- a trava e a escrita, nenhuma linha e afetada e a operacao aborta.
  -- REVISAO 8. O UPDATE grava SOMENTE os campos da propria parte. Quem move
  -- status e ponteiro do ciclo, juntos e na ordem certa, e
  -- public.contract_lifecycle_append: assim o evento sempre registra o estado
  -- ANTERIOR correto, e nao um estado ja alterado.
  if v_party = 'shipper' then
    update public.contracts c
       set shipper_signed_at      = v_now,
           shipper_signature_hash = p_signature_hash,
           shipper_signature_url  = p_signature_url
     where c.id = p_contract_id
       and c.status = 'awaiting_shipper_signature'::public.contract_status
       and c.shipper_signed_at is null;
  else
    update public.contracts c
       set carrier_signed_at      = v_now,
           carrier_signature_hash = p_signature_hash,
           carrier_signature_url  = p_signature_url,
           activated_at           = v_now
     where c.id = p_contract_id
       and c.status = 'awaiting_carrier_signature'::public.contract_status
       and c.carrier_signed_at is null;
  end if;
  if not found then
    raise exception using errcode = '40001',
      message = 'sign_contract: o contrato mudou de estado durante a operacao; '
                'nenhuma assinatura foi gravada';
  end if;

  perform public.contract_lifecycle_append(
    p_contract_id,
    case when v_party = 'shipper'
         then 'shipper_signed'::public.contract_lifecycle_transition
         else 'carrier_signed'::public.contract_lifecycle_transition end,
    v_new_cs, v_c.escrow_status, null, null, null, null, null,
    v_actor, 'party',
    case when v_party = 'shipper'
         then 'Assinatura do embarcador colhida.'
         else 'Assinatura da transportadora colhida; contrato ativado.' end,
    'sign_contract', p_request_id, v_fp);

  v_fstatus := v_f.status;

  -- (10) -----------------------------------------------------------------
  if v_party = 'carrier' then
    -- GUARDA DA TRANSICAO. Falhar aqui aborta a transacao inteira e desfaz a
    -- assinatura gravada no passo (9) - atomicidade comprovada por teste.
    if v_f.status is distinct from 'contract_pending'::public.freight_status then
      raise exception using errcode = '22023',
        message = format('sign_contract: frete deste contrato em %s; somente '
                         'frete em contract_pending pode ser contratado',
                         coalesce(v_f.status::pg_catalog.text, 'nulo'));
    end if;

    v_admin := public.has_role(v_actor, 'admin'::public.app_role);
    v_offer := public.ensure_offer_version(
      v_f.id, v_actor, 'sign_contract', p_request_id, v_fp);

    select * into v_f from public.freights f where f.id = v_fid for update;

    insert into public.freight_publication_events (
      freight_id, offer_version_id, previous_event_id, transition,
      previous_status, new_status, previous_published_at, new_published_at,
      previous_budget_brl, new_budget_brl, previous_budget_amount, new_budget_amount,
      previous_final_price_brl, new_final_price_brl,
      previous_final_price_amount, new_final_price_amount,
      previous_matched_carrier_id, new_matched_carrier_id,
      previous_matched_driver_id, new_matched_driver_id,
      previous_matched_truck_id, new_matched_truck_id,
      actor_id, actor_was_admin, actor_company_id, reason,
      rpc_name, request_id, params_fingerprint
    ) values (
      v_fid, v_offer, v_f.last_publication_event_id, 'contracted',
      v_f.status, 'contracted'::public.freight_status,
      v_f.published_at, v_f.published_at,
      v_f.budget_brl, v_f.budget_brl, v_f.budget_amount, v_f.budget_amount,
      v_f.final_price_brl, v_f.final_price_brl,
      v_f.final_price_amount, v_f.final_price_amount,
      v_f.matched_carrier_id, v_f.matched_carrier_id,
      v_f.matched_driver_id, v_f.matched_driver_id,
      v_f.matched_truck_id, v_f.matched_truck_id,
      v_actor, v_admin, v_f.company_id,
      -- source_bid_id so existe em transicao contract_pending, por CHECK. A
      -- rastreabilidade ate a proposta fica aqui, em texto auditavel.
      format('segunda assinatura no contrato %s, proposta %s',
             p_contract_id, v_c.bid_id),
      'sign_contract', p_request_id, v_fp
    )
    returning id into v_event;

    update public.freights f
       set status                    = 'contracted'::public.freight_status,
           last_publication_event_id = v_event
     where f.id = v_fid;

    v_fstatus := 'contracted'::public.freight_status;
  end if;

  -- (11) -----------------------------------------------------------------
  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('sign_contract', p_request_id, v_actor, p_contract_id, v_fp, 'accepted',
          format('parte %s derivada no servidor; contrato -> %s; frete %s -> %s',
                 v_party, v_new_cs, v_fid, v_fstatus));

  return query select p_contract_id, v_party, v_new_cs, v_fid, v_fstatus, false;
end;
$fn$;

comment on function public.sign_contract(uuid, text, text, uuid) is
  'Via UNICA e transacional da assinatura de contrato. Substitui o UPDATE direto '
  'em public.contracts de SignaturePad.tsx:76 e a chamada separada a '
  'mark_freight_contracted, que foi REMOVIDA. A parte signataria e derivada de '
  'auth.uid() contra shipper_company_id e carrier_company_id: o cliente nao '
  'informa party, status, carimbo de tempo nem identidade. Cada parte escreve '
  'somente os proprios campos; assinatura repetida e recusada, nunca '
  'substituida. A segunda assinatura valida ativa o contrato E move o frete '
  'para contracted na MESMA transacao, pelo contrato exato ligado ao frete e a '
  'proposta aceita - nunca por "o contrato ativo mais recente". Administrador '
  'nao e parte e nao assina.';

-- =============================================================================
-- 4. RETIRADA EM MASSA
-- =============================================================================

create function public.preview_bulk_withdrawal(
  p_scope_company_id uuid,
  p_reason           text,
  p_request_id       uuid,
  p_ttl_minutes      integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor   uuid := (select auth.uid());
  v_admin   boolean;
  v_fp      text;
  v_log     public.rpc_call_log%rowtype;
  v_preview uuid;
  v_count   integer;
  v_legacy  integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'preview_bulk_withdrawal: chamador nao autenticado';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception using errcode = '22004',
      message = 'preview_bulk_withdrawal: motivo e obrigatorio';
  end if;
  if p_ttl_minutes is null or p_ttl_minutes < 1 or p_ttl_minutes > 1440 then
    raise exception using errcode = '22023',
      message = 'preview_bulk_withdrawal: ttl entre 1 e 1440 minutos';
  end if;

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'scope_company_id', p_scope_company_id,
    'reason',           p_reason,
    'ttl_minutes',      p_ttl_minutes));

  v_log := public.rpc_idempotency_probe(
    'preview_bulk_withdrawal', p_request_id, v_actor, null, v_fp, true);
  if v_log.id is not null then
    return v_log.target_id;
  end if;

  v_admin := public.has_role(v_actor, 'admin'::public.app_role);

  if not v_admin then
    if p_scope_company_id is null then
      raise exception using errcode = '42501',
        message = 'preview_bulk_withdrawal: escopo global e restrito a admin';
    end if;
    if not public.is_current_user_company_owner(p_scope_company_id) then
      raise exception using errcode = '42501',
        message = 'preview_bulk_withdrawal: ator nao e dono da empresa informada';
    end if;
  end if;

  -- LEGADOS INCLUIDOS. O filtro e apenas "publicado" - anuncio sem ponteiro de
  -- evento entra normalmente e sera capturado como legacy_unassessed na
  -- execucao, com os valores reais.
  select count(*),
         count(*) filter (where f.last_publication_event_id is null)
    into v_count, v_legacy
    from public.freights f
   where f.status = 'published'::public.freight_status
     and (p_scope_company_id is null or f.company_id = p_scope_company_id);

  if v_count > 500 then
    raise exception using errcode = '22023',
      message = format('preview_bulk_withdrawal: %s ofertas elegiveis excedem o '
                       'teto de 500 por lote; reduza o escopo', v_count);
  end if;

  insert into public.bulk_withdrawal_previews (
    created_by, scope_company_id, filter_reason, filter_snapshot,
    item_count, legacy_count, rpc_name, request_id, params_fingerprint, expires_at
  ) values (
    v_actor, p_scope_company_id, p_reason,
    jsonb_build_object(
      'status', 'published',
      'scope_company_id', p_scope_company_id,
      'includes_legacy', true,
      'ttl_minutes', p_ttl_minutes),
    v_count, v_legacy, 'preview_bulk_withdrawal', p_request_id, v_fp,
    now() + make_interval(mins => p_ttl_minutes)
  )
  returning id into v_preview;

  insert into public.bulk_withdrawal_preview_items (
    preview_id, freight_id, status_at_preview, published_at_at_preview,
    budget_brl_at_preview, budget_amount_at_preview,
    last_publication_event_id_at_preview, is_legacy_at_preview
  )
  select v_preview, f.id, f.status, f.published_at,
         f.budget_brl, f.budget_amount, f.last_publication_event_id,
         f.last_publication_event_id is null
    from public.freights f
   where f.status = 'published'::public.freight_status
     and (p_scope_company_id is null or f.company_id = p_scope_company_id)
   order by f.id;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('preview_bulk_withdrawal', p_request_id, v_actor, v_preview, v_fp, 'accepted',
          format('%s itens, dos quais %s legados', v_count, v_legacy));

  return v_preview;
end;
$fn$;

comment on function public.preview_bulk_withdrawal(uuid, text, uuid, integer) is
  'Dry-run: fotografa o conjunto elegivel e NAO altera nenhuma linha de '
  'public.freights. Inclui anuncios legados, contados em legacy_count. Falha se '
  'o conjunto exceder 500, em vez de truncar em silencio.';

-- -----------------------------------------------------------------------------

create function public.execute_bulk_withdrawal(
  p_preview_id uuid,
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean;
  v_p     public.bulk_withdrawal_previews%rowtype;
  v_item  record;
  v_f     public.freights%rowtype;
  v_fp    text;
  v_log   public.rpc_call_log%rowtype;
  v_done  integer := 0;
  v_prior integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'execute_bulk_withdrawal: chamador nao autenticado';
  end if;
  if p_preview_id is null then
    raise exception using errcode = '22004',
      message = 'execute_bulk_withdrawal: p_preview_id e obrigatorio';
  end if;

  v_fp := public.rpc_params_fingerprint(
    jsonb_build_object('preview_id', p_preview_id));

  v_log := public.rpc_idempotency_probe(
    'execute_bulk_withdrawal', p_request_id, v_actor, p_preview_id, v_fp);
  if v_log.id is not null then
    select count(*) into v_prior
      from public.freight_publication_events e
     where e.bulk_withdrawal_preview_id = p_preview_id;
    return v_prior;
  end if;

  select * into v_p from public.bulk_withdrawal_previews p where p.id = p_preview_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'execute_bulk_withdrawal: preview inexistente';
  end if;

  v_admin := public.has_role(v_actor, 'admin'::public.app_role);
  if not (v_p.created_by = v_actor or v_admin) then
    raise exception using errcode = '42501',
      message = 'execute_bulk_withdrawal: ator nao autorizado sobre este preview';
  end if;

  -- "Executado" e estado DERIVADO, nao coluna mutavel.
  select count(*) into v_prior
    from public.freight_publication_events e
   where e.bulk_withdrawal_preview_id = p_preview_id;
  if v_prior > 0 then
    raise exception using errcode = '42501',
      message = 'execute_bulk_withdrawal: preview ja executado';
  end if;

  if now() >= v_p.expires_at then
    raise exception using errcode = '22023',
      message = 'execute_bulk_withdrawal: preview expirado; gere novo preview';
  end if;

  -- Ordem deterministica por freight_id: duas execucoes concorrentes travam as
  -- linhas na MESMA ordem e nao formam ciclo de espera.
  for v_item in
    select i.* from public.bulk_withdrawal_preview_items i
     where i.preview_id = p_preview_id
     order by i.freight_id
  loop
    select * into v_f from public.freights f where f.id = v_item.freight_id for update;
    if not found then
      raise exception using errcode = 'P0002',
        message = format('execute_bulk_withdrawal: frete %s desapareceu apos o preview',
                         v_item.freight_id);
    end if;

    -- ANTI-DERIVA. Fail-closed e total. is distinct from cobre o caso legado,
    -- em que o ponteiro capturado e null e tem de continuar null.
    if v_f.last_publication_event_id is distinct from v_item.last_publication_event_id_at_preview
       or v_f.status        is distinct from v_item.status_at_preview
       or v_f.published_at  is distinct from v_item.published_at_at_preview
       or v_f.budget_brl    is distinct from v_item.budget_brl_at_preview
       or v_f.budget_amount is distinct from v_item.budget_amount_at_preview then
      raise exception using errcode = '40001',
        message = format('execute_bulk_withdrawal: frete %s mudou de estado entre o '
                         'preview e a execucao; nenhuma retirada foi aplicada',
                         v_item.freight_id);
    end if;

    perform public.withdraw_freight_core(
      v_item.freight_id, v_actor, v_admin, v_p.filter_reason,
      'execute_bulk_withdrawal', p_request_id, v_fp, p_preview_id);

    v_done := v_done + 1;
  end loop;

  if v_done <> v_p.item_count then
    raise exception using errcode = '22023',
      message = format('execute_bulk_withdrawal: %s itens processados contra '
                       'item_count %s do preview', v_done, v_p.item_count);
  end if;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('execute_bulk_withdrawal', p_request_id, v_actor, p_preview_id, v_fp, 'accepted',
          format('%s ofertas retiradas, %s legados capturados', v_done, v_p.legacy_count));

  return v_done;
end;
$fn$;

comment on function public.execute_bulk_withdrawal(uuid, uuid) is
  'Tudo ou nada: qualquer deriva de estado entre preview e execucao aborta a '
  'transacao inteira. Itens legados sao capturados como legacy_unassessed com '
  'os valores reais. unique (request_id, freight_id) e unique '
  '(bulk_withdrawal_preview_id, freight_id) impedem execucao dupla '
  'estruturalmente. Linhas travadas em ordem de freight_id.';

-- -----------------------------------------------------------------------------

create function public.emergency_withdraw_offers_by_ids(
  p_freight_ids uuid[],
  p_reason      text,
  p_request_id  uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor    uuid := (select auth.uid());
  v_admin    boolean;
  v_n        integer;
  v_distinct integer;
  v_sorted   uuid[];
  v_id       uuid;
  v_fp       text;
  v_log      public.rpc_call_log%rowtype;
  v_done     integer := 0;
  v_prior    integer;
begin
  if v_actor is null then
    raise exception using errcode = '42501',
      message = 'emergency_withdraw_offers_by_ids: chamador nao autenticado';
  end if;

  v_admin := public.has_role(v_actor, 'admin'::public.app_role);
  if not v_admin then
    raise exception using errcode = '42501',
      message = 'emergency_withdraw_offers_by_ids: restrito a admin';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception using errcode = '22004',
      message = 'emergency_withdraw_offers_by_ids: motivo e obrigatorio';
  end if;
  if p_freight_ids is null then
    raise exception using errcode = '22004',
      message = 'emergency_withdraw_offers_by_ids: lista de ids e obrigatoria';
  end if;

  v_n := coalesce(array_length(p_freight_ids, 1), 0);
  if v_n = 0 then
    raise exception using errcode = '22023',
      message = 'emergency_withdraw_offers_by_ids: lista vazia';
  end if;
  -- Teto duro. Falha acima de 500; nao trunca.
  if v_n > 500 then
    raise exception using errcode = '22023',
      message = format('emergency_withdraw_offers_by_ids: %s ids excedem o teto de 500',
                       v_n);
  end if;
  if array_position(p_freight_ids, null) is not null then
    raise exception using errcode = '22004',
      message = 'emergency_withdraw_offers_by_ids: lista contem id nulo';
  end if;
  select count(distinct x) into v_distinct from unnest(p_freight_ids) as t(x);
  if v_distinct <> v_n then
    raise exception using errcode = '22023',
      message = 'emergency_withdraw_offers_by_ids: lista contem ids repetidos';
  end if;

  -- ORDENACAO DETERMINISTICA. Usada tanto para a impressao digital - de modo
  -- que a MESMA lista em outra ordem seja a MESMA chamada - quanto para a ordem
  -- de travamento das linhas, que e o que evita ciclo de espera entre chamadas
  -- concorrentes de emergencia sobre conjuntos que se cruzam.
  select array_agg(x order by x) into v_sorted from unnest(p_freight_ids) as t(x);

  v_fp := public.rpc_params_fingerprint(jsonb_build_object(
    'freight_ids', to_jsonb(v_sorted), 'reason', p_reason));

  v_log := public.rpc_idempotency_probe(
    'emergency_withdraw_offers_by_ids', p_request_id, v_actor, null, v_fp);
  if v_log.id is not null then
    select count(*) into v_prior
      from public.freight_publication_events e
     where e.request_id = p_request_id;
    return v_prior;
  end if;

  foreach v_id in array v_sorted loop
    perform public.withdraw_freight_core(
      v_id, v_actor, true, p_reason,
      'emergency_withdraw_offers_by_ids', p_request_id, v_fp, null);
    v_done := v_done + 1;
  end loop;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome, detail)
  values ('emergency_withdraw_offers_by_ids', p_request_id, v_actor, null, v_fp,
          'accepted', format('%s ofertas retiradas em emergencia', v_done));

  return v_done;
end;
$fn$;

comment on function public.emergency_withdraw_offers_by_ids(uuid[], text, uuid) is
  'Retirada de emergencia por lista explicita, restrita a admin, teto duro de '
  '500, tudo ou nada. ALCANCA anuncios legados: withdraw_freight_core captura '
  'versao legacy_unassessed com os valores reais, inclusive budget nulo. As '
  'linhas sao travadas em ordem crescente de id - ordenacao deterministica que '
  'evita deadlock entre chamadas concorrentes com conjuntos sobrepostos.';

-- =============================================================================
-- 5. GRANTS - revogacao ANTES das concessoes especificas
-- =============================================================================

revoke execute on function public.create_freight_draft(uuid, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function public.create_and_publish_freight(uuid, jsonb, numeric, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.publish_freight(uuid, numeric, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.withdraw_freight(uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.reprice_published_freight(uuid, numeric, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.cancel_freight(uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.accept_bid_and_create_contract(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.contract_party_of(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.sign_contract(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.preview_bulk_withdrawal(uuid, text, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.execute_bulk_withdrawal(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.emergency_withdraw_offers_by_ids(uuid[], text, uuid)
  from public, anon, authenticated;

grant execute on function public.create_freight_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function public.create_and_publish_freight(uuid, jsonb, numeric, uuid, text) to authenticated;
grant execute on function public.publish_freight(uuid, numeric, uuid, text) to authenticated;
grant execute on function public.withdraw_freight(uuid, text, uuid) to authenticated;
grant execute on function public.reprice_published_freight(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.cancel_freight(uuid, text, uuid) to authenticated;
grant execute on function public.accept_bid_and_create_contract(uuid, uuid, uuid) to authenticated;
-- contract_party_of NAO recebe grant: e helper interno das RPCs. Conceder
-- EXECUTE nao ampliaria privilegio, mas criaria uma superficie publica sem
-- proposito - o cliente ja sabe qual empresa ele possui.
grant execute on function public.sign_contract(uuid, text, text, uuid) to authenticated;
grant execute on function public.preview_bulk_withdrawal(uuid, text, uuid, integer) to authenticated;
grant execute on function public.execute_bulk_withdrawal(uuid, uuid) to authenticated;
-- Emergencia: EXECUTE a authenticated porque nao existe role de banco
-- correspondente a admin neste projeto. A restricao a admin e feita DENTRO da
-- funcao por public.has_role apurado no servidor; sem o papel, 42501 antes de
-- qualquer efeito. Conceder aqui NAO amplia privilegio.
grant execute on function public.emergency_withdraw_offers_by_ids(uuid[], text, uuid) to authenticated;

commit;
