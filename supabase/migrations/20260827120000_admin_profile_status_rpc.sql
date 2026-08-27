-- Moderação administrativa de perfis: verificar, suspender e reativar.
--
-- Problema corrigido:
--   A listagem do admin (src/routes/admin.users.tsx) lê profiles.is_verified,
--   mas a única policy de UPDATE em public.profiles é "profiles_update_own"
--   (using: id = auth.uid()), criada em 20260521014520.
--   O admin ENXERGA todos os perfis — a policy de SELECT contempla admin —
--   mas não consegue escrever em nenhum que não seja o dele. O UPDATE não
--   falhava: afetava zero linhas, silenciosamente, e a interface exibia
--   sucesso. As três ações (verify / suspend / reactivate) nunca funcionaram.
--
-- Por que RPC em vez de uma policy de UPDATE para admin:
--   Uma policy do tipo "for update to authenticated using (has_role(...admin))"
--   liberaria a LINHA INTEIRA para escrita — full_name, email, cpf, phone,
--   avatar_url. A moderação precisa de exatamente dois booleanos. Esta RPC
--   restringe a superfície de escrita a is_verified e is_active, e nenhuma
--   outra coluna de profiles fica gravável por quem não é o dono.
--   A policy "profiles_update_own" permanece intacta e inalterada.

create or replace function public.admin_set_profile_status(
  p_profile_id uuid,
  p_is_verified boolean default null,
  p_is_active boolean default null
)
returns table (
  id uuid,
  is_verified boolean,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not public.has_role(v_actor, 'admin'::public.app_role) then
    raise exception using errcode = '42501', message = 'Admin role required';
  end if;

  if p_is_verified is null and p_is_active is null then
    raise exception using errcode = '22023', message = 'Nothing to update';
  end if;

  update public.profiles p
  set is_verified = coalesce(p_is_verified, p.is_verified),
      is_active   = coalesce(p_is_active,   p.is_active)
  where p.id = p_profile_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  return query
  select p.id, p.is_verified, p.is_active
  from public.profiles p
  where p.id = p_profile_id;
end;
$$;

-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrão. Revogamos e liberamos
-- apenas para usuários autenticados; a checagem de admin acontece dentro da
-- função. Mesmo padrão adotado em 20260521014538 para handle_new_user().
revoke execute on function public.admin_set_profile_status(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_profile_status(uuid, boolean, boolean) to authenticated;
