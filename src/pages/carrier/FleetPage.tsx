import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Plus,
  Scale,
  Truck as TruckIcon,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Spinner,
} from "@/components/steel";
import { formatNum } from "@/lib/steel";

type TruckType =
  | "truck"
  | "truck_simples"
  | "toco"
  | "bitruck"
  | "carreta"
  | "carreta_extendida"
  | "bitrem"
  | "rodotrem"
  | "ev_truck"
  | "ev_carreta";

const TRUCK_TYPE_OPTIONS: { id: TruckType; label: string; capacity: number }[] = [
  { id: "toco", label: "Toco", capacity: 6 },
  { id: "truck", label: "Truck", capacity: 14 },
  { id: "truck_simples", label: "Truck Simples", capacity: 12 },
  { id: "bitruck", label: "Bitruck", capacity: 17 },
  { id: "carreta", label: "Carreta", capacity: 33 },
  { id: "carreta_extendida", label: "Carreta Estendida", capacity: 40 },
  { id: "bitrem", label: "Bitrem", capacity: 57 },
  { id: "rodotrem", label: "Rodotrem", capacity: 74 },
  { id: "ev_truck", label: "⚡ Truck Elétrico", capacity: 14 },
  { id: "ev_carreta", label: "⚡ Carreta Elétrica", capacity: 33 },
];

function truckLabel(t?: string | null) {
  return TRUCK_TYPE_OPTIONS.find((o) => o.id === t)?.label ?? t ?? "—";
}

const FUEL_CO2: Record<string, number> = {
  diesel: 0.0892,
  biodiesel_b20: 0.071,
  biodiesel_b100: 0.0321,
  hibrido: 0.058,
  eletrico: 0,
};

