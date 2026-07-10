import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "Quem usa",
    h2: "O que dizem nossos clientes",
    testimonials: [
      { tag: "Segurança", tagClass: "bg-[#C0392B]/20 text-[#C0392B] border-[#C0392B]/40", quote: "Antes do SteelGo, tínhamos 2 roubos de carga por trimestre. Nos últimos 8 meses, zero ocorrências. O rastreamento e o botão de pânico mudaram completamente nossa operação.", name: "Carlos Menezes", title: "Gerente de Logística, MetalSul Distribuidora", initials: "CM" },
      { tag: "Pagamento", tagClass: "bg-[#2FA98A]/20 text-[#2FA98A] border-[#2FA98A]/40", quote: "Como transportadora, a plataforma me dá acesso a fretes qualificados de aço e o pagamento cai em 24 horas após a entrega. Nunca mais esperamos 60 dias para receber.", name: "Adriana Fonseca", title: "Diretora, Transportes Fonseca Ltda.", initials: "AF" },
      { tag: "ESG", tagClass: "bg-[#16263F]/20 text-[#9FB4D4] border-[#16263F]/40", quote: "Nosso relatório ESG agora inclui dados de transporte com zero esforço da nossa equipe. O SteelGo gera tudo automaticamente. Apresentamos ao conselho no mês passado.", name: "Rafael Duarte", title: "Sustainability Manager, Forja Brasil Indústria", initials: "RD" },
    ],
  },
  en: {
    eyebrow: "Who uses it",
    h2: "What our customers say",
    testimonials: [
      { tag: "Security", tagClass: "bg-[#C0392B]/20 text-[#C0392B] border-[#C0392B]/40", quote: "Before SteelGo we had 2 cargo thefts per quarter. In the last 8 months, zero incidents. Tracking and the panic button completely changed our operation.", name: "Carlos Menezes", title: "Logistics Manager, MetalSul Distribuidora", initials: "CM" },
      { tag: "Payment", tagClass: "bg-[#2FA98A]/20 text-[#2FA98A] border-[#2FA98A]/40", quote: "As a carrier, the platform gives me access to qualified steel freights and payment lands in 24 hours after delivery. We no longer wait 60 days to get paid.", name: "Adriana Fonseca", title: "Director, Transportes Fonseca Ltda.", initials: "AF" },
      { tag: "ESG", tagClass: "bg-[#16263F]/20 text-[#9FB4D4] border-[#16263F]/40", quote: "Our ESG report now includes transport data with zero effort from our team. SteelGo generates everything automatically. We presented to the board last month.", name: "Rafael Duarte", title: "Sustainability Manager, Forja Brasil Indústria", initials: "RD" },
    ],
  },
} as const;

export function TestimonialsSection() {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <section className="bg-[#F7F9FB] py-[100px]">
      <div className="mx-auto max-w-[1280px] px-6">
        <div className="mb-12 text-center">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#16263F]">{c.eyebrow}</div>
          <h2 className="mb-4 text-4xl font-bold text-[#16263F]">{c.h2}</h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {c.testimonials.map((t) => (
            <div key={t.name} className="relative flex flex-col rounded-[16px] border border-[#E6EAF0] bg-white p-6 shadow-sm">
              <Badge variant="outline" className={`absolute right-5 top-5 ${t.tagClass}`}>{t.tag}</Badge>
              <div className="mb-4 flex gap-0.5 text-sm text-[#E0A23A]">{"★★★★★"}</div>
              <p className="mb-6 flex-1 text-sm italic text-[#1F2933]" style={{ lineHeight: 1.8 }}>"{t.quote}"</p>
              <div className="flex items-center gap-3 border-t border-[#E6EAF0] pt-4">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[#16263F]/15 text-xs text-[#16263F]">{t.initials}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-semibold text-[#16263F]">{t.name}</div>
                  <div className="text-xs text-[#9AA6B2]">{t.title}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
