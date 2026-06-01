import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Check,
  MapPin,
  ArrowRight,
  Plus,
  X,
  Scale,
  DollarSign,
  Box,
  Map as MapIcon,
  Clock,
  Truck,
  Leaf,
  Info,
  Hash,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ─── Constants per spec ───

const STEPS = [
  { id: 1, label: "Carga", title: "Detalhes da carga", subtitle: "Tipo de aço, peso e valor da carga" },
  { id: 2, label: "Rota", title: "Origem e destino", subtitle: "Onde a carga sai e onde precisa chegar" },
  { id: 3, label: "Logística", title: "Logística e operação", subtitle: "Categoria, frota aceita e janelas" },
  { id: 4, label: "Comercial", title: "Condições comerciais", subtitle: "Orçamento, prazo e referências" },
  { id: 5, label: "Revisão", title: "Revisão e publicação", subtitle: "Confira tudo antes de publicar" },
] as const;

// (id, label, desc, color) — id matches the steel_type enum in DB.
const STEEL_TYPES = [
  { id: "cold_rolled",     label: "Bobina frio",       desc: "Chapas processadas a frio",  color: "#3B89D4" },
  { id: "hot_rolled",      label: "Bobina quente",     desc: "Produção de tubos e perfis", color: "#3B89D4" },
  { id: "plate",           label: "Chapa grossa",      desc: "Estruturas pesadas",         color: "#484F58" },
  { id: "structural",      label: "Perfil estrutural", desc: "Vigas e colunas",            color: "#484F58" },
  { id: "seamless_pipe",   label: "Cano sem costura",  desc: "Alta pressão",               color: "#8B949E" },
  { id: "rebar",           label: "Vergalhão",         desc: "Construção civil",           color: "#8B949E" },
  { id: "galvanized_tube", label: "Tubo galvanizado",  desc: "Anti-corrosão",              color: "#8B949E" },
  { id: "special_steel",   label: "Aço especial",      desc: "Ferramentas e moldes",       color: "#484F58" },
] as const;

const TRUCK_TYPES = [
  { id: "truck_simples",  label: "Truck simples",  capacity: 23 },
  { id: "toco",           label: "Toco",           capacity: 15 },
  { id: "carreta",        label: "Carreta",        capacity: 33 },
  { id: "carreta_ext",    label: "Carreta ext.",   capacity: 45 },
  { id: "bitrem",         label: "Bitrem",         capacity: 57 },
  { id: "rodotrem",       label: "Rodotrem",       capacity: 74 },
  { id: "prancha",        label: "Prancha (AET)",  capacity: 0  },
] as const;

const HOUR_OPTIONS = Array.from({ length: 15 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);

const DRAFT_KEY = "steelgo:newfreight:draft";

// ─── Types ───

type Category = "traditional" | "green" | "green_ev";

type FormState = {
  // step 1
  steel_type: string;
  weight_tons: number | "";
  cargo_value_brl: number | "";
  volume_m3: number | "";
  notes: string;
  mopp: boolean;
  // step 2
  origin_city: string;
  origin_state: string;
  origin_name: string;
  dest_city: string;
  dest_state: string;
  dest_name: string;
  distance_km: number | "";
  waypoints: string[];
  // step 3
  category: Category;
  required_truck: string[];
  pickup_date: string;
  pickup_from: string;
  pickup_to: string;
  delivery_date: string;
  delivery_from: string;
  delivery_to: string;
  // step 4
  budget_brl: number | "";
  toll_included: boolean;
  bid_deadline: string;
  internal_ref: string;
};

const defaultDeadline = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(23, 59, 0, 0);
  return d.toISOString().slice(0, 16);
};