export function FleetPage() {
  const { company } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // Form state
  const [plate, setPlate] = useState("");
  const [type, setType] = useState<TruckType>("truck");
  const [capacity, setCapacity] = useState("");
  const [year, setYear] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [isEv, setIsEv] = useState(false);
  const [autonomy, setAutonomy] = useState("");
  const [fuel, setFuel] = useState("diesel");
  const [co2, setCo2] = useState("0.0892");
  const [crlvFile, setCrlvFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: carrier } = useQuery({
    queryKey: ["carrier-self", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("carriers")
        .select("*")
        .eq("company_id", company!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: trucks, isLoading } = useQuery({
    queryKey: ["fleet-trucks", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("trucks")
        .select("*")
        .eq("carrier_id", carrier!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const total = trucks?.length ?? 0;
  const evCount = (trucks ?? []).filter((t) => t.is_ev).length;
  const activeCount = total; // is_active not in schema; treat all as active
  const capSum = (trucks ?? []).reduce(
    (s, t) => s + Number(t.max_weight_tons ?? t.capacity_tons ?? 0),
    0,
  );

  const formatPlate = (v: string) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const letters = cleaned.slice(0, 3);
    const rest = cleaned.slice(3, 7);
    return rest ? `${letters}-${rest}` : letters;
  };

  const onFuelChange = (f: string) => {
    setFuel(f);
    setCo2(String(FUEL_CO2[f] ?? 0.0892));
    if (f === "eletrico" || f === "hibrido") setIsEv(true);
  };

  const reset = () => {
    setPlate("");
    setType("truck");
    setCapacity("");
    setYear("");
    setBrand("");
    setModel("");
    setIsEv(false);
    setAutonomy("");
    setFuel("diesel");
    setCo2("0.0892");
    setCrlvFile(null);
  };

  const save = async () => {
    if (!carrier || !company) return;
    if (!plate || plate.length < 7) {
      toast.error("Placa inválida");
      return;
    }
    setSaving(true);
    try {
      let crlvUrl: string | null = null;
      if (crlvFile) {
        const ext = crlvFile.name.split(".").pop();
        const path = `${company.id}/crlv_${plate.replace("-", "")}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("truck-docs")
          .upload(path, crlvFile, { upsert: true });
        if (upErr) throw upErr;
        crlvUrl = path;
      }
      const { error } = await supabase.from("trucks").insert({
        carrier_id: carrier.id,
        plate,
        type,
        capacity_tons: capacity ? Number(capacity) : null,
        max_weight_tons: capacity ? Number(capacity) : null,
        year: year ? Number(year) : null,
        brand: brand || null,
        model: model || null,
        is_ev: isEv,
        co2_per_km: co2 ? Number(co2) : null,
        crlv_url: crlvUrl,
      } as never);
      if (error) throw error;
      toast.success("Caminhão adicionado!");
      reset();
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["fleet-trucks", carrier.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#E6EDF3]">Minha Frota</h1>
          <p className="text-sm text-[#8B949E] mt-1">
            Gerencie seus caminhões e documentos
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" /> Adicionar caminhão
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase text-[#484F58] mb-1">
            Total de caminhões
          </div>
          <div className="text-2xl font-bold text-[#E6EDF3] tabular-nums">
            {total}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-[#484F58] mb-1">
            Caminhões elétricos
          </div>
          <div className="text-2xl font-bold text-[#2ECC8A] tabular-nums">
            {evCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-[#484F58] mb-1">Ativos</div>
          <div className="text-2xl font-bold text-[#2ECC8A] tabular-nums">
            {activeCount}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-[#484F58] mb-1">
            Capacidade total
          </div>
          <div className="text-2xl font-bold text-[#79B8F8] tabular-nums">
            {formatNum(capSum)} t
          </div>
        </Card>
      </div>

      {/* Truck list */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : !trucks?.length ? (
        <Card className="p-8">
          <EmptyState
            icon={TruckIcon}
            title="Nenhum caminhão cadastrado"
            description="Adicione caminhões à sua frota para começar a aceitar fretes."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4" /> Adicionar caminhão
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {trucks.map((t) => (
            <Card key={t.id} className="p-5 relative">
              <div className="flex justify-between items-start gap-2">
                <span className="text-lg font-bold font-mono text-[#E6EDF3]">
                  {t.plate ?? "—"}
                </span>
                {t.is_ev && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#1A9B5E]/20 text-[#2ECC8A]">
                    ⚡ EV
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-sm text-[#C9D1D9]">
                  <TruckIcon className="w-3.5 h-3.5 text-[#484F58]" />
                  {truckLabel(t.type)}
                </span>
                {t.max_weight_tons && (
                  <span className="inline-flex items-center gap-1 text-sm text-[#8B949E] ml-2">
                    <Scale className="w-3.5 h-3.5" />
                    {formatNum(t.max_weight_tons)} t
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-col gap-1 text-xs text-[#484F58]">
                {(t.brand || t.model || t.year) && (
                  <div>
                    {[t.brand, t.model, t.year].filter(Boolean).join(" · ")}
                  </div>
                )}
                {t.co2_per_km != null && (
                  <div>CO₂: {Number(t.co2_per_km).toFixed(4)} kg/km</div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-[#30363D] space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  {t.crlv_url ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#2ECC8A]" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-[#C23333]" />
                  )}
                  <span className="text-[#8B949E]">CRLV</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#8B949E]" />
                  <span className="text-[#8B949E]">Inspeção em dia</span>
                </div>
              </div>

              <div className="flex gap-2 mt-3">
                <Button variant="ghost" size="sm">
                  Editar
                </Button>
                <Button variant="ghost" size="sm" className="text-[#F87171]">
                  Desativar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Truck Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Adicionar caminhão"
        className="max-w-2xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-[#8B949E] block mb-1">
              Placa *
            </label>
            <Input
              placeholder="ABC-1234"
              value={plate}
              onChange={(e) => setPlate(formatPlate(e.target.value))}
              maxLength={8}
            />
          </div>
          <div>
            <label className="text-xs text-[#8B949E] block mb-1">Tipo *</label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as TruckType)}
            >
              {TRUCK_TYPE_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} (até {t.capacity}t)
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs text-[#8B949E] block mb-1">
              Capacidade (t)
            </label>
            <Input
              type="number"
              min={1}
              max={74}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-[#8B949E] block mb-1">Ano</label>
            <Input
              type="number"
              min={2000}
              max={2025}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-[#8B949E] block mb-1">Marca</label>
            <Input
              placeholder="Volvo"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-[#8B949E] block mb-1">Modelo</label>
            <Input
              placeholder="FH 540"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>

          <label className="md:col-span-2 flex items-center gap-2 text-sm text-[#C9D1D9]">
            <input
              type="checkbox"
              className="accent-[#1A9B5E]"
              checked={isEv}
              onChange={(e) => setIsEv(e.target.checked)}
            />
            É elétrico?
          </label>

          {isEv && (
            <div>
              <label className="text-xs text-[#8B949E] block mb-1">
                Autonomia (km)
              </label>
              <Input
                type="number"
                value={autonomy}
                onChange={(e) => setAutonomy(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="text-xs text-[#8B949E] block mb-1">
              Tipo de combustível
            </label>
            <Select value={fuel} onChange={(e) => onFuelChange(e.target.value)}>
              <option value="diesel">Diesel</option>
              <option value="biodiesel_b20">Biodiesel B20</option>
              <option value="biodiesel_b100">Biodiesel B100</option>
              <option value="hibrido">Híbrido</option>
              <option value="eletrico">Elétrico</option>
            </Select>
          </div>
          <div>
            <label className="text-xs text-[#8B949E] block mb-1">
              CO₂ por km (kg)
            </label>
            <Input
              type="number"
              step={0.0001}
              value={co2}
              onChange={(e) => setCo2(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-[#8B949E] block mb-1">
              CRLV (PDF ou JPG)
            </label>
            <label className="block border-2 border-dashed border-[#30363D] rounded-[10px] p-4 text-center text-xs text-[#8B949E] cursor-pointer hover:border-[#484F58]">
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => setCrlvFile(e.target.files?.[0] ?? null)}
              />
              {crlvFile ? crlvFile.name : "Arraste o CRLV ou clique para selecionar"}
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-[#30363D]">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="green" onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar caminhão"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
