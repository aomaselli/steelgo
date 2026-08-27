-- ============================================================================
-- Identity & Driver Verification — trilha de auditoria APPEND-ONLY
-- ============================================================================
--
-- Uma linha por EVENTO concluído: cada interação com provedor e a decisão
-- final. A linha nasce já com o desfecho — não existe registro "em aberto"
-- para atualizar depois, e por isso a tabela é append-only de verdade,
-- garantida por trigger e não apenas por convenção de código.
--
-- drivers.license_verification_status continua sendo o estado corrente.
-- Esta tabela é histórico. Nenhuma máquina de estados paralela.
--
-- NUNCA armazenado aqui: CPF, CNH, selfie, biometria, payload do Datavalid,
-- resposta do SENATRAN, token da GCC, bearer do SERPRO.
-- ============================================================================

create table if not exists public.driver_verifications (
  id                   uuid primary key default gen_random_uuid(),
  -- ON DELETE RESTRICT, não CASCADE: histórico de verificação de identidade
  -- não pode desaparecer junto com o registro do motorista. Apagar um driver
  -- com histórico passa a exigir decisão explícita (anonimizar ou arquivar),
  -- em vez de destruir a trilha em silêncio.
  driver_id            uuid not null references public.drivers(id) on delete restrict,
  provider             text not null,
  verification_type    text not null,
  status               text not null,
  decision             text,
  provider_reference   text,
  result_code          text,
  internal_reason_code text,
  rule_version         text,
  decided_by           text not null default 'system',
  requested_at         timestamptz not null default now(),
  completed_at         timestamptz not null default now(),
  expires_at           timestamptz,
  created_at           timestamptz not null default now()
);

alter table public.driver_verifications
  add constraint driver_verifications_provider_valid
    check (provider in ('gcc', 'datavalid', 'senatran', 'manual')),
  add constraint driver_verifications_type_valid
    check (verification_type in ('consent', 'identity', 'driver_license')),
  -- Sem 'requested': o evento só é gravado depois da chamada ao provedor.
  add constraint driver_verifications_status_valid
    check (status in ('completed', 'failed')),
  add constraint driver_verifications_decision_valid
    check (decision is null or decision in
      ('approved', 'manual_review', 'rejected', 'expired', 'provider_error')),
  add constraint driver_verifications_decided_by_valid
    check (decided_by in ('system', 'admin'));

create index if not exists driver_verifications_driver_idx
  on public.driver_verifications (driver_id, created_at desc);
create index if not exists driver_verifications_status_idx
  on public.driver_verifications (status, created_at desc);
create index if not exists driver_verifications_created_idx
  on public.driver_verifications (created_at desc);
create index if not exists driver_verifications_review_queue_idx
  on public.driver_verifications (decision, created_at desc)
  where decision in ('manual_review', 'provider_error');

-- ----------------------------------------------------------------------------
-- Append-only imposto pelo banco
-- ----------------------------------------------------------------------------
-- Vale inclusive para a service role, que ignora RLS. Sem isto, "append-only"
-- seria só uma promessa do código de hoje — qualquer refatoração futura
-- poderia reescrever histórico sem ninguém perceber.
create or replace function public.driver_verifications_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'driver_verifications is append-only: UPDATE and DELETE are not allowed';
end;
$$;

drop trigger if exists driver_verifications_no_mutation on public.driver_verifications;
create trigger driver_verifications_no_mutation
  before update or delete on public.driver_verifications
  for each row execute function public.driver_verifications_block_mutation();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
-- Escrita: NENHUMA policy de INSERT/UPDATE/DELETE. Sem policy, anon e
-- authenticated não escrevem. A service role é o único caminho de INSERT,
-- pelo repository server-side — e nem ela consegue UPDATE/DELETE.
--
-- Leitura: admin lê tudo. O motorista NÃO recebe policy de SELECT direto,
-- porque result_code e provider_reference são códigos de provedor externo.
-- O resumo seguro sai pela RPC abaixo.
alter table public.driver_verifications enable row level security;

create policy driver_verifications_select_admin
  on public.driver_verifications
  for select to authenticated
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

revoke all on public.driver_verifications from anon, authenticated;
grant select on public.driver_verifications to authenticated;

-- ----------------------------------------------------------------------------
-- Resumo seguro para o motorista
-- ----------------------------------------------------------------------------
-- Expõe apenas tipo, decisão interna, motivo interno e datas.
-- Nunca result_code, nunca provider_reference.
--
-- Defesas: exige role driver (uma inconsistência histórica em
-- drivers.profile_id não basta para receber dados); p_limit é saneado contra
-- null, negativo, zero e valor alto; o filtro é sempre o auth.uid() do
-- chamador, sem parâmetro de identidade.
create or replace function public.my_driver_verifications(p_limit integer default 20)
returns table (
  id uuid,
  verification_type text,
  status text,
  decision text,
  internal_reason_code text,
  requested_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.verification_type, v.status, v.decision,
         v.internal_reason_code, v.requested_at, v.completed_at, v.expires_at
  from public.driver_verifications v
  join public.drivers d on d.id = v.driver_id
  where d.profile_id = (select auth.uid())
    and (select auth.uid()) is not null
    and public.has_role((select auth.uid()), 'driver'::public.app_role)
  order by v.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke execute on function public.my_driver_verifications(integer) from public, anon;
grant  execute on function public.my_driver_verifications(integer) to authenticated;

revoke execute on function public.driver_verifications_block_mutation() from public, anon, authenticated;
