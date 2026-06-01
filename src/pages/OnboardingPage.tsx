import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  CheckCircle,
  Mail,
  Settings,
  Package,
  FileText,
  Truck,
  Users,
  IdCard,
  UploadCloud,
  Loader2,
  Zap,
  Plus,
  Trash2,
  Calendar,
  Info,
  Rocket,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { roleHome } from "@/lib/redirects";
import { maskCPF, maskPlate } from "@/lib/masks";
import { cn } from "@/lib/utils";
import type { TruckType, UserRole } from "@/types/database";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const STEEL_TYPES = ["Bobina frio","Bobina quente","Chapa grossa","Perfil","Cano","Vergalhão","Tubo galv.","Aço especial"];
const TRUCK_TYPES: TruckType[] = ["toco","truck","bitruck","carreta","carreta_extendida","rodotrem","bitrem","ev_truck","ev_carreta"];

const STEPS_BY_ROLE: Record<string, { label: string; icon: LucideIcon }[]> = {
  shipper: [
    { label: "Verificar empresa", icon: Mail },
    { label: "Preferências", icon: Settings },
    { label: "Primeiro frete", icon: Package },
  ],
  carrier: [
    { label: "Dados da empresa", icon: FileText },
    { label: "Cadastrar frota", icon: Truck },
    { label: "Cadastrar motoristas", icon: Users },
    { label: "Concluído", icon: Check },
  ],
  driver: [
    { label: "Seus documentos", icon: IdCard },
    { label: "Aguardando", icon: Check },
  ],
};

