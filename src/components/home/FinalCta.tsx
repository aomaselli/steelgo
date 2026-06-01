import { Link } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/steel";

export function FinalCta() {
  const { language } = useLanguage();
  const t = language === "pt"
    ? { h: "Pronto para transportar com confiança?", d: "Cadastro em 2 minutos. Sem cartão. Sem mensalidade.", s: "Sou embarcador", c: "Sou transportadora" }
    : { h: "Ready to ship with confidence?", d: "Sign up in 2 minutes. No card. No monthly fee.", s: "I'm a shipper", c: "I'm a carrier" };
  return (
    <section className="border-b border-graphite-800 py-24">
      <div className="mx-auto max-w-3xl px-4 text-center md:px-8">
        <h2 className="text-4xl font-bold text-graphite-50 md:text-5xl">{t.h}</h2>
        <p className="mt-4 text-lg text-graphite-300">{t.d}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/register" search={{ role: "shipper" }}>
            <Button size="xl">{t.s} →</Button>
          </Link>
          <Link to="/register" search={{ role: "carrier" }}>
            <Button size="xl" variant="green">{t.c} →</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const { language } = useLanguage();
  const t = language === "pt"
    ? { tagline: "Transporte de aço seguro, digital e rastreável.", product: "Produto", company: "Empresa", legal: "Legal", howItWorks: "Como funciona", pricing: "Preços", green: "Logística verde", security: "Segurança", about: "Sobre", contact: "Contato", careers: "Carreiras", terms: "Termos de uso", privacy: "Privacidade", lgpd: "LGPD" }
    : { tagline: "Steel transport: secure, digital, traceable.", product: "Product", company: "Company", legal: "Legal", howItWorks: "How it works", pricing: "Pricing", green: "Green logistics", security: "Security", about: "About", contact: "Contact", careers: "Careers", terms: "Terms", privacy: "Privacy", lgpd: "Data" };

  return (
    <footer className="bg-bg-surface py-14">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded bg-steel-blue-400" />
              <span className="text-lg font-bold text-graphite-50">SteelGo</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-graphite-400">{t.tagline}</p>
          </div>
          <FCol title={t.product} items={[
            { label: t.howItWorks, href: "#how" },
            { label: t.pricing, href: "#pricing" },
            { label: t.green, href: "#green" },
            { label: t.security, href: "#security" },
          ]} />
          <FCol title={t.company} items={[
            { label: t.about, href: "#" },
            { label: t.contact, href: "#" },
            { label: t.careers, href: "#" },
          ]} />
          <FCol title={t.legal} items={[
            { label: t.terms, href: "#" },
            { label: t.privacy, href: "#" },
            { label: t.lgpd, href: "#" },
          ]} />
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-graphite-800 pt-6 text-xs text-graphite-400 md:flex-row">
          <span>© {new Date().getFullYear()} SteelGo. CNPJ 00.000.000/0001-00</span>
          <span>Made in 🇧🇷</span>
        </div>
      </div>
    </footer>
  );
}

function FCol({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-graphite-50">{title}</h4>
      <ul className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.label}>
            <a href={i.href} className="text-sm text-graphite-400 hover:text-graphite-100">{i.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
