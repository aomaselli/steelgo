import type { Database } from "@/integrations/supabase/types";

// Rotulos HONESTOS para o estado financeiro (payment_intents.internal_status e
// seu espelho contracts.escrow_status). Solicitacao, confirmacao externa e
// pagamento efetivamente confirmado sao tres coisas diferentes, e a interface
// diz qual delas e. "confirmado pela SteelGo" e deliberado: sem provedor
// integrado, a confirmacao e uma ATESTACAO humana com comprovante anexado -
// nunca confirmacao automatica bancaria.

export type PaymentInternalStatus = Database["public"]["Enums"]["payment_internal_status"];

/** Estados do ledger + 'pending' (contrato sem intent) + legados de contracts.escrow_status. */
export type PaymentDisplayStatus =
  | PaymentInternalStatus
  | "pending"
  | "disputed"
  | "escrow_held"
  | "released"
  | "refunded";

export type PaymentStatusMeta = {
  label: string;
  short: string;
  cls: string;
  tone: "neutral" | "wait" | "ok" | "bad";
};

export const PAYMENT_STATUS: Record<PaymentDisplayStatus, PaymentStatusMeta> = {
  pending: {
    label: "Pagamento não solicitado",
    short: "Não solicitado",
    cls: "bg-[#EEF3F8] text-[#10274A]",
    tone: "neutral",
  },
  pending_provider: {
    label: "Aguardando meio de pagamento",
    short: "Aguardando meio",
    cls: "bg-[#EEF3F8] text-[#10274A]",
    tone: "neutral",
  },
  awaiting_funding: {
    label: "Aporte solicitado — sem confirmação",
    short: "Aporte solicitado",
    cls: "bg-[#FDF6E9] text-[#8A5A12]",
    tone: "wait",
  },
  funding_confirmed: {
    label: "Aporte confirmado pela SteelGo",
    short: "Aporte confirmado",
    cls: "bg-[#EAF7F1] text-[#14603F]",
    tone: "ok",
  },
  release_requested: {
    label: "Liberação solicitada — sem confirmação",
    short: "Liberação solicitada",
    cls: "bg-[#FDF6E9] text-[#8A5A12]",
    tone: "wait",
  },
  released_confirmed: {
    label: "Repasse confirmado pela SteelGo",
    short: "Repasse confirmado",
    cls: "bg-[#EAF7F1] text-[#14603F]",
    tone: "ok",
  },
  failed: {
    label: "Falhou — aguardando nova solicitação",
    short: "Falhou",
    cls: "bg-[#FDF3F3] text-[#8A2B2B]",
    tone: "bad",
  },
  cancelled: {
    label: "Cancelado",
    short: "Cancelado",
    cls: "bg-[#EEF3F8] text-[#54657C]",
    tone: "neutral",
  },
  reconciliation_required: {
    label: "Em reconciliação",
    short: "Em reconciliação",
    cls: "bg-[#FDF3F3] text-[#8A2B2B]",
    tone: "bad",
  },
  disputed: {
    label: "Disputado",
    short: "Disputado",
    cls: "bg-[#FDF3F3] text-[#8A2B2B]",
    tone: "bad",
  },
  // valores legados de contracts.escrow_status, mantidos apenas para linhas antigas
  escrow_held: {
    label: "Em escrow (legado)",
    short: "Em escrow (legado)",
    cls: "bg-[#FDF6E9] text-[#8A5A12]",
    tone: "wait",
  },
  released: {
    label: "Liberado (legado)",
    short: "Liberado (legado)",
    cls: "bg-[#EAF7F1] text-[#14603F]",
    tone: "ok",
  },
  refunded: {
    label: "Reembolsado (legado)",
    short: "Reembolsado (legado)",
    cls: "bg-[#EEF3F8] text-[#54657C]",
    tone: "neutral",
  },
};

export function paymentStatusMeta(status: string | null | undefined): PaymentStatusMeta {
  return PAYMENT_STATUS[(status ?? "pending") as PaymentDisplayStatus] ?? PAYMENT_STATUS.pending;
}

/** Aporte confirmado e ainda nao repassado: e o que a plataforma esta guardando. */
export const PROTECTED_STATUSES: readonly PaymentInternalStatus[] = [
  "funding_confirmed",
  "release_requested",
];
/** Estados que exigem acao ou atencao humana. */
export const PENDING_ISSUE_STATUSES: readonly PaymentInternalStatus[] = [
  "failed",
  "reconciliation_required",
];

export const FAILURE_CODES = [
  { code: "provider_rejected", label: "Recusado pelo provedor/banco" },
  { code: "amount_mismatch", label: "Valor divergente" },
  { code: "payer_unreachable", label: "Pagador não localizado" },
  { code: "other", label: "Outro (descrever)" },
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number]["code"];

/** Texto fixo exibido em toda tela que confirma pagamento manualmente. */
export const ATTESTATION_NOTICE =
  "Sem provedor de pagamento integrado. Toda confirmação aqui é uma ATESTAÇÃO humana feita por um administrador SteelGo, com comprovante anexado e registrada em trilha auditável. Não existe confirmação bancária automática. O SHA-256 do comprovante é calculado pelo navegador do administrador; o tamanho, o tipo e o identificador (eTag) são os registrados pelo Storage — nenhum deles é verificação independente.";
