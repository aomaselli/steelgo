-- =============================================================================
-- Estado do aviso de privacidade por viagem, para quem acompanha a viagem
-- =============================================================================
-- PROBLEMA, medido em 05/10/2026. Quando um aviso novo entra em vigor, o aceite
-- de TODOS os motoristas deixa de valer, inclusive o de quem esta em viagem.
-- O aparelho para de coletar posicao em segundos, mas:
--
--   * `operational_trips.status` nao muda;
--   * a sessao de rastreamento continua ABERTA (`ended_at` nulo).
--
-- Para a transportadora, isso aparece como "sem sinal" — indistinguivel de
-- bateria acabada, tunel ou aparelho desligado. A causa real (o motorista
-- precisa reconhecer o aviso novo) nao chega a nenhuma tela: nem `get_trip` nem
-- `list_my_trips` mencionam o aviso.
--
-- DECISAO. Nenhuma das duas funcoes de viagem e alterada, e nada de dado
-- pessoal e exposto. Esta funcao devolve, por viagem que o chamador JA PODE
-- VER (`public.trip_visible`, a mesma regra de get_trip), tres coisas:
--
--   a versao do aviso em vigor, se houver;
--   se o motorista designado ja reconheceu essa versao;
--   se existe motorista designado.
--
-- O QUE NAO ENTRA: identidade do motorista, data do reconhecimento, texto do
-- aviso, posicao, qualquer campo de `drivers` alem da comparacao booleana.
--
-- REGRAS: SECURITY DEFINER com search_path vazio; ator so de auth.uid();
-- chamador nao autenticado -> 42501; array nulo/vazio, elemento nulo ou mais de
-- 500 ids -> 22023; viagem nao visivel simplesmente nao aparece; ACL revogada
-- antes do grant; bloco final fail-closed.
-- =============================================================================

create function public.list_trip_privacy_acknowledgement(p_trip_ids uuid[])
returns table (
  trip_id             uuid,
  notice_version      text,
  driver_assigned     boolean,
  driver_acknowledged boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_ids uuid[];
  v_n public.privacy_notices%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'list_trip_privacy_acknowledgement: chamador nao autenticado';
  end if;
  if p_trip_ids is null or cardinality(p_trip_ids) = 0 then
    raise exception using errcode = '22023',
      message = 'list_trip_privacy_acknowledgement: informe ao menos uma viagem';
  end if;
  if exists (select 1 from unnest(p_trip_ids) u(id) where u.id is null) then
    raise exception using errcode = '22023',
      message = 'list_trip_privacy_acknowledgement: id de viagem nulo';
  end if;
  if cardinality(p_trip_ids) > 500 then
    raise exception using errcode = '22023',
      message = 'list_trip_privacy_acknowledgement: no maximo 500 viagens por chamada';
  end if;

  select array_agg(distinct u.id) into v_ids from unnest(p_trip_ids) u(id);
  v_n := public.current_privacy_notice();

  return query
    select t.id,
           v_n.version,
           d.id is not null,
           -- Sem aviso publicado nao ha o que reconhecer: nao e pendencia.
           case
             when v_n.id is null then true
             when d.id is null then false
             else d.privacy_notice_version is not distinct from v_n.version
              and d.privacy_notice_sha256 is not distinct from v_n.body_sha256
           end
      from public.operational_trips t
      left join public.drivers d on d.id = t.driver_id
     where t.id = any (v_ids)
       and public.trip_visible(t.id)
     order by t.id;
end;
$fn$;

comment on function public.list_trip_privacy_acknowledgement(uuid[]) is
  'Por viagem visivel ao chamador (trip_visible): versao do aviso em vigor, se '
  'ha motorista designado e se ele reconheceu essa versao. Serve para a tela '
  'distinguir "sem sinal" de "aguardando reconhecimento do aviso". Nenhum dado '
  'pessoal, nenhuma alteracao em get_trip ou list_my_trips.';

revoke all on function public.list_trip_privacy_acknowledgement(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.list_trip_privacy_acknowledgement(uuid[])
  to authenticated, service_role;

do $$
declare v_fn text := 'public.list_trip_privacy_acknowledgement(uuid[])';
begin
  if has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute')
     or not has_function_privilege('postgres', v_fn, 'execute')
     or exists (select 1 from pg_proc p
                 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')
     or (select count(*) from pg_proc where proname = 'list_trip_privacy_acknowledgement'
           and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'list_trip_privacy_acknowledgement: ACL ou overload inesperado';
  end if;
  if (select string_agg(n.name, ',' order by n.i)
        from pg_proc p cross join lateral unnest(p.proargnames) with ordinality n(name, i)
       where p.oid = v_fn::regprocedure and n.i > 1)
     <> 'trip_id,notice_version,driver_assigned,driver_acknowledged' then
    raise exception 'list_trip_privacy_acknowledgement: colunas de retorno inesperadas';
  end if;
end $$;
