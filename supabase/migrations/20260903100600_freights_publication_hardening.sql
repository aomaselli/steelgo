-- =============================================================================
-- L2a - migration 7/7 : privilegio de coluna + trigger de coerencia em freights
-- =============================================================================
-- O LOTE E IMPLANTAVEL INTEIRO. Esta migration nao deixa nenhum fluxo sem
-- substituto: as seis escritas diretas em public.freights.status existentes no
-- codigo em HEAD 9635404 e o INSERT de criacao tem RPC correspondente na
-- migration 6/7. As migrations 1/7 a 7/7 formam uma unidade e devem ser
-- aplicadas juntas, com a adaptacao de frontend descrita no relatorio F4.4.
--
-- MAPA DE SUBSTITUICAO (verificado por leitura do codigo, nao hipotese):
--   NewFreightPage.tsx:207        INSERT draft/published
--                                 -> create_freight_draft / create_and_publish_freight
--   FreightDetailPage.tsx:160     status -> published        -> publish_freight
--   FreightDetailPage.tsx:145     status -> cancelled        -> cancel_freight
--   FreightDetailPage.tsx:192     aceite de proposta (4 chamadas HTTP)
--                                 -> accept_bid_and_create_contract, transacional
--   admin.freights.tsx:63 e :92   status -> cancelled        -> cancel_freight
--   SignaturePad.tsx:76           UPDATE direto de assinaturas, status,
--                                 activated_at e hashes das DUAS partes
--                                 -> sign_contract, parte derivada no servidor
--   SignaturePad.tsx:83           mark_freight_contracted  -> REMOVIDA;
--                                 a segunda assinatura ja contrata o frete
--
-- PARTICAO EXAUSTIVA E DISJUNTA DAS 59 COLUNAS DE public.freights:
--   10 governadas por evento   nao concedidas; so mudam por transicao
--   5 imutaveis               nao concedidas; nunca mudam, nem para superusuario
--   4 operacionais            concedidas; nao integram o anuncio
--   40 do anuncio                concedidas, mas CONGELADAS enquanto publicado
--   10 + 5 + 4 + 40 = 59. GRANT UPDATE = 4 + 40 = 44.
--
-- LIMITE DE SEGURANCA REGISTRADO EXPLICITAMENTE:
--   service_role, postgres e supabase_admin NAO sao adversarios contidos por
--   este desenho. Todos ignoram RLS e mantem escrita direta; o trigger os obriga
--   a produzir evento coerente, mas nada os impede de inserir esse evento nem de
--   desabilitar o trigger. O modelo protege contra o cliente authenticated e
--   contra erro em caminhos normais da aplicacao, e garante DETECTABILIDADE.
--   Comprometimento de service_role e caso de resposta a incidente, rotacao de
--   chave e auditoria da trilha, nao de contencao pelo schema.
-- =============================================================================

begin;

-- =============================================================================
-- 1. PRIVILEGIO DE INSERT  -  fecha a publicacao por INSERT
-- =============================================================================
-- INSERT direto e revogado por completo, sem grant de coluna. Isso e
-- deliberado: conceder INSERT sem status faria o botao "Publicar" criar
-- rascunho SILENCIOSAMENTE. Com o privilegio revogado, INSERT direto falha com
-- 42501 - erro visivel - e a criacao passa por RPC, que REJEITA explicitamente
-- um payload contendo status em vez de rebaixa-lo a draft.
--
-- CONSEQUENCIA: a policy freights_insert_owner (20260521014520, linha 351)
-- torna-se inerte. Nao e removida para nao alterar migration anterior; RLS nunca
-- concede privilegio, apenas restringe, de modo que a policy inerte nao reabre
-- nada.
-- =============================================================================

revoke insert on public.freights from public, anon, authenticated;

