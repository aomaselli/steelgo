-- =============================================================================
-- MODULO 2 (3/9) : VALORES NOVOS DE ENUM  -  migration isolada, de proposito
-- =============================================================================
-- ALTER TYPE ... ADD VALUE nao pode ser USADO na mesma transacao em que e
-- criado. Por isso esta migration contem SOMENTE as adicoes; o uso comeca na
-- migration seguinte.
--
--   payment_internal_status:
--     settlement_requested  transacoes de liquidacao de disputa criadas
--                           (refund e/ou release) e ainda nao confirmadas;
--     settled               liquidacao de disputa confirmada. NAO e
--                           released_confirmed: o significado deste nao e
--                           forcado - a composicao esta nas transacoes.
--   contract_lifecycle_transition:
--     escrow_settlement_requested / escrow_settlement_confirmed  espelham os
--                           dois estados acima no ciclo do contrato;
--     dispute_withdrawn     disputa retirada pelo requerente: o contrato volta
--                           EXATAMENTE ao status anterior a disputa.
-- =============================================================================

alter type public.payment_internal_status add value if not exists 'settlement_requested';
alter type public.payment_internal_status add value if not exists 'settled';

alter type public.contract_lifecycle_transition add value if not exists 'escrow_settlement_requested';
alter type public.contract_lifecycle_transition add value if not exists 'escrow_settlement_confirmed';
alter type public.contract_lifecycle_transition add value if not exists 'dispute_withdrawn';
