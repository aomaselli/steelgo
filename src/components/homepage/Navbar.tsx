import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

type NavLink = { id: string; target: string; label: string };

const NAV_COPY = {
  pt: {
    links: [
      { id: "solucoes", target: "como-funciona", label: "Soluções" },
      { id: "tecnologia", target: "seguranca", label: "Tecnologia" },
      { id: "industrias", target: "empresas", label: "Indústrias" },
      { id: "recursos", target: "frete-tradicional", label: "Recursos" },
      { id: "transportadoras", target: "transportadoras", label: "Transportadoras" },
      { id: "esg", target: "esg", label: "ESG" },
      { id: "sobre", target: "contato", label: "Sobre" },
      { id: "contato", target: "contato", label: "Contato" },
      { id: "suporte", target: "contato", label: "Suporte" },
    ] as NavLink[],
    signIn: "Entrar",
    cta: "Solicitar acesso →",
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
  },
  en: {
    links: [
      { id: "solucoes", target: "como-funciona", label: "Solutions" },
      { id: "tecnologia", target: "seguranca", label: "Technology" },
      { id: "industrias", target: "empresas", label: "Industries" },
      { id: "recursos", target: "frete-tradicional", label: "Resources" },
      { id: "transportadoras", target: "transportadoras", label: "Carriers" },
      { id: "esg", target: "esg", label: "ESG" },
      { id: "sobre", target: "contato", label: "About" },
      { id: "contato", target: "contato", label: "Contact" },
      { id: "suporte", target: "contato", label: "Support" },
    ] as NavLink[],
    signIn: "Sign in",
    cta: "Request access →",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  es: {
    links: [
      { id: "solucoes", target: "como-funciona", label: "Soluciones" },
      { id: "tecnologia", target: "seguranca", label: "Tecnología" },
      { id: "industrias", target: "empresas", label: "Industrias" },
      { id: "recursos", target: "frete-tradicional", label: "Recursos" },
      { id: "transportadoras", target: "transportadoras", label: "Transportistas" },
      { id: "esg", target: "esg", label: "ESG" },
      { id: "sobre", target: "contato", label: "Nosotros" },
      { id: "contato", target: "contato", label: "Contacto" },
      { id: "suporte", target: "contato", label: "Soporte" },
    ] as NavLink[],
    signIn: "Iniciar sesión",
    cta: "Solicitar acceso →",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
  },
} as const;

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-[9px]"
        style={{ background: "linear-gradient(140deg,#16263F,#2FA98A)" }}
      >
        <div
          className="h-[15px] w-3 bg-white"
          style={{
            clipPath: "polygon(0 0,55% 0,100% 50%,55% 100%,0 100%,45% 50%)",
          }}
        />
      </div>
      <span className="text-lg font-bold tracking-tight text-[#16263F]">SteelGo</span>
    </div>
  );
}

function LangToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="flex overflow-hidden rounded-full border border-[#E6EAF0] bg-white/80">
      {(["pt", "en", "es"] as const).map((lng) => {
        const active = language === lng;
        return (
          <button
            key={lng}
            onClick={() => setLanguage(lng)}
            className={`px-3 py-1 text-xs transition-colors ${
              active ? "bg-[#2FA98A] text-white" : "text-[#5B6B80] hover:text-[#16263F]"
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
          scrolled ? "border-[#E6EAF0] bg-white/90 backdrop-blur" : "border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-6 lg:px-8">
          <Logo />

          <nav className="hidden items-center gap-4 lg:flex xl:gap-5">
            {c.links.map((l) => (
              <button
                key={l.id}
                onClick={() => scrollTo(l.target)}
                className="whitespace-nowrap text-[13px] text-[#5B6B80] transition-colors hover:text-[#16263F] xl:text-sm"
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <LangToggle />
            <button
              onClick={() => navigate({ to: "/login" })}
              className="whitespace-nowrap text-sm font-semibold text-[#16263F] transition-colors hover:text-[#101C30]"
            >
              {c.signIn}
            </button>
            <button
              onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })}
              className="whitespace-nowrap rounded-[10px] bg-[#16263F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#101C30]"
            >
              {c.cta}
            </button>
          </div>

          <button
            onClick={() => setMobileOpen(true)}
            className="text-[#5B6B80] hover:text-[#16263F] lg:hidden"
            aria-label={c.openMenu}
          >
            <Menu size={24} />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-50 flex flex-col bg-[#F7F9FB] transition-transform lg:hidden ${
          mobileOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionDuration: "250ms" }}
        aria-hidden={!mobileOpen}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#E6EAF0] px-6">
          <Logo />
          <button
            onClick={() => setMobileOpen(false)}
            className="text-[#5B6B80] hover:text-[#16263F]"
            aria-label={c.closeMenu}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-6">
          {c.links.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollTo(l.target)}
              className="block w-full border-b border-[#E6EAF0] py-4 text-left text-xl text-[#16263F]"
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-3 border-t border-[#E6EAF0] p-6">
          <LangToggle />
          <button
            onClick={() => {
              setMobileOpen(false);
              navigate({ to: "/login" });
            }}
            className="w-full rounded-[10px] border border-[#E6EAF0] bg-white px-4 py-3 text-sm font-semibold text-[#16263F]"
          >
            {c.signIn}
          </button>
          <button
            onClick={() => {
              setMobileOpen(false);
              navigate({ to: "/register", search: { role: "shipper" } as never });
            }}
            className="w-full rounded-[10px] bg-[#16263F] px-4 py-3 text-sm font-semibold text-white hover:bg-[#101C30]"
          >
            {c.cta}
          </button>
        </div>
      </div>
    </>
  );
}

export default Navbar;
