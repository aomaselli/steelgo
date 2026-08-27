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
import { BrandLogo } from "@/components/brand/BrandLogo";
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
  const [companyBootstrapState, setCompanyBootstrapState] = useState<"idle" | "loading" | "error">("idle");
  const [companyBootstrapError, setCompanyBootstrapError] = useState<string | null>(null);
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

  useEffect(() => {
    if (isLoading || !user || !role || (role !== "shipper" && role !== "carrier")) return;
    if (company) {
      setCompanyBootstrapState("idle");
      setCompanyBootstrapError(null);
      return;
    }

    const pendingCompany = (user.user_metadata as { pending_company?: Record<string, unknown> } | undefined)?.pending_company;
    if (!pendingCompany) return;

    let active = true;
    setCompanyBootstrapState("loading");
    setCompanyBootstrapError(null);

    void (async () => {
      try {
        const { error } = await supabase.rpc("complete_company_registration");
        if (error) throw error;
        await refresh();
        await supabase.auth.updateUser({ data: { pending_company: null } });
        if (active) {
          setCompanyBootstrapState("idle");
        }
      } catch (error) {
        if (!active) return;
        setCompanyBootstrapState("error");
        setCompanyBootstrapError(error instanceof Error ? error.message : "Não foi possível concluir o cadastro da empresa.");
      }
    })();

    return () => {
      active = false;
    };
  }, [company, isLoading, refresh, role, user]);

  const effectiveRole = (role ?? "shipper") as UserRole;
  const steps = useMemo(() => STEPS_BY_ROLE[effectiveRole] ?? [], [effectiveRole]);

  // Show spinner only briefly. After 3s, render the page regardless.
  if (!bypassTimeout && (isLoading || !user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B6CB8]" />
      </div>
    );
  }

  // After bypass, if user still missing, send to login
  if (!user) {
    void navigate({ to: "/login" });
    return null;
  }

  if ((role === "shipper" || role === "carrier") && !company && companyBootstrapState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] text-[#10274A]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#1B6CB8]" />
          <p className="text-sm text-[#5B6B80]">Concluindo cadastro da empresa...</p>
        </div>
      </div>
    );
  }

  if ((role === "shipper" || role === "carrier") && !company && companyBootstrapState === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F7FB] p-6 text-center">
        <div className="max-w-md rounded-[16px] border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-[#10274A]">Não foi possível concluir o cadastro</h1>
          <p className="text-sm text-[#D94B5C]">{companyBootstrapError ?? "Erro desconhecido ao concluir a empresa."}</p>
        </div>
      </div>
    );
  }

  const finish = async () => {
    await (supabase.from("profiles") as any).update({ is_onboarded: true }).eq("id", user.id);
    await refresh();
  };

  const lastStep = steps.length - 1;
  const goNext = () => setStep((s) => Math.min(s + 1, lastStep));

  return (
    <div className="flex min-h-screen bg-[#F4F7FB] text-[#10274A]">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[#22334A] bg-[#111E33] p-8 md:flex">
        <BrandLogo surface="dark" className="h-8 w-auto" />
        <div className="mt-8 mb-4 text-xs uppercase tracking-widest text-[#B8C6D6]">
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
                    !done && !active && "bg-[#E8EEF6]",
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5 text-white" />
                  ) : (
                    <Icon className={cn("h-3.5 w-3.5", active ? "text-white" : "text-[#5B6B80]")} />
                  )}
                </div>
                <span
                  className={cn(
                    "text-sm",
                    done && "text-[#1A9B5E]",
                    active && "font-medium text-white",
                    !done && !active && "text-[#5B6B80]",
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-auto pt-8 text-xs text-[#B8C6D6]">
          Precisa de ajuda?{" "}
          <a
            href="https://wa.me/5511000000000"
            target="_blank"
            rel="noreferrer"
            className="text-[#8AB7E8] hover:underline"
          >
            WhatsApp
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-[#F4F7FB] p-8 md:p-12">
        <div className="mx-auto max-w-[560px] rounded-[24px] border border-[#E3EAF3] bg-white p-6 shadow-[0_12px_32px_rgba(16,39,74,0.06)] md:p-8">
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
        "cursor-pointer rounded-[16px] border-2 border-dashed border-[#E3EAF3] bg-[#F8FBFF] text-center transition hover:border-[#1B6CB8]",
        compact ? "p-4" : "p-8",
      )}
    >
      {selected ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Check className="h-4 w-4 text-[#1A9B5E]" />
          <span className="text-[#10274A]">{selected.name}</span>
          <span className="text-xs text-[#5B6B80]">({(selected.size / 1024).toFixed(0)} KB)</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ref.current?.click(); }}
            className="ml-2 text-xs text-[#1B6CB8] hover:underline"
          >
            Trocar arquivo
          </button>
        </div>
      ) : (
        <>
          <UploadCloud className="mx-auto mb-3 h-10 w-10 text-[#5B6B80]" />
          <div className="text-sm text-[#10274A]">{label}</div>
          <div className="mt-1 text-xs text-[#5B6B80]">ou clique para selecionar</div>
          <div className="mt-2 text-xs text-[#5B6B80]">{hint}</div>
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
          ? "border-[#1B6CB8] bg-[#EAF4FF] text-[#1B6CB8]"
          : "border-[#E3EAF3] bg-white text-[#5B6B80] hover:border-[#C7D4E4] hover:text-[#10274A]",
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
        "rounded-[10px] bg-[#1B6CB8] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#155EA8] disabled:cursor-not-allowed disabled:opacity-50",
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
        "rounded-[10px] border border-[#E3EAF3] bg-white px-6 py-3 text-sm font-medium text-[#10274A] transition hover:border-[#C7D4E4] hover:bg-[#F4F7FB]",
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
        "rounded-[10px] bg-[#1A9B5E] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#16885A] disabled:cursor-not-allowed disabled:opacity-50",
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
      {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5B6B80]" />}
      <input
        {...rest}
        className={cn(
          "w-full rounded-[10px] border border-[#E3EAF3] bg-white py-2.5 text-sm text-[#10274A] placeholder:text-[#5B6B80] focus:border-[#1B6CB8] focus:outline-none",
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
      <h1 className="mb-2 text-2xl font-bold text-[#10274A]">Verifique sua empresa</h1>
      <p className="mb-8 text-sm text-[#5B6B80]">Envie o documento do CNPJ para liberar todos os recursos.</p>

      <UploadArea onFile={setFile} selected={file} label="Arraste o Cartão CNPJ aqui" />

      {done && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[#1A9B5E]">
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
        className="mt-4 block w-full cursor-pointer text-center text-sm text-[#5B6B80] hover:text-[#10274A]"
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
      <h1 className="mb-8 text-2xl font-bold text-[#10274A]">Configure suas preferências</h1>

      <div className="mb-3 text-sm text-[#5B6B80]">Estados de origem habituais:</div>
      <div className="grid grid-cols-9 gap-2">
        {UFS.map((u) => <Pill key={u} active={states.includes(u)} onClick={() => setStates(toggle(states, u))}>{u}</Pill>)}
      </div>

      <div className="mb-3 mt-6 text-sm text-[#5B6B80]">Tipos de aço mais usados:</div>
      <div className="flex flex-wrap gap-2">
        {STEEL_TYPES.map((s) => <Pill key={s} active={steels.includes(s)} onClick={() => setSteels(toggle(steels, s))}>{s}</Pill>)}
      </div>

      <div className="mb-3 mt-6 text-sm text-[#5B6B80]">Meta de logística verde:</div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={greenTarget}
        onChange={(e) => setGreenTarget(+e.target.value)}
        className="w-full accent-[#1A9B5E]"
      />
      <div className="mt-2 text-sm text-[#10274A]">Meta: {greenTarget}% de fretes com logística verde</div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E3EAF3]">
        <div className="h-full bg-[#1A9B5E] transition-all" style={{ width: `${greenTarget}%` }} />
      </div>

      <div className="mb-3 mt-6 text-sm text-[#5B6B80]">Alertas preferidos:</div>
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
      <h1 className="mb-2 text-2xl font-bold text-[#10274A]">Tudo pronto!</h1>
      <p className="mb-8 text-sm text-[#5B6B80]">Você pode publicar seu primeiro frete agora ou explorar a plataforma.</p>

      <div className="flex flex-col gap-4">
        <div className="rounded-[16px] border-2 border-[#1B6CB8] bg-[#EAF4FF] p-6">
          <Rocket className="mb-3 h-8 w-8 text-[#1B6CB8]" />
          <div className="mb-2 text-lg font-bold text-[#10274A]">Publicar meu primeiro frete →</div>
          <div className="text-sm text-[#5B6B80]">Receba propostas de transportadoras verificadas em minutos.</div>
          <PrimaryBtn full className="mt-4" onClick={onPost}>Publicar agora</PrimaryBtn>
        </div>
        <div className="rounded-[16px] border border-[#E3EAF3] bg-[#F8FBFF] p-6">
          <LayoutDashboard className="mb-3 h-8 w-8 text-[#5B6B80]" />
          <div className="mb-2 text-lg font-bold text-[#10274A]">Explorar a plataforma primeiro</div>
          <div className="text-sm text-[#5B6B80]">Conheça o dashboard antes de publicar seu frete.</div>
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

    try {
      let docPath: string | null = null;
      if (policy) {
        const path = `${companyId}/rctr_c.pdf`;
        const { error: uploadError } = await supabase.storage.from("company-docs").upload(path, policy, { upsert: true });
        if (uploadError) throw uploadError;
        docPath = path;
      }

      const { data: existing, error: existingError } = await supabase.from("carriers").select("id").eq("company_id", companyId).maybeSingle();
      if (existingError) throw existingError;

      const payload: any = {
        antt_rntrc: antt,
        insurance_expiry: expiry || null,
        operating_states: states,
        has_ev_trucks: hasEv,
        ev_truck_count: hasEv ? evCount : 0,
      };
      if (docPath) payload.insurance_doc_url = docPath;

      let carrierError: any = null;
      if (existing) {
        const result = await (supabase.from("carriers") as any).update(payload).eq("id", existing.id);
        carrierError = result.error;
      } else {
        const result = await (supabase.from("carriers") as any).insert({ company_id: companyId, ...payload });
        carrierError = result.error;
      }

      if (carrierError) throw carrierError;
      setSaving(false);
      onNext();
    } catch (error: any) {
      setSaving(false);
      toast.error(error?.message ?? "Não foi possível salvar os dados da transportadora.");
    }
  };

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold text-[#10274A]">Dados da transportadora</h1>

      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 text-sm text-[#5B6B80]">RNTRC/ANTT</div>
          <TextInput leftIcon={FileText} placeholder="BR-0000000" value={antt} onChange={(e) => setAntt(e.target.value)} />
        </div>

        <div>
          <div className="mb-1.5 text-sm text-[#5B6B80]">Apólice RCTR-C (PDF)</div>
          <UploadArea onFile={setPolicy} selected={policy} accept=".pdf" label="Envie a apólice em PDF" hint="PDF — máx. 10MB" />
        </div>

        <div>
          <div className="mb-1.5 text-sm text-[#5B6B80]">Vencimento da apólice</div>
          <TextInput type="date" leftIcon={Calendar} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>

        <div>
          <div className="mb-3 text-sm text-[#5B6B80]">Estados onde opera:</div>
          <div className="grid grid-cols-9 gap-2">
            {UFS.map((u) => (
              <Pill key={u} active={states.includes(u)} onClick={() => setStates((s) => s.includes(u) ? s.filter((x) => x !== u) : [...s, u])}>{u}</Pill>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 text-sm text-[#5B6B80]">Tem caminhões elétricos?</div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setHasEv((v) => !v)}
              className={cn(
                "relative h-6 w-11 rounded-full transition",
                hasEv ? "bg-[#1A9B5E]" : "bg-[#29405F]",
              )}
            >
              <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition", hasEv ? "left-[22px]" : "left-0.5")} />
            </button>
            {hasEv && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#5B6B80]">Quantos?</span>
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
      <h1 className="mb-2 text-2xl font-bold text-[#10274A]">Cadastre sua frota</h1>
      <p className="mb-8 text-sm text-[#5B6B80]">Você pode adicionar mais caminhões depois.</p>

      <div className="flex flex-col gap-3">
        {trucks.map((t, i) => (
          <div key={i} className="flex items-center justify-between rounded-[10px] border border-[#E3EAF3] bg-[#F8FBFF] p-4">
            <div>
              <div className="font-semibold text-[#10274A]">{t.plate}</div>
              <div className="text-xs text-[#5B6B80]">{t.type} • {t.capacity || "?"}t {t.is_ev && "• EV"}</div>
            </div>
            <button type="button" onClick={() => setTrucks(trucks.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4 text-[#5B6B80] hover:text-[#D94B5C]" />
            </button>
          </div>
        ))}

        {open ? (
          <div className="rounded-[10px] border border-[#29405F] bg-[#111E33] p-4">
            <div className="grid grid-cols-2 gap-3">
              <TextInput placeholder="Placa ABC-1234" value={form.plate} onChange={(e) => setForm({ ...form, plate: maskPlate(e.target.value) })} />
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as TruckType })}
                className="rounded-[10px] border border-[#29405F] bg-[#0B1628] px-3 py-2.5 text-sm text-[#E6EDF3]"
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
                className={cn("relative h-6 w-11 rounded-full transition", form.is_ev ? "bg-[#1A9B5E]" : "bg-[#29405F]")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition", form.is_ev ? "left-[22px]" : "left-0.5")} />
              </button>
              <span className="text-sm text-[#5B6B80]">É elétrico?</span>
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
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#29405F] bg-[#111E33] px-4 py-3 text-sm text-[#C9D1D9] hover:border-[#484F58]"
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

interface DriverDraft { full_name: string; cpf: string; license_number: string; license_category: string; license_expiry: string; has_mopp: boolean }

function CarrierDrivers({ companyId, onNext }: { companyId: string | null; onNext: () => void }) {
  const [drivers, setDrivers] = useState<DriverDraft[]>([]);
  const blank: DriverDraft = { full_name: "", cpf: "", license_number: "", license_category: "E", license_expiry: "", has_mopp: false };
  const [form, setForm] = useState<DriverDraft>(blank);
  const [open, setOpen] = useState(false);

  const saveDriver = async () => {
    if (!form.full_name) return toast.error("Nome obrigatório");
    if (companyId) {
      const { data: carrier } = await supabase.from("carriers").select("id").eq("company_id", companyId).maybeSingle();
      if (carrier) {
        await (supabase.from("drivers") as any).insert({
          carrier_id: carrier.id,
          full_name: form.full_name,
          cpf: form.cpf || null,
          license_number: form.license_number || null,
          license_category: form.license_category,
          license_expiry: form.license_expiry || null,
          license_issuer_country: "BR",
          has_mopp: form.has_mopp,
        });
      }
    }
    setDrivers([...drivers, form]);
    setForm(blank);
    setOpen(false);
    toast.success("Motorista cadastrado");
  };

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[#10274A]">Cadastre seus motoristas</h1>
      <p className="mb-8 text-sm text-[#5B6B80]">Você pode adicionar mais motoristas depois.</p>

      <div className="flex flex-col gap-3">
        {drivers.map((d, i) => (
          <div key={i} className="flex items-center justify-between rounded-[10px] border border-[#E3EAF3] bg-[#F8FBFF] p-4">
            <div>
              <div className="font-semibold text-[#10274A]">{d.full_name}</div>
              <div className="text-xs text-[#5B6B80]">CNH {d.license_category} • {d.license_number} {d.has_mopp && "• MOPP"}</div>
            </div>
            <button type="button" onClick={() => setDrivers(drivers.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4 text-[#5B6B80] hover:text-[#D94B5C]" />
            </button>
          </div>
        ))}

        {open ? (
          <div className="rounded-[10px] border border-[#29405F] bg-[#111E33] p-4">
            <div className="grid grid-cols-2 gap-3">
              <TextInput placeholder="Nome completo" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <TextInput placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} />
              <TextInput placeholder="Número CNH" value={form.license_number} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
              <select
                value={form.license_category}
                onChange={(e) => setForm({ ...form, license_category: e.target.value })}
                className="rounded-[10px] border border-[#29405F] bg-[#0B1628] px-3 py-2.5 text-sm text-[#E6EDF3]"
              >
                {["C","D","E"].map((c) => <option key={c} value={c}>Categoria {c}</option>)}
              </select>
              <TextInput type="date" value={form.license_expiry} onChange={(e) => setForm({ ...form, license_expiry: e.target.value })} />
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
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#29405F] bg-[#111E33] px-4 py-3 text-sm text-[#C9D1D9] hover:border-[#484F58]"
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
      <h1 className="mb-2 text-2xl font-bold text-[#10274A]">Envie seus documentos</h1>
      <p className="mb-6 text-sm text-[#5B6B80]">Para liberar suas entregas precisamos verificar sua CNH.</p>

      <div className="mb-6 flex gap-3 rounded-[14px] border border-[#E3EAF3] bg-[#F8FBFF] p-4">
        <Info className="h-5 w-5 shrink-0 text-[#1B6CB8]" />
        <p className="text-sm text-[#5B6B80]">
          <strong className="text-[#10274A]">Por que precisamos da sua CNH?</strong> Para confirmar que você é um motorista habilitado e proteger sua segurança nas entregas.
        </p>
      </div>

      <div className="mb-3 text-sm text-[#5B6B80]">Foto da CNH (frente)</div>
      <UploadArea onFile={setCnh} selected={cnh} accept="image/*" capture="environment" label="Foto da CNH" hint="JPG ou PNG" />

      <div className="mb-3 mt-4 text-sm text-[#5B6B80]">Selfie segurando a CNH</div>
      <UploadArea onFile={setSelfie} selected={selfie} accept="image/*" capture="user" label="Selfie com a CNH" hint="JPG ou PNG" />

      <GreenBtn full onClick={() => void submit()} disabled={!cnh || uploading}>
        {uploading ? "Enviando..." : "Enviar documentos"}
      </GreenBtn>

      <button
        type="button"
        onClick={onNext}
        className="mt-3 block w-full cursor-pointer text-center text-sm text-[#5B6B80] hover:text-[#10274A]"
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
      <CheckCircle className="mx-auto mb-6 h-[72px] w-[72px] text-[#1A9B5E]" />
      <h1 className="mb-3 text-2xl font-bold text-[#10274A]">Você está pronto para usar a SteelGo!</h1>
      <p className="mb-8 text-sm text-[#5B6B80]">
        Sua conta está sendo verificada. Te avisamos por WhatsApp em até 24h.
      </p>
      <PrimaryBtn full onClick={() => void onFinish()}>Ir para o dashboard →</PrimaryBtn>
    </div>
  );
}

export default OnboardingPage;
