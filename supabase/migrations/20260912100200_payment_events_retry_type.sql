-- =============================================================================
-- MODULO 1 (3/6) : tipo de evento 'retry_requested' em payment_events
-- =============================================================================
-- A RPC retry_failed_payment_transaction (5/6) registra um evento proprio para
-- a nova solicitacao que sucede uma falha. O CHECK payment_events_type_valid e
-- uma lista fechada; ampliar exige recriar a constraint (nao ha ADD VALUE
-- porque event_type e text, nao enum). A lista abaixo e a atual mais o novo
-- valor - nada e removido.
-- =============================================================================

alter table public.payment_events
  drop constraint payment_events_type_valid;

alter table public.payment_events
  add constraint payment_events_type_valid check (event_type in (
    'intent_created', 'funding_requested', 'funding_confirmed',
    'release_requested', 'release_confirmed', 'failed', 'cancelled',
    'reconciliation_opened', 'reconciliation_resolved',
    'release_blocked_by_dispute', 'release_unblocked',
    'retry_requested'));

do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conname = 'payment_events_type_valid';
  if v_def is null or v_def not like '%retry_requested%'
     or v_def not like '%reconciliation_resolved%' then
    raise exception 'payment_events_type_valid: lista inesperada: %', v_def;
  end if;
end $$;