const tomorrowISO = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function NewFreightPage() {
  const { user, company } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormState>({
    defaultValues: {
      steel_type: "",
      weight_tons: "",
      cargo_value_brl: "",
      volume_m3: "",
      notes: "",
      mopp: false,
      origin_city: "", origin_state: "", origin_name: "",
      dest_city: "", dest_state: "", dest_name: "",
      distance_km: "",
      waypoints: [],
      category: "traditional",
      required_truck: [],
      pickup_date: "",
      pickup_from: "08:00", pickup_to: "18:00",
      delivery_date: "",
      delivery_from: "08:00", delivery_to: "18:00",
      budget_brl: "",
      toll_included: false,
      bid_deadline: defaultDeadline(),
      internal_ref: "",
    },
  });
  const { register, watch, setValue, getValues, handleSubmit } = form;
  const v = watch();

  // ── Load draft once ──
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<FormState>;
      (Object.keys(parsed) as Array<keyof FormState>).forEach((k) =>
        setValue(k, parsed[k] as never),
      );
    } catch { /* ignore */ }
  }, [setValue]);

  // ── Auto-save every 10s ──
  useEffect(() => {
    const t = setInterval(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(getValues()));
      setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    }, 10_000);
    return () => clearInterval(t);
  }, [getValues]);

  const saveDraftLocal = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(getValues()));
    setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    toast.success("Rascunho salvo localmente");
  };

  // ── CO₂ estimate ──
  const co2Saved = useMemo(() => {
    const w = Number(v.weight_tons) || 0;
    const km = Number(v.distance_km) || 500;
    return Math.round(w * 0.0571 * km);
  }, [v.weight_tons, v.distance_km]);

  // ── Submit to Supabase ──
  const submit = async (publish: boolean) => {
    if (!user || !company) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    if (publish) {
      if (!v.steel_type) { toast.error("Selecione o tipo de aço"); setCurrentStep(1); return; }
      if (!v.weight_tons || Number(v.weight_tons) <= 0) { toast.error("Informe o peso da carga"); setCurrentStep(1); return; }
      if (!v.origin_city || !v.dest_city) { toast.error("Informe origem e destino"); setCurrentStep(2); return; }
      if (!v.pickup_date) { toast.error("Informe a data de coleta"); setCurrentStep(3); return; }
    }

    setSubmitting(true);
    const dbCategory =
      v.category === "green" ? "green_low_carbon" :
      v.category === "green_ev" ? "green_ev" : "traditional";

    const pickupWindow = v.pickup_from && v.pickup_to ? `${v.pickup_from}-${v.pickup_to}` : null;

    const num = (x: unknown) => {
      const n = Number(x);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const { data, error } = await supabase
      .from("freights")
      .insert({
        company_id: company.id,
        created_by: user.id,
        steel_type: v.steel_type as never,
        weight_tons: num(v.weight_tons),
        cargo_value_brl: num(v.cargo_value_brl),
        notes: v.notes || null,
        origin_name: v.origin_name || null,
        origin_city: v.origin_city || null,
        origin_state: v.origin_state || null,
        dest_name: v.dest_name || null,
        dest_city: v.dest_city || null,
        dest_state: v.dest_state || null,
        distance_km: num(v.distance_km),
        category: dbCategory as never,
        required_truck: v.required_truck.length ? (v.required_truck as never) : null,
        pickup_date: v.pickup_date || null,
        delivery_date: v.delivery_date || null,
        pickup_window: pickupWindow,
        budget_brl: num(v.budget_brl),
        bid_deadline: v.bid_deadline ? new Date(v.bid_deadline).toISOString() : null,
        status: publish ? "published" : "draft",
        published_at: publish ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    setSubmitting(false);

    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      return;
    }
    localStorage.removeItem(DRAFT_KEY);
    if (publish) {
      toast.success("✅ Frete publicado! Transportadoras verificadas já podem ver sua carga.");
      void navigate({ to: "/shipper/freights/$id", params: { id: String(data!.id) } });
    } else {
      toast.success("Rascunho salvo");
      void navigate({ to: "/shipper/freights" });
    }
  };

  const stepInfo = STEPS[currentStep - 1];

  // ── Toggle helpers ──
  const toggleTruck = (id: string) => {
    const cur = v.required_truck ?? [];
    setValue("required_truck", cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  return (
    <AppShell title="Novo Frete">
      <form
        onSubmit={handleSubmit(() => {})}
        className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-[16px] border border-[#30363D] bg-[#0D1117]"
      >
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <aside className="hidden w-[200px] shrink-0 border-r border-[#30363D] bg-[#161B22] p-5 md:block">
            <div className="mb-6 text-sm font-semibold text-[#E6EDF3]">Publicar frete</div>
            <div className="flex flex-col gap-1">
              {STEPS.map((s) => {
                const done = currentStep > s.id;
                const active = currentStep === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCurrentStep(s.id)}
                    className={[
                      "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm transition",
                      active ? "bg-[#1B6CB8]/10 font-medium text-[#E6EDF3]" :
                      done ? "text-[#2ECC8A]" : "text-[#484F58]",
                    ].join(" ")}
                  >
                    {done ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#2ECC8A]/40 text-[#2ECC8A]">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span
                        className={[
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          active ? "bg-[#1B6CB8] text-white" : "bg-[#21262D] text-[#484F58]",
                        ].join(" ")}
                      >
                        {s.id}
                      </span>
                    )}
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <h1 className="mb-2 text-2xl font-bold text-[#E6EDF3]">{stepInfo.title}</h1>
            <p className="mb-8 text-sm text-[#8B949E]">{stepInfo.subtitle}</p>

            {currentStep === 1 && <StepCarga v={v} register={register} setValue={setValue} />}
            {currentStep === 2 && <StepRota v={v} register={register} setValue={setValue} />}
            {currentStep === 3 && <StepLogistica v={v} register={register} setValue={setValue} co2Saved={co2Saved} toggleTruck={toggleTruck} />}
            {currentStep === 4 && <StepComercial register={register} />}
            {currentStep === 5 && <StepRevisao v={v} co2Saved={co2Saved} goto={setCurrentStep} />}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#30363D] bg-[#161B22] p-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={saveDraftLocal}
              className="rounded-[10px] px-3 py-2 text-sm text-[#C9D1D9] transition hover:bg-[#21262D]"
            >
              Salvar rascunho
            </button>
            {savedAt && (
              <span className="text-xs text-[#484F58]">Rascunho salvo às {savedAt}</span>
            )}
          </div>
          <div className="flex gap-3">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => s - 1)}
                className="rounded-[10px] px-4 py-2 text-sm text-[#C9D1D9] transition hover:bg-[#21262D]"
              >
                Voltar
              </button>
            )}
            {currentStep < 5 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => s + 1)}
                className="rounded-[10px] bg-[#1B6CB8] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#1E7AC6]"
              >
                Próximo →
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit(true)}
                className="rounded-[10px] bg-[#1B6CB8] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1E7AC6] disabled:opacity-50"
              >
                {submitting ? "Publicando..." : "Publicar frete →"}
              </button>
            )}
          </div>
        </div>
      </form>
    </AppShell>
  );
}

