import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Menu, X, Zap } from "lucide-react";
import { Button } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";

const NAV_COPY = {
  pt: {
    links: [
      { id: "como-funciona", label: "Como funciona" },
      { id: "empresas", label: "Para empresas" },
      { id: "transportadoras", label: "Transportadoras" },
      { id: "logistica-verde", label: "Logística Verde" },
      { id: "seguranca", label: "Segurança" },
    ],
    signIn: "Entrar",
    cta: "Solicitar acesso →",
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
  },
  en: {
    links: [
      { id: "como-funciona", label: "How it works" },
      { id: "empresas", label: "For companies" },
      { id: "transportadoras", label: "Carriers" },
      { id: "logistica-verde", label: "Green logistics" },
      { id: "seguranca", label: "Security" },
    ],
    signIn: "Sign in",
    cta: "Request access →",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  es: {
    links: [
      { id: "como-funciona", label: "Cómo funciona" },
      { id: "empresas", label: "Para empresas" },
      { id: "transportadoras", label: "Transportistas" },
      { id: "logistica-verde", label: "Logística verde" },
      { id: "seguranca", label: "Seguridad" },
    ],
    signIn: "Iniciar sesión",
    cta: "Solicitar acceso →",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
  },
} as const;

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#1A9B5E]">
        <Zap size={18} className="text-white" />
      </div>
      <span className="text-lg font-semibold text-[#0f172a]">SteelGo</span>
    </div>
  );
}

function LangToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="flex overflow-hidden rounded-full border border-[#dbe8f8] bg-white/80">
      {(["pt", "en", "es"] as const).map((lng) => {
        const active = language === lng;
        return (
          <button
            key={lng}
            onClick={() => setLanguage(lng)}
            className={`px-3 py-1 text-xs transition-colors ${
              active ? "bg-[#1A9B5E] text-white" : "text-[#475569] hover:text-[#0f172a]"
            }`}
          >
            {lng.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

export function Navbar() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = NAV_COPY[language] ?? NAV_COPY.en;
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <header
        className={`sticky top-0 z-50 h-16 w-full border-b transition-all duration-200 ${
          scrolled ? "border-[#dbe8f8] bg-white/90 backdrop-blur" : "border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 lg:px-8">
          <Logo />

          <nav className="hidden gap-6 md:flex">
            {c.links.map((l) => (
              <button
                key={l.id}
                onClick={() => scrollTo(l.id)}
                className="text-sm text-[#475569] transition-colors hover:text-[#0f172a]"
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <LangToggle />
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/login" })}>
              {c.signIn}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })}
            >
              {c.cta}
            </Button>
          </div>

          <button
            onClick={() => setMobileOpen(true)}
            className="text-[#475569] hover:text-[#0f172a] md:hidden"
            aria-label={c.openMenu}
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 flex flex-col bg-[#f8fbff] transition-transform duration-250 md:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionDuration: "250ms" }}
        aria-hidden={!mobileOpen}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#dbe8f8] px-6">
          <Logo />
          <button
            onClick={() => setMobileOpen(false)}
            className="text-[#475569] hover:text-[#0f172a]"
            aria-label={c.closeMenu}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-6">
          {c.links.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollTo(l.id)}
              className="block w-full border-b border-[#dbe8f8] py-4 text-left text-xl text-[#0f172a]"
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-3 border-t border-[#dbe8f8] p-6">
          <LangToggle />
          <Button
            variant="ghost"
            size="md"
            fullWidth
            onClick={() => {
              setMobileOpen(false);
              navigate({ to: "/login" });
            }}
          >
            {c.signIn}
          </Button>
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => {
              setMobileOpen(false);
              navigate({ to: "/register", search: { role: "shipper" } as never });
            }}
          >
            {c.cta}
          </Button>
        </div>
      </div>
    </>
  );
}

export default Navbar;
