import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  PENDING_ISSUE_STATUSES,
  PROTECTED_STATUSES,
  type PaymentInternalStatus,
} from "@/lib/paymentStatus";

// Leitura do LEDGER financeiro (payment_intents / payment_transactions /
// payment_allocations / payment_events / external_reconciliation), que
// substitui a tabela legada public.payments em todos os paineis. Somente
// SELECT: toda escrita financeira passa por RPC. A visibilidade por papel vem
// das policies (is_contract_visible): embarcador e transportadora enxergam so
// os proprios contratos; administrador enxerga tudo.

export type LedgerScope = "admin" | "shipper" | "carrier";

type IntentRow = Database["public"]["Tables"]["payment_intents"]["Row"];
export type TransactionRow = Database["public"]["Tables"]["payment_transactions"]["Row"];
export type AllocationRow = Database["public"]["Tables"]["payment_allocations"]["Row"];
export type PaymentEventRow = Database["public"]["Tables"]["payment_events"]["Row"];
export type ReconciliationRow = Database["public"]["Tables"]["external_reconciliation"]["Row"];

// Nomes das contrapartes NAO vem do join com public.companies: a policy
// companies_select deixa cada empresa ler apenas a si mesma, e o join da outra
// parte voltaria nulo. Os nomes vem de list_visible_contract_counterparties,
// uma RPC SECURITY DEFINER que devolve somente id e nome comercial das duas
// empresas de contratos que o chamador ja pode ver (is_contract_visible).
// Uma unica chamada em lote por carregamento, ate 500 contratos por chamada.
export type Counterparty = {
  contract_id: string;
  shipper_company_id: string;
  shipper_company_name: string | null;
  carrier_company_id: string;
  carrier_company_name: string | null;
};

export type LedgerIntent = IntentRow & {
  /** Preenchidos pela RPC em lote; null quando a RPC falhou (ver counterparties_unavailable). */
  shipper_company_name: string | null;
  carrier_company_name: string | null;
  /** true quando a RPC de contrapartes falhou ou nao devolveu este contrato: a UI mostra "indisponivel", nunca finge que nao existe. */
  counterparties_unavailable: boolean;
  contracts: {
    id: string;
    contract_number: string | null;
    status: Database["public"]["Enums"]["contract_status"] | null;
    escrow_status: string;
    shipper_company_id: string;
    carrier_company_id: string;
    delivery_completed_at: string | null;
    freight_id: string;
    freights: {
      id: string;
      origin_city: string | null;
      origin_state: string | null;
      dest_city: string | null;
      dest_state: string | null;
    } | null;
  };
};

const INTENT_SELECT =
  "*, contracts!inner(id, contract_number, status, escrow_status, shipper_company_id, carrier_company_id, delivery_completed_at, freight_id, " +
  "freights(id, origin_city, origin_state, dest_city, dest_state))";

const COUNTERPARTY_BATCH = 500;

/**
 * Nomes das contrapartes dos contratos informados, em lotes de ate 500 ids
 * (limite da RPC), duplicados eliminados. Lanca em caso de erro real da RPC.
 */
export async function fetchContractCounterparties(
  contractIds: string[],
): Promise<Map<string, Counterparty>> {
  const ids = Array.from(new Set(contractIds.filter(Boolean)));
  const out = new Map<string, Counterparty>();
  for (let i = 0; i < ids.length; i += COUNTERPARTY_BATCH) {
    const chunk = ids.slice(i, i + COUNTERPARTY_BATCH);
    const { data, error } = await supabase.rpc("list_visible_contract_counterparties", {
      p_contract_ids: chunk,
    });
    if (error) throw error;
    for (const row of data ?? []) out.set(row.contract_id, row);
  }
  return out;
}

/** Junta os nomes das contrapartes as intents por contract_id. Erro da RPC nao derruba a lista: marca as linhas como indisponiveis e registra o erro. */
async function attachCounterparties<T extends { contract_id: string }>(
  rows: T[],
): Promise<
  (T & {
    shipper_company_name: string | null;
    carrier_company_name: string | null;
    counterparties_unavailable: boolean;
  })[]
> {
  if (rows.length === 0) return [];
  let names: Map<string, Counterparty> | null = null;
  try {
    names = await fetchContractCounterparties(rows.map((r) => r.contract_id));
  } catch (e) {
    console.error(
      "[paymentLedger] contrapartes indisponiveis: list_visible_contract_counterparties falhou",
      e,
    );
  }
  return rows.map((r) => {
    const cp = names?.get(r.contract_id) ?? null;
    if (names && !cp) {
      console.error("[paymentLedger] contrato visivel sem contrapartes na RPC", r.contract_id);
    }
    return {
      ...r,
      shipper_company_name: cp?.shipper_company_name ?? null,
      carrier_company_name: cp?.carrier_company_name ?? null,
      counterparties_unavailable: !cp,
    };
  });
}

