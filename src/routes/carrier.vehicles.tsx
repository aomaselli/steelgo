import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Truck as TruckIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/lib/i18n";
import { Button, Card, EmptyState, Input, Modal, Select, Spinner } from "@/components/steel";
import { TRUCK_TYPES, formatNum } from "@/lib/steel";
import { maskPlate } from "@/lib/masks";

export const Route = createFileRoute("/carrier/vehicles")({
  component: VehiclesPage,
});

function VehiclesPage() {
  const { company } = useAuth();
  const { t } = useLanguage();
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
          <h1 className="text-2xl font-bold text-[#10274A]">{t("carrierFleet.title")}</h1>
          <p className="text-[#5B6B80] mt-1">{t("carrierFleet.subtitle")}</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> {t("carrierFleet.addTruck")}</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : !trucks?.length ? (
        <EmptyState icon={TruckIcon} title={t("carrierFleet.emptyTitle")} description={t("carrierFleet.emptyDesc")}
          action={<Button onClick={() => setOpen(true)}>{t("carrierFleet.addTruck")}</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trucks.map((truck) => (
            <Card key={truck.id} className="p-4 space-y-2 border-[#E3EAF3] bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-[#10274A] tracking-wider">{truck.plate ?? "—"}</div>
                  <div className="text-xs text-[#5B6B80]">{truck.brand ?? "—"} {truck.model ?? ""} {truck.year ?? ""}</div>
                </div>
                {truck.is_ev && <span className="text-xs px-2 py-0.5 rounded-full bg-esg-green-400/20 text-esg-green-400">Verde</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#E3EAF3]">
                <div><div className="text-[#5B6B80]">{t("carrierFleet.type")}</div><div className="text-[#10274A] capitalize">{truck.type ?? "—"}</div></div>
                <div><div className="text-[#5B6B80]">{t("carrierFleet.capacity")}</div><div className="text-[#10274A] tabular-nums">{formatNum(truck.capacity_tons)} t</div></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t("carrierFleet.modalTitle")}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-[#5B6B80] block mb-1">{t("carrierFleet.plate")}</label>
            <Input value={form.plate} onChange={(e) => setForm({ ...form, plate: maskPlate(e.target.value) })} placeholder="ABC-1D23" />
          </div>
          <div>
            <label className="text-xs text-[#5B6B80] block mb-1">{t("carrierFleet.brand")}</label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-[#5B6B80] block mb-1">{t("carrierFleet.model")}</label>
            <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-[#5B6B80] block mb-1">{t("carrierFleet.year")}</label>
            <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-[#5B6B80] block mb-1">{t("carrierFleet.type")}</label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TRUCK_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-[#5B6B80] block mb-1">{t("carrierFleet.capacity")}</label>
            <Input type="number" value={form.capacity_tons} onChange={(e) => setForm({ ...form, capacity_tons: e.target.value })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-[#10274A]">
            <input type="checkbox" checked={form.is_ev} onChange={(e) => setForm({ ...form, is_ev: e.target.checked })} />
            {t("carrierFleet.isElectric")}
          </label>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
