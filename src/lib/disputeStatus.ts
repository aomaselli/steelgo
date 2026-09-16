// Rotulos HONESTOS do modulo de disputas, num unico lugar. Nenhum estado e
// apresentado como algo que nao e: "liquidacao solicitada" nao e "liquidada";
// "recuperacao baixada" nao e "valor recuperado".
import type { Database } from "@/integrations/supabase/types";

export type DisputeStatus = Database["public"]["Enums"]["dispute_status"];
export type DisputeOutcome = Database["public"]["Enums"]["dispute_decision_outcome"];
export type DisputeReason = Database["public"]["Enums"]["dispute_reason_code"];
export type DisputePartyRole = Database["public"]["Enums"]["dispute_party_role"];

export type SettlementState =
  | "undecided"
  | "not_required"
  | "pending_funding"
  | "settlement_pending"
  | "requested"
  | "settled"
  | "recovery_open"
  | "recovery_closed"
  | "not_applicable";

type Meta = { label: string; tone: "blue" | "amber" | "green" | "gray" | "danger" | "default" };

export const DISPUTE_STATUS: Record<DisputeStatus, Meta> = {
  open: { label: "Aberta", tone: "danger" },
  under_review: { label: "Em análise", tone: "amber" },
  awaiting_evidence: { label: "Aguardando evidência", tone: "amber" },
  decided: { label: "Decidida", tone: "blue" },
  closed: { label: "Encerrada", tone: "green" },
  withdrawn: { label: "Retirada pelo requerente", tone: "gray" },
};

export const SETTLEMENT_STATE: Record<SettlementState, Meta & { hint: string }> = {
  undecided: { label: "Sem decisão", tone: "default", hint: "O caso ainda não foi decidido." },
  not_required: {
    label: "Sem movimento financeiro",
    tone: "gray",
    hint: "A decisão não devolve valor ao embarcador: nenhuma transação de liquidação é necessária.",
  },
  pending_funding: {
    label: "Aguardando aporte da decisão",
    tone: "amber",
    hint: "Não há custódia. O embarcador precisa aportar apenas o valor a liberar (R); a parcela devolvida nunca saiu dele.",
  },
  settlement_pending: {
    label: "Liquidação a solicitar",
    tone: "amber",
    hint: "Há custódia. A Equipe SteelGo precisa solicitar as transações de liquidação (devolução e/ou liberação).",
  },
  requested: {
    label: "Liquidação solicitada — sem confirmação",
    tone: "amber",
    hint: "Transações de devolução/liberação criadas. Nada foi confirmado até a atestação com comprovante.",
  },
  settled: {
    label: "Liquidação confirmada",
    tone: "green",
    hint: "Todas as transações da decisão foram atestadas com comprovante.",
  },
  recovery_open: {
    label: "Recuperação pendente",
    tone: "danger",
    hint: "O pagamento já havia sido repassado. Há obrigação de recuperação registrada: o valor NÃO voltou.",
  },
  recovery_closed: {
    label: "Recuperações encerradas",
    tone: "green",
    hint: "Cada obrigação foi confirmada com comprovante ou baixada com justificativa (baixa não é devolução).",
  },
  not_applicable: {
    label: "Sem liquidação — contrato cancelado",
    tone: "gray",
    hint: "O aporte da decisão não foi feito no prazo e o contrato foi cancelado administrativamente.",
  },
};

export const OUTCOME: Record<DisputeOutcome, { label: string; short: string }> = {
  release_to_carrier: {
    label: "Vitória da transportadora — valor integral liberado",
    short: "Transportadora",
  },
  refund_to_shipper: {
    label: "Vitória do embarcador — devolução integral do valor em disputa",
    short: "Embarcador",
  },
  split: { label: "Divisão — devolução parcial ao embarcador", short: "Divisão" },
  dismissed: { label: "Improcedente — nada devolvido ao embarcador", short: "Improcedente" },
};

