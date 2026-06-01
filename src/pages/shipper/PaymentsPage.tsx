import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Lock,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, EmptyState, Spinner, Button, Select } from "@/components/steel";
import { formatBRL } from "@/lib/steel";

type Row = {
  id: string;
  created_at: string | null;
  amount_brl: number | null;
  platform_fee_brl: number | null;
  carrier_payout_brl: number | null;
  status: string | null;
  contract_id: string;
  contracts: {
    id: string;
    contract_number: string | null;
    freight_id: string;
    freights: {
      id: string;
      origin_city: string | null;
      origin_state: string | null;
      dest_city: string | null;
      dest_state: string | null;
    } | null;
  } | null;
  carrier_company: { name: string | null; trade_name: string | null } | null;
};

const STATUS_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendente" },
  { id: "escrow_held", label: "Protegido" },
  { id: "released", label: "Liberado" },
  { id: "disputed", label: "Disputado" },
] as const;

export function PaymentsPage() {
  const { company } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["shipper-payments", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select(
          "*, contracts(id, contract_number, freight_id, freights(id, origin_city, origin_state, dest_city, dest_state)), carrier_company:companies!payments_carrier_company_id_fkey(name, trade_name)",
        )
        .eq("shipper_company_id", company!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as Row[];
    },
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
        .in("status", ["awaiting_shipper_signature", "awaiting_carrier_signature", "active"]);
      return data ?? [];
    },
  });

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  const monthRows = useMemo(
    () =>
      (data ?? []).filter((p) => {
        if (!p.created_at) return false;
        const d = new Date(p.created_at);
        return d >= monthStart && d < monthEnd;
      }),
    [data, monthStart, monthEnd],
  );

  const totals = monthRows.reduce(
    (acc, p) => {
      const amt = Number(p.amount_brl ?? 0);
      const fee = Number(p.platform_fee_brl ?? 0);
      if (p.status === "released") {
        acc.paid += amt;
        acc.fees += fee;
      }
      if (p.status === "escrow_held") acc.escrow += amt;
      return acc;
    },
    { paid: 0, escrow: 0, fees: 0 },
  );

  const filtered = useMemo(() => {
    return (data ?? []).filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (dateFrom && p.created_at && new Date(p.created_at) < new Date(dateFrom)) return false;
      if (dateTo && p.created_at && new Date(p.created_at) > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [data, statusFilter, dateFrom, dateTo]);

  const pendingAlert = pendingContracts?.[0];

  return (
    <AppShell title="Pagamentos">
      <div className="p-6">
        {/* Month selector */}
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

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
          <Card className="p-5">
            <p className="text-xs uppercase text-[#484F58] mb-2">Total pago este mês</p>
            <p className="text-2xl font-bold tabular-nums text-[#E6EDF3]">{formatBRL(totals.paid)}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-[#484F58] mb-2">Protegido</p>
            <p className="text-2xl font-bold tabular-nums text-[#F0A500]">{formatBRL(totals.escrow)}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-[#484F58] mb-2">Taxa plataforma paga</p>
            <p className="text-2xl font-bold tabular-nums text-[#8B949E]">{formatBRL(totals.fees)}</p>
          </Card>
        </div>

        {/* Pending payment alert */}
        {pendingAlert && (
          <div className="bg-[#1B6CB8]/10 border border-[#1B6CB8]/30 rounded-[14px] p-5 flex gap-4 items-center mb-6">
            <CreditCard className="w-7 h-7 text-[#3B89D4]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#E6EDF3]">
                Frete SG-{String(pendingAlert.freight_id).slice(0, 8).toUpperCase()} aguardando pagamento
              </p>
              <p className="text-xs text-[#8B949E] mt-1">
                Bloqueie {formatBRL(Number(pendingAlert.total_amount_brl))} protegido para ativar o contrato
              </p>
            </div>
            <Link
              to="/shipper/payment/$contractId"
              params={{ contractId: pendingAlert.id }}
            >
              <Button size="sm">Pagar agora →</Button>
            </Link>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-44"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
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

        {/* Payments table */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Spinner /></div>
          ) : !filtered.length ? (
            <EmptyState icon={CreditCard} title="Nenhum pagamento este mês" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated text-[#8B949E] text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Data</th>
                  <th className="text-left px-4 py-2">Frete</th>
                  <th className="text-left px-4 py-2">Rota</th>
                  <th className="text-left px-4 py-2">Transportadora</th>
                  <th className="text-right px-4 py-2">Valor frete</th>
                  <th className="text-right px-4 py-2">Taxa (3,5%)</th>
                  <th className="text-right px-4 py-2">Total</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const f = p.contracts?.freights;
                  const carrier = p.carrier_company?.trade_name ?? p.carrier_company?.name ?? "—";
                  return (
                    <tr key={p.id} className="border-t border-[#30363D] hover:bg-[#161B22]">
                      <td className="px-4 py-3 text-xs text-[#8B949E]">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "—"}
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
                      <td className="px-4 py-3 text-xs text-[#C9D1D9]">
                        {f?.origin_city ?? "—"} → {f?.dest_city ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#C9D1D9]">{carrier}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#C9D1D9]">
                        {formatBRL(Number(p.amount_brl ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs text-[#8B949E]">
                        {formatBRL(Number(p.platform_fee_brl ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-[#E6EDF3]">
                        {formatBRL(Number(p.amount_brl ?? 0) + Number(p.platform_fee_brl ?? 0))}
                      </td>
                      <td className="px-4 py-3"><PayBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {p.contract_id && (
                          <Link to="/shipper/contracts/$id" params={{ id: String(p.contract_id) }}>
                            <Button variant="ghost" size="sm">Ver contrato</Button>
                          </Link>
                        )}
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

function PayBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string; icon?: typeof Lock }> = {
    pending: { label: "Pendente", cls: "bg-[#21262D] text-[#8B949E]" },
    escrow_held: { label: "Protegido", cls: "bg-[#F0A500]/15 text-[#F0A500]", icon: Lock },
    released: { label: "Liberado", cls: "bg-esg-green-400/15 text-esg-green-400", icon: Check },
    disputed: { label: "Em disputa", cls: "bg-red-500/15 text-red-400" },
  };
  const s = map[status ?? "pending"] ?? map.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${s.cls}`}>
      {Icon && <Icon className="w-3 h-3" />} {s.label}
    </span>
  );
}
