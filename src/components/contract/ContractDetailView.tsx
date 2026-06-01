import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Pen, Truck, Check, AlertTriangle, Download, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, Spinner, Button } from "@/components/steel";
import { StatusPill } from "@/components/steel/StatusPill";
import { steelLabel, formatBRL, formatNum } from "@/lib/steel";
import { SignaturePad } from "./SignaturePad";
import { ReleasePaymentModal } from "@/components/payment/ReleasePaymentModal";

type Role = "shipper" | "carrier";

interface Props {
  contractId: string;
  viewerRole: Role;
}

const CLAUSES = [
  { title: "Responsabilidade RCTR-C", body: "A transportadora é responsável pela carga conforme o seguro RCTR-C contratado, cobrindo perdas e avarias durante o transporte rodoviário até a entrega no destino indicado neste contrato." },
  { title: "Penalidade por atraso", body: "Multa de 2% ao dia sobre o valor do frete por atraso injustificado na coleta ou entrega, limitado a 30% do valor total. Atrasos comunicados com antecedência de 6 horas não incorrem em multa." },
  { title: "Condições de pagamento", body: "O pagamento ficará retido protegido até confirmação de entrega pelo embarcador. A liberação ocorre em até 24h úteis após a confirmação, descontada a taxa de plataforma de 3,5%." },
  { title: "Foro", body: "Fica eleito o foro da Comarca de São Paulo, SP para dirimir quaisquer controvérsias decorrentes deste contrato, com renúncia expressa a qualquer outro." },
];

function Banner({ children, color }: { children: React.ReactNode; color: "amber" | "blue" | "green" | "red" }) {
  const map = {
    amber: "bg-amber-400/10 border-amber-400/30 text-amber-400",
    blue: "bg-steel-blue-200/10 border-steel-blue-200/30 text-steel-blue-200",
    green: "bg-esg-green-400/10 border-esg-green-400/30 text-esg-green-400",
    red: "bg-red-500/10 border-red-500/30 text-red-400",
  };
  return <div className={`flex items-center gap-2 border-b px-6 py-3 text-sm font-medium ${map[color]}`}>{children}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2 border-b border-graphite-700/40 last:border-0">
      <div className="w-40 flex-shrink-0 text-sm text-graphite-400">{label}</div>
      <div className="flex-1 text-sm text-graphite-100">{children}</div>
    </div>
  );
}

