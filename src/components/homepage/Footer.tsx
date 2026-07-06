import { Zap, Linkedin, Instagram, Youtube } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    tagline: "Marketplace de logística especializado em transporte de aço no Brasil.",
    columns: [
      { title: "Produto", links: ["Como funciona", "Preços", "Segurança", "Logística verde", "API"] },
      { title: "Empresa", links: ["Sobre nós", "Blog", "Carreiras", "Imprensa"] },
      { title: "Suporte", links: ["Central de ajuda", "Status", "Contato", "WhatsApp"] },
      { title: "Legal", links: ["Termos de uso", "Privacidade", "LGPD", "Cookies"] },
    ],
    copyright: "© 2025 SteelGo Tecnologia Ltda. · São Paulo, SP",
    badges: ["ANTT Parceiro", "LGPD Compliant", "ICP-Brasil", "🌿 Net Zero 2025"],
  },
  en: {
    tagline: "Logistics marketplace specialized in steel transport across Brazil.",
    columns: [
      { title: "Product", links: ["How it works", "Pricing", "Security", "Green logistics", "API"] },
      { title: "Company", links: ["About us", "Blog", "Careers", "Press"] },
      { title: "Support", links: ["Help center", "Status", "Contact", "WhatsApp"] },
      { title: "Legal", links: ["Terms of use", "Privacy", "LGPD", "Cookies"] },
    ],
    copyright: "© 2025 SteelGo Tecnologia Ltda. · São Paulo, Brazil",
    badges: ["ANTT Partner", "LGPD Compliant", "ICP-Brasil", "🌿 Net Zero 2025"],
  },
} as const;

export function Footer() {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <footer className="bg-[#161B22] border-t border-[#30363D] pt-[60px] pb-8">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#1B6CB8] rounded-[8px] flex items-center justify-center">
                <Zap size={18} className="text-white" />
              </div>
              <span className="text-[#E6EDF3] font-bold text-lg">SteelGo</span>
            </div>
            <p className="text-sm text-[#8B949E] mt-3 mb-4 max-w-xs">{c.tagline}</p>
            <div className="flex gap-3 mt-4">
              {[Linkedin, Instagram, Youtube].map((Icon, i) => (
                <a key={i} href="#" className="w-8 h-8 rounded-[8px] bg-[#21262D] flex items-center justify-center hover:bg-[#30363D] transition-colors">
                  <Icon size={16} className="text-[#8B949E]" />
                </a>
              ))}
            </div>
          </div>

          {c.columns.map((col) => (
            <div key={col.title}>
              <div className="text-xs uppercase tracking-widest text-[#484F58] font-bold mb-4">{col.title}</div>
              <div className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <a key={link} href="#" className="text-sm text-[#8B949E] hover:text-[#E6EDF3] transition-colors">{link}</a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#30363D] pt-6 flex items-center justify-between flex-wrap gap-4">
          <div className="text-xs text-[#484F58]">{c.copyright}</div>
          <div className="flex gap-2 flex-wrap">
            {c.badges.map((b) => (
              <span key={b} className="text-xs text-[#484F58] bg-[#21262D] border border-[#30363D] rounded-full px-3 py-1">{b}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
