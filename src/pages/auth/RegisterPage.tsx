import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  User,
  IdCard,
  Mail,
  Lock,
  Phone,
  Building,
  Building2,
  Briefcase,
  MapPin,
  FileText,
  Truck,
  Factory,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import { maskCPF, maskCNPJ, maskPhone, onlyDigits, UFS } from "@/lib/masks";
import type { UserRole } from "@/types/database";

type Role = "shipper" | "carrier" | "driver";

const STEP_NAMES = ["Quem é você", "Seus dados", "Sua empresa"];

// ───── Schemas ─────
const personalSchema = z
  .object({
    full_name: z.string().min(3, "Mínimo 3 caracteres"),
    cpf: z.string().refine((v) => onlyDigits(v).length === 11, "CPF inválido"),
    email: z.string().trim().email("E-mail inválido"),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
    phone: z.string().refine((v) => onlyDigits(v).length >= 10, "Telefone inválido"),
    terms: z.literal(true, { errorMap: () => ({ message: "Você precisa aceitar os termos" }) }),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Senhas não conferem" });
type PersonalData = z.infer<typeof personalSchema>;

const companyBase = z.object({
  cnpj: z.string().refine((v) => onlyDigits(v).length === 14, "CNPJ inválido"),
  legal_name: z.string().min(2, "Obrigatório"),
  trade_name: z.string().optional(),
  type: z.string().min(1, "Selecione"),
  state: z.string().min(2, "Selecione"),
  antt: z.string().optional(),
});
type CompanyData = z.infer<typeof companyBase>;

// ───── Page ─────
export function RegisterPage({ initialRole }: { initialRole?: Role }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role | null>(initialRole ?? null);
  const [personal, setPersonal] = useState<PersonalData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRole === "shipper" || initialRole === "carrier" || initialRole === "driver") {
      setRole(initialRole);
      return;
    }
    if (typeof window === "undefined") return;
    const queryRole = new URLSearchParams(window.location.search).get("role");
    if (queryRole === "driver" || queryRole === "carrier" || queryRole === "shipper") {
      setRole(queryRole);
    }
  }, [initialRole]);

  const handleFinish = async (company: CompanyData | null) => {
    if (!personal || !role) return;
    setSubmitting(true);
    setAuthError(null);

    const { data, error } = await supabase.auth.signUp({
      email: personal.email,
      password: personal.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: personal.full_name,
          role,
          phone: personal.phone,
          },
      },
    });

    if (error) {
      setAuthError(error.message);
      setSubmitting(false);
      return;
    }

    const userId = data.user?.id;

    if (userId && company && role !== "driver") {
      const { data: companyRow, error: cErr } = await supabase
        .from("companies")
        .insert({
          name: company.legal_name,
          trade_name: company.trade_name || null,
          cnpj: company.cnpj,
          type: company.type,
          address_state: company.state,
          owner_id: userId,
        })
        .select()
        .single();

      if (cErr) {
        setAuthError(`Conta criada, mas empresa falhou: ${cErr.message}`);
      } else if (companyRow) {
        await supabase.from("company_members").insert({
          company_id: companyRow.id,
          user_id: userId,
          member_role: "owner",
        });
        if (role === "carrier" && company.antt) {
          await supabase.from("carriers").insert({
            company_id: companyRow.id,
            antt_rntrc: company.antt,
          });
        }
      }
    }

    setSubmitting(false);
    void navigate({ to: "/onboarding" });
  };

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <Stepper step={step} role={role} />
      <div className="max-w-lg mx-auto px-6 pb-16">
        {step === 1 && (
          <StepRole
            role={role}
            onSelect={setRole}
            onNext={() => role && setStep(2)}
          />
        )}
        {step === 2 && (
          <StepPersonal
            initial={personal}
            onBack={() => setStep(1)}
            onSubmit={(d) => {
              setPersonal(d);
              if (role === "driver") void handleFinish(null);
              else setStep(3);
            }}
            submitting={submitting && role === "driver"}
          />
        )}
        {step === 3 && role && role !== "driver" && (
          <StepCompany
            role={role}
            onBack={() => setStep(2)}
            onSubmit={(d) => void handleFinish(d)}
            submitting={submitting}
            authError={authError}
          />
        )}
      </div>
    </div>
  );
}