-- =============================================================================
-- 2. PRIVILEGIO DE UPDATE
-- =============================================================================
-- Ordem obrigatoria: o privilegio de UPDATE em nivel de TABELA prevalece sobre
-- restricao de coluna. REVOKE de tabela primeiro, GRANT enumerado depois.
--
-- Estado anterior verificado por execucao do harness: apos as 28 migrations
-- anteriores, authenticated possui UPDATE de tabela inteira sobre freights,
-- alcancando as 58 colunas entao existentes - privilegio herdado do
-- ALTER DEFAULT PRIVILEGES do bootstrap do Supabase, com a RLS como unico
-- portao. Esta migration portanto SO REDUZ.
-- =============================================================================

revoke update on public.freights from public, anon, authenticated;

grant update (
  steel_type, weight_tons, volume_m3, cargo_value_brl,
  cargo_value_amount, distance_km, origin_name, origin_city,
  origin_state, origin_lat, origin_lng, origin_country_code,
  origin_subdivision_code, origin_postal_code, origin_timezone, dest_name,
  dest_city, dest_state, dest_lat, dest_lng,
  destination_country_code, destination_subdivision_code, destination_postal_code, destination_timezone,
  waypoints, operation_scope, toll_included, required_truck,
  category, goods_type_code, requires_mopp, regulatory_requirements,
  handling_requirements, pickup_date, delivery_date, pickup_window,
  bid_deadline, cargo_description, notes, internal_reference,
  updated_at, origin_geog, destination_geog, search_radius_km
) on public.freights to authenticated;

-- NAO CONCEDIDAS - 15 colunas, por duas razoes distintas:
--
--   GOVERNADAS POR EVENTO (10) - so mudam por transicao registrada na trilha:
--     status, published_at, last_publication_event_id,
--     budget_brl, budget_amount,
--     final_price_brl, final_price_amount,
--     matched_carrier_id, matched_driver_id, matched_truck_id
--
--   IMUTAVEIS (5) - identidade, autoria e moeda:
--     id, company_id, created_by, created_at, currency_code
--
--   currency_code entra aqui porque, gravavel, permitiria trocar a moeda e
--   redefinir o significado de budget_amount sem tocar em budget_brl.
--   budget_amount entra porque 20260812140000 linha 96 estabelece
--   budget_amount = coalesce(budget_amount, budget_brl): gravavel, permitiria
--   alterar o valor anunciado por fora. matched_* e final_price_* entram porque
--   passam a ser fixados apenas por accept_bid_and_create_contract, e por isso
--   sao declarados no evento e conferidos pelo trigger.
--
-- CONSEQUENCIA FAIL-CLOSED PERMANENTE, A REPETIR EM TODA MIGRATION FUTURA:
--   a partir daqui, TODA coluna nova de public.freights nasce SEM INSERT e SEM
--   UPDATE para authenticated. O privilegio de coluna nao se estende
--   automaticamente. Uma coluna nova so se torna gravavel por grant deliberado e
--   explicito em migration posterior. O erro de esquecer um grant e visivel e
--   reversivel; o erro de conceder por omissao, nao.

comment on table public.freights is
  'Ofertas de frete. A partir de 20260903100600 o papel authenticated nao possui '
  'INSERT algum e nao possui UPDATE sobre as 15 colunas governadas ou imutaveis. '
  'Das 44 concedidas, 40 integram o anuncio e ficam CONGELADAS enquanto o '
  'frete estiver publicado - alteracao exige retirar, alterar e republicar, o '
  'que gera nova versao em freight_offer_versions. Criacao e transicoes passam '
  'pelas RPCs da migration 20260903100500. Toda coluna acrescentada depois desta '
  'migration nasce sem INSERT e sem UPDATE ate grant deliberado.';

-- =============================================================================
-- 3. TRIGGER: imutabilidade + congelamento do anuncio + invariante evento<->estado
-- =============================================================================
-- Defesa em profundidade sobre o privilegio de coluna. NAO autoriza por
-- identidade: nao le current_user, nao le GUC, nao recebe nada do cliente.
--
-- SECURITY DEFINER apenas para que a leitura de freight_publication_events nao
-- dependa da RLS do chamador. A funcao nao escreve nada e nao recebe parametros.
-- EXECUTE revogado de todos.
-- =============================================================================

