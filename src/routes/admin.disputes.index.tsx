import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DisputeListPage } from "@/pages/shared/DisputeListPage";

export const Route = createFileRoute("/admin/disputes/")({
  component: DisputesPage,
});

// Modulo 2: a Central de disputas le EXCLUSIVAMENTE por RPC sanitizada
// (list_dispute_cases) e o detalhe/acoes ficam em /admin/disputes/$id. Toda
// escrita passa por RPC - nao ha UPDATE direto aqui.
function DisputesPage() {
  const [scope, setScope] = useState<"all" | "mine" | "unassigned">("all");
  return (
    <DisputeListPage
      title="Central de disputas"
      scope={scope}
      scopeSwitch={
        <div className="flex gap-1 text-xs">
          {(
            [
              ["all", "Todas"],
              ["mine", "Minhas"],
              ["unassigned", "Sem analista"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setScope(k)}
              className={`rounded-md px-3 py-1 ${scope === k ? "bg-steel-blue-100 text-steel-blue-400" : "text-graphite-400 hover:bg-bg-elevated"}`}
            >
              {label}
            </button>
          ))}
        </div>
      }
      renderLink={(r) => (
        <Link
          to="/admin/disputes/$id"
          params={{ id: r.case_id }}
          className="font-mono font-semibold text-steel-blue-300 hover:underline"
        >
          {r.case_number}
        </Link>
      )}
    />
  );
}
