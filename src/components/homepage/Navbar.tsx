import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Zap, Menu, X } from "lucide-react";
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
      { id: "precos", label: "Preços" },
    ],
    signIn: "Entrar",
    cta: "Começar grátis →",
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
      { id: "precos", label: "Pricing" },
    ],
    signIn: "Sign in",
    cta: "Get started free →",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
} as const;

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-[#1B6CB8] rounded-[8px] flex items-center justify-center">
        <Zap size={18} className="text-white" />
      </div>
      <span className="text-[#E6EDF3] font-bold text-lg">SteelGo</span>
      <span className="ml-1 text-[9px] bg-[#1B6CB8]/20 text-[#79B8F8] border border-[#1B6CB8]/30 rounded-full px-2 py-0.5">
        Beta
      </span>
    </div>
  );
}

function LangToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="flex border border-[#30363D] rounded-full overflow-hidden">
      {(["pt", "en"] as const).map((lng) => {
        const active = language === lng;
        return (
          <button
            key={lng}
            onClick={() => setLanguage(lng)}
            className={`text-xs px-3 py-1 transition-colors ${
              active
                ? "bg-[#1B6CB8] text-white"
                : "text-[#8B949E] hover:text-[#E6EDF3]"
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
  const c = NAV_COPY[language];
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
        className={`sticky top-0 z-50 w-full h-16 transition-all duration-200 ${
          scrolled
            ? "bg-[#161B22]/95 backdrop-blur-sm border-b border-[#30363D]"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-[1280px] mx-auto px-6 flex items-center justify-between h-full">
          <Logo />

          <nav className="hidden md:flex gap-6">
            {c.links.map((l) => (
              <button
                key={l.id}
                onClick={() => scrollTo(l.id)}
                className="text-[#8B949E] hover:text-[#E6EDF3] text-sm transition-colors cursor-pointer"
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <LangToggle />
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/login" })}>
              {c.signIn}
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate({ to: "/register" })}>
              {c.cta}
            </Button>
          </div>

          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden text-[#8B949E] hover:text-[#E6EDF3]"
            aria-label={c.openMenu}
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      <div
        className={`md:hidden fixed inset-0 bg-[#0D1117] z-50 flex flex-col transition-transform duration-250 ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionDuration: "250ms" }}
        aria-hidden={!mobileOpen}
      >
        <div className="flex items-center justify-between px-6 h-16 border-b border-[#21262D]">
          <Logo />
          <button
            onClick={() => setMobileOpen(false)}
            className="text-[#8B949E] hover:text-[#E6EDF3]"
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
              className="block w-full text-left text-xl py-4 border-b border-[#21262D] text-[#E6EDF3]"
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="p-6 flex flex-col gap-3 border-t border-[#21262D]">
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
              navigate({ to: "/register" });
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
