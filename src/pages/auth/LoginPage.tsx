import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Zap, Mail, Lock, Eye, EyeOff, Shield, MapPin, Leaf, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { roleHome } from "@/lib/redirects";

type DevRole = "shipper" | "carrier" | "driver";
const DEV_ACCOUNTS: { role: DevRole; emoji: string; label: string; email: string }[] = [
  { role: "shipper", emoji: "🏭", label: "Embarcador", email: "shipper@dev.steelgo.com" },
  { role: "carrier", emoji: "🚛", label: "Transportadora", email: "carrier@dev.steelgo.com" },
  { role: "driver", emoji: "👤", label: "Motorista", email: "driver@dev.steelgo.com" },
];
const DEV_PASSWORD = "DevTest123!";

async function ensureDevAccount(role: DevRole, email: string, index: number) {
  const log = (step: string, extra?: unknown) =>
    console.log(`[devLogin:${role}] ${step}`, extra ?? "");

  log("step 1: try signInWithPassword");
  let { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });

  if (signInErr || !signInData.session) {
    log("step 2: signIn failed → signUp", signInErr?.message);
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password: DEV_PASSWORD,
      options: {
        data: {
          full_name: `Dev ${role.charAt(0).toUpperCase() + role.slice(1)}`,
          role,
        },
      },
    });
    if (signUpErr) {
      console.error("[devLogin] signUp error:", signUpErr);
      throw new Error(`signUp falhou: ${signUpErr.message}`);
    }
    const userId = signUpData.user?.id;
    if (!userId) throw new Error("signUp não retornou user.id");
    log("step 3: signUp ok", userId);

    await new Promise((r) => setTimeout(r, 800));

    log("step 4: upsert profile");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: profileErr } = await (supabase.from("profiles") as any).upsert(
      {
        id: userId,
        full_name: `Dev ${role.charAt(0).toUpperCase() + role.slice(1)}`,
        email,
        is_verified: true,
        is_onboarded: true,
        language: "pt-BR",
        is_active: true,
      },
      { onConflict: "id" },
    );
    if (profileErr) {
      console.error("[devLogin] profile upsert error:", profileErr);
      alert(`Erro ao criar profile:\n${profileErr.message}\n\nDetalhes: ${profileErr.details ?? "—"}\nHint: ${profileErr.hint ?? "—"}\nCode: ${profileErr.code ?? "—"}`);
      throw new Error(`profile upsert: ${profileErr.message}`);
    }

    log("step 5: ensure user_roles");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: roleErr } = await (supabase.from("user_roles") as any).insert({
      user_id: userId,
      role,
    });
    if (roleErr && !String(roleErr.message).toLowerCase().includes("duplicate")) {
      console.error("[devLogin] user_roles insert error:", roleErr);
      // Non-fatal if trigger already created it
    }

    if (role !== "driver") {
      const companyType = role === "shipper" ? "steel_company" : "carrier_company";
      log("step 6: insert company", companyType);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: company, error: companyErr } = await (supabase.from("companies") as any)
        .insert({
          name: "Empresa Dev",
          cnpj: `00.000.000/0001-0${index}`,
          type: companyType,
          owner_id: userId,
        })
        .select("id")
        .single();
      if (companyErr) {
        console.error("[devLogin] company insert error:", companyErr);
        alert(`Erro ao criar empresa:\n${companyErr.message}\nDetails: ${companyErr.details ?? "—"}`);
        throw new Error(`company insert: ${companyErr.message}`);
      }
      log("step 6b: company ok", company.id);

      log("step 7: insert company_members");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: memberErr } = await (supabase.from("company_members") as any).insert({
        company_id: company.id,
        user_id: userId,
        member_role: "owner",
      });
      if (memberErr) {
        console.error("[devLogin] company_members error:", memberErr);
        alert(`Erro company_members:\n${memberErr.message}`);
        throw new Error(`company_members: ${memberErr.message}`);
      }

      if (role === "carrier") {
        log("step 8: insert carrier");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: carrierErr } = await (supabase.from("carriers") as any).insert({
          company_id: company.id,
          antt_rntrc: "BR-0000001",
          fleet_size: 1,
          truck_types: ["carreta"],
        });
        if (carrierErr) {
          console.error("[devLogin] carrier insert error:", carrierErr);
          alert(`Erro carrier:\n${carrierErr.message}`);
          throw new Error(`carrier: ${carrierErr.message}`);
        }
      }
    }

    log("step 9: signIn again");
    const retry = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD });
    if (retry.error) {
      console.error("[devLogin] retry signIn error:", retry.error);
      throw new Error(`retry signIn: ${retry.error.message}`);
    }
    signInData = retry.data;
  } else {
    log("step 2: signIn ok (account already exists)");
  }

  return signInData;
}

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  remember: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

const VALUE_PROPS = [
  { Icon: Shield, bg: "#1B6CB8", title: "Carga protegida", desc: "Conta protegida garante seu pagamento até a entrega confirmada" },
  { Icon: MapPin, bg: "#1B6CB8", title: "Rastreamento GPS", desc: "Posição do caminhão atualizada a cada 30 segundos" },
  { Icon: Leaf, bg: "#1A9B5E", title: "Logística verde", desc: "Relatórios ESG automáticos para seu compliance" },
  { Icon: Lock, bg: "#1A9B5E", title: "Contratos digitais", desc: "Assinatura ICP-Brasil com validade jurídica" },
];