// ─── Shared field primitives ───

function Field({
  label, children, hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[#C9D1D9]">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#484F58]">{hint}</p>}
    </div>
  );
}

function TextInput({
  icon: Icon, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#484F58]" />
      )}
      <input
        {...props}
        className={[
          "w-full rounded-[10px] border border-[#30363D] bg-[#0D1117] py-2.5 text-sm text-[#E6EDF3] placeholder:text-[#484F58]",
          "focus:border-[#1B6CB8] focus:outline-none focus:ring-1 focus:ring-[#1B6CB8]",
          Icon ? "pl-10 pr-3" : "px-3",
          props.className ?? "",
        ].join(" ")}
      />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "relative h-6 w-11 shrink-0 rounded-full transition",
        checked ? "bg-[#1B6CB8]" : "bg-[#30363D]",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

// ─── STEP 1: Carga ───

type StepProps = {
  v: FormState;
  register: ReturnType<typeof useForm<FormState>>["register"];
  setValue: ReturnType<typeof useForm<FormState>>["setValue"];
};

function StepCarga({ v, register, setValue }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="mb-3 block text-xs font-medium text-[#C9D1D9]">Tipo de aço</label>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {STEEL_TYPES.map((s) => {
            const selected = v.steel_type === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setValue("steel_type", s.id)}
                className={[
                  "rounded-[12px] border p-4 text-center transition-all",
                  selected
                    ? "border-[#1B6CB8] bg-[#1B6CB8]/10"
                    : "border-[#30363D] hover:border-[#484F58]",
                ].join(" ")}
              >
                <div className="mx-auto mb-2 h-2 w-2 rounded-sm" style={{ background: s.color }} />
                <div className="text-xs font-medium text-[#C9D1D9]">{s.label}</div>
                <div className="mt-1 text-[10px] text-[#484F58]">{s.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Peso (toneladas)">
          <TextInput
            icon={Scale}
            type="number" min={0.1} max={100} step={0.1}
            placeholder="0,0"
            {...register("weight_tons", { valueAsNumber: true })}
          />
          {Number(v.weight_tons) > 74 && (
            <div className="mt-2 flex items-start gap-2 rounded-[8px] border border-[#F0A500]/30 bg-[#F0A500]/10 p-2 text-xs text-[#F0A500]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Acima de 74t requer AET especial. Fale conosco.</span>
            </div>
          )}
        </Field>
        <Field label="Valor da carga (R$)">
          <TextInput
            icon={DollarSign} type="number" min={0}
            placeholder="Para cálculo do seguro RCTR-C"
            {...register("cargo_value_brl", { valueAsNumber: true })}
          />
        </Field>
        <Field label="Volume (m³)" hint="Opcional">
          <TextInput icon={Box} type="number" min={0} {...register("volume_m3", { valueAsNumber: true })} />
        </Field>
        <Field label="Manuseio especial" hint="Opcional">
          <textarea
            rows={2}
            placeholder="Instruções especiais de carregamento..."
            {...register("notes")}
            className="w-full rounded-[10px] border border-[#30363D] bg-[#0D1117] p-3 text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:border-[#1B6CB8] focus:outline-none focus:ring-1 focus:ring-[#1B6CB8]"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-[12px] bg-[#161B22] p-4">
        <div>
          <div className="text-sm text-[#C9D1D9]">Requer MOPP</div>
          <div className="text-xs text-[#484F58]">Habilitação para produtos perigosos</div>
        </div>
        <Toggle checked={v.mopp} onChange={(c) => setValue("mopp", c)} />
      </div>
    </div>
  );
}

// ─── STEP 2: Rota ───

function StepRota({ v, register, setValue }: StepProps) {
  const addWaypoint = () => {
    if ((v.waypoints?.length ?? 0) >= 3) return;
    setValue("waypoints", [...(v.waypoints ?? []), ""]);
  };
  const removeWaypoint = (i: number) => {
    setValue("waypoints", (v.waypoints ?? []).filter((_, idx) => idx !== i));
  };
  const updateWaypoint = (i: number, val: string) => {
    const next = [...(v.waypoints ?? [])];
    next[i] = val;
    setValue("waypoints", next);
  };
  const bothFilled = !!v.origin_city && !!v.dest_city;

  return (
    <div className="space-y-6">
      <Field label="Origem">
        <TextInput icon={MapPin} placeholder="Cidade de origem" {...register("origin_city")} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <TextInput placeholder="UF" maxLength={2} className="col-span-1" {...register("origin_state")} />
          <TextInput placeholder="Endereço (opcional)" className="col-span-2" {...register("origin_name")} />
        </div>
        {v.origin_city && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#1B6CB8]/15 px-3 py-1 text-xs text-[#79B8F8]">
            📍 {v.origin_city}{v.origin_state ? `, ${v.origin_state.toUpperCase()}` : ""}
            <button type="button" onClick={() => { setValue("origin_city", ""); setValue("origin_state", ""); }} className="text-[#484F58] hover:text-[#C9D1D9]">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </Field>

      <div className="flex justify-center">
        <ArrowRight className="h-5 w-5 text-[#484F58]" />
      </div>

      <Field label="Destino">
        <TextInput icon={MapPin} placeholder="Cidade de destino" {...register("dest_city")} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <TextInput placeholder="UF" maxLength={2} className="col-span-1" {...register("dest_state")} />
          <TextInput placeholder="Endereço (opcional)" className="col-span-2" {...register("dest_name")} />
        </div>
        {v.dest_city && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#1B6CB8]/15 px-3 py-1 text-xs text-[#79B8F8]">
            📍 {v.dest_city}{v.dest_state ? `, ${v.dest_state.toUpperCase()}` : ""}
            <button type="button" onClick={() => { setValue("dest_city", ""); setValue("dest_state", ""); }} className="text-[#484F58] hover:text-[#C9D1D9]">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </Field>

      {bothFilled && (
        <div className="flex flex-wrap gap-6 rounded-[12px] bg-[#161B22] p-4 text-sm text-[#C9D1D9]">
          <span className="inline-flex items-center gap-2">
            <MapIcon className="h-4 w-4 text-[#484F58]" />
            Distância estimada: {v.distance_km ? `${v.distance_km} km` : "calculando..."}
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#484F58]" />
            Tempo estimado: {v.distance_km ? `~${Math.round(Number(v.distance_km) / 70)}h` : "--"}
          </span>
        </div>
      )}

      <Field label="Distância estimada (km)" hint="Será calculada automaticamente quando a integração de mapas estiver ativa">
        <TextInput type="number" min={0} {...register("distance_km", { valueAsNumber: true })} />
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-[#C9D1D9]">Paradas intermediárias</span>
          <button
            type="button"
            onClick={addWaypoint}
            disabled={(v.waypoints?.length ?? 0) >= 3}
            className="inline-flex items-center gap-1 text-sm text-[#3B89D4] disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar parada intermediária
          </button>
        </div>
        <div className="space-y-2">
          {(v.waypoints ?? []).map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <TextInput
                icon={MapPin}
                placeholder={`Parada ${i + 1}`}
                value={w}
                onChange={(e) => updateWaypoint(i, e.target.value)}
              />
              <button type="button" onClick={() => removeWaypoint(i)} className="rounded-md p-2 text-[#484F58] hover:bg-[#21262D] hover:text-[#C9D1D9]">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── STEP 3: Logística ───

function StepLogistica({
  v, register, setValue, co2Saved, toggleTruck,
}: StepProps & { co2Saved: number; toggleTruck: (id: string) => void }) {
  const CategoryCard = ({
    id, title, subtitle, accentGreen, RightIcon, badge,
  }: {
    id: Category; title: string; subtitle: string; accentGreen?: boolean;
    RightIcon: React.ComponentType<{ className?: string }>; badge?: string;
  }) => {
    const selected = v.category === id;
    const border = selected
      ? (accentGreen ? "border-[#1A9B5E] bg-[#1A9B5E]/5" : "border-[#484F58] bg-[#21262D]")
      : "border-[#30363D]";
    return (
      <button
        type="button"
        onClick={() => setValue("category", id)}
        className={`flex items-center justify-between rounded-[14px] border p-5 text-left transition ${border}`}
      >
        <div className="flex items-center gap-4">
          <span className={[
            "flex h-5 w-5 items-center justify-center rounded-full border",
            selected ? (accentGreen ? "border-[#1A9B5E]" : "border-[#3B89D4]") : "border-[#484F58]",
          ].join(" ")}>
            {selected && <span className={`h-2.5 w-2.5 rounded-full ${accentGreen ? "bg-[#1A9B5E]" : "bg-[#3B89D4]"}`} />}
          </span>
          <div>
            <div className="font-semibold text-[#E6EDF3]">{title}</div>
            <div className={`text-sm ${accentGreen ? "text-[#2ECC8A]" : "text-[#8B949E]"}`}>{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badge && <span className="rounded-full bg-[#1A9B5E]/15 px-2 py-0.5 text-[10px] font-semibold text-[#2ECC8A]">{badge}</span>}
          <RightIcon className={`h-5 w-5 ${accentGreen ? "text-[#2ECC8A]" : "text-[#484F58]"}`} />
        </div>
      </button>
    );
  };

  const isGreen = v.category === "green" || v.category === "green_ev";

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-3 block text-xs font-medium text-[#C9D1D9]">Categoria do frete</label>
        <div className="flex flex-col gap-3">
          <CategoryCard id="traditional" title="Frete Tradicional" subtitle="Diesel convencional" RightIcon={Truck} />
          <CategoryCard id="green" title="🌿 Verde (Biodiesel)" subtitle="Redução de até 80% CO₂" accentGreen RightIcon={Leaf} />
          <CategoryCard id="green_ev" title="⚡ Verde Elétrico" subtitle="Zero emissão direta" accentGreen badge="EV" RightIcon={Leaf} />
        </div>

        {isGreen && (
          <div className="mt-2 rounded-[12px] border border-[#1A9B5E]/30 bg-[#0A2118] p-4">
            <div className="flex items-start gap-2">
              <Leaf className="mt-0.5 h-4 w-4 text-[#2ECC8A]" />
              <div>
                <div className="text-sm text-[#8B949E]">Estimativa de impacto:</div>
                <div className="text-sm font-medium text-[#2ECC8A]">
                  ~{co2Saved.toLocaleString("pt-BR")} kg CO₂ evitado vs frete tradicional
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="mb-3 block text-sm text-[#8B949E]">Tipos de caminhão aceitos:</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TRUCK_TYPES.map((t) => {
            const sel = v.required_truck?.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTruck(t.id)}
                className={[
                  "rounded-[8px] border px-3 py-2 text-center text-xs transition",
                  sel
                    ? "border-[#1B6CB8] bg-[#1B6CB8]/15 text-[#3B89D4]"
                    : "border-[#30363D] text-[#484F58] hover:border-[#484F58]",
                ].join(" ")}
              >
                {t.label}{t.capacity ? ` (${t.capacity}t)` : ""}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field label="Data de coleta">
          <TextInput type="date" min={tomorrowISO()} {...register("pickup_date")} />
        </Field>
        <Field label="Janela de coleta">
          <div className="flex items-center gap-2 text-sm text-[#C9D1D9]">
            <span>das</span>
            <TimeSelect register={register} name="pickup_from" />
            <span>às</span>
            <TimeSelect register={register} name="pickup_to" />
          </div>
        </Field>
        <Field label="Data de entrega (opcional)">
          <TextInput type="date" {...register("delivery_date")} />
        </Field>
        <Field label="Janela de entrega (opcional)">
          <div className="flex items-center gap-2 text-sm text-[#C9D1D9]">
            <span>das</span>
            <TimeSelect register={register} name="delivery_from" />
            <span>às</span>
            <TimeSelect register={register} name="delivery_to" />
          </div>
        </Field>
      </div>
    </div>
  );
}

function TimeSelect({
  register, name,
}: { register: StepProps["register"]; name: keyof FormState }) {
  return (
    <select
      {...register(name)}
      className="rounded-[8px] border border-[#30363D] bg-[#0D1117] px-2 py-1.5 text-sm text-[#E6EDF3] focus:border-[#1B6CB8] focus:outline-none"
    >
      {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}

// ─── STEP 4: Comercial ───

function StepComercial({ register }: { register: StepProps["register"] }) {
  return (
    <div className="space-y-6">
      <Field label="Orçamento de referência (R$)" hint="Opcional. Visível às transportadoras como referência. Deixe em branco para propostas abertas.">
        <TextInput icon={DollarSign} type="number" min={0} {...register("budget_brl", { valueAsNumber: true })} />
      </Field>

      <ToggleRow name="toll_included" label="Pedágio incluso no valor" register={register} />

      <Field label="Prazo para receber propostas" hint="Transportadoras poderão enviar propostas até esta data">
        <TextInput type="datetime-local" {...register("bid_deadline")} />
      </Field>

      <Field label="Referência interna (PO)" hint="Não visível às transportadoras">
        <TextInput icon={Hash} placeholder="Número do pedido interno" {...register("internal_ref")} />
      </Field>

      <Field label="Observações para transportadoras (opcional)">
        <textarea
          rows={3}
          placeholder="Instruções adicionais, restrições de horário, contato no local..."
          {...register("notes")}
          className="w-full rounded-[10px] border border-[#30363D] bg-[#0D1117] p-3 text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:border-[#1B6CB8] focus:outline-none focus:ring-1 focus:ring-[#1B6CB8]"
        />
      </Field>
    </div>
  );
}

function ToggleRow({
  name, label, register,
}: { name: keyof FormState; label: string; register: StepProps["register"] }) {
  // controlled via register checkbox for simplicity
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-[12px] bg-[#161B22] p-4">
      <span className="text-sm text-[#C9D1D9]">{label}</span>
      <input type="checkbox" {...register(name)} className="peer sr-only" />
      <span className="relative h-6 w-11 rounded-full bg-[#30363D] transition peer-checked:bg-[#1B6CB8]">
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

// ─── STEP 5: Revisão ───

function StepRevisao({
  v, co2Saved, goto,
}: { v: FormState; co2Saved: number; goto: (n: number) => void }) {
  const steel = STEEL_TYPES.find((s) => s.id === v.steel_type);
  const isGreen = v.category === "green" || v.category === "green_ev";
  const truckLabels = (v.required_truck ?? [])
    .map((id) => TRUCK_TYPES.find((t) => t.id === id)?.label ?? id)
    .join(", ") || "—";
  const catLabel =
    v.category === "green" ? "🌿 Verde (Biodiesel)" :
    v.category === "green_ev" ? "⚡ Verde Elétrico" : "Frete Tradicional";

  return (
    <div className="space-y-4">
      <SummaryCard title="📦 Carga" onEdit={() => goto(1)}>
        <KV k="Tipo de aço" val={steel?.label ?? "—"} />
        <KV k="Peso" val={v.weight_tons ? `${v.weight_tons} t` : "—"} />
        <KV k="Valor declarado" val={v.cargo_value_brl ? `R$ ${Number(v.cargo_value_brl).toLocaleString("pt-BR")}` : "—"} />
        <KV k="Volume" val={v.volume_m3 ? `${v.volume_m3} m³` : "—"} />
        <KV k="MOPP" val={v.mopp ? "Sim" : "Não"} />
        {v.notes && <KV k="Manuseio" val={v.notes} full />}
      </SummaryCard>

      <SummaryCard title="🗺️ Rota" onEdit={() => goto(2)}>
        <KV k="Origem" val={`${v.origin_city || "—"}${v.origin_state ? `, ${v.origin_state.toUpperCase()}` : ""}`} />
        <KV k="Destino" val={`${v.dest_city || "—"}${v.dest_state ? `, ${v.dest_state.toUpperCase()}` : ""}`} />
        <KV k="Distância" val={v.distance_km ? `${v.distance_km} km` : "calculando..."} />
        <KV k="Paradas" val={(v.waypoints ?? []).filter(Boolean).join(" → ") || "—"} />
      </SummaryCard>

      <SummaryCard title="⚙️ Logística" onEdit={() => goto(3)}>
        <KV k="Categoria" val={catLabel} />
        <KV k="Caminhões" val={truckLabels} />
        <KV k="Coleta" val={v.pickup_date ? `${v.pickup_date} (${v.pickup_from}-${v.pickup_to})` : "—"} />
        <KV k="Entrega" val={v.delivery_date ? `${v.delivery_date} (${v.delivery_from}-${v.delivery_to})` : "—"} />
        {isGreen && (
          <KV k="CO₂ evitado" val={<span className="text-[#2ECC8A]">~{co2Saved.toLocaleString("pt-BR")} kg</span>} full />
        )}
      </SummaryCard>

      <SummaryCard title="💰 Comercial" onEdit={() => goto(4)}>
        <KV k="Orçamento" val={v.budget_brl ? `R$ ${Number(v.budget_brl).toLocaleString("pt-BR")}` : "Propostas abertas"} />
        <KV k="Pedágio incluso" val={v.toll_included ? "Sim" : "Não"} />
        <KV k="Prazo propostas" val={v.bid_deadline ? new Date(v.bid_deadline).toLocaleString("pt-BR") : "—"} />
        <KV k="Ref. interna" val={v.internal_ref || "—"} />
      </SummaryCard>

      <div className="rounded-[12px] border border-[#1B6CB8]/30 bg-[#1B6CB8]/10 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 text-[#79B8F8]" />
          <div>
            <div className="text-sm text-[#79B8F8]">Taxa da plataforma: 3,5% do valor do frete fechado</div>
            <div className="text-xs text-[#484F58]">Você só paga quando fechar um frete.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title, onEdit, children,
}: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[#30363D] bg-[#161B22] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-[#E6EDF3]">{title}</div>
        <button type="button" onClick={onEdit} className="text-xs text-[#3B89D4] hover:underline">
          Editar
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function KV({ k, val, full }: { k: string; val: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[11px] uppercase tracking-wide text-[#484F58]">{k}</div>
      <div className="text-sm text-[#C9D1D9]">{val}</div>
    </div>
  );
}

export default NewFreightPage;
