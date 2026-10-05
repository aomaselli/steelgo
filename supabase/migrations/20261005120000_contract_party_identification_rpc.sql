-- =============================================================================
-- Identificacao EMPRESARIAL da contraparte, restrita as partes do contrato
-- =============================================================================
-- PROBLEMA. list_visible_contract_counterparties (20260912100600) devolve
-- apenas o NOME comercial das duas empresas, de proposito. Quem assina um
-- contrato ve o nome da contraparte mas nao a identificacao empresarial dela:
-- CNPJ e RNTRC/ANTT aparecem como indisponiveis. Assinar sem poder conferir o
-- cadastro da outra ponta e problema operacional, nao de tela.
--
-- DECISAO. A policy companies_select NAO e ampliada, nenhum SELECT adicional e
-- concedido em public.companies nem em public.carriers, e a funcao de nomes
-- continua como esta. Esta funcao nova devolve SOMENTE a identificacao
-- empresarial, e SOMENTE para quem e PARTE do contrato.
--
-- ALCANCE DELIBERADAMENTE MAIS ESTREITO QUE is_contract_visible.
-- is_contract_visible reconhece tambem o motorista vinculado e o administrador.
-- Identificacao empresarial nao e para eles: o predicado aqui e o mesmo de
-- contracts_select_party -- ser dono de UMA das duas empresas do contrato.
--   * motorista vinculado: NAO ve;
--   * administrador: NAO ve por esta funcao;
--   * terceiro: NAO ve, e contrato alheio simplesmente nao aparece.
--
-- O QUE NAO ENTRA. Nada de endereco, contato, inscricao estadual, documentos,
-- socios, dados bancarios ou qualquer outro campo de companies/carriers. Nada
-- de dados de motorista: CPF e CNH continuam fora, aqui e em qualquer lugar
-- que nao seja a transportadora dona do registro.
--
-- REGRAS (mesmas da funcao de nomes):
--   * SECURITY DEFINER com search_path vazio; o ator vem EXCLUSIVAMENTE de
--     auth.uid();
--   * chamador nao autenticado -> 42501;
--   * array nulo ou vazio, elemento nulo ou mais de 500 ids -> 22023;
--   * ids repetidos eliminados; no maximo uma linha por contrato;
--   * contrato inexistente ou do qual o chamador nao e parte nao aparece;
--   * ACL: REVOKE ALL antes do GRANT a authenticated e service_role; um unico
--     overload; bloco final fail-closed.
-- =============================================================================

create function public.list_contract_party_identification(p_contract_ids uuid[])
returns table (
  contract_id        uuid,
  shipper_company_id uuid,
  shipper_cnpj       text,
  carrier_company_id uuid,
  carrier_cnpj       text,
  carrier_antt_rntrc text
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
      message = 'list_contract_party_identification: chamador nao autenticado';
  end if;
  if p_contract_ids is null or cardinality(p_contract_ids) = 0 then
    raise exception using errcode = '22023',
      message = 'list_contract_party_identification: informe ao menos um contrato';
  end if;
  if exists (select 1 from unnest(p_contract_ids) u(id) where u.id is null) then
    raise exception using errcode = '22023',
      message = 'list_contract_party_identification: id de contrato nulo';
  end if;
  if cardinality(p_contract_ids) > 500 then
    raise exception using errcode = '22023',
      message = 'list_contract_party_identification: no maximo 500 contratos por chamada';
  end if;

  select array_agg(distinct u.id) into v_ids from unnest(p_contract_ids) u(id);

  return query
    select c.id,
           c.shipper_company_id,
           nullif(btrim(s.cnpj), ''),
           c.carrier_company_id,
           nullif(btrim(t.cnpj), ''),
           nullif(btrim(car.antt_rntrc), '')
      from public.contracts c
      join public.companies s on s.id = c.shipper_company_id
      join public.companies t on t.id = c.carrier_company_id
      left join public.carriers car on car.company_id = c.carrier_company_id
     where c.id = any (v_ids)
       -- PARTE do contrato, nao "quem pode ver o contrato".
       and (public.is_current_user_company_owner(c.shipper_company_id)
            or public.is_current_user_company_owner(c.carrier_company_id))
     order by c.id;
end;
$fn$;

comment on function public.list_contract_party_identification(uuid[]) is
  'CNPJ das duas empresas e RNTRC/ANTT da transportadora, apenas para contratos '
  'em que o chamador e PARTE (dono de uma das duas empresas). Mais estreito que '
  'is_contract_visible: motorista e administrador nao recebem. Nenhum outro '
  'campo de companies/carriers. Nao amplia companies_select.';

revoke all on function public.list_contract_party_identification(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.list_contract_party_identification(uuid[])
  to authenticated, service_role;

do $$
declare v_fn text := 'public.list_contract_party_identification(uuid[])';
begin
  if has_function_privilege('anon', v_fn, 'execute')
     or not has_function_privilege('authenticated', v_fn, 'execute')
     or not has_function_privilege('service_role', v_fn, 'execute')
     or not has_function_privilege('postgres', v_fn, 'execute')
     or exists (select 1 from pg_proc p
                 cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = v_fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')
     or (select count(*) from pg_proc where proname = 'list_contract_party_identification'
           and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'list_contract_party_identification: ACL ou overload inesperado';
  end if;
  -- o tipo de retorno nao carrega nenhum campo alem de ids e identificacao empresarial
  if (select string_agg(n.name, ',' order by n.i)
        from pg_proc p cross join lateral unnest(p.proargnames) with ordinality n(name, i)
       where p.oid = v_fn::regprocedure and n.i > 1)
     <> 'contract_id,shipper_company_id,shipper_cnpj,carrier_company_id,carrier_cnpj,carrier_antt_rntrc' then
    raise exception 'list_contract_party_identification: colunas de retorno inesperadas';
  end if;
end $$;
