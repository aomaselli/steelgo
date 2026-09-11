-- =============================================================================
-- VERIFICACAO PREVIA DO REMOTO  -  SOMENTE LEITURA
-- =============================================================================
-- Executar ANTES de aplicar 20260903100720_pricing_rules_seed_comercial.sql.
--
-- Nenhum comando abaixo escreve. Nao ha INSERT, UPDATE, DELETE, CREATE nem
-- ALTER. Pode ser rodado no Supabase remoto com seguranca.
--
-- Como rodar, a partir da raiz do repositorio:
--   supabase db remote query --file supabase/verificacao_previa_remoto.sql
-- ou colando o conteudo no SQL Editor do painel do Supabase.
--
-- CRITERIO DE APROVACAO PARA APLICAR O SEED:
--   consulta 1 -> total_regras deve ser 0, ou nenhuma linha geral BR/BRL ativa
--   consulta 2 -> zero linhas
--   consulta 3 -> zero linhas
--   consulta 4 -> zero linhas
-- Qualquer resultado diferente significa que ja existe precificacao configurada
-- no remoto. Nesse caso NAO aplique o seed antes de decidir qual regra vale: a
-- migration foi escrita para FALHAR nesse cenario, de proposito.
-- =============================================================================

-- 1. Panorama geral da tabela.
select
  count(*)                                                              as total_regras,
  count(*) filter (where carrier_id is null)                            as regras_gerais,
  count(*) filter (where carrier_id is not null)                        as regras_por_transportadora,
  count(*) filter (where is_active)                                     as ativas,
  count(*) filter (where country_code = 'BR' and currency_code = 'BRL') as br_brl
from public.pricing_rules;

-- 2. Regra geral ativa e vigente para BR/BRL - o conflito que a migration recusa.
select id, platform_fee_percentage, priority, effective_from, effective_until,
       version, created_by, created_at
  from public.pricing_rules
 where carrier_id is null
   and is_active
   and country_code  = 'BR'
   and currency_code = 'BRL'
   and effective_from <= now()
   and (effective_until is null or effective_until > now())
 order by priority asc, effective_from desc, id asc;

-- 3. O identificador estavel do seed ja existe?
select id, platform_fee_percentage, country_code, currency_code, created_at
  from public.pricing_rules
 where id = '53544c47-0001-4000-8000-000000000001';

-- 4. Regras por transportadora - elas VENCEM a regra geral em
--    platform_pricing_rule_for. Se houver alguma, a taxa aprovada de 3,5% nao
--    valera para essas transportadoras. Ver o achado registrado no relatorio
--    F4.4, secao "Achado aberto: a taxa aprovada e sobreponivel".
select pr.id, pr.carrier_id, pr.platform_fee_percentage, pr.priority,
       pr.is_active, pr.effective_from, pr.effective_until
  from public.pricing_rules pr
 where pr.carrier_id is not null
 order by pr.carrier_id, pr.priority;

-- 5. Contexto: contratos ja criados usam qual taxa efetiva? Somente leitura.
--    Serve para conferir se a taxa historicamente praticada bate com 3,5%.
select round(
         case when total_amount_brl is null or total_amount_brl = 0 then null
              else platform_fee_brl * 100 / total_amount_brl end, 4) as taxa_efetiva_pct,
       count(*) as contratos
  from public.contracts
 where platform_fee_brl is not null
 group by 1
 order by 2 desc;
