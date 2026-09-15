-- =============================================================================
-- MODULO 1 (7/7) : nomes das contrapartes de contratos visiveis, em lote
-- =============================================================================
-- PROBLEMA. A policy companies_select (20260521014520) deixa cada empresa ler
-- apenas a si mesma (dono, membro ou admin). Nas telas financeiras do
-- embarcador e da transportadora, o join aninhado contracts -> companies da
-- OUTRA parte volta nulo e a interface mostrava "Contraparte -" para um
-- contrato que tem as duas empresas cadastradas.
--
-- DECISAO. A policy geral de public.companies NAO e ampliada e nenhum SELECT
-- adicional e concedido na tabela. Em vez disso, esta RPC devolve SOMENTE o
-- nome comercial das duas empresas de contratos que o chamador ja pode ver,
-- segundo a MESMA regra das policies financeiras: public.is_contract_visible
-- (dono da empresa embarcadora ou transportadora, motorista vinculado, ou
-- administrador). Nada de CNPJ, endereco, documentos, contatos ou qualquer
-- outro campo de companies.
--
-- REGRAS:
--   * SECURITY DEFINER com search_path vazio; o ator vem EXCLUSIVAMENTE de
--     auth.uid() - nao ha parametro de usuario, empresa ou papel;
--   * chamador nao autenticado -> 42501;
--   * array nulo ou vazio, elemento nulo ou mais de 500 ids -> 22023;
--   * ids repetidos sao eliminados; a resposta tem no maximo uma linha por
--     contrato;
--   * contrato inexistente ou nao visivel simplesmente nao aparece: passar um
--     UUID de contrato alheio nao revela nada;
--   * ACL: REVOKE ALL de public, anon, authenticated e service_role antes do
--     GRANT a authenticated e service_role; um unico overload; bloco final
--     fail-closed.
-- =============================================================================

create function public.list_visible_contract_counterparties(p_contract_ids uuid[])
returns table (
  contract_id          uuid,
  shipper_company_id   uuid,
  shipper_company_name text,
  carrier_company_id   uuid,
  carrier_company_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_ids uuid[];
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'list_visible_contract_counterparties: chamador nao autenticado';
  end if;
  if p_contract_ids is null or cardinality(p_contract_ids) = 0 then
    raise exception using errcode = '22023',
      message = 'list_visible_contract_counterparties: informe ao menos um contrato';
  end if;
  if exists (select 1 from unnest(p_contract_ids) u(id) where u.id is null) then
    raise exception using errcode = '22023',
      message = 'list_visible_contract_counterparties: id de contrato nulo';
  end if;
  if cardinality(p_contract_ids) > 500 then
    raise exception using errcode = '22023',
      message = 'list_visible_contract_counterparties: no maximo 500 contratos por chamada';
  end if;

  select array_agg(distinct u.id) into v_ids from unnest(p_contract_ids) u(id);

  return query
    select c.id,
           c.shipper_company_id,
           coalesce(nullif(btrim(s.trade_name), ''), s.name),
           c.carrier_company_id,
           coalesce(nullif(btrim(t.trade_name), ''), t.name)
      from public.contracts c
      join public.companies s on s.id = c.shipper_company_id
      join public.companies t on t.id = c.carrier_company_id
     where c.id = any (v_ids)
       and public.is_contract_visible(c.id)
     order by c.id;
end;
$fn$;

comment on function public.list_visible_contract_counterparties(uuid[]) is
  'Nomes comerciais das duas empresas de contratos visiveis ao chamador '
  '(is_contract_visible). Apenas id e nome; nenhum outro campo de companies. '
  'Ate 500 ids por chamada, duplicados eliminados. Nao amplia companies_select.';

revoke all on function public.list_visible_contract_counterparties(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.list_visible_contract_counterparties(uuid[])
  to authenticated, service_role;

do $$
declare v_fn text := 'public.list_visible_contract_counterparties(uuid[])';
begin
  if has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute')
     or not has_function_privilege('postgres', v_fn, 'execute')
     or exists (select 1 from pg_proc p
                 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')
     or (select count(*) from pg_proc where proname = 'list_visible_contract_counterparties'
           and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'list_visible_contract_counterparties: ACL ou overload inesperado';
  end if;
  -- o tipo de retorno nao carrega nenhum campo alem de ids e nomes
  if (select string_agg(a.attname, ',' order by a.attnum)
        from pg_proc p cross join lateral unnest(p.proargnames) with ordinality n(name, i)
        join lateral (select n.name as attname, n.i as attnum) a on true
       where p.oid = v_fn::regprocedure and n.i > 1)
     <> 'contract_id,shipper_company_id,shipper_company_name,carrier_company_id,carrier_company_name' then
    raise exception 'list_visible_contract_counterparties: colunas de retorno inesperadas';
  end if;
end $$;