create function public.freights_enforce_publication_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_governed boolean;
  v_ev       public.freight_publication_events%rowtype;
begin
  -- ---------------------------------------------------------------------------
  -- 3.1 Imutabilidade absoluta de identidade, autoria e moeda.
  -- Vale inclusive para service_role e postgres. Uma correcao deliberada exige
  -- desabilitar este trigger explicitamente - ato visivel e auditavel.
  -- ---------------------------------------------------------------------------
  if new.id            is distinct from old.id
     or new.company_id    is distinct from old.company_id
     or new.created_by    is distinct from old.created_by
     or new.created_at    is distinct from old.created_at
     or new.currency_code is distinct from old.currency_code then
    raise exception using errcode = '42501',
      message = 'freights: id, company_id, created_by, created_at e currency_code '
                'sao imutaveis';
  end if;

  -- ---------------------------------------------------------------------------
  -- 3.2 CONGELAMENTO DO ANUNCIO PUBLICADO.
  -- Estas 40 colunas sao EXATAMENTE as chaves nao economicas de
  -- public.freight_offer_snapshot. Enquanto o frete estiver publicado elas nao
  -- mudam: a versao anunciada e o anuncio real nao podem divergir. Para
  -- altera-las, retire, altere e republique - o que cria nova versao encadeada.
  -- E por isso que freight_offer_versions e versao da OFERTA, e nao apenas do
  -- preco: nenhum componente do snapshot e mutavel fora da cadeia.
  -- ---------------------------------------------------------------------------
  if old.status = 'published'::public.freight_status
     and (new.steel_type                   is distinct from old.steel_type
          or new.weight_tons                  is distinct from old.weight_tons
          or new.volume_m3                    is distinct from old.volume_m3
          or new.cargo_value_brl              is distinct from old.cargo_value_brl
          or new.cargo_value_amount           is distinct from old.cargo_value_amount
          or new.distance_km                  is distinct from old.distance_km
          or new.origin_name                  is distinct from old.origin_name
          or new.origin_city                  is distinct from old.origin_city
          or new.origin_state                 is distinct from old.origin_state
          or new.origin_lat                   is distinct from old.origin_lat
          or new.origin_lng                   is distinct from old.origin_lng
          or new.origin_country_code          is distinct from old.origin_country_code
          or new.origin_subdivision_code      is distinct from old.origin_subdivision_code
          or new.origin_postal_code           is distinct from old.origin_postal_code
          or new.origin_timezone              is distinct from old.origin_timezone
          or new.dest_name                    is distinct from old.dest_name
          or new.dest_city                    is distinct from old.dest_city
          or new.dest_state                   is distinct from old.dest_state
          or new.dest_lat                     is distinct from old.dest_lat
          or new.dest_lng                     is distinct from old.dest_lng
          or new.destination_country_code     is distinct from old.destination_country_code
          or new.destination_subdivision_code is distinct from old.destination_subdivision_code
          or new.destination_postal_code      is distinct from old.destination_postal_code
          or new.destination_timezone         is distinct from old.destination_timezone
          or new.waypoints                    is distinct from old.waypoints
          or new.operation_scope              is distinct from old.operation_scope
          or new.toll_included                is distinct from old.toll_included
          or new.required_truck               is distinct from old.required_truck
          or new.category                     is distinct from old.category
          or new.goods_type_code              is distinct from old.goods_type_code
          or new.requires_mopp                is distinct from old.requires_mopp
          or new.regulatory_requirements      is distinct from old.regulatory_requirements
          or new.handling_requirements        is distinct from old.handling_requirements
          or new.pickup_date                  is distinct from old.pickup_date
          or new.delivery_date                is distinct from old.delivery_date
          or new.pickup_window                is distinct from old.pickup_window
          or new.bid_deadline                 is distinct from old.bid_deadline
          or new.cargo_description            is distinct from old.cargo_description
          or new.notes                        is distinct from old.notes
          or new.internal_reference           is distinct from old.internal_reference) then
    raise exception using errcode = '42501',
      message = 'freights: o conjunto anunciado e imutavel enquanto publicado; '
                'retire a oferta, altere e republique para gerar nova versao';
  end if;

  -- ---------------------------------------------------------------------------
  -- 3.3 Escopo do invariante evento <-> estado.
  -- TODA mudanca de status e governada - nao existe transicao livre. Nenhum
  -- termo abaixo pode ser NULL: "is distinct from" sempre devolve booleano.
  -- ---------------------------------------------------------------------------
  v_governed :=
          new.status                    is distinct from old.status
       or new.published_at              is distinct from old.published_at
       or new.last_publication_event_id is distinct from old.last_publication_event_id
       or new.budget_brl                is distinct from old.budget_brl
       or new.budget_amount             is distinct from old.budget_amount
       or new.final_price_brl           is distinct from old.final_price_brl
       or new.final_price_amount        is distinct from old.final_price_amount
       or new.matched_carrier_id        is distinct from old.matched_carrier_id
       or new.matched_driver_id         is distinct from old.matched_driver_id
       or new.matched_truck_id          is distinct from old.matched_truck_id;

  if not v_governed then
    return new;
  end if;

  if new.last_publication_event_id is null then
    raise exception using errcode = '42501',
      message = 'freights: alteracao governada exige last_publication_event_id '
                'apontando para um evento novo';
  end if;

  -- O ponteiro tem de AVANCAR. Repetir o evento corrente e reutilizacao.
  if new.last_publication_event_id is not distinct from old.last_publication_event_id then
    raise exception using errcode = '42501',
      message = 'freights: evento ja consumido; last_publication_event_id nao avancou';
  end if;

  select * into v_ev
    from public.freight_publication_events e
   where e.id = new.last_publication_event_id;

  if not found then
    raise exception using errcode = '42501',
      message = 'freights: evento de publicacao inexistente';
  end if;

  -- Redundante com a FK composta freights_last_publication_event_fk, que e
  -- verificada depois do trigger; mantida pela mensagem.
  if v_ev.freight_id <> new.id then
    raise exception using errcode = '42501',
      message = 'freights: evento pertence a outro frete';
  end if;

  -- NUCLEO DO INVARIANTE. O evento tem de ser o sucessor EXATO do evento que
  -- representa o estado corrente. Com o indice unico parcial
  -- freight_publication_events_single_successor, existe no maximo um evento em
  -- toda a tabela capaz de satisfazer esta condicao, e ele so pode faze-lo uma
  -- unica vez. Prova completa no cabecalho de 20260903100200.
  if v_ev.previous_event_id is distinct from old.last_publication_event_id then
    raise exception using errcode = '42501',
      message = 'freights: evento nao encadeia com o estado corrente do frete';
  end if;

  -- Coerencia do estado ANTERIOR declarado pelo evento.
  if v_ev.previous_status             is distinct from old.status
     or v_ev.previous_published_at       is distinct from old.published_at
     or v_ev.previous_budget_brl         is distinct from old.budget_brl
     or v_ev.previous_budget_amount      is distinct from old.budget_amount
     or v_ev.previous_final_price_brl    is distinct from old.final_price_brl
     or v_ev.previous_final_price_amount is distinct from old.final_price_amount
     or v_ev.previous_matched_carrier_id is distinct from old.matched_carrier_id
     or v_ev.previous_matched_driver_id  is distinct from old.matched_driver_id
     or v_ev.previous_matched_truck_id   is distinct from old.matched_truck_id then
    raise exception using errcode = '42501',
      message = 'freights: estado anterior declarado no evento diverge do estado real';
  end if;

  -- Coerencia do estado NOVO declarado pelo evento.
  if v_ev.new_status             is distinct from new.status
     or v_ev.new_published_at       is distinct from new.published_at
     or v_ev.new_budget_brl         is distinct from new.budget_brl
     or v_ev.new_budget_amount      is distinct from new.budget_amount
     or v_ev.new_final_price_brl    is distinct from new.final_price_brl
     or v_ev.new_final_price_amount is distinct from new.final_price_amount
     or v_ev.new_matched_carrier_id is distinct from new.matched_carrier_id
     or v_ev.new_matched_driver_id  is distinct from new.matched_driver_id
     or v_ev.new_matched_truck_id   is distinct from new.matched_truck_id then
    raise exception using errcode = '42501',
      message = 'freights: estado novo declarado no evento diverge do UPDATE apresentado';
  end if;

  return new;
