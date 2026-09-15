import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, EmptyState, Spinner, Button, Select } from "@/components/steel";
import { formatBRL } from "@/lib/steel";
import {
  paymentStatusMeta,
  PROTECTED_STATUSES,
  type PaymentInternalStatus,
} from "@/lib/paymentStatus";
import {
  counterpartyLabel,
  fetchLedgerIntents,
  routeLabel,
  type LedgerIntent,
} from "@/lib/paymentLedger";

// Pagamentos do EMBARCADOR, lidos do ledger (payment_intents). A tabela legada
// public.payments nao e mais consultada. Os totais do mes sao honestos:
//   pago         = repasse CONFIRMADO pela SteelGo (released_confirmed)
//   em custodia  = aporte confirmado ainda nao repassado
//   taxa paga    = platform_fee de repasses confirmados
// "Solicitado sem confirmacao" aparece como estado, nunca como dinheiro pago.

const STATUS_FILTERS: { id: "all" | PaymentInternalStatus; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "awaiting_funding", label: "Aporte solicitado — sem confirmação" },
  { id: "funding_confirmed", label: "Aporte confirmado" },
  { id: "release_requested", label: "Liberação solicitada" },
  { id: "released_confirmed", label: "Repasse confirmado" },
  { id: "failed", label: "Falhou" },
  { id: "reconciliation_required", label: "Em reconciliação" },
];

export function PaymentsPage() {
  const { company } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ledger-intents", "shipper", company?.id],
    enabled: !!company?.id,
    queryFn: () => fetchLedgerIntents("shipper", company?.id),
  });

  const { data: pendingContracts } = useQuery({
    queryKey: ["shipper-pending-payments", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, total_amount_brl, freight_id, freights(id)")
        .eq("shipper_company_id", company!.id)
        .eq("escrow_status", "pending")
        .eq("status", "active");
      return data ?? [];
    },
  });

  const stampOf = (p: LedgerIntent) => p.requested_at ?? p.created_at;

  const monthRows = useMemo(() => {
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    return (data ?? []).filter((p) => {
      const s = stampOf(p);
      if (!s) return false;
      const d = new Date(s);
      return d >= monthStart && d < monthEnd;
    });
  }, [data, month]);

  const totals = monthRows.reduce(
    (acc, p) => {
      const gross = Number(p.gross_amount ?? 0);
      const fee = Number(p.platform_fee_amount ?? 0);
      const s = p.internal_status as PaymentInternalStatus;
      if (s === "released_confirmed") {
        acc.paid += gross;
        acc.fees += fee;
      }
      if (PROTECTED_STATUSES.includes(s)) acc.escrow += gross;
      if (s === "awaiting_funding") acc.requested += gross;
      return acc;
    },
    { paid: 0, escrow: 0, fees: 0, requested: 0 },
  );

  const filtered = useMemo(() => {
    return (data ?? []).filter((p) => {
      if (statusFilter !== "all" && p.internal_status !== statusFilter) return false;
      const s = stampOf(p);
      if (dateFrom && s && new Date(s) < new Date(dateFrom)) return false;
      if (dateTo && s && new Date(s) > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [data, statusFilter, dateFrom, dateTo]);

  const pendingAlert = pendingContracts?.[0];

  return (
    <AppShell title="Pagamentos">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-semibold text-[#E6EDF3] capitalize">
            {month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-5 mb-3">
          <Card className="p-5">
            <p className="text-xs uppercase text-[#484F58] mb-2">Repasse confirmado no mês</p>
            <p className="text-2xl font-bold tabular-nums text-[#E6EDF3]">
              {formatBRL(totals.paid)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-[#484F58] mb-2">Aporte confirmado (em custódia)</p>
            <p className="text-2xl font-bold tabular-nums text-[#F0A500]">
              {formatBRL(totals.escrow)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-[#484F58] mb-2">Solicitado — sem confirmação</p>
            <p className="text-2xl font-bold tabular-nums text-[#8B949E]">
              {formatBRL(totals.requested)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-[#484F58] mb-2">
              Taxa da plataforma (repasses confirmados)
            </p>
            <p className="text-2xl font-bold tabular-nums text-[#8B949E]">
              {formatBRL(totals.fees)}
            </p>
          </Card>
        </div>
        <p className="text-xs text-[#8B949E] mb-8">
          Sem provedor de pagamento integrado: cada confirmação é uma atestação humana da SteelGo,
          com comprovante. Solicitar não é pagar.
        </p>

        {pendingAlert && (
          <div className="bg-[#1B6CB8]/10 border border-[#1B6CB8]/30 rounded-[14px] p-5 flex gap-4 items-center mb-6">
            <CreditCard className="w-7 h-7 text-[#3B89D4]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#E6EDF3]">
                Frete SG-{String(pendingAlert.freight_id).slice(0, 8).toUpperCase()} sem solicitação
                de aporte
              </p>
              <p className="text-xs text-[#8B949E] mt-1">
                Solicite o aporte protegido de {formatBRL(Number(pendingAlert.total_amount_brl))}; a
                confirmação será feita pela SteelGo.
              </p>
            </div>
            <Link to="/shipper/payment/$contractId" params={{ contractId: pendingAlert.id }}>
              <Button size="sm">Solicitar agora →</Button>
            </Link>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-64"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-bg-input border border-[#30363D] rounded-md px-3 py-2 text-sm text-[#C9D1D9]"
          />
          <span className="text-[#8B949E] text-xs">até</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-bg-input border border-[#30363D] rounded-md px-3 py-2 text-sm text-[#C9D1D9]"
          />
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Spinner />
            </div>
          ) : !filtered.length ? (
            <EmptyState icon={CreditCard} title="Nenhum pagamento encontrado" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated text-[#8B949E] text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Solicitado</th>
                  <th className="text-left px-4 py-2">Frete</th>
                  <th className="text-left px-4 py-2">Rota</th>
                  <th className="text-left px-4 py-2">Transportadora</th>
                  <th className="text-right px-4 py-2">Líquido</th>
                  <th className="text-right px-4 py-2">Taxa</th>
                  <th className="text-right px-4 py-2">Bruto</th>
                  <th className="text-left px-4 py-2">Estado</th>
                  <th className="text-right px-4 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const f = p.contracts.freights;
                  const meta = paymentStatusMeta(p.internal_status);
                  const s = stampOf(p);
                  return (
                    <tr key={p.id} className="border-t border-[#30363D] hover:bg-[#161B22]">
                      <td className="px-4 py-3 text-xs text-[#8B949E]">
                        {s ? new Date(s).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {f?.id ? (
                          <Link
                            to="/shipper/freights/$id"
                            params={{ id: String(f.id) }}
                            className="font-mono text-xs text-[#79B8F8] hover:underline"
                          >
                            SG-{String(f.id).slice(0, 8).toUpperCase()}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-[#8B949E]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#C9D1D9]">{routeLabel(f)}</td>
                      <td className="px-4 py-3 text-xs text-[#C9D1D9]">
                        {counterpartyLabel(p, "carrier")}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#C9D1D9]">
                        {formatBRL(Number(p.carrier_net_amount ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-[#8B949E]">
                        {formatBRL(Number(p.platform_fee_amount ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-[#E6EDF3]">
                        {formatBRL(Number(p.gross_amount ?? 0))}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to="/shipper/contracts/$id" params={{ id: String(p.contract_id) }}>
                          <Button variant="ghost" size="sm">
                            Ver contrato
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
