-- =============================================================================
-- L2a - migration 2/7 : freight_offer_versions + rpc_call_log + auxiliares
-- =============================================================================
-- Alternativa A: sem CREATE ROLE, ALTER OWNER, SET ROLE, GUC de sessao ou
-- current_user como autorizacao. Nada aqui muda o dono de nada.
--
-- ESCOPO DA TABELA DE VERSOES  (resolve a incoerencia do snapshot)
--   freight_offer_versions e versao do ANUNCIO INTEIRO, nao apenas do preco.
--   offer_snapshot e NOT NULL e cobre 43 chaves: as 40 colunas do anuncio
--   mais budget_brl, budget_amount e currency_code. A migration 7/7 CONGELA
--   exatamente essas 40 colunas em public.freights enquanto o frete estiver
--   publicado, e torna currency_code imutavel. Nao existe componente do
--   snapshot mutavel fora da cadeia: alterar qualquer um deles exige retirar,
--   alterar e republicar, o que produz nova versao encadeada.
--
--   A particao das 59 colunas de public.freights e exaustiva e disjunta:
--     10 governadas por evento  - status, published_at, last_publication_event_id,
--          budget_brl, budget_amount, final_price_brl, final_price_amount,
--          matched_carrier_id, matched_driver_id, matched_truck_id
--     5 imutaveis              - id, company_id, created_by, created_at, currency_code
--     4 operacionais           - updated_at (metadado de linha), origin_geog e
--          destination_geog (derivados de lat/lng, que estao congelados),
--          search_radius_km (parametro do motor de casamento, nao do anuncio)
--     40 do anuncio               - snapshot integral e congeladas enquanto publicado
--   10 + 5 + 4 + 40 = 59. Nenhuma coluna fica sem classificacao.
--
-- PROVENIENCIA E QUALIDADE DO VALOR  (historico distingue as quatro situacoes)
--   provenance     : quem criou o registro
--                    'rpc_declared'      = novo fluxo, valor declarado por RPC
--                    'legacy_unassessed' = captura de anuncio pre-L2a
--   value_basis    : o que se sabe do valor
--                    'declared_positive'     = declarado por RPC, positivo
--                    'legacy_known_positive' = legado com valor conhecido e positivo
--                    'legacy_unknown'        = legado com valor nulo, zero ou negativo,
--                                              isto e, nao comprovavel
--   snapshot_basis : de onde veio o snapshot
--                    'declared_at_publication'  = montado na publicacao por RPC
--                    'derived_from_legacy_row'  = derivado do estado legado encontrado
--   Um CHECK amarra os tres: value_basis nao pode ser afirmado, e derivado do
--   valor efetivamente gravado. NAO existe caminho para rotular como conhecido
--   um valor que nao e. E nenhum valor e inventado: em legado, budget_brl,
--   budget_amount e currency_code sao copiados como estao, null inclusive.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Bloqueio de mutacao das tabelas append-only do L2a.
-- -----------------------------------------------------------------------------
create function public.publication_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  raise exception using errcode = '42501',
    message = 'tabela append-only de publicacao: UPDATE e DELETE nao sao permitidos';
end;
$fn$;

revoke execute on function public.publication_block_mutation() from public, anon, authenticated;

comment on function public.publication_block_mutation() is
  'Trigger de bloqueio das tabelas append-only do L2a. Correcao se faz por nova '
  'linha encadeada, nunca por edicao da linha anterior.';

-- -----------------------------------------------------------------------------
-- Impressao digital canonica de parametros de RPC.
-- jsonb::text e canonico: chaves ordenadas, duplicatas removidas, espacos
-- normalizados. Listas sao ordenadas pelo chamador antes de digerir, de modo que
-- a mesma lista em outra ordem produz a MESMA impressao quando a ordem nao tem
-- significado funcional.
-- -----------------------------------------------------------------------------
create function public.rpc_params_fingerprint(p_params jsonb)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select pg_catalog.encode(
           pg_catalog.sha256(pg_catalog.convert_to(p_params::pg_catalog.text, 'UTF8')),
           'hex')
$fn$;

revoke execute on function public.rpc_params_fingerprint(jsonb) from public, anon, authenticated;

comment on function public.rpc_params_fingerprint(jsonb) is
  'sha256 hex da forma canonica dos parametros. Base da idempotencia: replay so '
  'e valido quando operacao, ator, alvo E esta impressao digital coincidem.';

-- =============================================================================
-- freight_offer_versions
-- =============================================================================

