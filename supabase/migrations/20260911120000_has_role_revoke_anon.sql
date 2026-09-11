-- =============================================================================
-- CORRETIVA DE SEGURANCA : public.has_role NAO executavel por anon
-- =============================================================================
-- FATO VERIFICADO (2026-09-11, leitura do catalogo):
--   remoto  proacl = {postgres=X, service_role=X, authenticated=X, anon=X}
--   local   proacl = {postgres=X, service_role=X, authenticated=X}
-- 20260521014538 revogou EXECUTE de public, anon e authenticated;
-- 20260902110000 reconcedeu SOMENTE a authenticated e registrou no comentario da
-- funcao: "Nao concedida a anon nem a PUBLIC". O EXECUTE de anon no remoto foi
-- concedido fora das migrations e nao sobrevive a um `db reset`: a suite
-- l2a_tests.sql (G0) exige has_function_privilege('anon', ...) = false.
--
-- POR QUE anon NAO PRECISA: das 70 policies que chamam has_role, 0 se aplicam a
-- PUBLIC e 0 a anon (todas sao FOR authenticated); nenhuma tabela legivel por
-- anon tem policy com has_role aplicavel a anon; as 24 funcoes que a chamam sao
-- SECURITY DEFINER com owner postgres, que mantem EXECUTE.
--
-- O QUE NAO MUDA: corpo, owner, SECURITY DEFINER, search_path, assinatura e o
-- comentario da funcao. Apenas privilegio.
-- =============================================================================

revoke execute on function public.has_role(uuid, public.app_role)
  from public, anon;

grant execute on function public.has_role(uuid, public.app_role)
  to authenticated;

-- Assertiva fail-closed: a migration FALHA se a ACL resultante nao for a esperada.
do $$
declare
  v_public_execute boolean;
begin
  -- PUBLIC e pseudo-role (grantee = 0 em aclexplode). has_function_privilege('public', ...)
  -- procuraria um role CHAMADO "public", que nao existe; por isso a ACL e lida direto.
  -- Se proacl for NULL, o privilegio efetivo e o default do dono: acldefault('f', proowner).
  select exists (
           select 1
             from pg_proc p
                  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where p.oid = 'public.has_role(uuid, public.app_role)'::regprocedure
              and a.grantee = 0
              and a.privilege_type = 'EXECUTE')
    into v_public_execute;

  if v_public_execute then
    raise exception 'has_role: PUBLIC ainda possui EXECUTE';
  end if;
  if has_function_privilege('anon', 'public.has_role(uuid, public.app_role)', 'execute') then
    raise exception 'has_role: anon ainda possui EXECUTE';
  end if;
  if not has_function_privilege('authenticated', 'public.has_role(uuid, public.app_role)', 'execute') then
    raise exception 'has_role: authenticated perdeu EXECUTE';
  end if;
  if not has_function_privilege('service_role', 'public.has_role(uuid, public.app_role)', 'execute') then
    raise exception 'has_role: service_role perdeu EXECUTE';
  end if;
  if not has_function_privilege('postgres', 'public.has_role(uuid, public.app_role)', 'execute') then
    raise exception 'has_role: postgres perdeu EXECUTE';
  end if;
end $$;