export const REASON: Record<DisputeReason, string> = {
  cargo_damage: "Avaria na carga",
  delivery_delay: "Atraso na entrega",
  quantity_mismatch: "Divergência de quantidade",
  documentation_issue: "Documentação",
  payment_amount: "Valor do pagamento",
  service_not_rendered: "Serviço não prestado",
  route_deviation: "Desvio de rota",
  other: "Outro",
};

export const PARTY_ROLE: Record<string, string> = {
  claimant: "Requerente",
  respondent: "Requerido",
  steelgo: "Equipe SteelGo",
  admin: "Equipe SteelGo",
  admin_reviewer: "Equipe SteelGo",
  driver: "Motorista",
  system: "Sistema",
  party: "Parte",
};

export const EVIDENCE_KIND: Record<string, string> = {
  photo: "Foto",
  document: "Documento",
  checkpoint: "Checkpoint",
  message: "Mensagem",
  invoice: "Nota fiscal",
  other: "Outro",
};

export const EVENT_LABEL: Record<string, string> = {
  opened: "Disputa aberta",
  claim_added: "Alegação registrada",
  evidence_added: "Evidência apresentada",
  comment_added: "Comentário",
  assigned: "Caso assumido pela Equipe SteelGo",
  reassigned: "Caso reatribuído",
  status_changed: "Estado alterado",
  decided: "Decisão registrada",
  decision_superseded: "Decisão corrigida por nova decisão",
  closed: "Caso encerrado",
  withdrawn: "Disputa retirada pelo requerente",
  evidence_requested: "Pedido de evidência",
  evidence_request_fulfilled: "Pedido de evidência atendido",
  evidence_request_waived: "Pedido de evidência dispensado",
  evidence_request_expired: "Pedido de evidência expirado",
  settlement_requested: "Liquidação solicitada (sem confirmação)",
  settlement_transaction_confirmed: "Transação da liquidação atestada",
  settlement_transaction_failed: "Transação da liquidação falhou",
  settlement_confirmed: "Liquidação confirmada",
  recovery_registered: "Obrigação de recuperação registrada (valor NÃO voltou)",
  recovery_confirmed: "Recuperação confirmada com comprovante",
  recovery_written_off: "Recuperação BAIXADA sem devolução",
  cancelled_unpaid_settlement: "Contrato cancelado por falta de aporte da decisão",
  release_blocked: "Liberação suspensa",
  reconciliation_required: "Reconciliação exigida",
};

export const RECOVERY_STATUS: Record<string, { label: string; tone: Meta["tone"] }> = {
  open: { label: "Recuperação pendente", tone: "danger" },
  confirmed: { label: "Recuperação confirmada", tone: "green" },
  written_off: { label: "Recuperação baixada (sem devolução)", tone: "gray" },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Meta["tone"] }> = {
  open: { label: "Aberto", tone: "amber" },
  fulfilled: { label: "Atendido", tone: "green" },
  waived: { label: "Dispensado", tone: "gray" },
  expired: { label: "Expirado", tone: "danger" },
};

export const DISPUTE_NOTICE =
  "Disputa mediada pela SteelGo. Uma disputa por contrato. Evidências são imutáveis depois de " +
  "apresentadas; o SHA-256 é declarado por quem envia e pode ser conferido ao baixar. Nenhum " +
  "valor é devolvido ou liberado sem atestação humana com comprovante.";

/** "vence em 3 d" / "atrasado há 2 d" — SLA administrativo, sem efeito automático. */
export function dueLabel(dueAt: string | null | undefined, terminal: boolean): string {
  if (!dueAt || terminal) return "";
  const ms = new Date(dueAt).getTime() - Date.now();
  const d = Math.ceil(Math.abs(ms) / 86400000);
  if (ms >= 0) return d <= 1 ? "vence em menos de 1 dia" : `vence em ${d} dias`;
  return d <= 1 ? "atrasado há menos de 1 dia" : `atrasado há ${d} dias`;
}
