import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Banknote,
  Clock3,
  MapPin,
  Radio,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Scope = "admin" | "shipper" | "carrier";

interface OperationsBoardProps {
  scope: Scope;
  companyId?: string;
}

type OperationalRow = {
  id: string;
  contractNumber: string;
  status: string;
  freightStatus: string;
  route: string;
  pickupDate: string | null;
  driver: string;
  amount: number;
  paymentStatus: string;
  lastSignal: string | null;
  alertCount: number;
};

const ACTIVE_STATUSES = [
  "draft",
  "awaiting_shipper_signature",
  "awaiting_carrier_signature",
  "active",
  "disputed",
];

const STATUS_LABEL: Record<string, string> = {
  draft: "Em preparação",
  awaiting_shipper_signature: "Assinatura embarcador",
  awaiting_carrier_signature: "Assinatura transportadora",
  active: "Em andamento",
  completed: "Concluído",
  disputed: "Em disputa",
  cancelled: "Cancelado",
};

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function relativeSignal(value: string | null) {
  if (!value) return "Sem sinal";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

function signalRisk(value: string | null) {
  if (!value) return true;
  return Date.now() - new Date(value).getTime() > 15 * 60 * 1000;
}

export function OperationsBoard({ scope, companyId }: OperationsBoardProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "attention" | "active">("all");
  const isLight = scope === "admin";

  const { data: rows = [], isLoading, isError } = useQuery({
    queryKey: ["operations-board", scope, companyId],
    enabled: scope === "admin" || Boolean(companyId),
    refetchInterval: 30_000,
    queryFn: async (): Promise<OperationalRow[]> => {
      let contractsQuery = supabase
        .from("contracts")
        .select("id, contract_number, status, total_amount_brl, carrier_payout_brl, driver_id, created_at, freights(id, status, origin_city, origin_state, dest_city, dest_state, pickup_date, final_price_brl)")
        .in("status", ACTIVE_STATUSES as any)
        .order("created_at", { ascending: false })
        .limit(100);

      if (scope === "shipper") {
        contractsQuery = contractsQuery.eq("shipper_company_id", companyId!);
      }
      if (scope === "carrier") {
        contractsQuery = contractsQuery.eq("carrier_company_id", companyId!);
      }

      const { data: contracts, error: contractsError } = await contractsQuery;
      if (contractsError) throw contractsError;
      if (!contracts?.length) return [];

      const contractIds = contracts.map((contract) => contract.id);
      const driverIds = contracts
        .map((contract) => contract.driver_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      const [positionsResult, alertsResult, paymentsResult, driversResult] = await Promise.all([
        supabase
          .from("driver_positions")
          .select("contract_id, updated_at")
          .in("contract_id", contractIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("security_alerts")
          .select("contract_id")
          .in("contract_id", contractIds)
          .is("resolved_at", null),
        supabase
          .from("payments")
          .select("contract_id, status")
          .in("contract_id", contractIds),
        driverIds.length
          ? supabase.from("drivers").select("id, full_name").in("id", driverIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const latestSignal = new Map<string, string>();
      for (const position of positionsResult.data ?? []) {
        if (position.contract_id && position.updated_at && !latestSignal.has(position.contract_id)) {
          latestSignal.set(position.contract_id, position.updated_at);
        }
      }

      const alertCount = new Map<string, number>();
      for (const alert of alertsResult.data ?? []) {
        if (!alert.contract_id) continue;
        alertCount.set(alert.contract_id, (alertCount.get(alert.contract_id) ?? 0) + 1);
      }

      const paymentStatus = new Map<string, string>();
      for (const payment of paymentsResult.data ?? []) {
        if (payment.contract_id) paymentStatus.set(payment.contract_id, payment.status ?? "pending");
      }

      const driverNames = new Map<string, string>();
      for (const driver of driversResult.data ?? []) {
        driverNames.set(driver.id, driver.full_name ?? "Motorista");
      }

      return contracts.map((contract: any) => {
        const freight = Array.isArray(contract.freights) ? contract.freights[0] : contract.freights;
        const origin = [freight?.origin_city, freight?.origin_state].filter(Boolean).join("/") || "Origem pendente";
        const destination = [freight?.dest_city, freight?.dest_state].filter(Boolean).join("/") || "Destino pendente";
        return {
          id: contract.id,
          contractNumber: contract.contract_number || String(contract.id).slice(0, 8).toUpperCase(),
          status: contract.status ?? "draft",
          freightStatus: freight?.status ?? "draft",
          route: `${origin} → ${destination}`,
          pickupDate: freight?.pickup_date ?? null,
          driver: contract.driver_id ? (driverNames.get(contract.driver_id) ?? "Motorista") : "Não designado",
          amount: Number(contract.total_amount_brl ?? freight?.final_price_brl ?? 0),
          paymentStatus: paymentStatus.get(contract.id) ?? "pending",
          lastSignal: latestSignal.get(contract.id) ?? null,
          alertCount: alertCount.get(contract.id) ?? 0,
        };
      });
    },
  });

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => {
      const attention = row.alertCount > 0 || signalRisk(row.lastSignal) || row.driver === "Não designado";
      if (filter === "attention" && !attention) return false;
      if (filter === "active" && row.status !== "active") return false;
      if (!term) return true;
      return `${row.contractNumber} ${row.route} ${row.driver}`.toLocaleLowerCase("pt-BR").includes(term);
    });
  }, [filter, rows, search]);

  const attentionCount = rows.filter(
    (row) => row.alertCount > 0 || signalRisk(row.lastSignal) || row.driver === "Não designado",
  ).length;
  const activeCount = rows.filter((row) => row.status === "active").length;

  const shell = isLight
    ? "border-[#E6EAF0] bg-white text-[#16263F] shadow-[0_8px_24px_rgba(16,28,48,0.06)]"
    : "border-[#30363D] bg-[#161B22] text-[#E6EDF3]";
  const muted = isLight ? "text-[#5B6B80]" : "text-[#8B949E]";
  const divider = isLight ? "border-[#E6EAF0]" : "border-[#30363D]";

  return (
    <section className={`overflow-hidden rounded-[16px] border ${shell}`}>
      <div className={`border-b px-5 py-4 ${divider}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-[#1B6CB8]" />
              <h2 className="font-semibold">Acompanhamento operacional</h2>
            </div>
            <p className={`mt-1 text-sm ${muted}`}>Viagens ordenadas para ação, do aceite à liberação financeira</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[#1B6CB8]/10 px-3 py-1.5 font-medium text-[#1B6CB8]">{activeCount} em andamento</span>
            <span className={`rounded-full px-3 py-1.5 font-medium ${attentionCount ? "bg-[#E0A23A]/15 text-[#B7791F]" : "bg-[#2FA98A]/10 text-[#1A7D60]"}`}>
              {attentionCount} exigem atenção
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <label className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${muted}`} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar contrato, rota ou motorista"
              className={`h-10 w-full rounded-[10px] border bg-transparent pl-9 pr-3 text-sm outline-none focus:border-[#1B6CB8] ${divider}`}
            />
          </label>
          <div className={`flex overflow-hidden rounded-[10px] border ${divider}`}>
            {(["all", "attention", "active"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`px-3 py-2 text-xs font-medium transition ${filter === value ? "bg-[#1B6CB8] text-white" : muted}`}
              >
                {value === "all" ? "Todas" : value === "attention" ? "Atenção" : "Em andamento"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className={`border-b text-[11px] uppercase tracking-wide ${divider} ${muted}`}>
            <tr>
              <th className="px-5 py-3">Prioridade</th>
              <th className="px-3 py-3">Viagem e rota</th>
              <th className="px-3 py-3">Etapa</th>
              <th className="px-3 py-3">Motorista</th>
              <th className="px-3 py-3">Último sinal</th>
              <th className="px-3 py-3">Financeiro</th>
              <th className="px-5 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const attention = row.alertCount > 0 || signalRisk(row.lastSignal) || row.driver === "Não designado";
              return (
                <tr key={row.id} className={`border-b last:border-b-0 ${divider}`}>
                  <td className="px-5 py-4">
                    {attention ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#E0A23A]/15 px-2 py-1 text-xs font-medium text-[#B7791F]">
                        <AlertTriangle className="h-3.5 w-3.5" /> Atenção
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#2FA98A]/10 px-2 py-1 text-xs font-medium text-[#1A7D60]">
                        <ShieldCheck className="h-3.5 w-3.5" /> Normal
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <div className="font-mono text-xs font-semibold text-[#1B6CB8]">#{row.contractNumber}</div>
                    <div className="mt-1 flex items-center gap-1.5 font-medium"><MapPin className="h-3.5 w-3.5 text-[#2FA98A]" />{row.route}</div>
                    <div className={`mt-1 text-xs ${muted}`}>{row.pickupDate ? `Coleta ${new Date(row.pickupDate).toLocaleDateString("pt-BR")}` : "Coleta a confirmar"}</div>
                  </td>
                  <td className="px-3 py-4"><span className="rounded-full bg-[#1B6CB8]/10 px-2 py-1 text-xs font-medium text-[#1B6CB8]">{STATUS_LABEL[row.status] ?? row.status}</span></td>
                  <td className="px-3 py-4"><div className="flex items-center gap-2"><UserRound className={`h-4 w-4 ${muted}`} /><span>{row.driver}</span></div></td>
                  <td className="px-3 py-4">
                    <div className={`flex items-center gap-2 ${signalRisk(row.lastSignal) ? "text-[#B74545]" : "text-[#1A7D60]"}`}>
                      <Radio className="h-4 w-4" />{relativeSignal(row.lastSignal)}
                    </div>
                    {row.alertCount > 0 && <div className="mt-1 text-xs text-[#B74545]">{row.alertCount} alerta(s)</div>}
                  </td>
                  <td className="px-3 py-4"><div className="flex items-center gap-2"><Banknote className={`h-4 w-4 ${muted}`} /><span className="capitalize">{row.paymentStatus.replaceAll("_", " ")}</span></div></td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums">{formatBRL(row.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isLoading && !isError && filteredRows.length === 0 && (
        <div className={`flex min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center ${muted}`}>
          <Clock3 className="h-7 w-7" />
          <p className="font-medium">Nenhuma viagem encontrada neste filtro</p>
          <p className="text-xs">As viagens aparecerão aqui assim que um contrato entrar no fluxo operacional.</p>
        </div>
      )}
      {isLoading && <div className={`px-6 py-12 text-center text-sm ${muted}`}>Carregando operação…</div>}
      {isError && <div className="px-6 py-12 text-center text-sm text-[#B74545]">Não foi possível consultar o acompanhamento operacional.</div>}
    </section>
  );
}
