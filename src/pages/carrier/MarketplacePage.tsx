import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  DollarSign,
  MapPin,
  Package,
  Scale,
  Star,
  Truck,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Spinner,
  Textarea,
} from "@/components/steel";
import { GreenFreightTag } from "@/components/steel/GreenFreightTag";
import { StatusPill } from "@/components/steel/StatusPill";
import {
  steelLabel,
  formatBRL,
  formatNum,
  STEEL_TYPES,
  TRUCK_TYPES,
} from "@/lib/steel";

const BR_STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const CATEGORIES = [
  { id: "traditional", label: "Tradicional" },
  { id: "green", label: "🌿 Verde" },
  { id: "green_ev", label: "⚡ Verde EV" },
];

type SortKey = "relevance" | "price_desc" | "price_asc" | "pickup" | "weight";

function FilterGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#30363D] py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex justify-between items-center text-sm font-medium text-[#E6EDF3]"
      >
        {title}
        {open ? (
          <ChevronUp className="w-4 h-4 text-[#8B949E]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#8B949E]" />
        )}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function MarketplacePage() {
  const { company } = useAuth();
  const qc = useQueryClient();

  // Filters
  const [originStates, setOriginStates] = useState<string[]>([]);
  const [destStates, setDestStates] = useState<string[]>([]);
  const [steelTypes, setSteelTypes] = useState<string[]>([]);
  const [truckTypes, setTruckTypes] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [weightMin, setWeightMin] = useState("");
  const [weightMax, setWeightMax] = useState("");
  const [pickupFrom, setPickupFrom] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [newCount, setNewCount] = useState(0);

  // Drawer
  const [openFreightId, setOpenFreightId] = useState<string | null>(null);
  const [tab, setTab] = useState<"details" | "bid">("details");

  // Bid form
  const [bidAmount, setBidAmount] = useState("");
  const [bidToll, setBidToll] = useState("");
  const [bidHours, setBidHours] = useState("48");
  const [bidTruckId, setBidTruckId] = useState("");
  const [bidDriverId, setBidDriverId] = useState("");
  const [bidEvCertified, setBidEvCertified] = useState(false);
  const [bidNotes, setBidNotes] = useState("");

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

  const { data: score } = useQuery({
    queryKey: ["carrier-score", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("carrier_scores")
        .select("*")
        .eq("carrier_id", carrier!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: trucks } = useQuery({
    queryKey: ["carrier-trucks", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("trucks")
        .select("*")
        .eq("carrier_id", carrier!.id);
      return data ?? [];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["carrier-drivers", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("drivers")
        .select("*")
        .eq("carrier_id", carrier!.id)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: freights, isLoading } = useQuery({
    queryKey: ["marketplace-freights"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("freights")
        .select("*, companies(name, trade_name)")
        .in("status", ["published", "bidding"])
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(100);
      return data ?? [];
    },
  });

  const { data: myBids } = useQuery({
    queryKey: ["carrier-my-bids", carrier?.id],
    enabled: !!carrier?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("bids")
        .select("freight_id")
        .eq("carrier_id", carrier!.id);
      return new Set((data ?? []).map((b) => b.freight_id));
    },
  });

  // Realtime subscription for new freights
  useEffect(() => {
    const channel = supabase
      .channel("marketplace-freights-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "freights" },
        () => setNewCount((c) => c + 1),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    v: string,
  ) =>
    setter((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );

  const clearFilters = () => {
    setOriginStates([]);
    setDestStates([]);
    setSteelTypes([]);
    setTruckTypes([]);
    setCategories([]);
    setWeightMin("");
    setWeightMax("");
    setPickupFrom("");
  };

  const filtered = useMemo(() => {
    let list = freights ?? [];
    if (originStates.length)
      list = list.filter((f) => originStates.includes(f.origin_state ?? ""));
    if (destStates.length)
      list = list.filter((f) => destStates.includes(f.dest_state ?? ""));
    if (steelTypes.length)
      list = list.filter((f) => steelTypes.includes(f.steel_type ?? ""));
    if (categories.length)
      list = list.filter((f) =>
        categories.includes(String(f.category ?? "traditional")),
      );
    if (truckTypes.length)
      list = list.filter((f) =>
        (f.required_truck ?? []).some((t: string) => truckTypes.includes(t)),
      );
    if (weightMin)
      list = list.filter((f) => Number(f.weight_tons ?? 0) >= Number(weightMin));
    if (weightMax)
      list = list.filter((f) => Number(f.weight_tons ?? 0) <= Number(weightMax));
    if (pickupFrom)
      list = list.filter(
        (f) => f.pickup_date && new Date(f.pickup_date) >= new Date(pickupFrom),
      );

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "price_desc":
          return Number(b.budget_brl ?? 0) - Number(a.budget_brl ?? 0);
        case "price_asc":
          return Number(a.budget_brl ?? 0) - Number(b.budget_brl ?? 0);
        case "pickup":
          return (
            new Date(a.pickup_date ?? 0).getTime() -
            new Date(b.pickup_date ?? 0).getTime()
          );
        case "weight":
          return Number(b.weight_tons ?? 0) - Number(a.weight_tons ?? 0);
        default:
          return 0;
      }
    });
    return sorted;
  }, [
    freights,
    originStates,
    destStates,
    steelTypes,
    truckTypes,
    categories,
    weightMin,
    weightMax,
    pickupFrom,
    sort,
  ]);

  const openFreight = freights?.find((f) => f.id === openFreightId) ?? null;

  const closeDrawer = () => {
    setOpenFreightId(null);
    setTab("details");
    setBidAmount("");
    setBidToll("");
    setBidHours("48");
    setBidTruckId("");
    setBidDriverId("");
    setBidEvCertified(false);
    setBidNotes("");
  };

  const submitBid = async () => {
    if (!openFreight || !carrier) return;
    const amt = Number(bidAmount);
    if (!amt || amt <= 0) {
      toast.error("Informe o valor da proposta");
      return;
    }
    if (
      openFreight.category &&
      openFreight.category !== "traditional" &&
      !bidEvCertified
    ) {
      toast.error("Confirme certificação verde para este frete");
      return;
    }
    const { error } = await supabase.from("bids").insert({
      freight_id: openFreight.id,
      carrier_id: carrier.id,
      driver_id: bidDriverId || null,
      truck_id: bidTruckId || null,
      amount_brl: amt,
      toll_brl: bidToll ? Number(bidToll) : 0,
      estimated_hours: bidHours ? Number(bidHours) : null,
      ev_certified: bidEvCertified,
      status: "pending",
    } as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      "✅ Proposta enviada! Você será notificado se for aceita.",
    );
    qc.invalidateQueries({ queryKey: ["carrier-my-bids", carrier.id] });
    closeDrawer();
  };

  const myFleetTypes = new Set(carrier?.truck_types ?? []);

  return (
    <div className="flex -m-6 h-[calc(100vh-64px)]">
      {/* Filters Panel */}
      <aside className="w-72 flex-shrink-0 bg-[#161B22] border-r border-[#30363D] p-5 overflow-y-auto hidden md:block">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-[#E6EDF3]">Filtros</h3>
          <button
            onClick={clearFilters}
            className="text-xs text-[#3B89D4] hover:underline"
          >
            Limpar
          </button>
        </div>

        <FilterGroup title="Estado de origem">
          <div className="grid grid-cols-5 gap-1">
            {BR_STATES.map((s) => {
              const sel = originStates.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggle(setOriginStates, s)}
                  className={`text-[10px] px-1.5 py-1 rounded-[4px] border transition ${
                    sel
                      ? "border-[#1B6CB8] bg-[#1B6CB8]/20 text-[#3B89D4]"
                      : "border-[#30363D] text-[#484F58] hover:border-[#484F58]"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </FilterGroup>

        <FilterGroup title="Estado de destino">
          <div className="grid grid-cols-5 gap-1">
            {BR_STATES.map((s) => {
              const sel = destStates.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => toggle(setDestStates, s)}
                  className={`text-[10px] px-1.5 py-1 rounded-[4px] border transition ${
                    sel
                      ? "border-[#1B6CB8] bg-[#1B6CB8]/20 text-[#3B89D4]"
                      : "border-[#30363D] text-[#484F58] hover:border-[#484F58]"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </FilterGroup>

        <FilterGroup title="Tipo de aço">
          <div className="flex flex-col gap-1">
            {STEEL_TYPES.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 py-1 text-sm text-[#8B949E] cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-[#1B6CB8]"
                  checked={steelTypes.includes(s.id)}
                  onChange={() => toggle(setSteelTypes, s.id)}
                />
                {s.label}
              </label>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup title="Tipo de caminhão">
          <div className="flex flex-col gap-1">
            {TRUCK_TYPES.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2 py-1 text-sm text-[#8B949E] cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-[#1B6CB8]"
                  checked={truckTypes.includes(t.id)}
                  onChange={() => toggle(setTruckTypes, t.id)}
                />
                {t.label}
                {myFleetTypes.has(t.id as never) && (
                  <Star className="w-3 h-3 text-[#F0A500] fill-[#F0A500]" />
                )}
              </label>
            ))}
          </div>
        </FilterGroup>

        <FilterGroup title="Categoria">
          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.map((c) => {
              const sel = categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(setCategories, c.id)}
                  className={`text-xs px-2 py-1 rounded-full border transition ${
                    sel
                      ? "border-[#1B6CB8] bg-[#1B6CB8]/20 text-[#3B89D4]"
                      : "border-[#30363D] text-[#8B949E] hover:border-[#484F58]"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </FilterGroup>

        <FilterGroup title="Peso (t)">
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="De"
              value={weightMin}
              onChange={(e) => setWeightMin(e.target.value)}
            />
            <Input
              type="number"
              placeholder="Até"
              value={weightMax}
              onChange={(e) => setWeightMax(e.target.value)}
            />
          </div>
        </FilterGroup>

        <FilterGroup title="Data de coleta">
          <Input
            type="date"
            value={pickupFrom}
            onChange={(e) => setPickupFrom(e.target.value)}
          />
        </FilterGroup>
      </aside>

      {/* Freight List */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div className="text-sm text-[#8B949E]">
            {filtered.length}{" "}
            {filtered.length === 1 ? "frete disponível" : "fretes disponíveis"}
          </div>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="relevance">Relevância</option>
            <option value="price_desc">Valor ↓</option>
            <option value="price_asc">Valor ↑</option>
            <option value="pickup">Data de coleta</option>
            <option value="weight">Peso</option>
          </Select>
        </div>

        {newCount > 0 && (
          <button
            onClick={() => {
              setNewCount(0);
              qc.invalidateQueries({ queryKey: ["marketplace-freights"] });
            }}
            className="mb-3 inline-flex items-center gap-2 bg-[#1A9B5E]/20 border border-[#1A9B5E] text-[#2ECC8A] text-xs px-3 py-1 rounded-full animate-pulse"
          >
            ● {newCount} {newCount === 1 ? "novo frete disponível" : "novos fretes disponíveis"} — clique para ver
          </button>
        )}

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        ) : !filtered.length ? (
          <EmptyState
            icon={Package}
            title="Nenhum frete encontrado"
            description="Ajuste os filtros para ver mais resultados."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((f) => {
              const alreadyBid = myBids?.has(f.id);
              return (
                <div
                  key={f.id}
                  onClick={() => {
                    setOpenFreightId(f.id);
                    setTab("details");
                  }}
                  className={`rounded-[16px] p-5 border transition cursor-pointer ${
                    alreadyBid
                      ? "bg-[#0A2118] border-[#1A9B5E]/40"
                      : "bg-[#161B22] border-[#30363D] hover:border-[#484F58]"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-[#79B8F8]">
                        #{String(f.id).slice(0, 8).toUpperCase()}
                      </span>
                      <GreenFreightTag category={f.category} />
                      {alreadyBid && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#1A9B5E]/20 text-[#2ECC8A]">
                          Proposta enviada
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#484F58]">
                      {f.pickup_date
                        ? new Date(f.pickup_date).toLocaleDateString("pt-BR")
                        : "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <MapPin className="w-3.5 h-3.5 text-[#3B89D4]" />
                    <span className="text-base font-semibold text-[#E6EDF3]">
                      {f.origin_city ?? "—"}, {f.origin_state ?? ""}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#484F58]" />
                    <span className="text-base font-semibold text-[#E6EDF3]">
                      {f.dest_city ?? "—"}, {f.dest_state ?? ""}
                    </span>
                    {f.distance_km && (
                      <span className="text-sm text-[#484F58]">
                        · {formatNum(f.distance_km)} km
                      </span>
                    )}
                  </div>

                  <div className="flex gap-4 mt-2 flex-wrap text-xs text-[#8B949E]">
                    <span className="inline-flex items-center gap-1">
                      <Package className="w-3.5 h-3.5" />
                      {steelLabel(f.steel_type)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Scale className="w-3.5 h-3.5" />
                      {formatNum(f.weight_tons)} t
                    </span>
                    {f.required_truck?.length ? (
                      <span className="inline-flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5" />
                        {f.required_truck.join(", ")}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex justify-between items-center mt-4 pt-3 border-t border-[#30363D]/60">
                    <div>
                      {f.budget_brl ? (
                        <span className="text-sm font-medium text-[#E6EDF3]">
                          Orçamento:{" "}
                          <span className="tabular-nums">
                            {formatBRL(f.budget_brl)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-sm italic text-[#484F58]">
                          Aberto a propostas
                        </span>
                      )}
                    </div>
                    <Button size="sm">Ver e propor →</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Detail Drawer */}
      {openFreight && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeDrawer}
          />
          <div className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-[#161B22] border-l border-[#30363D] z-50 p-6 overflow-y-auto">
            <button
              onClick={closeDrawer}
              className="absolute right-4 top-4 text-[#8B949E] hover:text-[#E6EDF3]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4 mt-1">
              <span className="font-mono text-xs text-[#79B8F8]">
                #{String(openFreight.id).slice(0, 8).toUpperCase()}
              </span>
              <StatusPill status={openFreight.status ?? "published"} />
            </div>

            <div className="flex gap-2 border-b border-[#30363D] mb-4">
              {[
                { id: "details", label: "Detalhes" },
                { id: "bid", label: "Fazer proposta" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as "details" | "bid")}
                  className={`px-3 py-2 text-sm border-b-2 -mb-px transition ${
                    tab === t.id
                      ? "border-steel-blue-400 text-[#E6EDF3]"
                      : "border-transparent text-[#8B949E] hover:text-[#C9D1D9]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "details" ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Origem</span>
                  <span className="text-[#E6EDF3]">
                    {openFreight.origin_city ?? "—"},{" "}
                    {openFreight.origin_state ?? ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Destino</span>
                  <span className="text-[#E6EDF3]">
                    {openFreight.dest_city ?? "—"},{" "}
                    {openFreight.dest_state ?? ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Distância</span>
                  <span className="text-[#E6EDF3]">
                    {formatNum(openFreight.distance_km)} km
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Tipo de aço</span>
                  <span className="text-[#E6EDF3]">
                    {steelLabel(openFreight.steel_type)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Peso</span>
                  <span className="text-[#E6EDF3]">
                    {formatNum(openFreight.weight_tons)} t
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Categoria</span>
                  <GreenFreightTag category={openFreight.category} />
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Coleta</span>
                  <span className="text-[#E6EDF3]">
                    {openFreight.pickup_date
                      ? new Date(openFreight.pickup_date).toLocaleDateString(
                          "pt-BR",
                        )
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Entrega</span>
                  <span className="text-[#E6EDF3]">
                    {openFreight.delivery_date
                      ? new Date(openFreight.delivery_date).toLocaleDateString(
                          "pt-BR",
                        )
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B949E]">Orçamento</span>
                  <span className="text-[#E6EDF3]">
                    {openFreight.budget_brl
                      ? formatBRL(openFreight.budget_brl)
                      : "Aberto"}
                  </span>
                </div>
                {openFreight.notes && (
                  <div className="pt-3 border-t border-[#30363D]">
                    <div className="text-[#8B949E] text-xs mb-1">
                      Observações
                    </div>
                    <div className="text-[#E6EDF3]">{openFreight.notes}</div>
                  </div>
                )}
                <div className="pt-3 border-t border-[#30363D] text-xs text-[#8B949E]">
                  Embarcador verificado ⭐
                </div>
                <Button
                  className="w-full mt-2"
                  onClick={() => setTab("bid")}
                  disabled={!carrier}
                >
                  Fazer proposta →
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#8B949E] block mb-1">
                    Meu valor (R$)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#484F58]" />
                    <Input
                      type="number"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      placeholder="0"
                      className="pl-9"
                    />
                  </div>
                  {openFreight.budget_brl && (
                    <p className="text-xs text-[#484F58] mt-1">
                      Orçamento do embarcador:{" "}
                      {formatBRL(openFreight.budget_brl)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs text-[#8B949E] block mb-1">
                    Pedágio estimado (R$)
                  </label>
                  <Input
                    type="number"
                    value={bidToll}
                    onChange={(e) => setBidToll(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#8B949E] block mb-1">
                    Prazo estimado
                  </label>
                  <Select
                    value={bidHours}
                    onChange={(e) => setBidHours(e.target.value)}
                  >
                    <option value="24">1 dia útil</option>
                    <option value="48">2 dias úteis</option>
                    <option value="72">3 dias úteis</option>
                    <option value="96">4+ dias úteis</option>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-[#8B949E] block mb-1">
                    Caminhão
                  </label>
                  <Select
                    value={bidTruckId}
                    onChange={(e) => setBidTruckId(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {(trucks ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.plate ?? "—"} · {t.type ?? ""} ·{" "}
                        {formatNum(t.capacity_tons)}t
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-[#8B949E] block mb-1">
                    Motorista
                  </label>
                  <Select
                    value={bidDriverId}
                    onChange={(e) => setBidDriverId(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {(drivers ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full_name} {d.cnh_category ? `· ${d.cnh_category}` : ""}
                      </option>
                    ))}
                  </Select>
                </div>

                {openFreight.category && openFreight.category !== "traditional" && (
                  <label className="flex items-center gap-2 text-sm text-[#C9D1D9]">
                    <input
                      type="checkbox"
                      className="accent-[#1A9B5E]"
                      checked={bidEvCertified}
                      onChange={(e) => setBidEvCertified(e.target.checked)}
                    />
                    Confirmar caminhão verde certificado
                  </label>
                )}

                <div>
                  <label className="text-xs text-[#8B949E] block mb-1">
                    Observações
                  </label>
                  <Textarea
                    value={bidNotes}
                    onChange={(e) => setBidNotes(e.target.value)}
                    placeholder="Opcional"
                    rows={3}
                  />
                </div>

                <div className="bg-[#0D2744] border border-[#1B6CB8]/30 rounded-[10px] p-3">
                  <div className="text-sm text-[#79B8F8]">
                    Seu score atual:{" "}
                    {score ? Number(score.overall_score ?? 0).toFixed(1) : "—"}{" "}
                    — {score?.badge_tier ?? "standard"}
                  </div>
                  {score && Number(score.overall_score ?? 0) < 7 && (
                    <div className="text-xs text-[#484F58] mt-1">
                      Melhore seu score aceitando mais fretes e mantendo
                      pontualidade
                    </div>
                  )}
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={submitBid}
                  disabled={!carrier}
                >
                  Enviar proposta →
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
