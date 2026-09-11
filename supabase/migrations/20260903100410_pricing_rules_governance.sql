-- =============================================================================
-- REV8.1 1/13 : GOVERNANCA E VERSIONAMENTO DE public.pricing_rules
-- =============================================================================
-- ACHADO FECHADO AQUI (comprovado no catalogo e reproduzido em teste na
-- revisao 7):
--
--   A policy pricing_rules_manage, criada em 20260812140000, autorizava INSERT,
--   UPDATE e DELETE a quem fosse dono da empresa da transportadora citada em
--   carrier_id. E public.platform_pricing_rule_for ordena regra de
--   transportadora ANTES da regra geral. Logo, uma transportadora podia inserir
--   uma regra propria com platform_fee_percentage = 0 e deixar de pagar a taxa
--   da plataforma. O teste G12 'ACHADO: a regra da transportadora VENCE a taxa
--   aprovada' devolvia 0.0000.
--
-- DECISAO APLICADA:
--   * carrier_id passa a significar CONDICAO COMERCIAL CRIADA PELA SteelGo para
--     aquela transportadora - nunca controle da transportadora sobre a propria
--     taxa;
--   * somente administrador SteelGo cria, altera, encerra ou substitui regra, e
--     somente por RPC SECURITY DEFINER;
--   * escrita direta de cliente e revogada em nivel de PRIVILEGIO, nao apenas de
--     policy: privilegio revogado nao depende de RLS estar habilitada.
--
-- VERSIONAMENTO, NAO EDICAO:
--   * os campos economicos e de escopo de uma regra sao IMUTAVEIS depois de
--     criados. Um trigger recusa qualquer UPDATE neles, inclusive vindo de
--     postgres ou service_role;
--   * o unico UPDATE admitido e o ENCERRAMENTO PARA A FRENTE: preencher
--     effective_until, is_active = false, closed_at, closed_by e
--     closed_at e closed_by. Nada disso reescreve o passado. A sucessao e
--     registrada UMA vez, na versao nova, por supersedes_id;
--   * DELETE e bloqueado por trigger. Regra usada em contrato nunca desaparece.
--
-- A taxa comercial da SteelGo NAO e o piso minimo da ANTT, nao deriva dele e nao
-- guarda relacao com ele. Piso regulatorio e materia do lote regulatorio.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. PRIVILEGIOS
-- -----------------------------------------------------------------------------
-- Ordem deliberada: revogar o privilegio ANTES de mexer em policy. Policy sem
-- privilegio e inerte; privilegio sem policy nao e.
revoke insert, update, delete, truncate on public.pricing_rules
  from public, anon, authenticated;

-- A policy que dava poder a transportadora deixa de existir. Nao basta torna-la
-- inerte: ela declarava uma intencao errada e seria reaproveitada por engano.
drop policy pricing_rules_manage on public.pricing_rules;

-- Substituta admin-only. Nao concede privilegio nenhum - RLS so restringe - e
-- existe como segunda barreira caso um ALTER DEFAULT PRIVILEGES futuro
-- reconceda escrita por acidente.
create policy pricing_rules_admin_manage on public.pricing_rules
  for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));

-- -----------------------------------------------------------------------------
-- 2. COLUNAS DE VERSIONAMENTO E AUTORIA
-- -----------------------------------------------------------------------------
-- CORRECAO 8.1. Existe UM unico ponteiro de versao: supersedes_id, da versao
-- nova para a que ela substitui. O ponteiro inverso foi REMOVIDO - dois
-- ponteiros apontando um para o outro sao redundantes, podem divergir, e a
-- divergencia entre eles nao teria como ser detectada. O sucessor de uma regra
-- e derivado por consulta reversa, sempre correto por construcao.
alter table public.pricing_rules
  add column supersedes_id     uuid        null,
  add column created_by_admin  uuid        null,
  add column closed_by_admin   uuid        null,
  add column closed_at         timestamptz null,
  add column change_reason     text        null;

alter table public.pricing_rules
  add constraint pricing_rules_supersedes_fk
  foreign key (supersedes_id) references public.pricing_rules(id) on delete restrict;

alter table public.pricing_rules
  add constraint pricing_rules_created_by_admin_fk
  foreign key (created_by_admin) references auth.users(id) on delete restrict;

alter table public.pricing_rules
  add constraint pricing_rules_closed_by_admin_fk
  foreign key (closed_by_admin) references auth.users(id) on delete restrict;

