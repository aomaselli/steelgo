// Camada de dados do modulo de disputas. TODA leitura passa por RPC sanitizada
// (list_dispute_cases / get_dispute_case): nenhum SELECT direto nas tabelas e
// nenhum uuid pessoal chega ao cliente. TODA escrita passa por RPC.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type {
  DisputeOutcome,
  DisputeReason,
  DisputeStatus,
  SettlementState,
} from "@/lib/disputeStatus";

export type DisputeListRow =
  Database["public"]["Functions"]["list_dispute_cases"]["Returns"][number];

export type Actor = { role: string; label: string; is_you: boolean };

export type DisputeCase = {
  case: {
    id: string;
    case_number: string;
    contract_id: string;
    status: DisputeStatus;
    settlement_state: SettlementState;
    reason_code: DisputeReason;
    description: string;
    disputed_amount: number;
    currency_code: string;
    priority: string;
    opened_at: string;
    due_at: string;
    overdue: boolean;
    settlement_due_at: string | null;
    settlement_overdue: boolean;
    previous_contract_status: string;
    closed_at: string | null;
    assigned: boolean;
    assignee: Actor | null;
    assigned_at: string | null;
    opened_by: Actor;
  };
  viewer: { role: string | null; is_admin: boolean; is_assignee: boolean };
  contract: {
    id: string;
    contract_number: string | null;
    status: string;
    escrow_status: string | null;
    total_amount_brl: number | null;
    platform_fee_brl: number | null;
    completed_at: string | null;
    delivery_completed_at: string | null;
  };
  parties: {
    role: string;
    company_name: string;
    company_kind: "shipper" | "carrier";
    is_you: boolean;
  }[];
  claims: {
    id: string;
    actor: Actor;
    role: string;
    reason_code: DisputeReason;
    statement: string;
    claimed_amount: number | null;
    currency_code: string | null;
    created_at: string;
  }[];
  evidence: {
    id: string;
    claim_id: string | null;
    evidence_request_id: string | null;
    actor: Actor;
    role: string;
    kind: string;
    description: string;
    artifact_ref: string | null;
    content_hash: string;
    artifact_size_bytes: number | null;
    artifact_mime: string | null;
    submitted_at: string;
  }[];
  evidence_requests: {
    id: string;
    target_role: string;
    description: string;
    due_at: string;
    created_at: string;
    status: "open" | "fulfilled" | "waived" | "expired";
    fulfilled_at: string | null;
    evidence_id: string | null;
    waived_at: string | null;
    waive_note: string | null;
    addressed_to_you: boolean;
  }[];
  comments: {
    id: string;
    actor: Actor;
    role: string;
    body: string;
    visibility: "all_parties" | "internal_admin";
    created_at: string;
  }[];
  decisions: {
    id: string;
    outcome: DisputeOutcome;
    decided_amount: number;
    gross_amount: number;
    original_platform_fee: number;
    shipper_amount: number;
    carrier_delta: number;
    platform_delta: number;
    release_amount: number;
    carrier_final: number;
    platform_fee_final: number;
    currency_code: string;
    rationale: string;
    decided_at: string;
    is_current: boolean;
    supersedes_decision_id: string | null;
    decided_by: Actor;
    allocations: { party_kind: string; amount: number; percentage: number | null }[];
  }[];
  events: {
    id: string;
    event_type: string;
    previous_status: string | null;
    new_status: string;
    actor: Actor;
    actor_kind: string;
    note: string | null;
    comment_id: string | null;
    decision_id: string | null;
    evidence_id: string | null;
    claim_id: string | null;
    evidence_request_id: string | null;
    transaction_id: string | null;
    recovery_id: string | null;
    created_at: string;
  }[];
  settlement: {
    state: SettlementState;
    due_at: string | null;
    intent: {
      id: string;
      internal_status: string;
      gross_amount: number;
      platform_fee_amount: number;
      carrier_net_amount: number;
      currency_code: string;
      release_blocked_by_dispute: boolean;
      funding_confirmed_at: string | null;
      released_confirmed_at: string | null;
      settled_at: string | null;
      settlement_refund_amount: number | null;
      settlement_release_amount: number | null;
      settlement_funding_amount: number | null;
    } | null;
    transactions: {
      id: string;
      kind: string;
      status: string;
      amount: number;
      currency_code: string;
      requested_at: string;
      confirmed_at: string | null;
      failure_code: string | null;
      dispute_decision_id: string | null;
      allocations: { party_kind: string; amount: number }[];
    }[];
    recoveries: {
      id: string;
      debtor_kind: "carrier" | "platform";
      debtor_label: string;
      creditor_label: string;
      expected_amount: number;
      currency_code: string;
      status: "open" | "confirmed" | "written_off";
      external_reference: string | null;
      confirmed_at: string | null;
      written_off_at: string | null;
      write_off_note: string | null;
      registered_at: string;
      evidence_ref: string | null;
    }[];
  };
};

export const TERMINAL: readonly DisputeStatus[] = ["closed", "withdrawn"];
export const INSTRUCTION_OPEN: readonly DisputeStatus[] = [
  "open",
  "under_review",
  "awaiting_evidence",
];

export async function fetchDisputeCases(
  scope: "mine" | "all" | "unassigned" = "mine",
  status: DisputeStatus[] | null = null,
): Promise<DisputeListRow[]> {
  const { data, error } = await supabase.rpc("list_dispute_cases", {
    p_scope: scope,
    p_status: status ?? undefined,
    p_limit: 200,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchDisputeCase(caseId: string): Promise<DisputeCase> {
  const { data, error } = await supabase.rpc("get_dispute_case", { p_case_id: caseId });
  if (error) throw error;
  return data as unknown as DisputeCase;
}

/** Moeda COM centavos: parcelas de liquidacao (ex.: 482,50) nao podem ser arredondadas na tela. */
export function brl(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

/** request_id estavel por tentativa: um erro de rede/RPC reaproveita o mesmo id. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

export function rpcErrorMessage(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string } | null;
  if (!err) return "erro desconhecido";
  return err.message ?? err.details ?? "erro desconhecido";
}

/** Matematica da liquidacao (espelho de dispute_settlement_math), so para PRE-VISUALIZACAO.
 *  O servidor recalcula e recusa qualquer parcela diferente. */
export function settlementPreview(G: number, F: number, D: number, S: number) {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const U = r2(G - D);
  const R = r2(G - S);
  const feeFinal = r2((F * R) / G);
  const carrierFinal = r2(R - feeFinal);
  const feeU = r2((F * U) / G);
  const carrierU = r2(U - feeU);
  const platformDelta = r2(feeFinal - feeU);
  const carrierDelta = r2(carrierFinal - carrierU);
  const carrierRecovery = r2(G - F - carrierFinal);
  const platformRecovery = r2(F - feeFinal);
  return {
    U,
    R,
    feeFinal,
    carrierFinal,
    platformDelta,
    carrierDelta,
    carrierRecovery,
    platformRecovery,
  };
}
