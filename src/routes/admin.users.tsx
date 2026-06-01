import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Button, Input, Select, Avatar } from "@/components/steel";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MoreVertical, Search } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  is_verified: boolean | null;
  is_active: boolean | null;
  created_at: string | null;
  role?: string;
};

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Row | null>(null);

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      const ids = (data ?? []).map((p) => p.id);
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
      return (data ?? []).map((p) => ({
        ...p,
        role: roles?.find((r) => r.user_id === p.id)?.role ?? "—",
      })) as Row[];
    },
  });

  const filtered = useMemo(() => {
    return profiles.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.full_name?.toLowerCase().includes(q) &&
          !p.email?.toLowerCase().includes(q) &&
          !p.cpf?.includes(q)
        )
          return false;
      }
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (statusFilter === "verified" && !p.is_verified) return false;
      if (statusFilter === "pending" && p.is_verified) return false;
      if (statusFilter === "suspended" && p.is_active !== false) return false;
      return true;
    });
  }, [profiles, search, roleFilter, statusFilter]);

  const roleColor = (role?: string): "blue" | "green" | "gray" | "danger" | "default" =>
    role === "shipper"
      ? "blue"
      : role === "carrier"
        ? "green"
        : role === "admin"
          ? "danger"
          : "gray";

  async function suspend(id: string) {
    await supabase.from("profiles").update({ is_active: false }).eq("id", id);
    toast.success("Conta suspensa");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }
  async function reactivate(id: string) {
    await supabase.from("profiles").update({ is_active: true }).eq("id", id);
    toast.success("Conta reativada");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }
  async function verify(id: string) {
    await supabase.from("profiles").update({ is_verified: true }).eq("id", id);
    toast.success("Usuário verificado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-graphite-50">Usuários</h1>
          <Badge variant="blue">{filtered.length}</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-[12px] border border-graphite-600 bg-bg-surface p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email, CPF..."
            className="pl-9"
          />
        </div>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">Todos os tipos</option>
          <option value="shipper">Embarcadores</option>
          <option value="carrier">Transportadoras</option>
          <option value="driver">Motoristas</option>
          <option value="admin">Admins</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos os status</option>
          <option value="verified">Verificados</option>
          <option value="pending">Pendentes</option>
          <option value="suspended">Suspensos</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-graphite-600 bg-bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-graphite-400">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Cadastro</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-bg-elevated">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.full_name ?? "?"} size="sm" />
                    <div>
                      <div className="font-medium text-graphite-50">{u.full_name ?? "—"}</div>
                      <div className="text-xs text-graphite-400">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={roleColor(u.role) as never}>{u.role}</Badge>
                </td>
                <td className="px-4 py-3 text-xs text-graphite-300">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="px-4 py-3">
                  {u.is_active === false ? (
                    <Badge variant="danger">Suspenso</Badge>
                  ) : u.is_verified ? (
                    <Badge variant="green">Verificado</Badge>
                  ) : (
                    <Badge variant="amber">Pendente</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(u)}>
                      Ver
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelected(u)}>Ver perfil completo</DropdownMenuItem>
                        {!u.is_verified && (
                          <DropdownMenuItem onClick={() => verify(u.id)}>Verificar manualmente</DropdownMenuItem>
                        )}
                        {u.is_active === false ? (
                          <DropdownMenuItem onClick={() => reactivate(u.id)}>Reativar conta</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => suspend(u.id)}>Suspender conta</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => toast.success("Email de redefinição enviado")}>
                          Redefinir senha
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-graphite-400">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-[480px] max-w-full overflow-y-auto bg-bg-surface text-graphite-50">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-graphite-50">{selected.full_name ?? "Usuário"}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-3">
                  <Avatar name={selected.full_name ?? "?"} size="lg" />
                  <div>
                    <Badge variant={roleColor(selected.role) as never}>{selected.role}</Badge>
                    <p className="mt-1 text-xs text-graphite-400">
                      Desde {selected.created_at ? new Date(selected.created_at).toLocaleDateString("pt-BR") : "—"}
                    </p>
                  </div>
                </div>
                <section className="space-y-2 rounded-md border border-graphite-700 p-3 text-sm">
                  <h4 className="text-xs uppercase text-graphite-400">Contato</h4>
                  <div className="text-graphite-200">{selected.email ?? "—"}</div>
                  <div className="text-graphite-200">{selected.phone ?? "—"}</div>
                  <div className="font-mono text-xs text-graphite-300">CPF: {selected.cpf ?? "—"}</div>
                </section>
                <section className="space-y-2 rounded-md border border-graphite-700 p-3 text-sm">
                  <h4 className="text-xs uppercase text-graphite-400">Status</h4>
                  <div>
                    Verificado:{" "}
                    {selected.is_verified ? (
                      <span className="text-esg-green-400">Sim</span>
                    ) : (
                      <span className="text-amber-400">Não</span>
                    )}
                  </div>
                  <div>
                    Ativo: {selected.is_active === false ? <span className="text-red-400">Não</span> : "Sim"}
                  </div>
                </section>
                <div className="flex gap-2">
                  {!selected.is_verified && (
                    <Button onClick={() => verify(selected.id)}>Verificar</Button>
                  )}
                  {selected.is_active === false ? (
                    <Button variant="outline" onClick={() => reactivate(selected.id)}>
                      Reativar
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => suspend(selected.id)}>
                      Suspender
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
