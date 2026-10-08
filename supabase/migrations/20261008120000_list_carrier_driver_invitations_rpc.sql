-- =============================================================================
-- Leitura dos convites de motorista, pela transportadora que os criou
-- =============================================================================
-- PROBLEMA, medido em 06/10/2026 pela interface, na instancia descartavel. A
-- aba "Convites" da tela da transportadora dizia "Nenhum convite -- ainda nao
-- ha convites ativos para este carrier" enquanto o banco tinha DOIS convites
-- daquela transportadora. A requisicao era:
--
--     GET /rest/v1/driver_carrier_invitations?...&carrier_id=eq.<id>
--     -> 403 Forbidden
--
-- CAUSA. `public.driver_carrier_invitations` tem a policy de SELECT
-- `driver_carrier_invitations_carrier_select`, mas a migration que cria a
-- tabela (20260813220000) termina com
--
--     revoke all on public.driver_carrier_invitations from anon, authenticated;
--
-- Isso NAO e esquecimento, e a decisao certa: a tabela guarda `token_hash`,
-- `expected_cpf_hash` e `expected_license_hash`. Um `grant select` na tabela
-- exporia essas tres colunas pelo PostgREST. Hash de CPF e reversivel na
-- pratica -- o espaco de CPFs validos e pequeno o bastante para ser varrido --
-- entao publicar esse hash equivale a publicar o CPF.
--
-- DECISAO. O revoke fica como esta. A leitura passa por uma funcao que devolve
-- SOMENTE o que a tela precisa, no mesmo padrao ja usado neste repositorio para
-- identificacao contratual.
--
-- O QUE NAO ENTRA, de proposito: token_hash, expected_cpf_hash,
-- expected_license_hash, created_by, accepted_by. Nenhum segredo e nenhum
-- identificador pessoal sai por aqui.
--
-- ALCANCE. Dono ou membro da empresa dona da transportadora. Nao se usa
-- `can_manage_capacity`, que tambem reconhece o PROPRIO MOTORISTA vinculado:
-- motorista nao lista os convites da transportadora. Transportadora de outra
-- empresa recebe lista vazia -- nao um erro -- para nao confirmar a existencia
-- do carrier alheio. Chamador nao autenticado e recusado com 42501, e `anon`
-- nem tem EXECUTE.
-- =============================================================================

create function public.list_carrier_driver_invitations(p_carrier_id uuid)
returns table (
  id            uuid,
  driver_id     uuid,
  invited_email text,
  invited_phone text,
  status        text,
  expires_at    timestamptz,
  accepted_at   timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'list_carrier_driver_invitations: chamador nao autenticado';
  end if;
  if p_carrier_id is null then
    raise exception using errcode = '22023',
      message = 'list_carrier_driver_invitations: informe a transportadora';
  end if;

  return query
    select i.id, i.driver_id, i.invited_email, i.invited_phone, i.status,
           i.expires_at, i.accepted_at, i.revoked_at, i.created_at
      from public.driver_carrier_invitations i
      join public.carriers c on c.id = i.carrier_id
     where i.carrier_id = p_carrier_id
       -- Dono ou membro da empresa dona da transportadora. Motorista nao.
       and (public.is_current_user_company_owner(c.company_id)
            or public.is_current_user_company_member(c.company_id))
     order by i.created_at desc;
end;
$fn$;

comment on function public.list_carrier_driver_invitations(uuid) is
  'Convites de motorista de uma transportadora, para o dono ou membro da '
  'empresa dona dela. Nao devolve token_hash nem hash de CPF/CNH. Existe '
  'porque driver_carrier_invitations tem o SELECT revogado de propósito.';

revoke all on function public.list_carrier_driver_invitations(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_carrier_driver_invitations(uuid)
  to authenticated, service_role;

do $$
declare v_fn text := 'public.list_carrier_driver_invitations(uuid)';
begin
  if has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute')
     or exists (select 1 from pg_proc p
                 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')
     or (select count(*) from pg_proc where proname = 'list_carrier_driver_invitations'
           and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'list_carrier_driver_invitations: ACL ou overload inesperado';
  end if;
  -- Nenhuma coluna de segredo no tipo de retorno.
  if (select string_agg(n.name, ',' order by n.i)
        from pg_proc p cross join lateral unnest(p.proargnames) with ordinality n(name, i)
       where p.oid = v_fn::regprocedure and n.i > 1)
     <> 'id,driver_id,invited_email,invited_phone,status,expires_at,accepted_at,revoked_at,created_at' then
    raise exception 'list_carrier_driver_invitations: colunas de retorno inesperadas';
  end if;
  -- E o revoke da tabela continua de pe.
  if has_table_privilege('authenticated', 'public.driver_carrier_invitations', 'select')
     or has_table_privilege('anon', 'public.driver_carrier_invitations', 'select') then
    raise exception 'driver_carrier_invitations voltou a ser legivel direto; o token_hash ficaria exposto';
  end if;
end $$;