end;
$fn$;

revoke execute on function public.freights_enforce_publication_event()
  from public, anon, authenticated;

create trigger freights_enforce_publication_event
  before update on public.freights
  for each row execute function public.freights_enforce_publication_event();

comment on function public.freights_enforce_publication_event() is
  'Tres verificacoes em um trigger BEFORE UPDATE: (1) imutabilidade de '
  'identidade, autoria e moeda; (2) congelamento das 40 colunas do anuncio '
  'enquanto publicado; (3) invariante evento <-> estado. Nao le current_user, '
  'nao le GUC e nao recebe nada do cliente. Nao e um EXISTS reutilizavel: a '
  'condicao e previous_event_id = OLD.last_publication_event_id, satisfeita por '
  'no maximo uma linha e uma unica vez.';

-- =============================================================================
-- 3-bis. PRIVILEGIO DE UPDATE EM public.contracts
-- =============================================================================
-- FATO COMPROVADO NO CATALOGO, antes desta secao:
--   * information_schema.column_privileges dava UPDATE a authenticated nas 29
--     colunas de public.contracts, por ALTER DEFAULT PRIVILEGES do bootstrap
--     Supabase (grant all on tables to anon, authenticated, service_role);
--   * a policy contracts_update_party (20260521014520) tem USING com
--     embarcador OR transportadora OR admin e NAO tem WITH CHECK proprio;
--   * portanto, qualquer parte participante escrevia livremente
--     shipper_signed_at, carrier_signed_at, status, activated_at, completed_at,
--     os quatro campos de assinatura, os tres campos economicos, bid_id,
--     freight_id e as identidades das duas empresas.
--
-- DECISAO: REVOGAR UPDATE POR INTEIRO, sem grant de coluna.
--
-- O requisito admitia privilegio de coluna fail-closed OU revogacao total "se
-- nao houver outras edicoes legitimas comprovadas". A varredura de src/
-- encontrou quatro escritas diretas de cliente em public.contracts alem da
-- assinatura. TODAS AS QUATRO escrevem contracts.status, que e campo governado
-- e sai do grant em qualquer hipotese. Nenhuma delas sobreviveria a um grant
-- de coluna restrito aos campos nao governados. Conceder as colunas restantes
-- - pdf_url, contract_number, pickup_window, escrow_status, escrow_held_at,
-- escrow_released_at, updated_at - nao salvaria fluxo nenhum e deixaria
-- escrow_status escrevivel por qualquer parte, que e exatamente a mesma classe
-- de vulnerabilidade que esta revisao fecha. Revogar tudo e mais simples de
-- provar e estritamente mais seguro.
--
-- CONSEQUENCIA OPERACIONAL, REGISTRADA E NAO DISFARCADA. As quatro telas
-- abaixo passam a falhar com 42501 e PRECISAM de RPC propria antes de voltar a
-- funcionar. Nenhuma delas pertence ao escopo L2a - todas sao ciclo de
-- execucao, escrow e disputa, isto e, L2b/L3 - e nenhuma recebe substituto
-- aqui. Estao listadas no relatorio F4.4 como bloqueio de implantacao:
--
--   src/components/payment/ReleasePaymentModal.tsx:30
--       escrow_status='released', escrow_released_at, status='completed',
--       completed_at   -> liberacao de pagamento pelo embarcador
--   src/routes/carrier.trips.$id.tsx:72
--       status in (active, completed), completed_at
--       -> inicio e conclusao de viagem pela transportadora
--   src/routes/shipper.payment.$contractId.tsx:46
--       status='active', activated_at, escrow_status, escrow_held_at
--       -> pagamento simulado (tela marcada DEMO no proprio arquivo)
--   src/routes/admin.disputes.tsx:121
--       status, escrow_status, completed_at  -> decisao de disputa pelo admin
--
-- A policy contracts_update_party torna-se INERTE, como ja ocorreu com
-- freights_insert_owner na secao 1. Nao e removida, para nao alterar migration
-- anterior; RLS nunca concede privilegio, apenas restringe.
--
-- LIMITES QUE ESTA SECAO NAO FECHA, registrados como fato e nao como hipotese:
--   * authenticated mantem TRUNCATE em public.contracts, herdado do mesmo
--     ALTER DEFAULT PRIVILEGES, e TRUNCATE NAO e filtrado por RLS. Nao e
--     alcancavel pelo PostgREST, que emite apenas SELECT/INSERT/UPDATE/DELETE,
--     e por isso nao e caminho de exploracao pela API - mas e privilegio
--     excedente e esta registrado para decisao propria;
--   * DELETE permanece concedido e e barrado apenas por RLS: nao existe policy
--     de DELETE em public.contracts, entao o cliente e negado. A protecao aqui
--     e a policy, nao o privilegio;
--   * service_role, postgres e supabase_admin continuam escrevendo direto e
--     nao sao adversarios contidos por este desenho.
-- =============================================================================

