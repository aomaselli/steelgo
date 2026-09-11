-- =============================================================================
-- REV8.1 9/13 : SEED COMERCIAL  -  taxa de plataforma da SteelGo  BR / BRL / 3,5%
-- =============================================================================
-- NATUREZA DO NUMERO. 3,5% e a TAXA COMERCIAL DA SteelGo, aprovada pela
-- fundadora em 2026-09-09, em carater PROVISORIO para o MVP. NAO e piso minimo
-- da ANTT, nao deriva de piso regulatorio e nao guarda relacao com ele. Piso
-- regulatorio e materia do lote regulatorio; esta linha e preco de servico da
-- plataforma.
--
-- POR QUE UMA MIGRATION PROPRIA. O default 3.5 da coluna
-- platform_fee_percentage, existente desde 20260812140000 linha 186, e
-- conveniencia de schema e NAO aprovacao comercial: nao havia linha, nao havia
-- autor, nao havia vigencia. Esta migration cria o registro que faltava. O valor
-- e escrito EXPLICITAMENTE - nao se apoia no default da coluna.
--
-- POR QUE INSERT DIRETO E NAO admin_create_pricing_rule. Numa base recem
-- construida nao existe usuario administrador para assinar a chamada, e
-- inventar um seria pior do que declarar a natureza do ato. O evento gravado em
-- pricing_rule_events sai com actor_kind = 'migration' e actor_id nulo -
-- rastreavel como ato de implantacao, nunca disfarcado de decisao de alguem.
--
-- SEM SUBSTITUICAO SILENCIOSA. Nao ha ON CONFLICT, IF NOT EXISTS nem UPDATE. Se
-- ja existir regra geral ativa e vigente para BR/BRL, esta migration FALHA e diz
-- por que. Conflito de precificacao e decisao humana.
--
-- ANTES DE APLICAR NO REMOTO. O acesso remoto esta vedado nesta sessao. NAO se
-- afirma aqui que public.pricing_rules esteja vazia no remoto. A verificacao
-- read-only esta em supabase/verificacao_previa_remoto.sql. As guardas abaixo
-- tornam a migration fail-closed mesmo que a verificacao seja pulada.
-- =============================================================================

begin;

do $seed$
declare
  -- Identificador ESTAVEL. Constante, nao gerado, para que a linha seja citavel
  -- em auditoria e reconhecivel entre ambientes. 53544c47 = 'STLG' em ASCII hex.
  v_id       constant uuid        := '53544c47-0001-4000-8000-000000000001';
  v_pais     constant text        := 'BR';
  v_moeda    constant text        := 'BRL';
  v_taxa     constant numeric     := 3.5;
  v_de       constant timestamptz := timestamptz '2026-09-09 00:00:00-03:00';
  v_req      constant uuid        := '53544c47-0001-4000-8000-0000000000ee';
  v_fp       constant text        := repeat('0', 64);
  v_conflito record;
  v_check    record;
begin
  if exists (select 1 from public.pricing_rules pr where pr.id = v_id) then
    raise exception using errcode = '23505',
      message = format('seed comercial: a regra %s ja existe. Esta migration nao '
                       'substitui linha existente.', v_id);
  end if;

  select pr.id, pr.platform_fee_percentage, pr.priority, pr.effective_from
    into v_conflito
    from public.pricing_rules pr
   where pr.carrier_id is null
     and pr.is_active
     and pr.country_code  = v_pais
     and pr.currency_code = v_moeda
     and pr.effective_from <= now()
     and (pr.effective_until is null or pr.effective_until > now())
   order by pr.priority asc, pr.effective_from desc, pr.id asc
   limit 1;
  if found then
    raise exception using errcode = '22023',
      message = format('seed comercial: ja existe regra geral ativa e vigente '
                       'para %s/%s - id %s, taxa %s%%, priority %s, vigente desde '
                       '%s. Esta migration NAO substitui nem desativa regra '
                       'existente. Decida qual regra vale antes de aplicar.',
                       v_pais, v_moeda, v_conflito.id,
                       v_conflito.platform_fee_percentage,
                       v_conflito.priority, v_conflito.effective_from);
  end if;

  insert into public.pricing_rules (
    id, carrier_id, country_code, currency_code,
    platform_fee_percentage,     -- explicito, nao default
    risk_percentage, insurance_percentage,
    effective_from, effective_until,   -- null = vigente ate revogacao expressa
    version, priority, is_active,
    change_reason, parameters
  ) values (
    v_id, null, v_pais, v_moeda,
    v_taxa,
    0, 0,
    v_de, null,
    1, 100, true,
    'Taxa comercial de lancamento do MVP, aprovada pela fundadora em 2026-09-09 '
    'em carater provisorio.',
    jsonb_build_object(
      'natureza',        'taxa comercial da plataforma SteelGo',
      'nao_e',           'piso minimo da ANTT nem qualquer piso regulatorio',
      'aprovacao',       'fundadora da SteelGo',
      'carater',         'provisorio para o MVP',
      'data_aprovacao',  '2026-09-09',
      'origem_registro', 'migration 20260903100720_pricing_rules_seed_comercial')
  );

  insert into public.pricing_rule_events (
    pricing_rule_id, event_type, previous_rule_id, country_code, currency_code,
    carrier_id, fee_percentage, effective_from, effective_until, is_active,
    actor_kind, actor_id, reason, rpc_name, request_id, params_fingerprint
  ) values (
    v_id, 'created', null, v_pais, v_moeda,
    null, v_taxa, v_de, null, true,
    'migration', null,
    'Seed comercial do MVP: 3,5% aprovados em 2026-09-09, em carater provisorio. '
    'Taxa comercial da SteelGo, nao piso regulatorio.',
    '20260903100720_pricing_rules_seed_comercial', v_req, v_fp);

  -- PROVA DE EFEITO. Nao basta inserir: a regra tem de ser a que
  -- platform_pricing_rule_for de fato escolhe.
  select r.id, r.platform_fee_percentage
    into v_check
    from public.platform_pricing_rule_for(v_pais, v_moeda, null) r;

  if v_check.id is distinct from v_id then
    raise exception using errcode = '22023',
      message = format('seed comercial: apos o INSERT, a regra resolvida para %s/%s '
                       'foi %s e nao %s. O seed nao governa o calculo.',
                       v_pais, v_moeda, coalesce(v_check.id::text, 'nenhuma'), v_id);
  end if;
  if v_check.platform_fee_percentage is distinct from v_taxa then
    raise exception using errcode = '22023',
      message = format('seed comercial: taxa resolvida %s difere da aprovada %s.',
                       v_check.platform_fee_percentage, v_taxa);
  end if;

  raise notice 'seed comercial aplicado: % / % / %%% - regra %',
    v_pais, v_moeda, v_taxa, v_id;
end;
$seed$;

comment on table public.pricing_rules is
  'Regras de precificacao VERSIONADAS. platform_fee_percentage e TAXA COMERCIAL '
  'da plataforma - nao e piso minimo da ANTT e nao deriva de piso regulatorio. '
  'Escrita exclusiva de administrador SteelGo, por RPC. Campos economicos sao '
  'imutaveis: correcao se faz por nova versao. A regra geral BR/BRL vigente foi '
  'registrada por 20260903100720, com 3,5% aprovados em 2026-09-09 em carater '
  'provisorio para o MVP.';

commit;