create table public.freight_offer_versions (
  id                          uuid        primary key default gen_random_uuid(),
  freight_id                  uuid        not null,
  supersedes_offer_version_id uuid        null,
  provenance                  text        not null,
  value_basis                 text        not null,
  snapshot_basis              text        not null,
  budget_brl                  numeric     null,
  budget_amount               numeric     null,
  currency_code               text        not null,
  weight_tons                 numeric     null,
  distance_km                 numeric     null,
  offer_snapshot              jsonb       not null,
  created_by                  uuid        not null,
  rpc_name                    text        not null,
  request_id                  uuid        not null,
  params_fingerprint          text        not null,
  created_at                  timestamptz not null default now(),

  constraint freight_offer_versions_provenance_valid
    check (provenance in ('rpc_declared', 'legacy_unassessed')),
  constraint freight_offer_versions_value_basis_valid
    check (value_basis in ('declared_positive', 'legacy_known_positive', 'legacy_unknown')),
  constraint freight_offer_versions_snapshot_basis_valid
    check (snapshot_basis in ('declared_at_publication', 'derived_from_legacy_row')),

  -- A classificacao NAO e afirmada: e derivada do valor efetivamente gravado.
  -- Em legado nada e exigido do valor - null, zero e negativo sao o fato e sao
  -- preservados; o que muda e o rotulo, que passa a 'legacy_unknown'.
  constraint freight_offer_versions_classification_coherent check (
    case provenance
      when 'rpc_declared' then
             budget_brl is not null and budget_brl > 0
         and budget_amount is not null and budget_amount = budget_brl
         and currency_code = 'BRL'
         and value_basis = 'declared_positive'
         and snapshot_basis = 'declared_at_publication'
      when 'legacy_unassessed' then
             snapshot_basis = 'derived_from_legacy_row'
         and value_basis = case
               when budget_brl is not null and budget_brl > 0
                 then 'legacy_known_positive'
               else 'legacy_unknown'
             end
      else false
    end
  ),

  constraint freight_offer_versions_currency_format
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint freight_offer_versions_snapshot_is_object
    check (jsonb_typeof(offer_snapshot) = 'object'),
  constraint freight_offer_versions_rpc_name_not_blank
    check (length(btrim(rpc_name)) > 0),
  constraint freight_offer_versions_fingerprint_format
    check (params_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint freight_offer_versions_not_self_superseding
    check (supersedes_offer_version_id is null
           or supersedes_offer_version_id <> id),
  constraint freight_offer_versions_id_freight_unique
    unique (id, freight_id)
);

alter table public.freight_offer_versions
  add constraint freight_offer_versions_freight_fk
  foreign key (freight_id) references public.freights(id) on delete restrict;

alter table public.freight_offer_versions
  add constraint freight_offer_versions_created_by_fk
  foreign key (created_by) references auth.users(id) on delete restrict;

-- FK COMPOSTA: a versao antecessora pertence ao MESMO frete.
alter table public.freight_offer_versions
  add constraint freight_offer_versions_supersedes_fk
  foreign key (supersedes_offer_version_id, freight_id)
  references public.freight_offer_versions (id, freight_id) on delete restrict;

create unique index freight_offer_versions_single_root
  on public.freight_offer_versions (freight_id)
  where supersedes_offer_version_id is null;

create unique index freight_offer_versions_single_successor
  on public.freight_offer_versions (supersedes_offer_version_id)
  where supersedes_offer_version_id is not null;

create index freight_offer_versions_freight_idx
  on public.freight_offer_versions (freight_id, created_at desc);
create index freight_offer_versions_created_by_idx
  on public.freight_offer_versions (created_by);
create index freight_offer_versions_request_idx
  on public.freight_offer_versions (request_id);
create index freight_offer_versions_legacy_idx
  on public.freight_offer_versions (freight_id)
  where provenance = 'legacy_unassessed';
create index freight_offer_versions_value_basis_idx
  on public.freight_offer_versions (value_basis);

create trigger freight_offer_versions_block_update
  before update on public.freight_offer_versions
  for each row execute function public.publication_block_mutation();

create trigger freight_offer_versions_block_delete
  before delete on public.freight_offer_versions
  for each row execute function public.publication_block_mutation();

comment on table public.freight_offer_versions is
  'Versao do ANUNCIO INTEIRO, append-only. offer_snapshot cobre 43 chaves: as '
  '40 colunas do anuncio mais budget_brl, budget_amount e currency_code. A '
  'migration 7/7 congela exatamente essas 40 colunas enquanto o frete estiver '
  'publicado e torna currency_code imutavel - nenhum componente do snapshot e '
  'mutavel fora da cadeia. A versao corrente e a que nao possui sucessora; nao '
  'existe coluna de status mutavel.';

comment on column public.freight_offer_versions.provenance is
  'rpc_declared = registro criado pelo novo fluxo. legacy_unassessed = captura de '
  'anuncio pre-L2a. Uma versao legacy_unassessed NAO autoriza calculo de piso nem '
  'declaracao de conformidade: registra que o valor nunca foi avaliado.';

comment on column public.freight_offer_versions.value_basis is
  'Qualidade do valor anunciado. declared_positive = declarado por RPC. '
  'legacy_known_positive = legado com valor conhecido e positivo. legacy_unknown '
  '= legado com valor nulo, zero ou negativo, isto e, nao comprovavel. NAO e '
  'afirmado pelo chamador: o CHECK de coerencia o deriva do valor gravado.';

comment on column public.freight_offer_versions.snapshot_basis is
  'declared_at_publication = snapshot montado na publicacao. '
  'derived_from_legacy_row = snapshot derivado do estado legado encontrado.';

comment on column public.freight_offer_versions.offer_snapshot is
  'Foto integral do anuncio, montada no servidor por '
  'public.freight_offer_snapshot a partir da propria linha travada. NOT NULL: '
  'nao existe versao sem snapshot.';

-- =============================================================================
-- rpc_call_log  -  livro-razao de idempotencia, append-only
-- =============================================================================
-- LIMITE HONESTO: chamadas REJEITADAS nao aparecem. Uma RPC que levanta excecao
-- aborta a transacao e desfaz qualquer INSERT anterior ao RAISE; PostgreSQL nao
-- oferece transacao autonoma. So existem 'accepted' e 'replayed'.
-- =============================================================================

create table public.rpc_call_log (
  id                 uuid        primary key default gen_random_uuid(),
  rpc_name           text        not null,
  request_id         uuid        not null,
  actor_id           uuid        not null,
  target_id          uuid        null,
  params_fingerprint text        not null,
  outcome            text        not null,
  detail             text        null,
  created_at         timestamptz not null default now(),

  constraint rpc_call_log_rpc_name_not_blank
    check (length(btrim(rpc_name)) > 0),
  constraint rpc_call_log_outcome_valid
    check (outcome in ('accepted', 'replayed')),
  constraint rpc_call_log_fingerprint_format
    check (params_fingerprint ~ '^[0-9a-f]{64}$')
);

alter table public.rpc_call_log
  add constraint rpc_call_log_actor_fk
  foreign key (actor_id) references auth.users(id) on delete restrict;

-- ESPACO DE NOMES GLOBAL DE IDEMPOTENCIA. Um request_id e aceito por UMA unica
-- operacao em toda a base. O mesmo request_id apresentado a outra RPC, por outro
-- ator, para outro alvo ou com outros parametros encontra este registro, e a
-- probe levanta 42501 em vez de devolver evento de operacao diferente.
create unique index rpc_call_log_accepted_request_unique
  on public.rpc_call_log (request_id)
  where outcome = 'accepted';

create index rpc_call_log_request_idx on public.rpc_call_log (rpc_name, request_id);
create index rpc_call_log_actor_idx   on public.rpc_call_log (actor_id, created_at desc);
create index rpc_call_log_target_idx  on public.rpc_call_log (target_id);

create trigger rpc_call_log_block_update
  before update on public.rpc_call_log
  for each row execute function public.publication_block_mutation();

create trigger rpc_call_log_block_delete
  before delete on public.rpc_call_log
  for each row execute function public.publication_block_mutation();

comment on table public.rpc_call_log is
  'Livro-razao append-only de idempotencia. O indice unico parcial sobre '
  'request_id onde outcome = accepted torna o request_id um recurso consumido '
  'UMA vez, por UMA operacao. Nao e fonte de autorizacao.';

-- -----------------------------------------------------------------------------
-- Probe de idempotencia.
--   retorno com id nulo -> chamada NOVA.
--   retorno com id      -> replay legitimo; a linha traz target_id, util para as
--                          RPCs cujo alvo e SAIDA (criacao e preview).
-- Levanta 42501 em divergencia de operacao, ator, alvo ou impressao digital.
-- -----------------------------------------------------------------------------
create function public.rpc_idempotency_probe(
  p_rpc_name         text,
  p_request_id       uuid,
  p_actor_id         uuid,
  p_target_id        uuid,
  p_fingerprint      text,
  p_target_is_output boolean default false
)
returns public.rpc_call_log
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v     public.rpc_call_log%rowtype;
  v_nil public.rpc_call_log%rowtype;
begin
  if p_request_id is null then
    raise exception using errcode = '22004',
      message = p_rpc_name || ': request_id e obrigatorio';
  end if;

  -- SERIALIZACAO DO ESPACO DE request_id, ANTES DE QUALQUER LEITURA.
  -- Sem isto, duas transacoes simultaneas com o mesmo request_id leem "nao
  -- encontrado" ao mesmo tempo, ambas executam o trabalho e a segunda morre com
  -- 23505 cru no indice unico parcial - erro de banco vazando para o cliente em
  -- vez de replay. O advisory lock TRANSACIONAL fecha essa janela: a segunda
  -- sessao espera a primeira COMMITAR e so entao le, encontrando a linha
  -- 'accepted' e devolvendo um replay equivalente.
  --   * transacional: liberado automaticamente no COMMIT ou ROLLBACK, sem
  --     necessidade de unlock explicito e sem vazar lock em caminho de excecao;
  --   * deterministico: a chave e o hash do proprio request_id, prefixado, de
  --     modo que a MESMA chave sempre cai no mesmo lock e chaves diferentes
  --     quase nunca colidem - e uma colisao apenas serializa a mais, nunca
  --     compromete a correcao;
  --   * nao e autorizacao e nao depende de papel, GUC ou current_user.
  -- O indice unico parcial rpc_call_log_accepted_request_unique permanece como
  -- rede de seguranca estrutural; o lock existe para que ele nunca precise
  -- disparar num caminho legitimo.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('steelgo.rpc_idempotency:' || p_request_id::pg_catalog.text, 0));

  select * into v
    from public.rpc_call_log l
   where l.request_id = p_request_id
     and l.outcome = 'accepted';

  if not found then
    return v_nil;
  end if;

  if v.rpc_name <> p_rpc_name then
    raise exception using errcode = '42501',
      message = format('%s: request_id ja consumido pela operacao %s',
                       p_rpc_name, v.rpc_name);
  end if;
  if v.actor_id <> p_actor_id then
    raise exception using errcode = '42501',
      message = format('%s: request_id pertence a outro ator', p_rpc_name);
  end if;
  if not p_target_is_output and v.target_id is distinct from p_target_id then
    raise exception using errcode = '42501',
      message = format('%s: request_id ja consumido para outro alvo', p_rpc_name);
  end if;
  if v.params_fingerprint <> p_fingerprint then
    raise exception using errcode = '42501',
      message = format('%s: request_id reapresentado com parametros diferentes',
                       p_rpc_name);
  end if;

  insert into public.rpc_call_log
    (rpc_name, request_id, actor_id, target_id, params_fingerprint, outcome)
  values
    (p_rpc_name, p_request_id, p_actor_id, v.target_id, p_fingerprint, 'replayed');

  return v;
