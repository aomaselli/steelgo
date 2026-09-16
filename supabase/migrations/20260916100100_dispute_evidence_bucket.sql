-- =============================================================================
-- MODULO 2 (2/9) : BUCKET dispute-evidence  -  evidencias das partes
-- =============================================================================
-- Bucket PRIVADO, separado de payment-evidence (cuja policy e admin-only e cujo
-- caminho e contrato/transacao). Regras:
--   * caminho: <case_id>/<uuid aleatorio>/<kind>-<UTC ms>-<uuid>-<sha16>.<ext>
--     kind em (photo|document|invoice|message|other); ext em (pdf|jpg|jpeg|png).
--     O caminho NAO carrega o uuid de quem envia (privacidade): a autoria e o
--     owner_id que o Storage registra no upload, conferido por
--     assert_dispute_evidence;
--   * INSERT: partes do caso (proprietarios das empresas do contrato) e
--     administradores, somente enquanto o caso aceita instrucao
--     (open, under_review, awaiting_evidence);
--   * SELECT: partes do caso e administradores;
--   * NENHUMA policy de UPDATE ou DELETE: evidencia enviada nao e sobrescrita
--     nem apagada por cliente; objetos orfaos ficam retidos;
--   * 10 MB, pdf/jpeg/png.
--
-- LIMITE HONESTO (mesmo do modulo financeiro): o SHA-256 e calculado e
-- declarado pelo navegador de quem envia; MIME e tamanho sao os registrados
-- pelo Storage; o eTag e identificador opaco. Nada disso e verificacao
-- independente - a outra parte e o administrador podem recalcular o hash ao
-- baixar o arquivo, e isso sim e conferencia.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. visibilidade do caso: partes proprietarias e administradores
-- -----------------------------------------------------------------------------
-- Diferente de is_dispute_visible (que herda o motorista de
-- is_contract_visible): nesta fase, motorista NAO e parte de disputa.
create function public.dispute_case_visible(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select (select auth.uid()) is not null
     and (
       public.has_role((select auth.uid()), 'admin'::public.app_role)
       or exists (
         select 1
           from public.dispute_cases d
           join public.contracts c on c.id = d.contract_id
          where d.id = p_case_id
            and (public.is_current_user_company_owner(c.shipper_company_id)
                 or public.is_current_user_company_owner(c.carrier_company_id)))
     )
$fn$;

-- Para as policies de Storage: recebe TEXTO (segmentos do caminho) e devolve
-- false para qualquer coisa que nao seja um uuid valido, sem lancar erro.
create function public.dispute_object_visible(p_case text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if p_case is null or p_case !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.dispute_case_visible(p_case::uuid);
end;
$fn$;

create function public.dispute_upload_allowed(p_case text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    return false;
  end if;
  if p_case is null or p_case !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if not public.dispute_case_visible(p_case::uuid) then
    return false;
  end if;
  return exists (
    select 1 from public.dispute_cases d
     where d.id = p_case::uuid
       and d.status in ('open'::public.dispute_status,
                        'under_review'::public.dispute_status,
                        'awaiting_evidence'::public.dispute_status));
end;
$fn$;

revoke all on function public.dispute_case_visible(uuid) from public, anon, authenticated, service_role;
revoke all on function public.dispute_object_visible(text) from public, anon, authenticated, service_role;
revoke all on function public.dispute_upload_allowed(text) from public, anon, authenticated, service_role;
grant execute on function public.dispute_case_visible(uuid) to authenticated, service_role;
grant execute on function public.dispute_object_visible(text) to authenticated, service_role;
grant execute on function public.dispute_upload_allowed(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. bucket e policies
-- -----------------------------------------------------------------------------
-- Sem ON CONFLICT: se o bucket ja existir com outra configuracao, a migration
-- FALHA e alguem decide.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dispute-evidence', 'dispute-evidence', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png']);

create policy dispute_evidence_insert_party on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dispute-evidence'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(photo|document|invoice|message|other)-[0-9]{8}T[0-9]{6}\.[0-9]{3}Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{16}\.(pdf|jpg|jpeg|png)$'
    and public.dispute_upload_allowed((storage.foldername(name))[1])
  );

create policy dispute_evidence_select_party on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dispute-evidence'
    and public.dispute_object_visible((storage.foldername(name))[1])
  );

-- -----------------------------------------------------------------------------
-- 3. assertivas fail-closed
-- -----------------------------------------------------------------------------
do $$
declare
  v_limit bigint;
  v_mimes text[];
  v_n     int;
begin
  select file_size_limit, allowed_mime_types into v_limit, v_mimes
    from storage.buckets where id = 'dispute-evidence' and public = false;
  if v_limit is distinct from 10485760
     or v_mimes is distinct from array['application/pdf', 'image/jpeg', 'image/png'] then
    raise exception 'dispute-evidence: bucket fora da configuracao exigida';
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('dispute_evidence_insert_party', 'dispute_evidence_select_party');
  if v_n <> 2 then
    raise exception 'dispute-evidence: esperadas 2 policies, encontradas %', v_n;
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and cmd in ('UPDATE', 'DELETE')
                and (coalesce(qual, '') || coalesce(with_check, '')) like '%dispute-evidence%') then
    raise exception 'dispute-evidence: policy de UPDATE/DELETE encontrada';
  end if;
end $$;

commit;
