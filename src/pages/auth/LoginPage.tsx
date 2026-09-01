import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { Mail, Lock, Eye, EyeOff, Shield, MapPin, Leaf, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { roleHome } from "@/lib/redirects";
import { BrandLogo } from "@/components/brand/BrandLogo";

/**
 * Acesso rapido de desenvolvimento -- OPT-IN, nunca no bundle de producao.
 *
 * Correcao de seguranca P0:
 *   - todo o bloco vive sob `import.meta.env.DEV`; no build de producao o Vite
 *     substitui por `false` e o dead-code elimination remove tudo;
 *   - NENHUMA credencial no codigo: e-mails e senha vem de variaveis de
 *     ambiente locais (.env.local), que nao sao versionadas;
 *   - so autentica (signInWithPassword). Nunca cria usuario, perfil, empresa,
 *     vinculo ou transportadora, e nunca cria conta no Supabase Auth;
 *   - sem as variaveis definidas, os botoes nao aparecem nem em dev.
 */
type DevRole = "shipper" | "carrier" | "driver";

interface DevAccount {
  role: DevRole;
  emoji: string;
  label: string;
  email: string;
}

const DEV_LOGIN_PASSWORD: string = import.meta.env.DEV
  ? (import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? "")
  : "";

const DEV_ACCOUNTS: DevAccount[] = import.meta.env.DEV
  ? (
      [
        { role: "shipper", emoji: "\u{1F3ED}", label: "Embarcador", email: import.meta.env.VITE_DEV_LOGIN_SHIPPER },
        { role: "carrier", emoji: "\u{1F69B}", label: "Transportadora", email: import.meta.env.VITE_DEV_LOGIN_CARRIER },
        { role: "driver", emoji: "\u{1F464}", label: "Motorista", email: import.meta.env.VITE_DEV_LOGIN_DRIVER },
      ] as { role: DevRole; emoji: string; label: string; email?: string }[]
    ).filter((a): a is DevAccount => Boolean(a.email) && DEV_LOGIN_PASSWORD !== "")
  : [];

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  remember: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

const VALUE_PROPS = [
  { Icon: Shield, bg: "#1B6CB8", title: "Gestão de pagamentos", desc: "Centralize condições de pagamento e evidências de entrega." },
  { Icon: MapPin, bg: "#1B6CB8", title: "Visibilidade operacional", desc: "Acompanhe rotas, checkpoints e registros da operação." },
  { Icon: Leaf, bg: "#1A9B5E", title: "Logística de menor impacto", desc: "Compare cenários e acompanhe estimativas de emissões." },
  { Icon: Lock, bg: "#1A9B5E", title: "Documentos digitais", desc: "Centralize contratos, documentos e evidências digitais." },
];

export function LoginPage() {
  const { signIn, isAuthenticated, role, profile, isLoading } = useAuth();
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState<DevRole | null>(null);

  const isNativeCapacitorApp = useMemo(() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  }, []);

  const onDevLogin = async (role: DevRole, email: string) => {
    setDevLoading(role);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: DEV_LOGIN_PASSWORD,
      });
      if (error) throw error;
      void navigate({ to: `/${role}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAuthError(msg);
      toast.error(msg);
    } finally {
      setDevLoading(null);
    }
  };


  const {
    control,
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

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

    try {
      const { error } = await signIn(data.email, data.password);

      if (error) {
        console.error("[Login] signInWithPassword returned error", {
          name: error.name,
          message: error.message,
        });
        setAuthError(error.message);
        return;
      }
    } catch (error) {
      const authException = error instanceof Error ? error : new Error(String(error));
      console.error("[Login] signInWithPassword threw", authException);
      setAuthError(authException.message);
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth/callback",
      },
    });
    if (error) setAuthError(error.message);
  };

  return (
    <div
      className="min-h-screen flex bg-[#0B1628]"
      style={{
        minHeight: "100dvh",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* LEFT */}
      <aside className="hidden md:flex flex-1 flex-col p-12 bg-[#111E33] border-r border-[#29405F]">
        <BrandLogo surface="dark" className="h-12 w-auto" />

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
      </aside>

      {/* RIGHT */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          <Link to="/" className="mb-8 flex md:hidden" aria-label="SteelGo">
            <BrandLogo surface="dark" className="h-9 w-auto" />
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
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <input
                      ref={field.ref}
                      name={field.name}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="next"
                      placeholder="seu@email.com.br"
                      value={field.value ?? ""}
                      onInput={(event) => {
                        const nextValue = event.currentTarget.value;
                        // Fallback for Android/WebView keyboards that emit input but miss change.
                        if (isNativeCapacitorApp && nextValue !== (field.value ?? "")) {
                          field.onChange(nextValue);
                        }
                      }}
                      onChange={(event) => field.onChange(event.currentTarget.value)}
                      onBlur={field.onBlur}
                      className="auth-login-input w-full h-11 bg-[#0B1628] border border-[#29405F] rounded-[8px] pl-10 pr-3 text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:outline-none focus:border-[#1B6CB8]"
                    />
                  )}
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
                <Controller
                  name="password"
                  control={control}
                  render={({ field }) => (
                    <input
                      ref={field.ref}
                      name={field.name}
                      type={showPwd ? "text" : "password"}
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="go"
                      placeholder="••••••••"
                      value={field.value ?? ""}
                      onInput={(event) => {
                        const nextValue = event.currentTarget.value;
                        // Fallback for Android/WebView keyboards that emit input but miss change.
                        if (isNativeCapacitorApp && nextValue !== (field.value ?? "")) {
                          field.onChange(nextValue);
                        }
                      }}
                      onChange={(event) => field.onChange(event.currentTarget.value)}
                      onBlur={field.onBlur}
                      className="auth-login-input w-full h-11 bg-[#0B1628] border border-[#29405F] rounded-[8px] pl-10 pr-10 text-sm text-[#E6EDF3] placeholder:text-[#484F58] focus:outline-none focus:border-[#1B6CB8]"
                    />
                  )}
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
                  className="w-4 h-4 rounded border-[#29405F] bg-[#21262D] accent-[#1B6CB8]"
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
            <div className="flex-1 h-px bg-[#29405F]" />
            <span className="text-xs text-[#484F58]">ou</span>
            <div className="flex-1 h-px bg-[#29405F]" />
          </div>

          <button
            type="button"
            onClick={() => void onGoogle()}
            className="w-full h-11 bg-[#21262D] hover:bg-[#29405F] border border-[#29405F] text-[#E6EDF3] text-sm font-medium rounded-[8px] flex items-center justify-center gap-2 transition-colors"
          >
            <GoogleIcon />
            Continuar com Google
          </button>

          {import.meta.env.DEV && DEV_ACCOUNTS.length > 0 && (
            <>
            <div className="text-xs text-[#484F58] text-center my-4">
              — Acesso rápido (dev only) —
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DEV_ACCOUNTS.map((acc) => {
                const busy = devLoading === acc.role;
                return (
                  <button
                    key={acc.role}
                    type="button"
                    disabled={devLoading !== null}
                    onClick={() => void onDevLogin(acc.role, acc.email)}
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
          )}

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