function TimelineStep({ done, current, label, ts }: { done: boolean; current?: boolean; label: string; ts?: string | null }) {
  return (
    <li className="flex gap-3 pb-3 last:pb-0">
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full ${done ? "bg-esg-green-400" : current ? "bg-steel-blue-200 animate-pulse" : "bg-graphite-700 border border-graphite-600"}`} />
        <div className="w-px flex-1 bg-graphite-700 mt-1" />
      </div>
      <div className="flex-1">
        <div className={`text-sm ${done || current ? "text-graphite-100" : "text-graphite-400"}`}>{label}</div>
        {ts && <div className="text-xs text-graphite-400">{new Date(ts).toLocaleString("pt-BR")}</div>}
      </div>
    </li>
  );
}

export function ContractDetailView({ contractId, viewerRole }: Props) {
  const { user, company } = useAuth();
  const qc = useQueryClient();
  const [showClauses, setShowClauses] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["contract-detail", contractId],
    queryFn: async () => {
      const { data: c, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", contractId)
        .single();
      if (error) throw error;

      const [freightRes, shipperRes, carrierRes, truckRes, driverRes] = await Promise.all([
        c.freight_id ? supabase.from("freights").select("*").eq("id", c.freight_id).maybeSingle() : Promise.resolve({ data: null }),
        c.shipper_company_id ? supabase.from("companies").select("id, name, trade_name, cnpj").eq("id", c.shipper_company_id).maybeSingle() : Promise.resolve({ data: null }),
        c.carrier_company_id ? supabase.from("companies").select("id, name, trade_name, cnpj").eq("id", c.carrier_company_id).maybeSingle() : Promise.resolve({ data: null }),
        c.truck_id ? supabase.from("trucks").select("plate, type, capacity_tons").eq("id", c.truck_id).maybeSingle() : Promise.resolve({ data: null }),
        c.driver_id ? supabase.from("drivers").select("full_name, cpf, cnh_number, cnh_category").eq("id", c.driver_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      return {
        ...c,
        freights: freightRes.data,
        shipper_company: shipperRes.data,
        carrier_company: carrierRes.data,
        trucks: truckRes.data,
        drivers: driverRes.data,
      };
    },
  });

  const { data: carrierMeta } = useQuery({
    queryKey: ["contract-carrier-meta", data?.carrier_company?.id],
    enabled: !!data?.carrier_company?.id,
    queryFn: async () => {
      const { data: car } = await supabase.from("carriers").select("antt_rntrc").eq("company_id", data!.carrier_company!.id).maybeSingle();
      return car;
    },
  });

  const { data: lastCheckpoint } = useQuery({
    queryKey: ["contract-last-checkpoint", contractId],
    queryFn: async () => {
      const { data: rows } = await supabase.from("checkpoints").select("type, recorded_at, photo_url")
        .eq("contract_id", contractId).order("recorded_at", { ascending: false }).limit(1);
      return rows?.[0] ?? null;
    },
  });

  const status = data?.status ?? "draft";
  const isShipperOwner = viewerRole === "shipper" && company?.id === data?.shipper_company?.id;
  const isCarrierOwner = viewerRole === "carrier" && company?.id === data?.carrier_company?.id;

  const banner = useMemo(() => {
    if (status === "awaiting_shipper_signature") {
      return isShipperOwner
        ? <Banner color="amber"><Pen className="w-4 h-4" /> Aguardando sua assinatura</Banner>
        : <Banner color="amber"><Pen className="w-4 h-4" /> Aguardando assinatura do embarcador</Banner>;
    }
    if (status === "awaiting_carrier_signature") {
      return isCarrierOwner
        ? <Banner color="amber"><Pen className="w-4 h-4" /> Aguardando sua assinatura</Banner>
        : <Banner color="amber"><Pen className="w-4 h-4" /> Aguardando assinatura da transportadora</Banner>;
    }
    if (status === "active") return <Banner color="blue"><Truck className="w-4 h-4" /> Contrato ativo — em execução</Banner>;
    if (status === "completed") return <Banner color="green"><Check className="w-4 h-4" /> Contrato concluído</Banner>;
    if (status === "disputed") return <Banner color="red"><AlertTriangle className="w-4 h-4" /> Em disputa — aguardando resolução</Banner>;
    return null;
  }, [status, isShipperOwner, isCarrierOwner]);

  if (isLoading) return <div className="p-12 flex justify-center"><Spinner /></div>;
  if (!data) return <div className="p-12 text-center text-graphite-200">Contrato não encontrado.</div>;

  const f = data.freights;
  const shipper = data.shipper_company;
  const carrier = data.carrier_company;
  const truck = data.trucks;
  const driver = data.drivers;
  const isGreen = f?.category && f.category !== "traditional";

  const refetchAll = () => { void refetch(); qc.invalidateQueries({ queryKey: ["contract-detail", contractId] }); };

  return (
    <div>
      {banner}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* LEFT */}
        <div className="space-y-6 min-w-0">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-mono text-xl font-bold text-graphite-50">{data.contract_number ?? `SG-${String(data.id).slice(0, 8).toUpperCase()}`}</div>
                <div className="text-xs text-graphite-400 mt-1">
                  Gerado em {new Date(data.created_at ?? Date.now()).toLocaleString("pt-BR")}
                </div>
              </div>
              <StatusPill status={status} />
            </div>

            <div className="border-t border-graphite-700/40 mt-4 pt-2">
              <Row label="Embarcador">{shipper?.name ?? "—"} • CNPJ {shipper?.cnpj ?? "—"}</Row>
              <Row label="Transportadora">{carrier?.name ?? "—"} • CNPJ {carrier?.cnpj ?? "—"} • ANTT {carrierMeta?.antt_rntrc ?? "—"}</Row>
              <Row label="Motorista">{driver?.full_name ?? "—"}{driver?.cpf ? ` • CPF ${driver.cpf}` : ""}{driver?.cnh_number ? ` • CNH ${driver.cnh_number}` : ""}{driver?.cnh_category ? ` (${driver.cnh_category})` : ""}</Row>
              <Row label="Caminhão">{truck?.plate ?? "—"}{truck?.type ? ` • ${truck.type}` : ""}{truck?.capacity_tons ? ` • ${formatNum(truck.capacity_tons)} t` : ""}</Row>
              <Row label="Tipo de aço">{steelLabel(f?.steel_type)} • {formatNum(f?.weight_tons)} t</Row>
              <Row label="Valor da carga">{formatBRL(f?.cargo_value_brl)}</Row>
              <Row label="Rota">{f?.origin_city}, {f?.origin_state} → {f?.dest_city}, {f?.dest_state} {f?.distance_km ? `· ${formatNum(f.distance_km)} km` : ""}</Row>
              <Row label="Data de coleta">{f?.pickup_date ? new Date(f.pickup_date).toLocaleDateString("pt-BR") : "—"}{data.pickup_window ? ` · ${data.pickup_window}` : ""}</Row>
              <Row label="Valor do frete"><span className="font-bold text-graphite-50">{formatBRL(data.total_amount_brl ? data.total_amount_brl - (data.platform_fee_brl ?? 0) : f?.final_price_brl)}</span></Row>
              <Row label="Taxa plataforma (3,5%)"><span className="text-graphite-300">{formatBRL(data.platform_fee_brl)}</span></Row>
              <Row label="Total a pagar"><span className="text-lg font-bold text-steel-blue-200">{formatBRL(data.total_amount_brl)}</span></Row>
              <Row label="Categoria">
                <span className={`text-xs px-2 py-0.5 rounded-full ${isGreen ? "bg-esg-green-400/20 text-esg-green-400" : "bg-graphite-700 text-graphite-200"}`}>
                  {isGreen ? "🌿 Verde" : "Tradicional"}
                </span>
              </Row>
              {isGreen && (
                <Row label="CO₂ estimado"><span className="text-esg-green-400">~{Math.round(((f?.weight_tons ?? 0) * (f?.distance_km ?? 0)) * 0.018)} kg (frete verde)</span></Row>
              )}
            </div>

            <button onClick={() => setShowClauses((v) => !v)} className="mt-4 text-sm text-graphite-400 hover:text-graphite-100 flex items-center gap-1">
              {showClauses ? <>Fechar cláusulas <ChevronUp className="w-3 h-3" /></> : <>Ver cláusulas contratuais <ChevronDown className="w-3 h-3" /></>}
            </button>
            {showClauses && (
              <div className="mt-3 space-y-3 text-xs text-graphite-200 border-t border-graphite-700/40 pt-3">
                {CLAUSES.map((cl, i) => (
                  <div key={i}>
                    <div className="font-semibold text-graphite-100">{i + 1}. {cl.title}</div>
                    <p className="mt-1 leading-relaxed">{cl.body}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Signatures */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-graphite-50 mb-4">Assinaturas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SignatureBox
                label="Embarcador" subtitle={shipper?.name ?? ""}
                signedAt={data.shipper_signed_at} sigUrl={data.shipper_signature_url} ip={data.shipper_signed_ip}
                myTurn={isShipperOwner && status === "awaiting_shipper_signature"}
                pad={<SignaturePad contractId={contractId} party="shipper" onSigned={refetchAll} />}
              />
              <SignatureBox
                label="Transportadora" subtitle={carrier?.name ?? ""}
                signedAt={data.carrier_signed_at} sigUrl={data.carrier_signature_url} ip={data.carrier_signed_ip}
                myTurn={isCarrierOwner && status === "awaiting_carrier_signature"}
                pad={<SignaturePad contractId={contractId} freightId={f?.id} party="carrier" onSigned={refetchAll} />}
              />
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-4 lg:sticky lg:top-4 self-start">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-graphite-700">
              <span className="text-sm font-medium text-graphite-100">Contrato PDF</span>
              {data.pdf_url && (
                <a href={data.pdf_url} download className="text-graphite-400 hover:text-graphite-100"><Download className="w-4 h-4" /></a>
              )}
            </div>
            {data.pdf_url ? (
              <iframe src={data.pdf_url} className="w-full h-64 border-0" title="Contrato PDF" />
            ) : (
              <div className="h-48 flex flex-col items-center justify-center text-graphite-400 text-xs gap-2">
                <FileText className="w-8 h-8" />
                <span>PDF será gerado após ativação</span>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h4 className="text-sm font-semibold text-graphite-50 mb-3">Linha do tempo</h4>
            <ol className="space-y-0">
              <TimelineStep done label="Rascunho gerado" ts={data.created_at} />
              <TimelineStep done={!!data.shipper_signed_at} current={status === "awaiting_shipper_signature"} label="Assinatura do embarcador" ts={data.shipper_signed_at} />
              <TimelineStep done={!!data.carrier_signed_at} current={status === "awaiting_carrier_signature"} label="Assinatura da transportadora" ts={data.carrier_signed_at} />
              <TimelineStep done={data.escrow_status === "escrow_held" || data.escrow_status === "released"} current={status === "active" && data.escrow_status === "pending"} label="Pagamento em escrow" ts={data.escrow_held_at} />
              <TimelineStep done={status === "active" || status === "completed"} current={status === "active"} label="Frete ativo" ts={data.activated_at} />
              <TimelineStep done={status === "completed" || status === "disputed"} label={status === "disputed" ? "Disputado" : "Concluído"} ts={data.completed_at} />
            </ol>
          </Card>

          {(status === "active" || status === "completed") && (
            <Card className="p-5 space-y-3">
              <h4 className="text-sm font-semibold text-graphite-50">Pagamento</h4>
              <div className="text-2xl font-bold text-graphite-50 tabular-nums">{formatBRL(data.total_amount_brl)}</div>
              <EscrowBadge status={data.escrow_status} />

              {isShipperOwner && data.escrow_status === "pending" && (
                <Link to="/shipper/payment/$contractId" params={{ contractId }}>
                  <Button className="w-full">Confirmar e garantir pagamento →</Button>
                </Link>
              )}
              {isShipperOwner && data.escrow_status === "escrow_held" && (
                <Button variant="green" className="w-full" onClick={() => setReleaseOpen(true)}>
                  Confirmar entrega e liberar →
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>

      {isShipperOwner && (
        <ReleasePaymentModal
          open={releaseOpen}
          onClose={() => setReleaseOpen(false)}
          contractId={contractId}
          amount={data.total_amount_brl ?? 0}
          lastCheckpoint={lastCheckpoint}
          driverName={driver?.full_name}
          onReleased={refetchAll}
        />
      )}
    </div>
  );
}

function EscrowBadge({ status }: { status?: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Aguardando pagamento", cls: "bg-graphite-700 text-graphite-100" },
    escrow_held: { label: "Em escrow", cls: "bg-amber-400/20 text-amber-400" },
    released: { label: "Liberado", cls: "bg-esg-green-400/20 text-esg-green-400" },
    refunded: { label: "Reembolsado", cls: "bg-graphite-700 text-graphite-200" },
    disputed: { label: "Disputado", cls: "bg-red-500/20 text-red-400" },
  };
  const it = map[status ?? "pending"] ?? map.pending;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${it.cls}`}>{it.label}</span>;
}

