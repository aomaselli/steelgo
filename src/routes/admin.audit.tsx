import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge, Button, Input, Select, Avatar, Modal } from "@/components/steel";
import { Download, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/audit")({
  component: AuditPage,
});

type AuditEntry = {
  id: string;
  ts: string;
  table: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  user: string;
  ip: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

// Mock log — wire up real audit triggers in a separate migration.
const MOCK: AuditEntry[] = [
  {
    id: "1",
    ts: new Date(Date.now() - 5 * 60000).toISOString(),
    table: "contracts",
    action: "UPDATE",
    user: "admin@steelgo.com",
    ip: "200.198.12.4",
    old_data: { status: "disputed", escrow_status: "escrow_held" },
    new_data: { status: "completed", escrow_status: "released" },
  },
  {
    id: "2",
    ts: new Date(Date.now() - 22 * 60000).toISOString(),
    table: "companies",
    action: "UPDATE",
    user: "admin@steelgo.com",
    ip: "200.198.12.4",
    old_data: { is_verified: false },
    new_data: { is_verified: true },
  },
  {
    id: "3",
    ts: new Date(Date.now() - 60 * 60000).toISOString(),
    table: "freights",
    action: "INSERT",
    user: "carlos@usiminas.com",
    ip: "189.4.55.22",
    old_data: null,
    new_data: { id: "f_abc123", status: "published", weight_tons: 28 },
  },
];

function AuditPage() {
  const [tableFilter, setTableFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [diff, setDiff] = useState<AuditEntry | null>(null);

  const filtered = useMemo(() => {
    return MOCK.filter((r) => {
      if (tableFilter !== "all" && r.table !== tableFilter) return false;
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (userSearch && !r.user.toLowerCase().includes(userSearch.toLowerCase())) return false;
      return true;
    });
  }, [tableFilter, actionFilter, userSearch]);

  function exportCsv() {
    const rows = [
      ["Timestamp", "Tabela", "Ação", "Usuário", "IP"],
      ...filtered.map((r) => [r.ts, r.table, r.action, r.user, r.ip]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit-${Date.now()}.csv`;
    a.click();
  }

  const actionBadge = {
    INSERT: "bg-esg-green/20 text-esg-green-400",
    UPDATE: "bg-steel-blue/20 text-steel-blue-200",
    DELETE: "bg-red-900/30 text-red-400",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-graphite-50">Log de auditoria</h1>
        <Button variant="ghost" size="sm" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-amber-700/40 bg-amber-900/10 p-3 text-xs text-amber-300">
        <ShieldAlert className="mt-0.5 h-4 w-4" />
        Este log é imutável. Registros não podem ser alterados ou excluídos.
      </div>

      <div className="flex flex-wrap gap-3 rounded-[12px] border border-graphite-600 bg-bg-surface p-4">
        <Select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
          <option value="all">Todas as tabelas</option>
          <option value="contracts">contracts</option>
          <option value="freights">freights</option>
          <option value="companies">companies</option>
          <option value="user_roles">user_roles</option>
        </Select>
        <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="all">Todas as ações</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </Select>
        <Input
          placeholder="Buscar usuário..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="min-w-[200px]"
        />
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-graphite-600 bg-bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-graphite-400">
              <th className="px-3 py-3">Timestamp</th>
              <th className="px-3 py-3">Tabela</th>
              <th className="px-3 py-3">Ação</th>
              <th className="px-3 py-3">Usuário</th>
              <th className="px-3 py-3">IP</th>
              <th className="px-3 py-3 text-right">Alterações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-bg-elevated">
                <td className="px-3 py-3 font-mono text-xs text-graphite-300">
                  {new Date(r.ts).toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-3">
                  <span className="rounded bg-bg-elevated px-2 py-0.5 font-mono text-xs">{r.table}</span>
                </td>
                <td className="px-3 py-3">
                  <span className={cn("rounded px-2 py-0.5 text-xs font-bold", actionBadge[r.action])}>
                    {r.action.slice(0, 3)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.user} size="sm" />
                    <span className="text-xs text-graphite-200">{r.user}</span>
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-graphite-400">{r.ip}</td>
                <td className="px-3 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setDiff(r)}>
                    Ver diff →
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!diff} onClose={() => setDiff(null)} title="Diferenças">
        {diff && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-red-400">Antes</h4>
              <pre className="rounded border border-red-900/40 bg-red-950/20 p-3 text-xs text-graphite-200">
                {JSON.stringify(diff.old_data, null, 2)}
              </pre>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase text-esg-green-400">Depois</h4>
              <pre className="rounded border border-esg-green/40 bg-esg-green/10 p-3 text-xs text-graphite-200">
                {JSON.stringify(diff.new_data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      <Badge variant="default">{filtered.length} registros</Badge>
    </div>
  );
}
