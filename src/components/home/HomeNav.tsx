import { Link } from "@tanstack/react-router";
import { Menu, X, Globe } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/steel";

export function HomeNav() {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "#how", label: t("nav.howItWorks") },
    { href: "#companies", label: t("nav.forCompanies") },
    { href: "#carriers", label: t("nav.forCarriers") },
    { href: "#green", label: t("nav.greenLogistics") },
    { href: "#security", label: t("nav.security") },
    { href: "#pricing", label: t("nav.pricing") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-graphite-800/50 bg-bg-base/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <a href="#top" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-steel-blue-400" />
          <span className="text-lg font-bold text-graphite-50">SteelGo</span>
        </a>

        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-graphite-200 hover:text-graphite-50">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLanguage(language === "pt" ? "en" : "pt")}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-graphite-200 hover:bg-bg-elevated"
          >
            <Globe className="h-4 w-4" />
            <span className="uppercase">{language}</span>
          </button>
          <Link to="/login" className="hidden text-sm text-graphite-200 hover:text-graphite-50 md:inline">
            {t("nav.login")}
          </Link>
          <Link to="/register" search={{ role: "shipper" }} className="hidden md:inline">
            <Button size="sm">{t("nav.cta")}</Button>
          </Link>
          <button
            className="lg:hidden rounded-md p-2 text-graphite-200 hover:bg-bg-elevated"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-graphite-800 bg-bg-surface lg:hidden">
          <div className="space-y-1 px-4 py-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm text-graphite-200 hover:bg-bg-elevated"
              >
                {l.label}
              </a>
            ))}
            <Link to="/login" className="block rounded-md px-3 py-2 text-sm text-graphite-200 hover:bg-bg-elevated">
              {t("nav.login")}
            </Link>
            <Link to="/register" search={{ role: "shipper" }} className="block px-3 py-2">
              <Button size="sm" className="w-full">{t("nav.cta")}</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