export function OnboardingPage() {
  const { isLoading, isAuthenticated, role, profile, company, refresh, user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [bypassTimeout, setBypassTimeout] = useState(false);
  const ensuredRef = useRef(false);

  // Failsafe: never block on the spinner more than 3s
  useEffect(() => {
    const t = setTimeout(() => setBypassTimeout(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      void navigate({ to: "/login" });
      return;
    }
    // Only redirect away if we can confirm onboarded === true
    if (profile?.is_onboarded === true) void navigate({ to: roleHome(role) });
  }, [isLoading, isAuthenticated, profile, role, navigate]);

  // Auto-create a profile row if missing so the page never stays empty
  useEffect(() => {
    if (!user || ensuredRef.current) return;
    ensuredRef.current = true;
    void (async () => {
      try {
        const { data: existing } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        if (!existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase.from("profiles") as any).insert({
            id: user.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            full_name: (user.user_metadata as any)?.full_name || "Usuário",
            email: user.email || "",
            is_verified: false,
            is_onboarded: false,
            language: "pt-BR",
            is_active: true,
          });
          if (error) console.error("[Onboarding] profile insert error:", error);
          await refresh();
        }
      } catch (e) {
        console.error("[Onboarding] ensure profile failed:", e);
      }
    })();
  }, [user, refresh]);

  const effectiveRole = (role ?? "shipper") as UserRole;
  const steps = useMemo(() => STEPS_BY_ROLE[effectiveRole] ?? [], [effectiveRole]);

  // Show spinner only briefly. After 3s, render the page regardless.
  if (!bypassTimeout && (isLoading || !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D1117]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B6CB8]" />
      </div>
    );
  }

  // After bypass, if user still missing, send to login
  if (!user) {
    void navigate({ to: "/login" });
    return null;
  }


  const finish = async () => {
    await (supabase.from("profiles") as any).update({ is_onboarded: true }).eq("id", user.id);
    await refresh();
  };

  const lastStep = steps.length - 1;
  const goNext = () => setStep((s) => Math.min(s + 1, lastStep));

  return (
    <div className="flex min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[#30363D] bg-[#161B22] p-8 md:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#1B6CB8]">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-[#E6EDF3]">SteelGo</span>
        </div>
        <div className="mt-8 mb-4 text-xs uppercase tracking-widest text-[#484F58]">
          Configuração inicial
        </div>
        <ol className="flex flex-col gap-1">
          {steps.map((s, i) => {
            const done = step > i;
            const active = step === i;
            const Icon = s.icon;
            return (
              <li key={s.label} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    done && "bg-[#1A9B5E]",
                    active && "bg-[#1B6CB8]",
                    !done && !active && "bg-[#21262D]",
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5 text-white" />
                  ) : (
                    <Icon className={cn("h-3.5 w-3.5", active ? "text-white" : "text-[#484F58]")} />
                  )}
                </div>
                <span
                  className={cn(
                    "text-sm",
                    done && "text-[#2ECC8A]",
                    active && "font-medium text-[#E6EDF3]",
                    !done && !active && "text-[#484F58]",
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-auto pt-8 text-xs text-[#484F58]">
          Precisa de ajuda?{" "}
          <a
            href="https://wa.me/5511000000000"
            target="_blank"
            rel="noreferrer"
            className="text-[#3B89D4] hover:underline"
          >
            WhatsApp
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-8 md:p-12">
        <div className="mx-auto max-w-[560px]">
          {effectiveRole === "shipper" && (
            <>
              {step === 0 && <ShipperVerify userId={user.id} companyId={company?.id ?? null} onNext={goNext} />}
              {step === 1 && <ShipperPreferences userId={user.id} onNext={goNext} />}
              {step === 2 && (
                <ShipperFirstFreight
                  onPost={async () => { await finish(); void navigate({ to: "/shipper/freights/new" }); }}
                  onExplore={async () => { await finish(); void navigate({ to: "/shipper" }); }}
                />
              )}
            </>
          )}
          {effectiveRole === "carrier" && (
            <>
              {step === 0 && <CarrierCompany userId={user.id} companyId={company?.id ?? null} onNext={goNext} />}
              {step === 1 && <CarrierFleet companyId={company?.id ?? null} onNext={goNext} />}
              {step === 2 && <CarrierDrivers companyId={company?.id ?? null} onNext={goNext} />}
              {step === 3 && (
                <Completion
                  onFinish={async () => { await finish(); void navigate({ to: roleHome(role) }); }}
                />
              )}
            </>
          )}
          {effectiveRole === "driver" && (
            <>
              {step === 0 && <DriverDocs userId={user.id} onNext={goNext} />}
              {step === 1 && (
                <Completion
                  onFinish={async () => { await finish(); void navigate({ to: roleHome(role) }); }}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ───────── Reusable UI ─────────
function UploadArea({
  onFile,
  accept = ".pdf,.jpg,.jpeg,.png",
  capture,
  label = "Arraste o arquivo aqui",
  hint = "PDF, JPG ou PNG — máx. 10MB",
  selected,
  compact,
}: {
  onFile: (f: File) => void;
  accept?: string;
  capture?: "user" | "environment";
  label?: string;
  hint?: string;
  selected?: File | null;
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => ref.current?.click()}
      className={cn(
        "cursor-pointer rounded-[16px] border-2 border-dashed border-[#30363D] text-center transition hover:border-[#484F58]",
        compact ? "p-4" : "p-8",
      )}
    >
      {selected ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Check className="h-4 w-4 text-[#2ECC8A]" />
          <span className="text-[#C9D1D9]">{selected.name}</span>
          <span className="text-xs text-[#484F58]">({(selected.size / 1024).toFixed(0)} KB)</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ref.current?.click(); }}
            className="ml-2 text-xs text-[#3B89D4] hover:underline"
          >
            Trocar arquivo
          </button>
        </div>
      ) : (
        <>
          <UploadCloud className="mx-auto mb-3 h-10 w-10 text-[#484F58]" />
          <div className="text-sm text-[#C9D1D9]">{label}</div>
          <div className="mt-1 text-xs text-[#484F58]">ou clique para selecionar</div>
          <div className="mt-2 text-xs text-[#484F58]">{hint}</div>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-[6px] border px-2 py-1 text-xs transition",
        active
          ? "border-[#1B6CB8] bg-[#1B6CB8]/20 text-[#3B89D4]"
          : "border-[#30363D] bg-transparent text-[#484F58] hover:border-[#484F58]",
      )}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({ children, onClick, disabled, full, className }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; full?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-[10px] bg-[#1B6CB8] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#1E7AC6] disabled:cursor-not-allowed disabled:opacity-50",
        full && "w-full",
        className,
      )}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, full }: { children: React.ReactNode; onClick?: () => void; full?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[10px] border border-[#30363D] bg-transparent px-6 py-3 text-sm font-medium text-[#C9D1D9] transition hover:border-[#484F58] hover:bg-[#161B22]",
        full && "w-full",
      )}
    >
      {children}
    </button>
  );
}

function GreenBtn({ children, onClick, disabled, full }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; full?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-[10px] bg-[#1A9B5E] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#22B870] disabled:cursor-not-allowed disabled:opacity-50",
        full && "w-full",
      )}
    >
      {children}
    </button>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { leftIcon?: LucideIcon }) {
  const { leftIcon: Icon, className, ...rest } = props;
  return (
    <div className="relative">
      {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#484F58]" />}
      <input
        {...rest}
        className={cn(
          "w-full rounded-[10px] border border-[#30363D] bg-[#0D1117] py-2.5 text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:border-[#1B6CB8] focus:outline-none",
          Icon ? "pl-9 pr-3" : "px-3",
          className,
        )}
      />
    </div>
  );
}

// ───────── SHIPPER ─────────
function ShipperVerify({ userId, companyId, onNext }: { userId: string; companyId: string | null; onNext: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const upload = async () => {
    if (!file) return;
    if (!companyId) { toast.error("Empresa não encontrada"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${companyId}/cnpj_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-docs").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    await (supabase.from("companies") as any).update({ verification_doc_url: path }).eq("id", companyId);
    setDone(true);
    setUploading(false);
    toast.success("Documento enviado!");
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[#E6EDF3]">Verifique sua empresa</h1>
      <p className="mb-8 text-sm text-[#8B949E]">Envie o documento do CNPJ para liberar todos os recursos.</p>

      <UploadArea onFile={setFile} selected={file} label="Arraste o Cartão CNPJ aqui" />

      {done && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#2ECC8A]">
          <CheckCircle className="h-4 w-4" /> Documento enviado! Verificação em até 24h.
        </div>
      )}

      {file && !done && (
        <GreenBtn full onClick={() => void upload()} disabled={uploading}>
          {uploading ? "Enviando..." : "Enviar documento"}
        </GreenBtn>
      )}

      <button
        type="button"
        onClick={onNext}
        className="mt-4 block w-full cursor-pointer text-center text-sm text-[#484F58] hover:text-[#8B949E]"
      >
        Pular por agora
      </button>

      <div className="mt-8 flex justify-between gap-4">
        <GhostBtn onClick={onNext}>Pular por agora</GhostBtn>
        <PrimaryBtn onClick={onNext}>Continuar →</PrimaryBtn>
      </div>
    </div>
  );
}

function ShipperPreferences({ userId, onNext }: { userId: string; onNext: () => void }) {
  const [states, setStates] = useState<string[]>([]);
  const [steels, setSteels] = useState<string[]>([]);
  const [greenTarget, setGreenTarget] = useState(20);
  const [alerts, setAlerts] = useState({ whatsapp: true, push: true, email: true, sms: false });
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = async () => {
    setSaving(true);
    await (supabase.from("profiles") as any).update({
      preferences: { states, steel_types: steels, green_target: greenTarget, alerts },
    }).eq("id", userId);
    setSaving(false);
    onNext();
  };

  const alertColor = (k: keyof typeof alerts) => {
    if (k === "whatsapp") return alerts[k] ? "bg-[#1A9B5E] border-[#1A9B5E] text-white" : "border-[#1A9B5E] text-[#1A9B5E]";
    if (k === "sms") return alerts[k] ? "bg-[#484F58] border-[#484F58] text-white" : "border-[#484F58] text-[#484F58]";
    return alerts[k] ? "bg-[#1B6CB8] border-[#1B6CB8] text-white" : "border-[#1B6CB8] text-[#3B89D4]";
  };

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold text-[#E6EDF3]">Configure suas preferências</h1>

      <div className="mb-3 text-sm text-[#8B949E]">Estados de origem habituais:</div>
      <div className="grid grid-cols-9 gap-2">
        {UFS.map((u) => <Pill key={u} active={states.includes(u)} onClick={() => setStates(toggle(states, u))}>{u}</Pill>)}
      </div>

      <div className="mb-3 mt-6 text-sm text-[#8B949E]">Tipos de aço mais usados:</div>
      <div className="flex flex-wrap gap-2">
        {STEEL_TYPES.map((s) => <Pill key={s} active={steels.includes(s)} onClick={() => setSteels(toggle(steels, s))}>{s}</Pill>)}
      </div>

      <div className="mb-3 mt-6 text-sm text-[#8B949E]">Meta de logística verde:</div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={greenTarget}
        onChange={(e) => setGreenTarget(+e.target.value)}
        className="w-full accent-[#1A9B5E]"
      />
      <div className="mt-2 text-sm text-[#E6EDF3]">Meta: {greenTarget}% de fretes com logística verde</div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#21262D]">
        <div className="h-full bg-[#1A9B5E] transition-all" style={{ width: `${greenTarget}%` }} />
      </div>

      <div className="mb-3 mt-6 text-sm text-[#8B949E]">Alertas preferidos:</div>
      <div className="flex gap-2">
        {(["whatsapp","push","email","sms"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setAlerts({ ...alerts, [k]: !alerts[k] })}
            className={cn("rounded-[8px] border px-4 py-2 text-xs font-medium capitalize transition", alertColor(k))}
          >
            {k}
          </button>
        ))}
      </div>

      <PrimaryBtn full className="mt-8" onClick={() => void save()} disabled={saving}>
        {saving ? "Salvando..." : "Continuar →"}
      </PrimaryBtn>
    </div>
  );
}

function ShipperFirstFreight({ onPost, onExplore }: { onPost: () => void; onExplore: () => void }) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[#E6EDF3]">Tudo pronto!</h1>
      <p className="mb-8 text-sm text-[#8B949E]">Você pode publicar seu primeiro frete agora ou explorar a plataforma.</p>

      <div className="flex flex-col gap-4">
        <div className="rounded-[16px] border-2 border-[#1B6CB8] bg-[#1B6CB8]/5 p-6">
          <Rocket className="mb-3 h-8 w-8 text-[#3B89D4]" />
          <div className="mb-2 text-lg font-bold text-[#E6EDF3]">Publicar meu primeiro frete →</div>
          <div className="text-sm text-[#8B949E]">Receba propostas de transportadoras verificadas em minutos.</div>
          <PrimaryBtn full className="mt-4" onClick={onPost}>Publicar agora</PrimaryBtn>
        </div>
        <div className="rounded-[16px] border border-[#30363D] bg-[#161B22] p-6">
          <LayoutDashboard className="mb-3 h-8 w-8 text-[#484F58]" />
          <div className="mb-2 text-lg font-bold text-[#E6EDF3]">Explorar a plataforma primeiro</div>
          <div className="text-sm text-[#8B949E]">Conheça o dashboard antes de publicar seu frete.</div>
          <GhostBtn full onClick={onExplore}>Ver o dashboard</GhostBtn>
        </div>
      </div>
    </div>
  );
}

// ───────── CARRIER ─────────
function CarrierCompany({ userId, companyId, onNext }: { userId: string; companyId: string | null; onNext: () => void }) {
  const [antt, setAntt] = useState("");
  const [policy, setPolicy] = useState<File | null>(null);
  const [expiry, setExpiry] = useState("");
  const [states, setStates] = useState<string[]>([]);
  const [hasEv, setHasEv] = useState(false);
  const [evCount, setEvCount] = useState(1);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!companyId) { toast.error("Empresa não encontrada"); return; }
    setSaving(true);
    let docPath: string | null = null;
    if (policy) {
      const path = `${companyId}/rctr_c.pdf`;
      const { error } = await supabase.storage.from("company-docs").upload(path, policy, { upsert: true });
      if (error) { toast.error(error.message); setSaving(false); return; }
      docPath = path;
    }
    const { data: existing } = await supabase.from("carriers").select("id").eq("company_id", companyId).maybeSingle();
    const payload: any = {
      antt_rntrc: antt,
      insurance_expiry: expiry || null,
      operating_states: states,
      has_ev_trucks: hasEv,
      ev_truck_count: hasEv ? evCount : 0,
    };
    if (docPath) payload.insurance_doc_url = docPath;
    if (existing) {
      await (supabase.from("carriers") as any).update(payload).eq("id", existing.id);
    } else {
      await (supabase.from("carriers") as any).insert({ company_id: companyId, ...payload });
    }
    setSaving(false);
    onNext();
  };

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold text-[#E6EDF3]">Dados da transportadora</h1>

      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 text-sm text-[#8B949E]">RNTRC/ANTT</div>
          <TextInput leftIcon={FileText} placeholder="BR-0000000" value={antt} onChange={(e) => setAntt(e.target.value)} />
        </div>

        <div>
          <div className="mb-1.5 text-sm text-[#8B949E]">Apólice RCTR-C (PDF)</div>
          <UploadArea onFile={setPolicy} selected={policy} accept=".pdf" label="Envie a apólice em PDF" hint="PDF — máx. 10MB" />
        </div>

        <div>
          <div className="mb-1.5 text-sm text-[#8B949E]">Vencimento da apólice</div>
          <TextInput type="date" leftIcon={Calendar} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>

        <div>
          <div className="mb-3 text-sm text-[#8B949E]">Estados onde opera:</div>
          <div className="grid grid-cols-9 gap-2">
            {UFS.map((u) => (
              <Pill key={u} active={states.includes(u)} onClick={() => setStates((s) => s.includes(u) ? s.filter((x) => x !== u) : [...s, u])}>{u}</Pill>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 text-sm text-[#8B949E]">Tem caminhões elétricos?</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setHasEv((v) => !v)}
              className={cn(
                "relative h-6 w-11 rounded-full transition",
                hasEv ? "bg-[#1A9B5E]" : "bg-[#30363D]",
              )}
            >
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition", hasEv ? "left-[22px]" : "left-0.5")} />
            </button>
            {hasEv && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#8B949E]">Quantos?</span>
                <TextInput
                  type="number"
                  min={1}
                  value={evCount}
                  onChange={(e) => setEvCount(Math.max(1, +e.target.value))}
                  className="w-24"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <PrimaryBtn full className="mt-8" onClick={() => void save()} disabled={saving}>
        {saving ? "Salvando..." : "Continuar →"}
      </PrimaryBtn>
    </div>
  );
}

interface TruckDraft { plate: string; type: TruckType; capacity: string; year: string; brand: string; model: string; is_ev: boolean; autonomy: string; crlv: File | null }

function CarrierFleet({ companyId, onNext }: { companyId: string | null; onNext: () => void }) {
  const [trucks, setTrucks] = useState<TruckDraft[]>([]);
  const [open, setOpen] = useState(false);
  const blank: TruckDraft = { plate: "", type: "truck", capacity: "", year: "", brand: "", model: "", is_ev: false, autonomy: "", crlv: null };
  const [form, setForm] = useState<TruckDraft>(blank);

  const saveTruck = async () => {
    if (!form.plate) return toast.error("Placa obrigatória");
    if (!companyId) { setTrucks([...trucks, form]); setOpen(false); setForm(blank); return; }
    const { data: carrier } = await supabase.from("carriers").select("id").eq("company_id", companyId).maybeSingle();
    if (carrier) {
      await (supabase.from("trucks") as any).insert({
        carrier_id: carrier.id, plate: form.plate, type: form.type,
        capacity_tons: form.capacity ? +form.capacity : null, year: form.year ? +form.year : null,
        brand: form.brand, model: form.model, is_ev: form.is_ev,
      });
    }
    setTrucks([...trucks, form]);
    setForm(blank);
    setOpen(false);
    toast.success("Caminhão cadastrado");
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[#E6EDF3]">Cadastre sua frota</h1>
      <p className="mb-8 text-sm text-[#8B949E]">Você pode adicionar mais caminhões depois.</p>

      <div className="flex flex-col gap-3">
        {trucks.map((t, i) => (
          <div key={i} className="flex items-center justify-between rounded-[10px] border border-[#30363D] bg-[#161B22] p-4">
            <div>
              <div className="font-semibold text-[#E6EDF3]">{t.plate}</div>
              <div className="text-xs text-[#8B949E]">{t.type} • {t.capacity || "?"}t {t.is_ev && "• EV"}</div>
            </div>
            <button type="button" onClick={() => setTrucks(trucks.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4 text-[#484F58] hover:text-red-400" />
            </button>
          </div>
        ))}

        {open ? (
          <div className="rounded-[10px] border border-[#30363D] bg-[#161B22] p-4">
            <div className="grid grid-cols-2 gap-3">
              <TextInput placeholder="Placa ABC-1234" value={form.plate} onChange={(e) => setForm({ ...form, plate: maskPlate(e.target.value) })} />
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as TruckType })}
                className="rounded-[10px] border border-[#30363D] bg-[#0D1117] px-3 py-2.5 text-sm text-[#E6EDF3]"
              >
                {TRUCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <TextInput type="number" min={1} max={74} placeholder="Capacidade (t)" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
              <TextInput type="number" min={2000} max={2025} placeholder="Ano" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              <TextInput placeholder="Volvo" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              <TextInput placeholder="FH 540" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, is_ev: !form.is_ev })}
                className={cn("relative h-6 w-11 rounded-full transition", form.is_ev ? "bg-[#1A9B5E]" : "bg-[#30363D]")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition", form.is_ev ? "left-[22px]" : "left-0.5")} />
              </button>
              <span className="text-sm text-[#8B949E]">É elétrico?</span>
              {form.is_ev && (
                <TextInput type="number" placeholder="Autonomia (km)" value={form.autonomy} onChange={(e) => setForm({ ...form, autonomy: e.target.value })} className="w-40" />
              )}
            </div>
            <div className="mt-3">
              <UploadArea onFile={(f) => setForm({ ...form, crlv: f })} selected={form.crlv} compact label="Upload CRLV" />
            </div>
            <div className="mt-3 flex justify-end">
              <GreenBtn onClick={() => void saveTruck()}>Salvar caminhão</GreenBtn>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#30363D] bg-[#161B22] px-4 py-3 text-sm text-[#C9D1D9] hover:border-[#484F58]"
          >
            <Plus className="h-4 w-4" /> Adicionar caminhão
          </button>
        )}
      </div>

      <div className="mt-8 flex justify-between gap-4">
        <GhostBtn onClick={onNext}>Pular</GhostBtn>
        <PrimaryBtn onClick={onNext}>Continuar →</PrimaryBtn>
      </div>
    </div>
  );
}

interface DriverDraft { full_name: string; cpf: string; cnh_number: string; cnh_category: string; cnh_expiry: string; has_mopp: boolean }

function CarrierDrivers({ companyId, onNext }: { companyId: string | null; onNext: () => void }) {
  const [drivers, setDrivers] = useState<DriverDraft[]>([]);
  const blank: DriverDraft = { full_name: "", cpf: "", cnh_number: "", cnh_category: "E", cnh_expiry: "", has_mopp: false };
  const [form, setForm] = useState<DriverDraft>(blank);
  const [open, setOpen] = useState(false);

  const saveDriver = async () => {
    if (!form.full_name) return toast.error("Nome obrigatório");
    if (companyId) {
      const { data: carrier } = await supabase.from("carriers").select("id").eq("company_id", companyId).maybeSingle();
      if (carrier) {
        await (supabase.from("drivers") as any).insert({ ...form, carrier_id: carrier.id, cnh_expiry: form.cnh_expiry || null });
      }
    }
    setDrivers([...drivers, form]);
    setForm(blank);
    setOpen(false);
    toast.success("Motorista cadastrado");
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[#E6EDF3]">Cadastre seus motoristas</h1>
      <p className="mb-8 text-sm text-[#8B949E]">Você pode adicionar mais motoristas depois.</p>

      <div className="flex flex-col gap-3">
        {drivers.map((d, i) => (
          <div key={i} className="flex items-center justify-between rounded-[10px] border border-[#30363D] bg-[#161B22] p-4">
            <div>
              <div className="font-semibold text-[#E6EDF3]">{d.full_name}</div>
              <div className="text-xs text-[#8B949E]">CNH {d.cnh_category} • {d.cnh_number} {d.has_mopp && "• MOPP"}</div>
            </div>
            <button type="button" onClick={() => setDrivers(drivers.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4 text-[#484F58] hover:text-red-400" />
            </button>
          </div>
        ))}

        {open ? (
          <div className="rounded-[10px] border border-[#30363D] bg-[#161B22] p-4">
            <div className="grid grid-cols-2 gap-3">
              <TextInput placeholder="Nome completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <TextInput placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} />
              <TextInput placeholder="Número CNH" value={form.cnh_number} onChange={(e) => setForm({ ...form, cnh_number: e.target.value })} />
              <select
                value={form.cnh_category}
                onChange={(e) => setForm({ ...form, cnh_category: e.target.value })}
                className="rounded-[10px] border border-[#30363D] bg-[#0D1117] px-3 py-2.5 text-sm text-[#E6EDF3]"
              >
                {["C","D","E"].map((c) => <option key={c} value={c}>Categoria {c}</option>)}
              </select>
              <TextInput type="date" value={form.cnh_expiry} onChange={(e) => setForm({ ...form, cnh_expiry: e.target.value })} />
              <label className="flex items-center gap-2 text-sm text-[#C9D1D9]">
                <input type="checkbox" checked={form.has_mopp} onChange={(e) => setForm({ ...form, has_mopp: e.target.checked })} />
                Tem MOPP?
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <GreenBtn onClick={() => void saveDriver()}>Salvar motorista</GreenBtn>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#30363D] bg-[#161B22] px-4 py-3 text-sm text-[#C9D1D9] hover:border-[#484F58]"
          >
            <Plus className="h-4 w-4" /> Adicionar motorista
          </button>
        )}
      </div>

      <div className="mt-8 flex justify-between gap-4">
        <GhostBtn onClick={onNext}>Pular</GhostBtn>
        <PrimaryBtn onClick={onNext}>Continuar →</PrimaryBtn>
      </div>
    </div>
  );
}

// ───────── DRIVER ─────────
function DriverDocs({ userId, onNext }: { userId: string; onNext: () => void }) {
  const [cnh, setCnh] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const submit = async () => {
    if (!cnh) return;
    setUploading(true);
    const up = async (file: File, name: string) => {
      const { error } = await supabase.storage.from("driver-docs").upload(`${userId}/${name}.jpg`, file, { upsert: true });
      if (error) throw error;
    };
    try {
      await up(cnh, "cnh");
      if (selfie) await up(selfie, "selfie");
      toast.success("Documentos enviados!");
      onNext();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[#E6EDF3]">Envie seus documentos</h1>
      <p className="mb-6 text-sm text-[#8B949E]">Para liberar suas entregas precisamos verificar sua CNH.</p>

      <div className="mb-6 flex gap-3 rounded-[14px] border border-[#30363D] bg-[#161B22] p-4">
        <Info className="h-5 w-5 shrink-0 text-[#3B89D4]" />
        <p className="text-sm text-[#8B949E]">
          <strong className="text-[#C9D1D9]">Por que precisamos da sua CNH?</strong> Para confirmar que você é um motorista habilitado e proteger sua segurança nas entregas.
        </p>
      </div>

      <div className="mb-3 text-sm text-[#8B949E]">Foto da CNH (frente)</div>
      <UploadArea onFile={setCnh} selected={cnh} accept="image/*" capture="environment" label="Foto da CNH" hint="JPG ou PNG" />

      <div className="mb-3 mt-4 text-sm text-[#8B949E]">Selfie segurando a CNH</div>
      <UploadArea onFile={setSelfie} selected={selfie} accept="image/*" capture="user" label="Selfie com a CNH" hint="JPG ou PNG" />

      <GreenBtn full onClick={() => void submit()} disabled={!cnh || uploading}>
        {uploading ? "Enviando..." : "Enviar documentos"}
      </GreenBtn>

      <button
        type="button"
        onClick={onNext}
        className="mt-3 block w-full cursor-pointer text-center text-sm text-[#484F58] hover:text-[#8B949E]"
      >
        Enviar depois
      </button>
    </div>
  );
}

// ───────── COMPLETION ─────────
function Completion({ onFinish }: { onFinish: () => void | Promise<void> }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 20);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="flex flex-col items-center text-center transition-all duration-[400ms] ease-out"
      style={{
        transform: shown ? "scale(1)" : "scale(0.5)",
        opacity: shown ? 1 : 0,
      }}
    >
      <CheckCircle className="mx-auto mb-6 h-[72px] w-[72px] text-[#2ECC8A]" />
      <h1 className="mb-3 text-2xl font-bold text-[#E6EDF3]">Você está pronto para usar a SteelGo!</h1>
      <p className="mb-8 text-sm text-[#8B949E]">
        Sua conta está sendo verificada. Te avisamos por WhatsApp em até 24h.
      </p>
      <PrimaryBtn full onClick={() => void onFinish()}>Ir para o dashboard →</PrimaryBtn>
    </div>
  );
}

export default OnboardingPage;