/** Intents visiveis ao papel, mais recentes primeiro. Para shipper/carrier exige companyId. */
export async function fetchLedgerIntents(
  scope: LedgerScope,
  companyId?: string | null,
  limit = 250,
): Promise<LedgerIntent[]> {
  let q = supabase
    .from("payment_intents")
    .select(INTENT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (scope === "shipper") {
    if (!companyId) return [];
    q = q.eq("contracts.shipper_company_id", companyId);
  }
  if (scope === "carrier") {
    if (!companyId) return [];
    q = q.eq("contracts.carrier_company_id", companyId);
  }
  const { data, error } = await q;
  if (error) throw error;
  type Raw = Omit<
    LedgerIntent,
    "shipper_company_name" | "carrier_company_name" | "counterparties_unavailable"
  >;
  return attachCounterparties((data ?? []) as unknown as Raw[]);
}

export async function fetchIntentDetail(intentId: string) {
  const [tx, ev, rec] = await Promise.all([
    supabase
      .from("payment_transactions")
      .select("*")
      .eq("intent_id", intentId)
      .order("requested_at", { ascending: true }),
    supabase
      .from("payment_events")
      .select("*")
      .eq("intent_id", intentId)
      .order("created_at", { ascending: true }),
    supabase
      .from("external_reconciliation")
      .select("*")
      .eq("intent_id", intentId)
      .order("opened_at", { ascending: true }),
  ]);
  if (tx.error) throw tx.error;
  if (ev.error) throw ev.error;
  if (rec.error) throw rec.error;
  const txIds = (tx.data ?? []).map((t) => t.id);
  let allocations: AllocationRow[] = [];
  if (txIds.length) {
    const al = await supabase.from("payment_allocations").select("*").in("transaction_id", txIds);
    if (al.error) throw al.error;
    allocations = al.data ?? [];
  }
  return {
    transactions: (tx.data ?? []) as TransactionRow[],
    events: (ev.data ?? []) as PaymentEventRow[],
    reconciliations: (rec.data ?? []) as ReconciliationRow[],
    allocations,
  };
}

export async function fetchPendingReconciliations(): Promise<
  (ReconciliationRow & { contract_id: string | null })[]
> {
  const { data, error } = await supabase
    .from("external_reconciliation")
    .select("*, payment_intents!inner(contract_id)")
    .eq("status", "pending")
    .order("opened_at", { ascending: true });
  if (error) throw error;
  type Row = ReconciliationRow & { payment_intents: { contract_id: string } | null };
  return (data as unknown as Row[]).map(({ payment_intents, ...r }) => ({
    ...r,
    contract_id: payment_intents?.contract_id ?? null,
  }));
}

/**
 * Objetos do bucket payment-evidence que nenhuma transacao confirmada NEM
 * recuperacao confirmada referencia. As recuperacoes vem por RPC (admin nao
 * tem SELECT direto em payment_recoveries).
 */
export async function fetchUnlinkedEvidence(): Promise<
  { name: string; created_at: string | null; size: number | null }[]
> {
  const { data: roots, error } = await supabase.storage
    .from("payment-evidence")
    .list("", { limit: 1000 });
  if (error) throw error;
  const { data: refs, error: refErr } = await supabase
    .from("payment_transactions")
    .select("confirmation_evidence_ref")
    .not("confirmation_evidence_ref", "is", null);
  if (refErr) throw refErr;
  const { data: recRefs, error: recErr } = await supabase.rpc("list_recovery_evidence_refs");
  if (recErr) throw recErr;
  const linked = new Set<string>([
    ...(refs ?? []).map((r) => r.confirmation_evidence_ref as string),
    ...((recRefs ?? []) as string[]),
  ]);
  const out: { name: string; created_at: string | null; size: number | null }[] = [];
  for (const contractFolder of roots ?? []) {
    if (!contractFolder.name) continue;
    const { data: txFolders } = await supabase.storage
      .from("payment-evidence")
      .list(contractFolder.name, { limit: 1000 });
    for (const txFolder of txFolders ?? []) {
      const prefix = `${contractFolder.name}/${txFolder.name}`;
      const { data: files } = await supabase.storage
        .from("payment-evidence")
        .list(prefix, { limit: 1000 });
      for (const f of files ?? []) {
        const full = `${prefix}/${f.name}`;
        if (!linked.has(full))
          out.push({
            name: full,
            created_at: f.created_at ?? null,
            size: typeof f.metadata?.size === "number" ? f.metadata.size : null,
          });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// KPIs honestos por escopo. Nenhum indicador soma "tudo" como se fosse dinheiro
// movimentado: cada numero diz de que estado veio.
// ---------------------------------------------------------------------------
export type LedgerKpis = {
  contractedGross: number; // Σ gross de todas as intents (custo/receita contratada)
  contractedNet: number; // Σ carrier_net de todas as intents
  protectedGross: number; // funding_confirmed ∪ release_requested (em custodia)
  protectedNet: number;
  confirmedGross: number; // released_confirmed (bruto) + settled (amount da release confirmada)
  confirmedNet: number; // carrier_net + alocacao 'carrier' da release confirmada nos settled
  confirmedFee: number; // platform_fee onde released_confirmed + alocacao 'platform' nos settled
  issueGross: number; // failed ∪ reconciliation_required ∪ bloqueado por disputa
  awaitingFundingGross: number; // awaiting_funding (solicitado, sem confirmacao)
  awaitingFundingCount: number;
  awaitingReleaseGross: number; // release_requested
  awaitingReleaseCount: number;
  issueCount: number;
};

/**
 * Valores PERSISTIDOS da liquidacao confirmada de cada intent `settled`:
 * amount da release confirmada e suas alocacoes. Vem da RPC sanitizada
 * list_settled_release_amounts (admin: tudo; parte: contratos visiveis).
 * Nenhuma formula financeira e recalculada no cliente.
 */
export type SettledRelease = {
  intent_id: string;
  contract_id: string;
  transaction_id: string;
  release_amount: number;
  carrier_amount: number;
  platform_amount: number;
};

export async function fetchSettledReleases(): Promise<SettledRelease[]> {
  const { data, error } = await supabase.rpc("list_settled_release_amounts");
  if (error) throw error;
  return (data ?? []) as SettledRelease[];
}

export function computeLedgerKpis(
  rows: LedgerIntent[],
  settled: SettledRelease[] = [],
): LedgerKpis {
  const k: LedgerKpis = {
    contractedGross: 0,
    contractedNet: 0,
    protectedGross: 0,
    protectedNet: 0,
    confirmedGross: 0,
    confirmedNet: 0,
    confirmedFee: 0,
    issueGross: 0,
    awaitingFundingGross: 0,
    awaitingFundingCount: 0,
    awaitingReleaseGross: 0,
    awaitingReleaseCount: 0,
    issueCount: 0,
  };
  const settledByIntent = new Map(settled.map((s) => [s.intent_id, s]));
  for (const r of rows) {
    const gross = Number(r.gross_amount ?? 0),
      net = Number(r.carrier_net_amount ?? 0),
      fee = Number(r.platform_fee_amount ?? 0);
    const s = r.internal_status as PaymentInternalStatus;
    k.contractedGross += gross;
    k.contractedNet += net;
    if (PROTECTED_STATUSES.includes(s)) {
      k.protectedGross += gross;
      k.protectedNet += net;
    }
    if (s === "released_confirmed") {
      k.confirmedGross += gross;
      k.confirmedNet += net;
      k.confirmedFee += fee;
    }
    // Liquidacao de disputa confirmada: soma-se o que esta no razao (release
    // confirmada e alocacoes), nunca um recalculo. Sem release confirmada
    // (decisao sem parcela a liberar) nada e somado.
    if (s === "settled") {
      const sr = settledByIntent.get(r.id);
      if (sr) {
        k.confirmedGross += Number(sr.release_amount);
        k.confirmedNet += Number(sr.carrier_amount);
        k.confirmedFee += Number(sr.platform_amount);
      }
    }
    if (PENDING_ISSUE_STATUSES.includes(s) || r.release_blocked_by_dispute) {
      k.issueGross += gross;
      k.issueCount += 1;
    }
    if (s === "awaiting_funding") {
      // Aporte de decisao de disputa: o devido e R (settlement_funding_amount,
      // persistido pelo servidor), nao o bruto do contrato.
      k.awaitingFundingGross += Number(r.settlement_funding_amount ?? gross);
      k.awaitingFundingCount += 1;
    }
    if (s === "release_requested") {
      k.awaitingReleaseGross += gross;
      k.awaitingReleaseCount += 1;
    }
  }
  return k;
}

export const COUNTERPARTY_UNAVAILABLE = "Contraparte indisponível";

/** Nome da contraparte para exibicao. Nunca "—" para contrato com as duas empresas: sem nome = RPC indisponivel, dito explicitamente. */
export function counterpartyLabel(row: LedgerIntent, side: "shipper" | "carrier"): string {
  const name = side === "shipper" ? row.shipper_company_name : row.carrier_company_name;
  return name && name.trim() ? name : COUNTERPARTY_UNAVAILABLE;
}

export function routeLabel(f: LedgerIntent["contracts"]["freights"]): string {
  if (!f) return "—";
  const o = [f.origin_city, f.origin_state].filter(Boolean).join("/");
  const d = [f.dest_city, f.dest_state].filter(Boolean).join("/");
  return `${o || "—"} → ${d || "—"}`;
}