alter table public.pricing_rules
  add constraint pricing_rules_not_self_superseding
  check (supersedes_id is null or supersedes_id <> id);

alter table public.pricing_rules
  add constraint pricing_rules_change_reason_not_blank
  check (change_reason is null or length(btrim(change_reason)) > 0);

-- ENCERRAMENTO COERENTE - ESTRUTURAL, NAO SO NA RPC (correcao 8.1/b5).
-- O comentario antigo dizia "regra encerrada nao fica ativa" mas o CHECK so
-- verificava a simetria closed_at/closed_by_admin: a frase valia porque as RPCs
-- se comportavam bem, nao porque o schema exigia. Uma regra encerrada e ainda
-- ativa era representavel. Agora nao e. As tres afirmacoes que o comentario faz
-- passam a ser as tres conjuncoes do CHECK:
--
--   1. quem tem closed_at tem closed_by_admin e vice-versa;
--   2. regra encerrada NAO fica ativa: closed_at preenchido => is_active = false;
--   3. regra encerrada tem fim de vigencia declarado e posterior ao inicio:
--      closed_at preenchido => effective_until nao nulo e > effective_from.
--
-- A condicao 3 e o que impede o encerramento "sem fim": uma linha marcada como
-- encerrada mas com vigencia aberta ate o infinito, que continuaria sendo
-- escolhida por qualquer consulta que filtre por effective_until.
--
-- Seguro para linhas pre-existentes: closed_at e coluna NOVA, criada nesta
-- mesma migration, portanto nula em toda linha ja gravada - so a conjuncao 1
-- se aplica a elas, e ela e satisfeita por dois nulos.
alter table public.pricing_rules
  add constraint pricing_rules_close_coherent
  check (
    (closed_at is null) = (closed_by_admin is null)
    and (closed_at is null
         or (is_active = false
             and effective_until is not null
             and effective_until > effective_from))
  );

-- SUCESSOR UNICO, em UM unico indice. unique(supersedes_id) diz exatamente
-- isto: nenhuma regra e substituida por duas versoes diferentes. E como cada
-- linha tem no maximo um supersedes_id, o predecessor tambem e unico. A cadeia
-- de versoes nao bifurca em nenhuma das duas direcoes.
create unique index pricing_rules_single_successor
  on public.pricing_rules (supersedes_id) where supersedes_id is not null;

comment on column public.pricing_rules.carrier_id is
  'Condicao comercial criada PELA SteelGo para aquela transportadora. NAO e '
  'controle da transportadora sobre a propria taxa: desde 20260903100410 a '
  'escrita e exclusiva de administrador, por RPC.';