function SignatureBox({
  label, subtitle, signedAt, sigUrl, ip, myTurn, pad,
}: {
  label: string; subtitle: string; signedAt?: string | null; sigUrl?: string | null; ip?: string | null;
  myTurn: boolean; pad: React.ReactNode;
}) {
  return (
    <div className="bg-bg-elevated border border-graphite-700 rounded-[14px] p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-graphite-100">{label}</span>
        <span className="text-xs text-graphite-400 truncate ml-2">{subtitle}</span>
      </div>
      {signedAt ? (
        <>
          {sigUrl && <img src={sigUrl} alt="assinatura" className="w-full h-24 object-contain rounded-[8px] bg-bg-input mt-2" />}
          <div className="text-sm text-esg-green-400 mt-2">✅ Assinado em {new Date(signedAt).toLocaleString("pt-BR")}</div>
          {ip && <div className="text-xs text-graphite-400">IP: {ip}</div>}
        </>
      ) : myTurn ? (
        <div className="mt-2">{pad}</div>
      ) : (
        <div className="mt-3 border-2 border-dashed border-graphite-600 rounded-[10px] py-8 flex flex-col items-center text-graphite-400 italic text-sm">
          <Pen className="w-5 h-5 mb-1" />
          Aguardando assinatura...
        </div>
      )}
    </div>
  );
}
