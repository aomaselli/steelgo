import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, EmptyState, Input, Modal, Select, Spinner } from "@/components/steel";
import { maskCPF } from "@/lib/masks";

export const Route = createFileRoute("/carrier/drivers")({
  component: DriversPage,
});

const CNH_CATEGORIES = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];

function DriversPage() {
  const { company } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", cpf: "", cnh_number: "", cnh_category: "C", cnh_expiry: "", has_mopp: false });

  const { data: carrier } = useQuery({
    queryKey: ["carrier-self", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase.from("carriers").select("id").eq("company_id", company!.id).maybeSingle();
      return data;
    },
  });

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["carrier-drivers", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("*").eq("carrier_id", carrier!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const save = async () => {
    if (!carrier) return;
    if (!form.full_name) { toast.error("Informe o nome do motorista"); return; }
    const { error } = await supabase.from("drivers").insert({
      carrier_id: carrier.id,
      full_name: form.full_name,
      cpf: form.cpf || null,
      cnh_number: form.cnh_number || null,
      cnh_category: form.cnh_category,
      cnh_expiry: form.cnh_expiry || null,
      has_mopp: form.has_mopp,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Motorista cadastrado");
    setOpen(false);
    setForm({ full_name: "", cpf: "", cnh_number: "", cnh_category: "C", cnh_expiry: "", has_mopp: false });
    qc.invalidateQueries({ queryKey: ["carrier-drivers", carrier.id] });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-graphite-50">Motoristas</h1>
          <p className="text-graphite-200 mt-1">Cadastre seus motoristas e CNHs</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Adicionar motorista</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : !drivers?.length ? (
        <EmptyState icon={UserIcon} title="Nenhum motorista" description="Adicione seu primeiro motorista."
          action={<Button onClick={() => setOpen(true)}>Adicionar motorista</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated text-graphite-400 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Nome</th>
                <th className="text-left px-4 py-2">CPF</th>
                <th className="text-left px-4 py-2">CNH</th>
                <th className="text-left px-4 py-2">Cat.</th>
                <th className="text-left px-4 py-2">Validade</th>
                <th className="text-left px-4 py-2">MOPP</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.id} className="border-t border-graphite-700">
                  <td className="px-4 py-3 text-graphite-100">{d.full_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-graphite-200">{d.cpf ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-graphite-200">{d.cnh_number ?? "—"}</td>
                  <td className="px-4 py-3 text-graphite-100">{d.cnh_category ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-graphite-200">{d.cnh_expiry ? new Date(d.cnh_expiry).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3">{d.has_mopp ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-400">Sim</span> : <span className="text-xs text-graphite-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Adicionar motorista">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-graphite-200 block mb-1">Nome completo</label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">CPF</label>
            <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">CNH</label>
            <Input value={form.cnh_number} onChange={(e) => setForm({ ...form, cnh_number: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">Categoria</label>
            <Select value={form.cnh_category} onChange={(e) => setForm({ ...form, cnh_category: e.target.value })}>
              {CNH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">Validade CNH</label>
            <Input type="date" value={form.cnh_expiry} onChange={(e) => setForm({ ...form, cnh_expiry: e.target.value })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-graphite-100">
            <input type="checkbox" checked={form.has_mopp} onChange={(e) => setForm({ ...form, has_mopp: e.target.checked })} />
            Possui certificação MOPP (cargas perigosas)
          </label>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