// ───── Stepper ─────
function Stepper({ step, role }: { step: number; role: Role | null }) {
  const totalSteps = role === "driver" ? 2 : 3;
  return (
    <div className="max-w-sm mx-auto mt-8 mb-10 px-6">
      <div className="flex items-center">
        {Array.from({ length: totalSteps }).map((_, i) => {
          const idx = i + 1;
          const done = step > idx;
          const active = step === idx;
          return (
            <div key={idx} className="flex items-center flex-1 last:flex-none">
              <div
                className={`w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  done
                    ? "bg-[#1A9B5E] border-[#1A9B5E]"
                    : active
                      ? "bg-[#1B6CB8] border-[#1B6CB8]"
                      : "bg-transparent border-[#30363D]"
                }`}
              >
                {done ? (
                  <Check size={16} className="text-white" />
                ) : (
                  <span
                    className={`text-sm font-bold ${
                      active ? "text-white" : "text-[#484F58]"
                    }`}
                  >
                    {idx}
                  </span>
                )}
              </div>
              {idx < totalSteps && (
                <div
                  className={`flex-1 h-px mx-2 ${
                    step > idx ? "bg-[#1A9B5E]" : "bg-[#30363D]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2">
        {STEP_NAMES.slice(0, totalSteps).map((n) => (
          <div key={n} className="text-xs text-[#8B949E] text-center flex-1">
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───── Step 1 ─────
const ROLE_CARDS: {
  key: Role;
  Icon: typeof User;
  title: string;
  desc: string;
  pills: string[];
}[] = [
  {
    key: "shipper",
    Icon: Factory,
    title: "Embarcador",
    desc: "Siderúrgica, distribuidor ou indústria",
    pills: ["Publicar fretes", "Rastrear cargas", "ESG"],
  },
  {
    key: "carrier",
    Icon: Truck,
    title: "Transportadora",
    desc: "Empresa de transporte de cargas",
    pills: ["Receber fretes", "Pagamento 24h", "Score"],
  },
  {
    key: "driver",
    Icon: User,
    title: "Motorista",
    desc: "Preciso do app do motorista",
    pills: ["Navegação em rota", "Checkpoints", "Emergência"],
  },
];

function StepRole({
  role,
  onSelect,
  onNext,
}: {
  role: Role | null;
  onSelect: (r: Role) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[#E6EDF3] text-center mb-2">Quem é você?</h1>
      <p className="text-sm text-[#8B949E] text-center mb-8">
        Escolha como vai usar a SteelGo
      </p>
      <div className="flex flex-col gap-4">
        {ROLE_CARDS.map((c) => {
          const selected = role === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClickCapture={() => onSelect(c.key)}
              onClick={() => onSelect(c.key)}
              className={`border-2 rounded-[16px] p-5 cursor-pointer transition-all flex gap-4 items-start text-left ${
                selected
                  ? "border-[#1B6CB8] bg-[#1B6CB8]/10"
                  : "border-[#30363D] bg-[#161B22] hover:border-[#484F58]"
              }`}
            >
              <div
                className={`w-11 h-11 rounded-[12px] flex-shrink-0 flex items-center justify-center ${
                  selected
                    ? "bg-[#0D2744] border border-[#1B6CB8]"
                    : "bg-[#21262D]"
                }`}
              >
                <c.Icon size={22} color={selected ? "#3B89D4" : "#484F58"} />
              </div>
              <div className="flex-1">
                <div className="font-bold text-[#E6EDF3] text-base">{c.title}</div>
                <div className="text-sm text-[#8B949E] mt-1">{c.desc}</div>
                <div className="flex gap-1 flex-wrap mt-3">
                  {c.pills.map((p) => (
                    <span
                      key={p}
                      className="text-[10px] bg-[#21262D] border border-[#30363D] text-[#8B949E] rounded-full px-2 py-0.5"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              {selected && (
                <CheckCircle size={22} className="text-[#1B6CB8] flex-shrink-0 ml-auto" />
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={!role}
        className="w-full h-11 mt-8 bg-[#1B6CB8] hover:bg-[#1758a0] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-[8px] transition-colors"
      >
        Próximo →
      </button>
    </div>
  );
}

// ───── Step 2 ─────
function passwordTier(p: string) {
  if (p.length < 6) return { width: "0%", color: "bg-transparent", label: "" };
  if (p.length < 8) return { width: "33%", color: "bg-red-500", label: "Fraca" };
  const hasNumLetter = /\d/.test(p) && /[a-zA-Z]/.test(p);
  if (!hasNumLetter) return { width: "66%", color: "bg-[#CC8800]", label: "Média" };
  return { width: "100%", color: "bg-[#1A9B5E]", label: "Forte" };
}

function StepPersonal({
  initial,
  onBack,
  onSubmit,
  submitting,
}: {
  initial: PersonalData | null;
  onBack: () => void;
  onSubmit: (d: PersonalData) => void;
  submitting: boolean;
}) {
  const [showPwd, setShowPwd] = useState(false);
  const { language } = useLanguage();
  const consentText =
    language === "es"
      ? "Al continuar, aceptas los Términos de Uso y la Política de Privacidad de SteelGo."
      : language === "en"
        ? "By continuing, you agree to SteelGo’s Terms of Use and Privacy Policy."
        : "Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade da SteelGo.";
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PersonalData>({
    resolver: zodResolver(personalSchema),
    defaultValues: initial ?? undefined,
  });
  const pwd = watch("password") ?? "";
  const strength = passwordTier(pwd);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold text-[#E6EDF3] mb-4">Seus dados</h2>

      <IconInput
        Icon={User}
        placeholder="João Carlos Silva"
        label="Nome completo"
        error={errors.full_name?.message}
        {...register("full_name")}
      />

      <IconInput
        Icon={IdCard}
        placeholder="000.000.000-00"
        label="CPF"
        error={errors.cpf?.message}
        {...register("cpf")}
        onChange={(e) =>
          setValue("cpf", maskCPF(e.target.value), { shouldValidate: true })
        }
      />

      <IconInput
        Icon={Mail}
        type="email"
        placeholder="joao@email.com.br"
        label="Email"
        error={errors.email?.message}
        {...register("email")}
      />

      <div>
        <label className="block text-sm text-[#C9D1D9] mb-1.5">Senha</label>
        <div className="relative">
          <Lock
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E] pointer-events-none"
          />
          <input
            type={showPwd ? "text" : "password"}
            placeholder="Mínimo 8 caracteres"
            {...register("password")}
            className="w-full h-11 bg-[#0D1117] border border-[#30363D] rounded-[8px] pl-10 pr-10 text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:outline-none focus:border-[#1B6CB8]"
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B949E] hover:text-[#E6EDF3]"
          >
            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {pwd && (
          <>
            <div className="w-full h-1.5 rounded-full bg-[#21262D] overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all ${strength.color}`}
                style={{ width: strength.width }}
              />
            </div>
            <div
              className={`text-[10px] mt-1 ${
                strength.label === "Forte"
                  ? "text-[#2ECC8A]"
                  : strength.label === "Média"
                    ? "text-[#F0A500]"
                    : "text-red-400"
              }`}
            >
              {strength.label}
            </div>
          </>
        )}
        {errors.password && (
          <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>
        )}
      </div>

      <IconInput
        Icon={Lock}
        type={showPwd ? "text" : "password"}
        placeholder="Repita a senha"
        label="Confirmar senha"
        error={errors.confirm?.message}
        {...register("confirm")}
      />

      <IconInput
        Icon={Phone}
        placeholder="(11) 98433-9109"
        label="Telefone"
        error={errors.phone?.message}
        {...register("phone")}
        onChange={(e) =>
          setValue("phone", maskPhone(e.target.value), { shouldValidate: true })
        }
      />

      <label className="flex items-start gap-3 mt-2">
        <input
          type="checkbox"
          {...register("terms")}
          className="w-4 h-4 mt-0.5 accent-[#1B6CB8] flex-shrink-0"
        />
        <span className="text-sm text-[#8B949E]">
          {consentText}
        </span>
      </label>
      {errors.terms && <p className="text-xs text-red-400">{errors.terms.message}</p>}

      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 h-11 border border-[#30363D] text-[#E6EDF3] hover:bg-[#1C2128] text-sm font-medium rounded-[8px] transition-colors"
        >
          ← Voltar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 h-11 bg-[#1B6CB8] hover:bg-[#1758a0] disabled:opacity-60 text-white text-sm font-medium rounded-[8px] transition-colors"
        >
          {submitting ? "Criando..." : "Próximo →"}
        </button>
      </div>
    </form>
  );
}

// ───── Step 3 ─────
function StepCompany({
  role,
  onBack,
  onSubmit,
  submitting,
  authError,
}: {
  role: Role;
  onBack: () => void;
  onSubmit: (d: CompanyData) => void;
  submitting: boolean;
  authError: string | null;
}) {
  const schema = role === "carrier"
    ? companyBase.extend({ antt: z.string().min(3, "RNTRC obrigatório") })
    : companyBase;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CompanyData>({
    resolver: zodResolver(schema),
    defaultValues: { type: role === "carrier" ? "transportadora" : "" },
  });
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<"ok" | "error" | null>(null);

  const fetchCNPJ = async (raw: string) => {
    const digits = onlyDigits(raw);
    if (digits.length !== 14) return;
    setCnpjLoading(true);
    setCnpjStatus(null);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error("notfound");
      const d = await res.json();
      setValue("legal_name", d.razao_social ?? "", { shouldValidate: true });
      setValue("trade_name", d.nome_fantasia ?? "", { shouldValidate: true });
      if (d.uf) setValue("state", d.uf, { shouldValidate: true });
      setCnpjStatus("ok");
    } catch {
      setCnpjStatus("error");
    } finally {
      setCnpjLoading(false);
    }
  };

  const typeOptions =
    role === "shipper"
      ? [
          { v: "siderurgica", l: "Siderúrgica" },
          { v: "distribuidora", l: "Distribuidora" },
          { v: "industria", l: "Indústria consumidora" },
        ]
      : [{ v: "transportadora", l: "Transportadora" }];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold text-[#E6EDF3] mb-4">Sua empresa</h2>

      <div>
        <label className="block text-sm text-[#C9D1D9] mb-1.5">CNPJ</label>
        <div className="relative">
          <Building2
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E] pointer-events-none"
          />
          <input
            placeholder="00.000.000/0000-00"
            {...register("cnpj")}
            onChange={(e) => {
              const masked = maskCNPJ(e.target.value);
              setValue("cnpj", masked, { shouldValidate: true });
            }}
            onBlur={(e) => void fetchCNPJ(e.target.value)}
            className="w-full h-11 bg-[#0D1117] border border-[#30363D] rounded-[8px] pl-10 pr-10 text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:outline-none focus:border-[#1B6CB8]"
          />
          {cnpjLoading && (
            <Loader2
              size={16}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#3B89D4] animate-spin"
            />
          )}
        </div>
        {errors.cnpj && (
          <p className="text-xs text-red-400 mt-1">{errors.cnpj.message}</p>
        )}
        {!errors.cnpj && cnpjStatus === "ok" && (
          <p className="text-xs text-[#2ECC8A] mt-1">✅ CNPJ válido</p>
        )}
        {!errors.cnpj && cnpjStatus === "error" && (
          <p className="text-xs text-red-400 mt-1">❌ CNPJ não encontrado</p>
        )}
      </div>

      <IconInput
        Icon={Building}
        placeholder="Razão social"
        label="Razão social"
        error={errors.legal_name?.message}
        {...register("legal_name")}
      />

      <IconInput
        Icon={Building}
        placeholder="Nome fantasia"
        label="Nome fantasia (opcional)"
        {...register("trade_name")}
      />

      <div>
        <label className="block text-sm text-[#C9D1D9] mb-1.5">Tipo de empresa</label>
        <div className="relative">
          <Briefcase
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E] pointer-events-none"
          />
          <select
            {...register("type")}
            disabled={role === "carrier"}
            className="w-full h-11 bg-[#0D1117] border border-[#30363D] rounded-[8px] pl-10 pr-3 text-sm text-[#E6EDF3] focus:outline-none focus:border-[#1B6CB8] disabled:opacity-70"
          >
            <option value="">Selecione...</option>
            {typeOptions.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </div>
        {errors.type && (
          <p className="text-xs text-red-400 mt-1">{errors.type.message}</p>
        )}
      </div>

      {role === "carrier" && (
        <IconInput
          Icon={FileText}
          placeholder="BR-0000000"
          label="RNTRC/ANTT"
          error={errors.antt?.message}
          {...register("antt")}
        />
      )}

      <div>
        <label className="block text-sm text-[#C9D1D9] mb-1.5">Estado sede</label>
        <div className="relative">
          <MapPin
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E] pointer-events-none"
          />
          <select
            {...register("state")}
            className="w-full h-11 bg-[#0D1117] border border-[#30363D] rounded-[8px] pl-10 pr-3 text-sm text-[#E6EDF3] focus:outline-none focus:border-[#1B6CB8]"
          >
            <option value="">UF...</option>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        {errors.state && (
          <p className="text-xs text-red-400 mt-1">{errors.state.message}</p>
        )}
      </div>

      {authError && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-700/30 rounded-[8px] px-3 py-2">
          {authError}
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 h-11 border border-[#30363D] text-[#E6EDF3] hover:bg-[#1C2128] text-sm font-medium rounded-[8px] transition-colors"
        >
          ← Voltar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 h-11 bg-[#1B6CB8] hover:bg-[#1758a0] disabled:opacity-60 text-white text-sm font-medium rounded-[8px] transition-colors flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? "Criando..." : "Criar conta →"}
        </button>
      </div>
    </form>
  );
}

// ───── Reusable Input with left icon ─────
type IconInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  Icon: typeof User;
  label: string;
  error?: string;
};

const IconInput = Object.assign(
  function InnerIconInput({
    Icon,
    label,
    error,
    className,
    ...rest
  }: IconInputProps) {
    return (
      <div>
        <label className="block text-sm text-[#C9D1D9] mb-1.5">{label}</label>
        <div className="relative">
          <Icon
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E] pointer-events-none"
          />
          <input
            {...rest}
            className={`w-full h-11 bg-[#0D1117] border border-[#30363D] rounded-[8px] pl-10 pr-3 text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:outline-none focus:border-[#1B6CB8] ${className ?? ""}`}
          />
        </div>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    );
  },
  { displayName: "IconInput" },
);

// Type-only: make UserRole reference satisfied for future imports
export type _RoleRef = UserRole;
