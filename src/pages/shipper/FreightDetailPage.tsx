import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Pencil,
  Clock,
  MapPin,
  Zap,
  ShieldCheck,
  Map as MapIcon,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Button,
  Card,
  EmptyState,
  Spinner,
  Modal,
  Select,
  Badge,
} from "@/components/steel";
import { StatusPill } from "@/components/steel/StatusPill";
import { GreenFreightTag } from "@/components/steel/GreenFreightTag";
import { ScoreRing } from "@/components/steel/ScoreRing";
import { steelLabel, formatBRL, formatNum } from "@/lib/steel";

type SortKey = "match" | "price" | "score";

type BidRow = {
  id: string;
  carrier_id: string;
  driver_id: string | null;
  truck_id: string | null;
  amount_brl: number;
  ev_certified: boolean | null;
  submitted_at: string | null;
  status: string | null;
  carriers: {
    id: string;
    company_id: string;
    companies: { name: string | null; trade_name: string | null } | null;
    carrier_scores?: {
      overall_score: number | null;
      safety_score: number | null;
      esg_score: number | null;
      delivery_score: number | null;
      is_verified: boolean | null;
    }[] | null;
  } | null;
};

function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export function FreightDetailPage() {
  const { id } = useParams({ from: "/shipper/freights/$id" });
  const { company } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sort, setSort] = useState<SortKey>("match");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [acceptBid, setAcceptBid] = useState<BidRow | null>(null);

  const { data: freight, isLoading } = useQuery({
    queryKey: ["freight", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("freights")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: bids } = useQuery({
    queryKey: ["freight-bids", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bids")
        .select(
          "*, carriers(id, company_id, companies(name, trade_name), carrier_scores(overall_score, safety_score, esg_score, delivery_score, is_verified))",
        )
        .eq("freight_id", id);
      return (data ?? []) as unknown as BidRow[];
    },
  });

  const { data: contract } = useQuery({
    queryKey: ["freight-contract", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("*")
        .eq("freight_id", id)
        .maybeSingle();
      return data;
    },
  });

  const { data: checkpoints } = useQuery({
    queryKey: ["freight-checkpoints", contract?.id],
    enabled: !!contract?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("checkpoints")
        .select("*")
        .eq("contract_id", contract!.id)
        .order("recorded_at", { ascending: false });
      return data ?? [];
    },
  });

  const sortedBids = useMemo(() => {
    const list = [...(bids ?? [])];
    const score = (b: BidRow) => b.carriers?.carrier_scores?.[0]?.overall_score ?? 0;
    if (sort === "price") list.sort((a, b) => Number(a.amount_brl) - Number(b.amount_brl));
    else if (sort === "score") list.sort((a, b) => Number(score(b)) - Number(score(a)));
    else
      list.sort(
        (a, b) =>
          Number(score(b)) * 1000 - Number(b.amount_brl) -
          (Number(score(a)) * 1000 - Number(a.amount_brl)),
      );
    return list;
  }, [bids, sort]);

  const cancelMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("freights")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Frete cancelado.");
      qc.invalidateQueries({ queryKey: ["freight", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("freights")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Frete publicado!");
      qc.invalidateQueries({ queryKey: ["freight", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptMut = useMutation({
    mutationFn: async () => {
      if (!acceptBid || !freight || !company) throw new Error("Dados incompletos");
      const amount = Number(acceptBid.amount_brl);
      const fee = +(amount * 0.035).toFixed(2);
      const payout = +(amount * 0.965).toFixed(2);

      const { error: bidErr } = await supabase
        .from("bids")
        .update({ status: "accepted" })
        .eq("id", acceptBid.id);
      if (bidErr) throw bidErr;

      await supabase
        .from("bids")
        .update({ status: "rejected" })
        .eq("freight_id", id)
        .neq("id", acceptBid.id);

      await supabase
        .from("freights")
        .update({
          status: "contract_pending",
          matched_carrier_id: acceptBid.carrier_id,
          matched_driver_id: acceptBid.driver_id,
          matched_truck_id: acceptBid.truck_id,
          final_price_brl: amount,
        })
        .eq("id", id);

      const carrierCompanyId = acceptBid.carriers?.company_id;
      if (!carrierCompanyId) throw new Error("Transportadora sem empresa vinculada");
      const { data: newContract, error: cErr } = await supabase
        .from("contracts")
        .insert({
          bid_id: acceptBid.id,
          freight_id: id,
          shipper_company_id: company.id,
          carrier_company_id: carrierCompanyId,
          driver_id: acceptBid.driver_id,
          truck_id: acceptBid.truck_id,
          total_amount_brl: amount,
          platform_fee_brl: fee,
          carrier_payout_brl: payout,
          status: "awaiting_shipper_signature",
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      return newContract.id as string;
    },
    onSuccess: (contractId) => {
      toast.success("Proposta aceita! Contrato gerado.");
      setAcceptBid(null);
      setConfirmChecked(false);
      navigate({ to: "/shipper/contracts/$id", params: { id: contractId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AppShell title="Detalhe do Frete">
        <div className="p-8 flex justify-center"><Spinner /></div>
      </AppShell>
    );
  }
  if (!freight) {
    return (
      <AppShell title="Detalhe do Frete">
        <div className="p-8"><EmptyState title="Frete não encontrado" /></div>
      </AppShell>
    );
  }

  const isLocked = freight.status === "matched" || freight.status === "contract_pending" ||
    freight.status === "contracted" || freight.status === "in_transit" ||
    freight.status === "delivered" || freight.status === "completed";

  return (
    <AppShell title="Detalhe do Frete">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm bg-[#21262D] px-3 py-1 rounded-[8px] text-[#79B8F8]">
              SG-{String(freight.id).slice(0, 8).toUpperCase()}
            </span>
            <StatusPill status={freight.status ?? "draft"} />
            <GreenFreightTag category={freight.category} />
          </div>
          <div className="flex gap-2">
            {(freight.status === "published" || freight.status === "bidding") && (
              <Button variant="ghost" onClick={() => cancelMut.mutate()}>
                Cancelar frete
              </Button>
            )}
            {freight.status === "draft" && (
              <Button onClick={() => publishMut.mutate()}>Publicar agora</Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-5">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base font-semibold text-[#E6EDF3]">
                  Informações do frete
                </h2>
                <Link to="/shipper/freights/new">
                  <Button variant="ghost" size="sm"><Pencil className="w-4 h-4" /></Button>
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow label="Tipo de aço" value={steelLabel(freight.steel_type)} />
                <InfoRow label="Peso" value={`${formatNum(freight.weight_tons)} t`} />
                <InfoRow label="Valor da carga" value={formatBRL(freight.cargo_value_brl)} />
                <InfoRow
                  label="Categoria"
                  value={freight.category?.startsWith("green") ? "Verde / Elétrico" : "Tradicional"}
                />
                <InfoRow label="Origem" value={`${freight.origin_city ?? "—"}, ${freight.origin_state ?? ""}`} />
                <InfoRow label="Destino" value={`${freight.dest_city ?? "—"}, ${freight.dest_state ?? ""}`} />
                <InfoRow label="Distância" value={freight.distance_km ? `${formatNum(freight.distance_km)} km` : "—"} />
                <InfoRow
                  label="Data de coleta"
                  value={`${freight.pickup_date ?? "—"}${freight.pickup_window ? " · " + freight.pickup_window : ""}`}
                />
                <InfoRow
                  label="Orçamento"
                  value={freight.budget_brl ? formatBRL(freight.budget_brl) : "Aberto a propostas"}
                />
                <InfoRow
                  label="Prazo propostas"
                  value={freight.bid_deadline ? new Date(freight.bid_deadline).toLocaleString("pt-BR") : "—"}
                />
              </div>
            </Card>

            {(freight.status === "published" || freight.status === "bidding" || freight.status === "matched") && (
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-[#E6EDF3]">Propostas recebidas</h2>
                    <Badge>{sortedBids.length}</Badge>
                  </div>
                  <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    <option value="match">Melhor match</option>
                    <option value="price">Menor preço</option>
                    <option value="score">Maior score</option>
                  </Select>
                </div>

                {sortedBids.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="Aguardando propostas..."
                    description="Transportadoras verificadas serão notificadas."
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    {sortedBids.map((b) => {
                      const sc = b.carriers?.carrier_scores?.[0];
                      const name = b.carriers?.companies?.trade_name ?? b.carriers?.companies?.name ?? "Transportadora";
                      return (
                        <div
                          key={b.id}
                          className="bg-[#161B22] border border-[#30363D] rounded-[14px] p-5 hover:border-[#484F58] transition"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-semibold text-[#E6EDF3]">{name}</span>
                              {sc?.is_verified && (
                                <span className="inline-flex items-center gap-1 text-[10px] uppercase bg-[#0D2F5E] text-[#79B8F8] px-2 py-0.5 rounded">
                                  <ShieldCheck className="w-3 h-3" /> Verificada
                                </span>
                              )}
                            </div>
                            <div className="text-xl font-bold text-[#E6EDF3] tabular-nums">
                              {formatBRL(Number(b.amount_brl))}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-6 items-center mt-3">
                            <ScoreRing score={Number(sc?.overall_score ?? 0)} size={56} />
                            <div className="flex flex-col gap-1 text-xs text-[#8B949E]">
                              <span>Safety {Number(sc?.safety_score ?? 0).toFixed(1)}</span>
                              <span>ESG {Number(sc?.esg_score ?? 0).toFixed(1)}</span>
                              <span>Pontualidade {Number(sc?.delivery_score ?? 0).toFixed(1)}</span>
                            </div>
                            {b.ev_certified && (
                              <span className="inline-flex items-center gap-1 text-xs text-esg-green-400 bg-esg-green-400/10 px-2 py-1 rounded">
                                <Zap className="w-3 h-3" /> Caminhão elétrico
                              </span>
                            )}
                          </div>

                          <div className="flex justify-between items-center mt-4 pt-4 border-t border-[#30363D]">
                            <span className="text-xs text-[#484F58]">
                              Enviada {timeAgo(b.submitted_at)}
                            </span>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm">Ver perfil</Button>
                              {freight.status !== "matched" && freight.status !== "contract_pending" && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setAcceptBid(b);
                                    setConfirmChecked(false);
                                  }}
                                >
                                  Aceitar proposta
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* RIGHT */}
          <aside className="space-y-4">
            {freight.status === "in_transit" && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">Rastreamento ao vivo</h3>
                <div className="bg-[#0F1923] h-40 rounded-[10px] flex flex-col items-center justify-center gap-1">
                  <MapIcon className="w-6 h-6 text-[#484F58]" />
                  <span className="text-xs text-[#484F58]">Atualizando...</span>
                </div>
                {checkpoints?.[0] && (
                  <p className="text-xs text-[#8B949E] mt-3">
                    Último: {checkpoints[0].type} · {timeAgo(checkpoints[0].recorded_at)}
                  </p>
                )}
                <p className="text-xs text-[#484F58] mt-1">ETA: —</p>
                <Button variant="ghost" size="sm" className="w-full mt-3">Ver mapa completo</Button>
              </Card>
            )}

            <Card className="p-4">
              <h3 className="text-sm font-semibold text-[#E6EDF3] mb-3">Linha do tempo</h3>
              <ol className="space-y-3">
                <TimelineDot done={!!freight.created_at} label="Criado" ts={freight.created_at} />
                <TimelineDot done={!!freight.published_at} label="Publicado" ts={freight.published_at} />
                <TimelineDot
                  done={(bids?.length ?? 0) > 0}
                  label={`Propostas (${bids?.length ?? 0})`}
                />
                <TimelineDot done={!!contract} label="Contratado" ts={contract?.created_at} />
                <TimelineDot done={freight.status === "in_transit" || freight.status === "delivered"} label="Em trânsito" />
                <TimelineDot done={freight.status === "delivered" || freight.status === "completed"} label="Entregue" />
                {checkpoints?.map((c) => (
                  <li key={c.id} className="flex gap-2 text-xs">
                    <MapPin className="w-3 h-3 text-steel-blue-200 mt-0.5" />
                    <div>
                      <p className="text-[#C9D1D9]">{c.type}</p>
                      <p className="text-[#484F58]">{timeAgo(c.recorded_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            {contract && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-[#E6EDF3] mb-2">Pagamento</h3>
                <div className="text-xl font-bold text-[#E6EDF3] tabular-nums">
                  {formatBRL(Number(contract.total_amount_brl))}
                </div>
                <div className="mt-2">
                  <Badge>{contract.escrow_status ?? "pending"}</Badge>
                </div>
                {contract.escrow_status === "held" && freight.status === "delivered" && (
                  <Button className="w-full mt-3">Confirmar entrega e liberar pagamento</Button>
                )}
                {(!contract.escrow_status || contract.escrow_status === "pending") &&
                  contract.status === "active" && (
                    <Link
                      to="/shipper/payment/$contractId"
                      params={{ contractId: contract.id }}
                    >
                      <Button className="w-full mt-3">Confirmar e garantir pagamento →</Button>
                    </Link>
                  )}
              </Card>
            )}
          </aside>
        </div>
      </div>

      {acceptBid && (
        <Modal open onClose={() => setAcceptBid(null)} title="Confirmar contratação">
          <div className="space-y-3 mb-4 text-sm text-[#C9D1D9]">
            <div className="flex justify-between">
              <span className="text-[#8B949E]">Transportadora</span>
              <span>
                {acceptBid.carriers?.companies?.trade_name ??
                  acceptBid.carriers?.companies?.name ??
                  "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8B949E]">Valor</span>
              <span className="font-semibold">{formatBRL(Number(acceptBid.amount_brl))}</span>
            </div>
          </div>
          <p className="text-sm text-[#8B949E] mb-4">
            Ao aceitar, as outras propostas serão recusadas automaticamente e um contrato será gerado.
          </p>
          <label className="flex items-center gap-2 text-sm text-[#C9D1D9] mb-4">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
            />
            Confirmo que li todas as condições
          </label>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setAcceptBid(null)}>Cancelar</Button>
            <Button
              disabled={!confirmChecked || acceptMut.isPending}
              onClick={() => acceptMut.mutate()}
            >
              Aceitar e gerar contrato →
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase text-[#484F58]">{label}</div>
      <div className="text-sm text-[#C9D1D9] mt-0.5">{value || "—"}</div>
    </div>
  );
}

function TimelineDot({
  done,
  label,
  ts,
}: {
  done: boolean;
  label: string;
  ts?: string | null;
}) {
  return (
    <li className="flex gap-2 items-start">
      <span
        className={`w-2.5 h-2.5 rounded-full mt-1 ${
          done ? "bg-esg-green-400" : "border border-[#484F58]"
        }`}
      />
      <div>
        <p className="text-sm text-[#C9D1D9]">{label}</p>
        {ts && (
          <p className="text-xs text-[#484F58]">
            {new Date(ts).toLocaleString("pt-BR")}
          </p>
        )}
      </div>
    </li>
  );
}
