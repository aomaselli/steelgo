-- =============================================================================
-- REV8.1 2/13 : COLUNAS DO CICLO OPERACIONAL DO CONTRATO
-- =============================================================================
-- ENTREGA E PAGAMENTO SAO FATOS INDEPENDENTES. Ate a revisao 7 o contrato
-- chegava a 'completed' por dois caminhos separados - a transportadora concluir
-- a viagem, ou o embarcador liberar o pagamento - e qualquer um deles sozinho
-- bastava. Isso permitia contrato concluido sem entrega, e entrega sem
-- pagamento, ambos exibidos como 'concluido'.
--
-- A partir daqui o contrato so vai para 'completed' quando as DUAS coisas forem
-- verdade, em qualquer ordem. A segunda condicao satisfeita fecha o contrato, na
-- mesma transacao. A regra e imposta por TRIGGER, em 7/13, e nao
-- apenas por convencao dentro das RPCs - nenhuma RPC isolada consegue marcar
-- 'completed' sem que as duas condicoes existam na linha.
--
-- Estas colunas sao ADITIVAS. Nenhuma coluna existente muda de tipo, de default
-- ou de significado.
-- =============================================================================

begin;

alter table public.contracts
  add column delivery_completed_at timestamptz null,
  add column delivery_completed_by uuid        null,
  add column pricing_rule_id       uuid        null,
  add column escrow_provider       text        null,
  add column escrow_external_ref   text        null,
  add column completion_reason     text        null;

alter table public.contracts
  add constraint contracts_delivery_completed_by_fk
  foreign key (delivery_completed_by) references auth.users(id) on delete restrict;

-- REGRA HISTORICA DE PRECIFICACAO. O contrato passa a citar a linha exata de
-- public.pricing_rules que produziu a taxa cobrada. Como aquela linha e
-- imutavel nos campos economicos desde 20260903100410, a taxa historica
-- continua recuperavel para sempre, mesmo que a regra seja encerrada ou
-- substituida depois.
alter table public.contracts
  add constraint contracts_pricing_rule_fk
  foreign key (pricing_rule_id) references public.pricing_rules(id) on delete restrict;

alter table public.contracts
  add constraint contracts_delivery_completion_coherent
  check ((delivery_completed_at is null) = (delivery_completed_by is null));

alter table public.contracts
  add constraint contracts_completion_reason_not_blank
  check (completion_reason is null or length(btrim(completion_reason)) > 0);

alter table public.contracts
  add constraint contracts_escrow_external_ref_not_blank
  check (escrow_external_ref is null or length(btrim(escrow_external_ref)) > 0);

comment on column public.contracts.delivery_completed_at is
  'Instante em que a transportadora declarou a entrega concluida. Fato '
  'OPERACIONAL, independente do pagamento.';
comment on column public.contracts.escrow_provider is
  'ESPELHO de leitura do provedor do payment_intent deste contrato. A fonte '
  'autoritativa e public.payment_intents. Mantido pelas RPCs financeiras.';
comment on column public.contracts.escrow_external_ref is
  'ESPELHO de leitura da referencia externa do pagamento. Fonte autoritativa: '
  'public.payment_intents / public.payment_transactions.';

-- -----------------------------------------------------------------------------
-- ESTADOS DE ESCROW SEMANTICAMENTE HONESTOS
-- -----------------------------------------------------------------------------
-- O CHECK anterior (20260521014520) admitia pending, escrow_held, released,
-- refunded e disputed. Os tres do meio AFIRMAM movimentacao de dinheiro que
-- nunca foi confirmada por provedor nenhum - nao existe integracao, e nenhum
-- ponto do sistema jamais criou linha em public.payments.
--
-- O novo conjunto separa SOLICITACAO de CONFIRMACAO. Os valores antigos
-- permanecem aceitos para nao invalidar linhas ja existentes no ambiente
-- remoto, mas nenhum codigo desta revisao os escreve - estao marcados como
-- legado no comentario da coluna.
alter table public.contracts drop constraint contracts_escrow_status_check;

alter table public.contracts
  add constraint contracts_escrow_status_check
  check (escrow_status in (
    -- estados vigentes
    'pending',                  -- nenhum pedido de pagamento ainda
    'pending_provider',         -- registrado, aguardando meio de pagamento
    'awaiting_funding',         -- solicitado ao provedor, sem confirmacao
    'funding_confirmed',        -- confirmado por provedor ou atestado por admin
    'release_requested',        -- liberacao pedida, sem confirmacao
    'released_confirmed',       -- liberacao confirmada
    'failed',
    'cancelled',
    'reconciliation_required',
    'disputed',
    -- legado, aceito para nao invalidar linhas existentes; nada escreve
    'escrow_held', 'released', 'refunded'
  ));

comment on column public.contracts.escrow_status is
  'ESPELHO de leitura de payment_intents.internal_status. Separa SOLICITACAO de '
  'CONFIRMACAO: awaiting_funding e release_requested sao pedidos; '
  'funding_confirmed e released_confirmed sao fatos confirmados. Os valores '
  'escrow_held, released e refunded sao LEGADO - nenhum codigo os escreve desde '
  '20260903100420.';

-- -----------------------------------------------------------------------------
-- IMUTABILIDADE DOS FATOS DO CICLO
-- -----------------------------------------------------------------------------
-- Entrega concluida e fato datado: nao se apaga nem se reescreve. A regra de
-- precificacao citada tambem nao muda depois de gravada - se mudasse, o
-- contrato passaria a apontar para um numero que nao foi o cobrado.
create function public.contracts_enforce_lifecycle_facts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if OLD.delivery_completed_at is not null
     and (NEW.delivery_completed_at is distinct from OLD.delivery_completed_at
          or NEW.delivery_completed_by is distinct from OLD.delivery_completed_by) then
    raise exception using errcode = '42501',
      message = 'public.contracts: a conclusao da entrega ja esta registrada e '
                'nao e reescrita nem apagada.';
  end if;

  if OLD.pricing_rule_id is not null
     and NEW.pricing_rule_id is distinct from OLD.pricing_rule_id then
    raise exception using errcode = '42501',
      message = 'public.contracts: a regra de precificacao do contrato e '
                'historica e nao e reapontada.';
  end if;

  if OLD.completed_at is not null
     and NEW.completed_at is distinct from OLD.completed_at then
    raise exception using errcode = '42501',
      message = 'public.contracts: a conclusao do contrato ja esta datada e nao '
                'e reescrita.';
  end if;

  return NEW;
end;
$fn$;

create trigger contracts_enforce_lifecycle_facts_trg
  before update on public.contracts
  for each row execute function public.contracts_enforce_lifecycle_facts();

comment on function public.contracts_enforce_lifecycle_facts() is
  'Torna imutaveis os fatos datados do ciclo: conclusao da entrega, regra de '
  'precificacao citada e data de conclusao do contrato. LIMITE: postgres, '
  'service_role e supabase_admin podem desabilitar este trigger e nao sao '
  'adversarios contidos por este desenho.';

commit;
