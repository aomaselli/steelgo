import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "Quem usa",
    h2: "O que dizem nossos clientes",
    testimonials: [
      { tag: "Segurança", tagClass: "bg-[#C23333]/20 text-[#FF6B6B] border-[#C23333]/40", quote: "Antes do SteelGo, tínhamos 2 roubos de carga por trimestre. Nos últimos 8 meses, zero ocorrências. O rastreamento e o botão de pânico mudaram completamente nossa operação.", name: "Carlos Menezes", title: "Gerente de Logística, MetalSul Distribuidora", initials: "CM" },
      { tag: "Pagamento", tagClass: "bg-[#1A9B5E]/20 text-[#2ECC8A] border-[#1A9B5E]/40", quote: "Como transportadora, a plataforma me dá acesso a fretes qualificados de aço e o pagamento cai em 24 horas após a entrega. Nunca mais esperamos 60 dias para receber.", name: "Adriana Fonseca", title: "Diretora, Transportes Fonseca Ltda.", initials: "AF" },
      { tag: "ESG", tagClass: "bg-[#1B6CB8]/20 text-[#79B8F8] border-[#1B6CB8]/40", quote: "Nosso relatório ESG agora inclui dados de transporte com zero esforço da nossa equipe. O SteelGo gera tudo automaticamente. Apresentamos ao conselho no mês passado.", name: "Rafael Duarte", title: "Sustainability Manager, Forja Brasil Indústria", initials: "RD" },
    ],
  },
  en: {
    eyebrow: "Who uses it",
    h2: "What our customers say",
    testimonials: [
      { tag: "Security", tagClass: "bg-[#C23333]/20 text-[#FF6B6B] border-[#C23333]/40", quote: "Before SteelGo we had 2 cargo thefts per quarter. In the last 8 months, zero incidents. Tracking and the panic button completely changed our operation.", name: "Carlos Menezes", title: "Logistics Manager, MetalSul Distribuidora", initials: "CM" },
      { tag: "Payment", tagClass: "bg-[#1A9B5E]/20 text-[#2ECC8A] border-[#1A9B5E]/40", quote: "As a carrier, the platform gives me access to qualified steel freights and payment lands in 24 hours after delivery. We no longer wait 60 days to get paid.", name: "Adriana Fonseca", title: "Director, Transportes Fonseca Ltda.", initials: "AF" },
      { tag: "ESG", tagClass: "bg-[#1B6CB8]/20 text-[#79B8F8] border-[#1B6CB8]/40", quote: "Our ESG report now includes transport data with zero effort from our team. SteelGo generates everything automatically. We presented to the board last month.", name: "Rafael Duarte", title: "Sustainability Manager, Forja Brasil Indústria", initials: "RD" },
    ],
  },
} as const;

export function TestimonialsSection() {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <section className="bg-[#161B22] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-12">
          <div className="text-[#79B8F8] text-xs uppercase tracking-widest font-medium mb-3">{c.eyebrow}</div>
          <h2 className="text-[#E6EDF3] font-bold text-4xl mb-4">{c.h2}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {c.testimonials.map((t) => (
            <div key={t.name} className="bg-[#1C2128] border border-[#30363D] rounded-[16px] p-6 relative flex flex-col">
              <Badge variant="outline" className={`absolute top-5 right-5 ${t.tagClass}`}>{t.tag}</Badge>
              <div className="flex gap-0.5 mb-4 text-[#F0A500] text-sm">{"★★★★★"}</div>
              <p className="text-[#C9D1D9] text-sm italic flex-1 mb-6" style={{ lineHeight: 1.8 }}>"{t.quote}"</p>
              <div className="flex items-center gap-3 border-t border-[#30363D] pt-4">
                <Avatar className="w-9 h-9">
                  <AvatarFallback className="bg-[#1B6CB8]/20 text-[#79B8F8] text-xs">{t.initials}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-semibold text-[#E6EDF3]">{t.name}</div>
                  <div className="text-xs text-[#8B949E]">{t.title}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