export function LoginPage() {
  const { signIn, isAuthenticated, role, profile, isLoading } = useAuth();
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState<DevRole | null>(null);

  const onDevLogin = async (role: DevRole, email: string, index: number) => {
    setDevLoading(role);
    setAuthError(null);
    try {
      await ensureDevAccount(role, email, index);
      void navigate({ to: `/${role}` });
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg = err?.message ?? String(e);
      console.error("[devLogin] FAILED:", err);
      toast.error(msg);
      setAuthError(msg);
      alert(`Dev login falhou:\n${msg}\n\nVer console para detalhes.`);
    } finally {
      setDevLoading(null);
    }
  };


  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isLoading || devLoading) return;
    if (!isAuthenticated) return;
    // Wait for profile + role before deciding where to send the user
    if (!profile || !role) return;
    if (profile.is_onboarded === true) void navigate({ to: roleHome(role) });
    else void navigate({ to: "/onboarding" });
  }, [isAuthenticated, role, profile, isLoading, devLoading, navigate]);


  const onSubmit = async (data: FormData) => {
    setAuthError(null);
    setLoading(true);
    const { error } = await signIn(data.email, data.password);
    setLoading(false);
    if (error) setAuthError(error.message);
  };

  const onGoogle = async () => {
    setAuthError(null);
    const r = await supabase.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/auth/callback",
    });
    if (r.error) setAuthError(r.error.message);
  };

  return (
    <div className="min-h-screen flex bg-[#0D1117]">
      {/* LEFT */}
      <aside className="hidden md:flex flex-1 flex-col p-12 bg-[#161B22] border-r border-[#30363D]">
        <div>
          <div className="w-14 h-14 bg-[#1B6CB8] rounded-[16px] flex items-center justify-center">
            <Zap size={40} className="text-white" />
          </div>
          <div className="text-3xl font-bold text-[#E6EDF3] mt-4">SteelGo</div>
        </div>

        <div className="flex flex-col gap-6 mt-12 flex-1">
          {VALUE_PROPS.map(({ Icon, bg, title, desc }) => (
            <div key={title} className="flex items-start gap-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: bg }}
              >
                <Icon size={20} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#E6EDF3]">{title}</div>
                <div className="text-xs text-[#8B949E] mt-0.5">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-xs text-[#484F58]">340+ transportadoras verificadas</div>
      </aside>

      {/* RIGHT */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          <Link to="/" className="md:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#1B6CB8] rounded-[8px] flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <span className="text-[#E6EDF3] font-bold text-lg">SteelGo</span>
          </Link>

          <h2 className="font-bold text-2xl text-[#E6EDF3] mb-1">Bem-vindo de volta</h2>
          <p className="text-sm text-[#8B949E] mb-8">Entre na sua conta para continuar</p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm text-[#C9D1D9] mb-1.5">Email</label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E] pointer-events-none"
                />
                <input
                  type="email"
                  placeholder="seu@email.com.br"
                  {...register("email")}
                  className="w-full h-11 bg-[#0D1117] border border-[#30363D] rounded-[8px] pl-10 pr-3 text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:outline-none focus:border-[#1B6CB8]"
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-[#C9D1D9] mb-1.5">Senha</label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E] pointer-events-none"
                />
                <input
                  type={showPwd ? "text" : "password"}
                  placeholder="••••••••"
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
              {errors.password && (
                <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>
              )}
            </div>

            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-sm text-[#8B949E]">
                <input
                  type="checkbox"
                  {...register("remember")}
                  className="w-4 h-4 rounded border-[#30363D] bg-[#21262D] accent-[#1B6CB8]"
                />
                Lembrar de mim
              </label>
              <Link
                to="/forgot-password"
                className="text-sm text-[#3B89D4] hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#1B6CB8] hover:bg-[#1758a0] disabled:opacity-60 text-white text-sm font-medium rounded-[8px] transition-colors"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            {authError && (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-700/30 rounded-[8px] px-3 py-2">
                {authError}
              </div>
            )}
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[#30363D]" />
            <span className="text-xs text-[#484F58]">ou</span>
            <div className="flex-1 h-px bg-[#30363D]" />
          </div>

          <button
            type="button"
            onClick={() => void onGoogle()}
            className="w-full h-11 bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#E6EDF3] text-sm font-medium rounded-[8px] flex items-center justify-center gap-2 transition-colors"
          >
            <GoogleIcon />
            Continuar com Google
          </button>

          <>
            <div className="text-xs text-[#484F58] text-center my-4">
              — Acesso rápido (dev only) —
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DEV_ACCOUNTS.map((acc, i) => {
                const busy = devLoading === acc.role;
                return (
                  <button
                    key={acc.role}
                    type="button"
                    disabled={devLoading !== null}
                    onClick={() => void onDevLogin(acc.role, acc.email, i + 1)}
                    className="w-full h-9 flex items-center justify-center gap-1 text-xs text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#1C2128] rounded-[8px] transition-colors disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <span>{acc.emoji}</span>
                        <span>{acc.label}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </>



          <p className="text-sm text-[#8B949E] text-center mt-8">
            Não tem uma conta?{" "}
            <Link
              to="/register"
              className="text-sm text-[#3B89D4] font-medium hover:underline"
            >
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.12c-.22-.66-.35-1.36-.35-2.12s.13-1.46.35-2.12V7.04H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.96l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
