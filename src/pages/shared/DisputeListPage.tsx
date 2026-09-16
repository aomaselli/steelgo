import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Spinner } from "@/components/steel";
import {
  DISPUTE_NOTICE,
  DISPUTE_STATUS,
  PARTY_ROLE,
  REASON,
  SETTLEMENT_STATE,
  dueLabel,
} from "@/lib/disputeStatus";
import { fetchDisputeCases, rpcErrorMessage, type DisputeListRow, brl } from "@/lib/disputes";

type Tab = "active" | "decided" | "closed";
const TABS: { id: Tab; label: string; statuses: DisputeListRow["status"][] }[] = [
  { id: "active", label: "Em andamento", statuses: ["open", "under_review", "awaiting_evidence"] },
  { id: "decided", label: "Decididas (liquidação)", statuses: ["decided"] },
  { id: "closed", label: "Encerradas", statuses: ["closed", "withdrawn"] },
];

interface Props {
  title: string;
  /** admin: 'all' | 'unassigned' | 'mine' ; partes: sempre 'mine' */
  scope: "mine" | "all" | "unassigned";
  renderLink: (row: DisputeListRow) => React.ReactNode;
  scopeSwitch?: React.ReactNode;
}

export function DisputeListPage({ title, scope, renderLink, scopeSwitch }: Props) {
  const [tab, setTab] = useState<Tab>("active");
  const statuses = TABS.find((t) => t.id === tab)!.statuses;
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["dispute-list", scope, tab],
    queryFn: () => fetchDisputeCases(scope, statuses),
    refetchInterval: 60_000,
  });
  const tone = (t: string) => t as "danger" | "amber" | "green" | "blue" | "gray" | "default";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-graphite-50">{title}</h1>
        {scopeSwitch}
      </div>
      <p className="text-xs text-graphite-400">{DISPUTE_NOTICE}</p>
      <div className="flex gap-2 border-b border-graphite-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-steel-blue-400 text-steel-blue-200" : "border-transparent text-graphite-400 hover:text-graphite-100"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : error ? (
        <Card className="p-8 text-center text-sm text-red-400">
          Não foi possível listar as disputas. {rpcErrorMessage(error)}
        </Card>
      ) : data.length === 0 ? (
        <Card className="p-12 text-center text-graphite-400">Nenhuma disputa nesta categoria.</Card>
      ) : (
        <div className="space-y-2">
          {data.map((r) => {
            const st = DISPUTE_STATUS[r.status];
            const ss = SETTLEMENT_STATE[r.settlement_state as keyof typeof SETTLEMENT_STATE];
            const terminal = r.status === "closed" || r.status === "withdrawn";
            return (
              <Card key={r.case_id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {renderLink(r)}
                    <Badge variant={tone(st.tone)}>{st.label}</Badge>
                    {r.status === "decided" && ss && (
                      <Badge variant={tone(ss.tone)}>{ss.label}</Badge>
                    )}
                    {!terminal && (
                      <span
                        className={`text-xs ${r.overdue ? "text-red-400" : "text-graphite-400"}`}
                      >
                        {dueLabel(r.due_at, terminal)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-graphite-400">
                    {r.my_role !== "admin" && r.my_role && <>Você: {PARTY_ROLE[r.my_role]} · </>}
                    {r.assignee_label ? `Analista: ${r.assignee_label}` : "sem analista"}
                  </div>
                </div>
                <div className="mt-1 text-xs text-graphite-400">
                  Contrato{" "}
                  <span className="font-mono text-graphite-200">
                    {r.contract_number ?? r.contract_id.slice(0, 8)}
                  </span>{" "}
                  · {REASON[r.reason_code]} · em disputa{" "}
                  <span className="font-semibold text-graphite-200">{brl(r.disputed_amount)}</span>{" "}
                  · {r.claimant_company_name ?? "—"} × {r.respondent_company_name ?? "—"} · aberta
                  em {new Date(r.opened_at).toLocaleDateString("pt-BR")}
                  {r.settlement_due_at && (
                    <>
                      {" "}
                      · aporte da decisão até{" "}
                      {new Date(r.settlement_due_at).toLocaleDateString("pt-BR")}
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
