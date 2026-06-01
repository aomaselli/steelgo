import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Button, Input, Select } from "@/components/steel";
import { Download, MoreVertical, Search } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/admin/freights")({
  component: AdminFreightsPage,
});

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function AdminFreightsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data = [] } = useQuery({
    queryKey: ["admin-freights"],
    queryFn: async () => {
      const { data } = await supabase
        .from("freights")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return data.filter((f) => {
      if (search) {
        const q = search.toLowerCase();
        const blob = `${f.id} ${f.origin_city ?? ""} ${f.dest_city ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (categoryFilter !== "all" && f.category !== categoryFilter) return false;
      return true;
    });
  }, [data, search, statusFilter, categoryFilter]);

  function toggle(id: string) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  }

  async function bulkCancel() {
    await supabase
      .from("freights")
      .update({ status: "cancelled" })
      .in("id", Array.from(selectedIds));
    toast.success(`${selectedIds.size} frete(s) cancelado(s)`);
    setSelectedIds(new Set());
    qc.invalidateQueries({ queryKey: ["admin-freights"] });
  }

  function exportCsv() {
    const rows = [
      ["ID", "Origem", "Destino", "Peso(t)", "Status", "Valor"],
      ...filtered.map((f) => [
        f.id,
        f.origin_city ?? "",
        f.dest_city ?? "",
        f.weight_tons ?? "",
        f.status ?? "",
        f.final_price_brl ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `freights-${Date.now()}.csv`;
    a.click();
  }

  async function cancelOne(id: string) {
    await supabase.from("freights").update({ status: "cancelled" }).eq("id", id);
    toast.success("Frete cancelado");
    qc.invalidateQueries({ queryKey: ["admin-freights"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-graphite-50">Todos os fretes</h1>
          <Badge variant="blue">{filtered.length}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 rounded-[12px] border border-graphite-600 bg-bg-surface p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <Input
            placeholder="Buscar por ID, rota..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="published">Publicado</option>
          <option value="bidding">Em leilão</option>
          <option value="contracted">Contratado</option>
          <option value="in_transit">Em trânsito</option>
          <option value="completed">Concluído</option>
          <option value="cancelled">Cancelado</option>
        </Select>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">Todas categorias</option>
          <option value="traditional">Tradicional</option>
          <option value="green_low_carbon">Verde</option>
          
        </Select>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-amber-700/50 bg-amber-900/10 p-3 text-sm">
          <span className="text-amber-300">{selectedIds.size} selecionados</span>
          <Button variant="ghost" size="sm" onClick={bulkCancel}>
            Cancelar selecionados
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-[12px] border border-graphite-600 bg-bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-graphite-400">
              <th className="w-10 px-3 py-3"></th>
              <th className="px-3 py-3">ID</th>
              <th className="px-3 py-3">Rota</th>
              <th className="px-3 py-3">Peso</th>
              <th className="px-3 py-3">Categoria</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Valor</th>
              <th className="px-3 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {filtered.map((f) => (
              <tr key={f.id} className="hover:bg-bg-elevated">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(f.id)}
                    onChange={() => toggle(f.id)}
                    className="rounded border-graphite-600"
                  />
                </td>
                <td className="px-3 py-3 font-mono text-xs text-graphite-300">{f.id.slice(0, 8)}</td>
                <td className="px-3 py-3 text-graphite-200">
                  {f.origin_city ?? "—"} → {f.dest_city ?? "—"}
                </td>
                <td className="px-3 py-3 text-graphite-200">{f.weight_tons ?? "—"} t</td>
                <td className="px-3 py-3">
                  <Badge variant={f.category === "green_low_carbon" ? "green" : "default"}>
                    {f.category}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <Badge variant="blue">{f.status}</Badge>
                </td>
                <td className="px-3 py-3 text-graphite-200">{fmtBRL(Number(f.final_price_brl ?? f.budget_brl ?? 0))}</td>
                <td className="px-3 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toast.info("Detalhes em breve")}>Ver detalhes</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => cancelOne(f.id)}>Cancelar frete</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.info("Notificação enviada")}>
                        Contatar embarcador
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-graphite-400">
                  Nenhum frete encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
