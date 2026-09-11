-- =============================================================================
-- L2a - migration 4/7 : dry-run de retirada em massa
-- =============================================================================
-- Nenhuma retirada acontece aqui.
--
-- ALCANCE DOS LEGADOS. Ao contrario da versao anterior deste lote, o preview
-- NAO exclui anuncios legados. Um frete publicado sem ponteiro de evento entra
-- normalmente, marcado com is_legacy_at_preview = true, e a execucao captura
-- para ele uma versao de oferta 'legacy_unassessed' com os valores REAIS
-- (inclusive budget nulo) antes de registrar a retirada. Nenhum valor e
-- inventado.
--
-- ANTI-DERIVA. Cada item guarda o ponteiro estrutural do frete no instante do
-- preview. A execucao exige que o ponteiro ainda seja EXATAMENTE aquele -
-- inclusive null, para legados. Divergencia = a transacao inteira aborta. Nao
-- ha execucao parcial nem item silenciosamente pulado.
-- =============================================================================

begin;

create table public.bulk_withdrawal_previews (
  id                 uuid        primary key default gen_random_uuid(),
  created_by         uuid        not null,
  scope_company_id   uuid        null,
  filter_reason      text        not null,
  filter_snapshot    jsonb       null,
  item_count         integer     not null,
  legacy_count       integer     not null,
  rpc_name           text        not null,
  request_id         uuid        not null,
  params_fingerprint text        not null,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,

  constraint bulk_withdrawal_previews_reason_not_blank
    check (length(btrim(filter_reason)) > 0),
  constraint bulk_withdrawal_previews_expiry_after_creation
    check (expires_at > created_at),
  -- Teto duro de lote, identico ao da RPC de emergencia.
  constraint bulk_withdrawal_previews_item_count_bounded
    check (item_count >= 0 and item_count <= 500),
  constraint bulk_withdrawal_previews_legacy_count_bounded
    check (legacy_count >= 0 and legacy_count <= item_count),
  constraint bulk_withdrawal_previews_filter_is_object
    check (filter_snapshot is null or jsonb_typeof(filter_snapshot) = 'object'),
  constraint bulk_withdrawal_previews_fingerprint_format
    check (params_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint bulk_withdrawal_previews_request_unique
    unique (request_id)
);

alter table public.bulk_withdrawal_previews
  add constraint bulk_withdrawal_previews_created_by_fk
  foreign key (created_by) references auth.users(id) on delete restrict;

alter table public.bulk_withdrawal_previews
  add constraint bulk_withdrawal_previews_company_fk
  foreign key (scope_company_id) references public.companies(id) on delete restrict;

create index bulk_withdrawal_previews_created_by_idx
  on public.bulk_withdrawal_previews (created_by, created_at desc);
create index bulk_withdrawal_previews_company_idx
  on public.bulk_withdrawal_previews (scope_company_id);

create trigger bulk_withdrawal_previews_block_update
  before update on public.bulk_withdrawal_previews
  for each row execute function public.publication_block_mutation();

create trigger bulk_withdrawal_previews_block_delete
  before delete on public.bulk_withdrawal_previews
  for each row execute function public.publication_block_mutation();

comment on table public.bulk_withdrawal_previews is
  'Dry-run append-only de retirada em massa. Sem coluna de status: "executado" e '
  'estado DERIVADO da existencia de eventos apontando para este preview. '
  'legacy_count informa quantos itens exigirao captura legacy_unassessed.';

-- -----------------------------------------------------------------------------

create table public.bulk_withdrawal_preview_items (
  id                                   uuid        primary key default gen_random_uuid(),
  preview_id                           uuid        not null,
  freight_id                           uuid        not null,
  status_at_preview                    public.freight_status not null,
  published_at_at_preview              timestamptz null,
  budget_brl_at_preview                numeric     null,
  budget_amount_at_preview             numeric     null,
  last_publication_event_id_at_preview uuid        null,
  is_legacy_at_preview                 boolean     not null,
  created_at                           timestamptz not null default now(),

  constraint bulk_withdrawal_preview_items_unique
    unique (preview_id, freight_id),
  constraint bulk_withdrawal_preview_items_id_preview_unique
    unique (id, preview_id),
  -- So entra no preview o que esta efetivamente publicado.
  constraint bulk_withdrawal_preview_items_published_only
    check (status_at_preview = 'published'::public.freight_status),
  -- "Legado" e definicao estrutural, nao rotulo solto: ausencia de ponteiro.
  constraint bulk_withdrawal_preview_items_legacy_definition
    check (is_legacy_at_preview = (last_publication_event_id_at_preview is null))
);

alter table public.bulk_withdrawal_preview_items
  add constraint bulk_withdrawal_preview_items_preview_fk
  foreign key (preview_id) references public.bulk_withdrawal_previews(id) on delete restrict;

alter table public.bulk_withdrawal_preview_items
  add constraint bulk_withdrawal_preview_items_freight_fk
  foreign key (freight_id) references public.freights(id) on delete restrict;

-- FK COMPOSTA: o ponteiro capturado pertence ao MESMO frete. MATCH SIMPLE deixa
-- o caso legado (ponteiro null) fora da exigencia, corretamente.
alter table public.bulk_withdrawal_preview_items
  add constraint bulk_withdrawal_preview_items_pointer_fk
  foreign key (last_publication_event_id_at_preview, freight_id)
  references public.freight_publication_events (id, freight_id) on delete restrict;

create index bulk_withdrawal_preview_items_preview_idx
  on public.bulk_withdrawal_preview_items (preview_id);
create index bulk_withdrawal_preview_items_freight_idx
  on public.bulk_withdrawal_preview_items (freight_id);
create index bulk_withdrawal_preview_items_legacy_idx
  on public.bulk_withdrawal_preview_items (preview_id)
  where is_legacy_at_preview;

create trigger bulk_withdrawal_preview_items_block_update
  before update on public.bulk_withdrawal_preview_items
  for each row execute function public.publication_block_mutation();

create trigger bulk_withdrawal_preview_items_block_delete
  before delete on public.bulk_withdrawal_preview_items
  for each row execute function public.publication_block_mutation();

comment on column public.bulk_withdrawal_preview_items.last_publication_event_id_at_preview is
  'Ponteiro estrutural do frete no instante do preview. A execucao exige que '
  'freights.last_publication_event_id ainda seja EXATAMENTE este valor, null '
  'inclusive. Qualquer transicao ocorrida no intervalo muda o ponteiro e aborta '
  'a transacao inteira.';

comment on column public.bulk_withdrawal_preview_items.is_legacy_at_preview is
  'true = anuncio pre-L2a, sem ponteiro de evento. A execucao capturara para ele '
  'uma versao de oferta legacy_unassessed com os valores reais antes de '
  'registrar a retirada.';

-- =============================================================================
-- Vinculo evento -> preview
-- =============================================================================

alter table public.freight_publication_events
  add column bulk_withdrawal_preview_id uuid null;

alter table public.freight_publication_events
  add constraint freight_publication_events_preview_fk
  foreign key (bulk_withdrawal_preview_id)
  references public.bulk_withdrawal_previews(id) on delete restrict;

-- Um preview nao produz dois eventos para o mesmo frete. Com a verificacao de
-- deriva, torna a execucao dupla estruturalmente impossivel.
create unique index freight_publication_events_preview_freight_unique
  on public.freight_publication_events (bulk_withdrawal_preview_id, freight_id)
  where bulk_withdrawal_preview_id is not null;

alter table public.freight_publication_events
  add constraint freight_publication_events_preview_only_withdraw
  check (bulk_withdrawal_preview_id is null
         or transition = 'withdraw'::public.freight_lifecycle_transition);

create index freight_publication_events_preview_idx
  on public.freight_publication_events (bulk_withdrawal_preview_id)
  where bulk_withdrawal_preview_id is not null;

comment on column public.freight_publication_events.bulk_withdrawal_preview_id is
  'Preview que autorizou esta retirada. null em retirada unitaria e em '
  'emergencia. A execucao de um preview e estado DERIVADO destas linhas.';

-- =============================================================================
-- RLS e grants
-- =============================================================================

alter table public.bulk_withdrawal_previews      enable row level security;
alter table public.bulk_withdrawal_preview_items enable row level security;

revoke all on public.bulk_withdrawal_previews      from anon, authenticated;
revoke all on public.bulk_withdrawal_preview_items from anon, authenticated;

grant select on public.bulk_withdrawal_previews      to authenticated;
grant select on public.bulk_withdrawal_preview_items to authenticated;

create policy bulk_withdrawal_previews_select on public.bulk_withdrawal_previews
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin'::public.app_role)
    or (scope_company_id is not null
        and public.is_current_user_company_owner(scope_company_id))
  );

create policy bulk_withdrawal_preview_items_select on public.bulk_withdrawal_preview_items
  for select to authenticated
  using (
    exists (
      select 1 from public.bulk_withdrawal_previews p
      where p.id = preview_id
        and (
          p.created_by = (select auth.uid())
          or public.has_role((select auth.uid()), 'admin'::public.app_role)
          or (p.scope_company_id is not null
              and public.is_current_user_company_owner(p.scope_company_id))
        )
    )
  );

commit;