revoke update on public.contracts from public, anon, authenticated;

commit;

-- =============================================================================
-- 4. CONSULTA DE CONTAGEM DE LEGADOS  -  SOMENTE LEITURA
-- =============================================================================
-- NAO EXECUTADA POR ESTA MIGRATION. Nenhum UPDATE automatico de anuncio legado
-- existe em nenhuma das sete migrations deste lote.
--
-- Os legados SAO alcancaveis por withdraw_freight, execute_bulk_withdrawal e
-- emergency_withdraw_offers_by_ids, que capturam para eles uma versao de oferta
-- 'legacy_unassessed' com os valores REAIS. A consulta abaixo serve para
-- DIMENSIONAR lotes de ate 500 e decidir COM O VOLUME REMOTO em maos - nao para
-- viabilizar a retirada, que ja e possivel.
--
-- select
--   count(*)                                       as publicado_total,
--   count(*) filter (where f.budget_brl is null)   as budget_nulo,
--   count(*) filter (where f.budget_brl = 0)       as budget_zero,
--   count(*) filter (where f.budget_brl < 0)       as budget_negativo,
--   count(*) filter (where f.budget_brl > 0)       as budget_conhecido_positivo,
--   count(*) filter (where f.last_publication_event_id is null)
--                                                  as legado_nao_governado,
--   count(*) filter (where f.published_at is null) as sem_carimbo,
--   count(*) filter (where f.currency_code <> 'BRL')
--                                                  as moeda_nao_brl
-- from public.freights f
-- where f.status = 'published'::public.freight_status;
--
-- Detalhamento por empresa, para dimensionar lotes de ate 500:
--
-- select f.company_id,
--        count(*) as publicados,
--        count(*) filter (where f.last_publication_event_id is null) as legados,
--        count(*) filter (where f.budget_brl is null or f.budget_brl <= 0)
--          as valor_nao_comprovavel
--   from public.freights f
--  where f.status = 'published'::public.freight_status
--  group by f.company_id
--  order by publicados desc;
-- =============================================================================
