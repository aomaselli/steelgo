import { Linkedin, Instagram, Youtube } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { BrandLogo } from "@/components/brand/BrandLogo";

type FooterLink = { label: string; href: string };

const COPY = {
  pt: {
    tagline: "A infraestrutura digital logística da América Latina.",
    columns: [
      { title: "Produto", links: ["Como funciona", "Segurança", "Logística verde", "API"] },
      { title: "Empresa", links: ["Sobre nós", "Blog", "Carreiras", "Imprensa"] },
      { title: "Suporte", links: ["Central de ajuda", "Status", "Contato", "WhatsApp"] },
      { title: "Legal", links: [
        { label: "Termos de uso", href: "/terms" },
        { label: "Privacidade", href: "/privacy" },
        { label: "Cookies", href: "/cookies" },
      ] },
    ],
    copyright: "© 2026 SteelGo · São Paulo, Brasil",
    badges: ["Segurança", "Rastreabilidade", "Compliance", "Logística verde"],
  },
  en: {
    tagline: "Latin America's digital logistics infrastructure.",
    columns: [
      { title: "Product", links: ["How it works", "Security", "Green logistics", "API"] },
      { title: "Company", links: ["About us", "Blog", "Careers", "Press"] },
      { title: "Support", links: ["Help center", "Status", "Contact", "WhatsApp"] },
      { title: "Legal", links: [
        { label: "Terms of use", href: "/terms" },
        { label: "Privacy", href: "/privacy" },
        { label: "Cookies", href: "/cookies" },
      ] },
    ],
    copyright: "© 2026 SteelGo · São Paulo, Brazil",
    badges: ["Security", "Traceability", "Compliance", "Green logistics"],
  },
  es: {
    tagline: "La infraestructura logística digital de América Latina.",
    columns: [
      { title: "Producto", links: ["Cómo funciona", "Seguridad", "Logística verde", "API"] },
      { title: "Empresa", links: ["Sobre nosotros", "Blog", "Carreras", "Prensa"] },
      { title: "Soporte", links: ["Centro de ayuda", "Estado", "Contacto", "WhatsApp"] },
      { title: "Legal", links: [
        { label: "Términos de uso", href: "/terms" },
        { label: "Privacidad", href: "/privacy" },
        { label: "Cookies", href: "/cookies" },
      ] },
    ],
    copyright: "© 2026 SteelGo · São Paulo, Brasil",
    badges: ["Seguridad", "Trazabilidad", "Cumplimiento", "Logística verde"],
  },
} as const;

export function Footer() {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <footer id="contato" className="border-t border-[#29405F] bg-[#081321] pt-[60px] pb-8 text-white">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <BrandLogo surface="dark" className="h-10 w-auto" />
            <p className="text-sm text-[#B8C6D9] mt-3 mb-4 max-w-xs">{c.tagline}</p>
            <div className="flex gap-3 mt-4">
              {[Linkedin, Instagram, Youtube].map((Icon, i) => (
                <a key={i} href="#" className="w-8 h-8 rounded-[8px] border border-[#29405F] bg-[#111E33] flex items-center justify-center text-[#B8C6D9] hover:border-[#2FA98A] hover:text-[#2FA98A] transition-colors">
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {c.columns.map((col) => (
            <div key={col.title}>
              <div className="text-xs uppercase tracking-widest text-[#E7EDF5] font-bold mb-4">{col.title}</div>
              <div className="flex flex-col gap-2">
                {(col.links as FooterLink[]).map((link) => (
                  <a key={link.href} href={link.href} className="text-sm text-[#E7EDF5] hover:text-[#2FA98A] hover:underline transition-colors">{link.label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>


        <div className="border-t border-[#29405F] pt-6 flex items-center justify-between flex-wrap gap-4">
          <div className="text-xs text-[#9FB4D4]">{c.copyright}</div>
          <div className="flex gap-2 flex-wrap">
            {c.badges.map((b) => (
              <span key={b} className="text-xs text-[#E7EDF5] bg-[#111E33] border border-[#29405F] rounded-full px-3 py-1">{b}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
