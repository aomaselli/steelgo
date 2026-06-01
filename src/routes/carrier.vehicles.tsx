import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Truck as TruckIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Card, EmptyState, Input, Modal, Select, Spinner } from "@/components/steel";
import { TRUCK_TYPES, formatNum } from "@/lib/steel";
import { maskPlate } from "@/lib/masks";

export const Route = createFileRoute("/carrier/vehicles")({
  component: VehiclesPage,
});

function VehiclesPage() {
  const { company } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ plate: "", brand: "", model: "", year: "", type: "carreta", capacity_tons: "", is_ev: false });

  const { data: carrier } = useQuery({
    queryKey: ["carrier-self", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase.from("carriers").select("id").eq("company_id", company!.id).maybeSingle();
      return data;
    },
  });

  const { data: trucks, isLoading } = useQuery({
    queryKey: ["carrier-trucks", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase.from("trucks").select("*").eq("carrier_id", carrier!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const save = async () => {
    if (!carrier) return;
    if (!form.plate) { toast.error("Informe a placa"); return; }
    const { error } = await supabase.from("trucks").insert({
      carrier_id: carrier.id,
      plate: form.plate.toUpperCase(),
      brand: form.brand || null,
      model: form.model || null,
      year: form.year ? Number(form.year) : null,
      type: form.type,
      capacity_tons: form.capacity_tons ? Number(form.capacity_tons) : null,
      is_ev: form.is_ev,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Veículo cadastrado");
    setOpen(false);
    setForm({ plate: "", brand: "", model: "", year: "", type: "carreta", capacity_tons: "", is_ev: false });
    qc.invalidateQueries({ queryKey: ["carrier-trucks", carrier.id] });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-graphite-50">Frota</h1>
          <p className="text-graphite-200 mt-1">Cadastre e gerencie seus veículos</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Adicionar veículo</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : !trucks?.length ? (
        <EmptyState icon={TruckIcon} title="Nenhum veículo" description="Adicione o primeiro caminhão da sua frota."
          action={<Button onClick={() => setOpen(true)}>Adicionar veículo</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trucks.map((t) => (
            <Card key={t.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-graphite-50 tracking-wider">{t.plate ?? "—"}</div>
                  <div className="text-xs text-graphite-400">{t.brand ?? "—"} {t.model ?? ""} {t.year ?? ""}</div>
                </div>
                {t.is_ev && <span className="text-xs px-2 py-0.5 rounded-full bg-esg-green-400/20 text-esg-green-400">Verde</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-graphite-700">
                <div><div className="text-graphite-400">Tipo</div><div className="text-graphite-100 capitalize">{t.type ?? "—"}</div></div>
                <div><div className="text-graphite-400">Capacidade</div><div className="text-graphite-100 tabular-nums">{formatNum(t.capacity_tons)} t</div></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Adicionar veículo">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-graphite-200 block mb-1">Placa</label>
            <Input value={form.plate} onChange={(e) => setForm({ ...form, plate: maskPlate(e.target.value) })} placeholder="ABC-1D23" />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">Marca</label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">Modelo</label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">Ano</label>
            <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">Tipo</label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TRUCK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">Capacidade (t)</label>
            <Input type="number" value={form.capacity_tons} onChange={(e) => setForm({ ...form, capacity_tons: e.target.value })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-graphite-100">
            <input type="checkbox" checked={form.is_ev} onChange={(e) => setForm({ ...form, is_ev: e.target.checked })} />
            Veículo elétrico ou biodiesel certificado
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