end;
$fn$;

revoke execute on function
  public.rpc_idempotency_probe(text, uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated;

comment on function public.rpc_idempotency_probe(text, uuid, uuid, uuid, text, boolean) is
  'Quatro dimensoes cumulativas: operacao, ator, alvo e impressao digital dos '
  'parametros. Divergencia em qualquer uma FALHA com 42501 - nunca devolve '
  'evento de operacao diferente.';

-- =============================================================================
-- Snapshot da oferta e captura de legado
-- =============================================================================

create function public.freight_offer_snapshot(p_f public.freights)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select jsonb_build_object(
    'steel_type',                    p_f.steel_type,
    'weight_tons',                   p_f.weight_tons,
    'volume_m3',                     p_f.volume_m3,
    'cargo_value_brl',               p_f.cargo_value_brl,
    'cargo_value_amount',            p_f.cargo_value_amount,
    'distance_km',                   p_f.distance_km,
    'origin_name',                   p_f.origin_name,
    'origin_city',                   p_f.origin_city,
    'origin_state',                  p_f.origin_state,
    'origin_lat',                    p_f.origin_lat,
    'origin_lng',                    p_f.origin_lng,
    'origin_country_code',           p_f.origin_country_code,
    'origin_subdivision_code',       p_f.origin_subdivision_code,
    'origin_postal_code',            p_f.origin_postal_code,
    'origin_timezone',               p_f.origin_timezone,
    'dest_name',                     p_f.dest_name,
    'dest_city',                     p_f.dest_city,
    'dest_state',                    p_f.dest_state,
    'dest_lat',                      p_f.dest_lat,
    'dest_lng',                      p_f.dest_lng,
    'destination_country_code',      p_f.destination_country_code,
    'destination_subdivision_code',  p_f.destination_subdivision_code,
    'destination_postal_code',       p_f.destination_postal_code,
    'destination_timezone',          p_f.destination_timezone,
    'waypoints',                     p_f.waypoints,
    'operation_scope',               p_f.operation_scope,
    'toll_included',                 p_f.toll_included,
    'required_truck',                p_f.required_truck,
    'category',                      p_f.category,
    'goods_type_code',               p_f.goods_type_code,
    'requires_mopp',                 p_f.requires_mopp,
    'regulatory_requirements',       p_f.regulatory_requirements,
    'handling_requirements',         p_f.handling_requirements,
    'pickup_date',                   p_f.pickup_date,
    'delivery_date',                 p_f.delivery_date,
    'pickup_window',                 p_f.pickup_window,
    'bid_deadline',                  p_f.bid_deadline,
    'cargo_description',             p_f.cargo_description,
    'notes',                         p_f.notes,
    'internal_reference',            p_f.internal_reference,
    'budget_brl',                    p_f.budget_brl,
    'budget_amount',                 p_f.budget_amount,
    'currency_code',                 p_f.currency_code
  )
$fn$;

revoke execute on function public.freight_offer_snapshot(public.freights)
  from public, anon, authenticated;

comment on function public.freight_offer_snapshot(public.freights) is
  'Monta o snapshot a partir da propria linha. As 43 chaves aqui sao exatamente '
  'as 40 colunas congeladas pela migration 7/7 enquanto publicado mais '
  'budget_brl, budget_amount e currency_code - governadas e imutavel '
  'respectivamente. Snapshot e anuncio nao podem divergir.';

-- -----------------------------------------------------------------------------
-- Devolve a versao corrente da oferta. Se o frete nunca passou por RPC (anuncio
-- legado), CAPTURA os valores reais como versao raiz 'legacy_unassessed',
-- classificando o valor conforme o que de fato existe. Nao inventa valor.
-- -----------------------------------------------------------------------------
create function public.ensure_offer_version(
  p_freight_id  uuid,
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
  v_id uuid;
  v_f  public.freights%rowtype;
begin
  select o.id into v_id
    from public.freight_offer_versions o
   where o.freight_id = p_freight_id
     and not exists (
       select 1 from public.freight_offer_versions s
        where s.supersedes_offer_version_id = o.id
     );
  if v_id is not null then
    return v_id;
  end if;

  select * into v_f from public.freights f where f.id = p_freight_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'ensure_offer_version: frete inexistente';
  end if;

  insert into public.freight_offer_versions (
    freight_id, supersedes_offer_version_id,
    provenance, value_basis, snapshot_basis,
    budget_brl, budget_amount, currency_code, weight_tons, distance_km,
    offer_snapshot, created_by, rpc_name, request_id, params_fingerprint
  ) values (
    p_freight_id, null,
    'legacy_unassessed',
    case when v_f.budget_brl is not null and v_f.budget_brl > 0
           then 'legacy_known_positive' else 'legacy_unknown' end,
    'derived_from_legacy_row',
    v_f.budget_brl, v_f.budget_amount, v_f.currency_code,
    v_f.weight_tons, v_f.distance_km,
    public.freight_offer_snapshot(v_f), p_actor_id, p_rpc_name, p_request_id,
    p_fingerprint
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke execute on function
  public.ensure_offer_version(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;

comment on function public.ensure_offer_version(uuid, uuid, text, uuid, text) is
  'Torna todo anuncio legado alcancavel pelas RPCs de retirada - unitaria, em '
  'massa e emergencial - sem inventar valor: copia budget_brl, budget_amount, '
  'currency_code e o snapshot REAIS, null inclusive, e classifica value_basis '
  'como legacy_known_positive ou legacy_unknown conforme o que existe.';

-- =============================================================================
-- RLS e grants
-- =============================================================================

alter table public.freight_offer_versions enable row level security;
alter table public.rpc_call_log            enable row level security;

revoke all on public.freight_offer_versions from anon, authenticated;
revoke all on public.rpc_call_log          from anon, authenticated;

grant select on public.freight_offer_versions to authenticated;
grant select on public.rpc_call_log          to authenticated;

create policy freight_offer_versions_select on public.freight_offer_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.freights f
      where f.id = freight_id
        and (
          f.created_by = (select auth.uid())
          or public.is_current_user_company_owner(f.company_id)
          or public.is_current_user_company_member(f.company_id)
          or public.has_role((select auth.uid()), 'admin'::public.app_role)
        )
    )
  );

create policy rpc_call_log_select on public.rpc_call_log
  for select to authenticated
  using (
    actor_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

commit;