-- -----------------------------------------------------------------------------
-- 3. TRILHA APPEND-ONLY DE PRECIFICACAO
-- -----------------------------------------------------------------------------
create table public.pricing_rule_events (
  id                 uuid        primary key default gen_random_uuid(),
  pricing_rule_id    uuid        not null,
  event_type         text        not null,
  previous_rule_id   uuid        null,
  country_code       text        not null,
  currency_code      text        not null,
  carrier_id         uuid        null,
  fee_percentage     numeric(8,4) not null,
  effective_from     timestamptz not null,
  effective_until    timestamptz null,
  is_active          boolean     not null,
  -- O seed comercial e ato de MIGRATION, nao de usuario: numa base recem
  -- construida nao existe administrador para assinar o evento. Em vez de
  -- inventar um ator, o evento declara sua natureza.
  actor_kind         text        not null,
  actor_id           uuid        null,
  reason             text        null,
  rpc_name           text        not null,
  request_id         uuid        not null,
  params_fingerprint text        not null,
  created_at         timestamptz not null default now(),

  constraint pricing_rule_events_type_valid
    check (event_type in ('created', 'superseded', 'closed')),
  constraint pricing_rule_events_actor_kind_valid
    check (actor_kind in ('admin', 'migration')),
  -- Ato de administrador tem ator; ato de migration nao tem, e diz que nao tem.
  constraint pricing_rule_events_actor_coherent
    check ((actor_kind = 'migration') = (actor_id is null)),
  constraint pricing_rule_events_fingerprint_format
    check (params_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint pricing_rule_events_reason_not_blank
    check (reason is null or length(btrim(reason)) > 0),
  -- 'superseded' e o unico tipo que cita regra anterior, e sempre cita.
  constraint pricing_rule_events_previous_only_on_supersede
    check ((previous_rule_id is not null) = (event_type = 'superseded')),
  constraint pricing_rule_events_request_rule_unique
    unique (request_id, pricing_rule_id)
);

alter table public.pricing_rule_events
  add constraint pricing_rule_events_rule_fk
  foreign key (pricing_rule_id) references public.pricing_rules(id) on delete restrict;
alter table public.pricing_rule_events
  add constraint pricing_rule_events_previous_fk
  foreign key (previous_rule_id) references public.pricing_rules(id) on delete restrict;
alter table public.pricing_rule_events
  add constraint pricing_rule_events_actor_fk
  foreign key (actor_id) references auth.users(id) on delete restrict;

create index pricing_rule_events_rule_idx  on public.pricing_rule_events (pricing_rule_id, created_at desc);
create index pricing_rule_events_actor_idx on public.pricing_rule_events (actor_id, created_at desc);

create trigger pricing_rule_events_block_update
  before update on public.pricing_rule_events
  for each row execute function public.publication_block_mutation();
create trigger pricing_rule_events_block_delete
  before delete on public.pricing_rule_events
  for each row execute function public.publication_block_mutation();

comment on table public.pricing_rule_events is
  'Trilha append-only das decisoes de precificacao comercial da SteelGo. Guarda '
  'o valor VIGENTE no instante do evento, de modo que a taxa historica seja '
  'recuperavel mesmo que a regra seja encerrada depois.';

-- -----------------------------------------------------------------------------
-- 4. IMUTABILIDADE ECONOMICA
-- -----------------------------------------------------------------------------
-- LIMITE HONESTO, ja registrado no L2a: postgres, service_role e supabase_admin
-- nao sao adversarios contidos - eles podem desabilitar este trigger. O trigger
-- protege contra caminho de aplicacao e contra erro operacional, e garante
-- DETECTABILIDADE, nao contencao de superusuario.
create function public.pricing_rules_enforce_versioning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if TG_OP = 'DELETE' then
    raise exception using errcode = '42501',
      message = 'public.pricing_rules e versionada: regra nao e apagada. '
                'Encerre com admin_close_pricing_rule ou substitua com '
                'admin_supersede_pricing_rule.';
  end if;

  -- Campos economicos e de escopo: imutaveis. Corrigir e criar nova versao.
  if NEW.platform_fee_percentage is distinct from OLD.platform_fee_percentage
     or NEW.risk_percentage      is distinct from OLD.risk_percentage
     or NEW.insurance_percentage is distinct from OLD.insurance_percentage
     or NEW.country_code         is distinct from OLD.country_code
     or NEW.currency_code        is distinct from OLD.currency_code
     or NEW.carrier_id           is distinct from OLD.carrier_id
     or NEW.effective_from       is distinct from OLD.effective_from
     or NEW.id                   is distinct from OLD.id
     or NEW.created_at           is distinct from OLD.created_at
     or NEW.created_by_admin     is distinct from OLD.created_by_admin
     or NEW.supersedes_id        is distinct from OLD.supersedes_id
  then
    raise exception using errcode = '42501',
      message = 'public.pricing_rules: campo economico ou de escopo e imutavel. '
                'Correcao se faz por NOVA VERSAO, nunca por UPDATE destrutivo.';
  end if;

  -- Encerramento so avanca: nunca reabre nem reescreve um fechamento.
  if OLD.closed_at is not null then
    if NEW.closed_at is distinct from OLD.closed_at
       or NEW.closed_by_admin  is distinct from OLD.closed_by_admin
       or NEW.effective_until  is distinct from OLD.effective_until
       or NEW.is_active is distinct from OLD.is_active
    then
      raise exception using errcode = '42501',
        message = 'public.pricing_rules: regra ja encerrada; encerramento nao e '
                  'reescrito nem revertido.';
    end if;
  end if;

  return NEW;
end;
$fn$;

create trigger pricing_rules_enforce_versioning_trg
  before update or delete on public.pricing_rules
  for each row execute function public.pricing_rules_enforce_versioning();

comment on function public.pricing_rules_enforce_versioning() is
  'Torna a regra de precificacao um registro versionado: campos economicos e de '
  'escopo imutaveis, encerramento so para a frente, sucessao registrada uma '
  'unica vez, DELETE recusado. Regra usada em contrato nunca e alterada.';

commit;
