import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Camera, Flag, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, EmptyState, Spinner, Modal, Select, Input } from "@/components/steel";
import { StatusPill } from "@/components/steel/StatusPill";
import { formatBRL, formatNum } from "@/lib/steel";

export const Route = createFileRoute("/carrier/trips/$id")({
  component: TripDetail,
});

const CHECKPOINT_TYPES = [
  { id: "pickup", label: "Coleta" },
  { id: "transit", label: "Em trânsito" },
  { id: "rest", label: "Parada / descanso" },
  { id: "delivery", label: "Entrega" },
] as const;

function TripDetail() {
  const { id } = useParams({ from: "/carrier/trips/$id" });
  const qc = useQueryClient();
  const [cpOpen, setCpOpen] = useState(false);
  const [cpType, setCpType] = useState<string>("transit");
  const [cpQr, setCpQr] = useState("");

  const { data: contract, isLoading } = useQuery({
    queryKey: ["carrier-trip", id],
    queryFn: async () => {
      const { data } = await supabase.from("contracts")
        .select("*, freights(*), drivers(full_name), trucks(plate, model, brand)")
        .eq("id", id).maybeSingle();
      return data;
    },
  });

  const { data: checkpoints } = useQuery({
    queryKey: ["trip-checkpoints", id],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase.from("checkpoints").select("*").eq("contract_id", id).order("recorded_at", { ascending: false });
      return data ?? [];
    },
  });

  const addCheckpoint = async () => {
    if (!contract) return;
    const pos = await new Promise<GeolocationPosition | null>((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => res(p), () => res(null), { timeout: 5000 });
    });
    const { error } = await supabase.from("checkpoints").insert({
      contract_id: id,
      type: cpType,
      qr_seal_code: cpQr || null,
      qr_verified: !!cpQr,
      lat: pos?.coords.latitude ?? null,
      lng: pos?.coords.longitude ?? null,
      recorded_at: new Date().toISOString(),
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Checkpoint registrado");
    setCpOpen(false); setCpQr(""); setCpType("transit");
    qc.invalidateQueries({ queryKey: ["trip-checkpoints", id] });
  };

  const updateStatus = async (status: "active" | "completed") => {
    const patch: Record<string, unknown> = { status };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("contracts").update(patch as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "completed" ? "Viagem concluída!" : "Viagem iniciada");
    qc.invalidateQueries({ queryKey: ["carrier-trip", id] });
  };

  if (isLoading) return <div className="p-6"><Spinner /></div>;
  if (!contract) return <div className="p-6"><EmptyState title="Viagem não encontrada" /></div>;

  const f = (contract as { freights?: { origin_city?: string; origin_state?: string; dest_city?: string; dest_state?: string; weight_tons?: number; distance_km?: number; cargo_value_brl?: number; pickup_date?: string } }).freights;
  const driver = (contract as { drivers?: { full_name?: string } }).drivers;
  const truck = (contract as { trucks?: { plate?: string; model?: string; brand?: string } }).trucks;

  return (
    <div className="p-6 space-y-6">
      <Link to="/carrier/trips" className="inline-flex items-center gap-1 text-sm text-steel-blue-200 hover:underline">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-graphite-50">Contrato {contract.contract_number ?? String(contract.id).slice(0, 8)}</h1>
            <StatusPill status={contract.status ?? "draft"} />
          </div>
          <p className="text-graphite-200">{f?.origin_city ?? "—"}, {f?.origin_state ?? ""} → {f?.dest_city ?? "—"}, {f?.dest_state ?? ""}</p>
        </div>
        <div className="flex gap-2">
          {contract.status === "awaiting_carrier_signature" && (
            <Button onClick={() => updateStatus("active")}>Assinar e iniciar</Button>
          )}
          {contract.status === "active" && (
            <>
              <Button variant="ghost" onClick={() => setCpOpen(true)}><Camera className="w-4 h-4" /> Checkpoint</Button>
              <Button onClick={() => updateStatus("completed")}><Flag className="w-4 h-4" /> Concluir</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-graphite-700 flex items-center justify-between">
            <h2 className="text-sm font-medium text-graphite-50">Linha do tempo</h2>
            <span className="text-xs text-graphite-400">{checkpoints?.length ?? 0} registros</span>
          </div>
          {!checkpoints?.length ? (
            <EmptyState icon={MapPin} title="Sem checkpoints" description="Registre coletas, paradas e entrega." />
          ) : (
            <ul className="divide-y divide-graphite-700">
              {checkpoints.map((c) => (
                <li key={c.id} className="px-4 py-3 flex items-start gap-3">
                  {c.qr_verified ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-esg-green-400" /> : <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400" />}
                  <div className="flex-1">
                    <div className="text-sm text-graphite-100 capitalize">{c.type ?? "checkpoint"}</div>
                    <div className="text-xs text-graphite-400">
                      {c.recorded_at ? new Date(c.recorded_at).toLocaleString("pt-BR") : "—"}
                      {c.lat != null && c.lng != null && ` • ${Number(c.lat).toFixed(3)}, ${Number(c.lng).toFixed(3)}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4 space-y-2 text-sm">
            <h3 className="text-sm font-medium text-graphite-50 mb-2">Carga</h3>
            <div className="flex justify-between"><span className="text-graphite-400">Peso</span><span className="text-graphite-100 tabular-nums">{formatNum(f?.weight_tons)} t</span></div>
            <div className="flex justify-between"><span className="text-graphite-400">Distância</span><span className="text-graphite-100 tabular-nums">{formatNum(f?.distance_km)} km</span></div>
            <div className="flex justify-between"><span className="text-graphite-400">Valor carga</span><span className="text-graphite-100 tabular-nums">{formatBRL(f?.cargo_value_brl)}</span></div>
            <div className="flex justify-between"><span className="text-graphite-400">Coleta</span><span className="text-graphite-100">{f?.pickup_date ? new Date(f.pickup_date).toLocaleDateString("pt-BR") : "—"}</span></div>
          </Card>
          <Card className="p-4 space-y-2 text-sm">
            <h3 className="text-sm font-medium text-graphite-50 mb-2">Operação</h3>
            <div className="flex justify-between"><span className="text-graphite-400">Motorista</span><span className="text-graphite-100">{driver?.full_name ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-graphite-400">Veículo</span><span className="text-graphite-100">{truck?.plate ?? "—"}</span></div>
            <div className="flex justify-between pt-2 border-t border-graphite-700"><span className="text-graphite-400">A receber</span><span className="text-graphite-50 font-bold tabular-nums">{formatBRL(contract.carrier_payout_brl)}</span></div>
          </Card>
        </div>
      </div>

      <Modal open={cpOpen} onClose={() => setCpOpen(false)} title="Registrar checkpoint">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-graphite-200 block mb-1">Tipo</label>
            <Select value={cpType} onChange={(e) => setCpType(e.target.value)}>
              {CHECKPOINT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-graphite-200 block mb-1">Código do lacre (QR)</label>
            <Input value={cpQr} onChange={(e) => setCpQr(e.target.value)} placeholder="Opcional" />
          </div>
          <p className="text-xs text-graphite-400">A localização atual será capturada automaticamente.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCpOpen(false)}>Cancelar</Button>
            <Button onClick={addCheckpoint}>Registrar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
