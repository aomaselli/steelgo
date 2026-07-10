import { Zap, Linkedin, Instagram, Youtube } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

type FooterLink = { label: string; href: string };

const COPY = {
  pt: {
    tagline: "Plataforma de tecnologia para logística industrial na América Latina, começando pela cadeia do aço.",
    columns: [
      { title: "Produto", links: ["Como funciona", "Segurança", "Logística verde", "API"] },
      { title: "Empresa", links: ["Sobre nós", "Blog", "Carreiras", "Imprensa"] },
      { title: "Suporte", links: ["Central de ajuda", "Status", "Contato", "WhatsApp"] },
      {
        title: "Legal",
        links: [
          { label: "Termos de uso", href: "/terms" },
          { label: "Privacidade", href: "/privacy" },
          { label: "Cookies", href: "/cookies" },
        ],
      },
    ],
    contactLine: "Contato:",
    copyright: "© 2025 SteelGo Tecnologia Ltda. · São Paulo, SP",
    badges: ["ANTT Parceiro", "LGPD Compliant", "ICP-Brasil", "🌿 Net Zero 2025"],
  },
  en: {
    tagline: "Technology platform for industrial logistics in Latin America, starting with the steel supply chain.",
    columns: [
      { title: "Product", links: ["How it works", "Security", "Green logistics", "API"] },
      { title: "Company", links: ["About us", "Blog", "Careers", "Press"] },
      { title: "Support", links: ["Help center", "Status", "Contact", "WhatsApp"] },
      {
        title: "Legal",
        links: [
          { label: "Terms of use", href: "/terms" },
          { label: "Privacy", href: "/privacy" },
          { label: "Cookies", href: "/cookies" },
        ],
      },
    ],
    contactLine: "Contact:",
    copyright: "© 2025 SteelGo Tecnologia Ltda. · São Paulo, Brazil",
    badges: ["ANTT Partner", "LGPD Compliant", "ICP-Brasil", "🌿 Net Zero 2025"],
  },
  es: {
    tagline: "Plataforma tecnológica para logística industrial en América Latina, comenzando por la cadena del acero.",
    columns: [
      { title: "Producto", links: ["Cómo funciona", "Seguridad", "Logística verde", "API"] },
      { title: "Empresa", links: ["Sobre nosotros", "Blog", "Carreras", "Prensa"] },
      { title: "Soporte", links: ["Centro de ayuda", "Estado", "Contacto", "WhatsApp"] },
      {
        title: "Legal",
        links: [
          { label: "Términos de uso", href: "/terms" },
          { label: "Privacidad", href: "/privacy" },
          { label: "Cookies", href: "/cookies" },
        ],
      },
    ],
    contactLine: "Contacto:",
    copyright: "© 2025 SteelGo Tecnologia Ltda. · São Paulo, Brasil",
    badges: ["Socio ANTT", "LGPD Compliant", "ICP-Brasil", "🌿 Net Zero 2025"],
  },
} as const;

export function Footer() {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;
  const contactMailto =
    language === "en"
      ? "mailto:ariane@steelgoapp.com?subject=SteelGo%20contact&body=Hello%2C%20I%20would%20like%20to%20learn%20more%20about%20SteelGo."
      : language === "es"
        ? "mailto:ariane@steelgoapp.com?subject=Contacto%20SteelGo&body=Hola%2C%20me%20gustaría%20saber%20más%20sobre%20SteelGo."
        : "mailto:ariane@steelgoapp.com?subject=Contato%20SteelGo&body=Olá%2C%20gostaria%20de%20saber%20mais%20sobre%20a%20SteelGo.";

  return (
    <footer id="contato" className="border-t border-[#E6EAF0] bg-[#F7F9FB] pt-[60px] pb-8 text-[#16263F]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#16263F] rounded-[8px] flex items-center justify-center">
                <Zap size={18} className="text-white" />
              </div>
              <span className="text-[#16263F] font-bold text-lg">SteelGo</span>
            </div>
            <p className="text-sm text-[#5B6B80] mt-3 mb-4 max-w-xs">{c.tagline}</p>
            <div className="flex gap-3 mt-4">
              {[Linkedin, Instagram, Youtube].map((Icon, i) => (
                <a key={i} href="#" className="w-8 h-8 rounded-[8px] border border-[#E6EAF0] bg-white flex items-center justify-center text-[#5B6B80] hover:border-[#2FA98A] hover:text-[#2FA98A] transition-colors">
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {c.columns.map((col) => (
            <div key={col.title}>
              <div className="text-xs uppercase tracking-widest text-[#1F2933] font-bold mb-4">{col.title}</div>
              <div className="flex flex-col gap-2">
                {(col.links as FooterLink[]).map((link) => (
                  <a key={link.href} href={link.href} className="text-sm text-[#1F2933] hover:text-[#2FA98A] hover:underline transition-colors">{link.label}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-6 text-sm text-[#5B6B80]">
          {c.contactLine}{" "}
          <a href={contactMailto} className="text-[#16263F] hover:underline">ariane@steelgoapp.com</a>
        </div>

        <div className="border-t border-[#E6EAF0] pt-6 flex items-center justify-between flex-wrap gap-4">
          <div className="text-xs text-[#9AA6B2]">{c.copyright}</div>
          <div className="flex gap-2 flex-wrap">
            {c.badges.map((b) => (
              <span key={b} className="text-xs text-[#1F2933] bg-white border border-[#E6EAF0] rounded-full px-3 py-1">{b}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
