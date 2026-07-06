import { Coins, Star, Leaf, Smartphone, FileText, Target, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "Para transportadoras",
    h2a: "Acesse fretes de qualidade. ",
    h2b: "Receba em 24 horas.",
    sub: "Cadastre gratuitamente e acesse fretes de aço qualificados com pagamento garantido.",
    benefits: [
      { Icon: Coins, bg: "bg-[#1A9B5E]/20", color: "#2ECC8A", title: "Pagamento garantido", desc: "Conta protegida (Stripe). PIX em até 24h após entrega confirmada." },
      { Icon: Star, bg: "bg-[#1B6CB8]/20", color: "#3B89D4", title: "Score de reputação", desc: "Histórico digital. Score alto = mais fretes disponíveis." },
      { Icon: Leaf, bg: "bg-[#1A9B5E]/20", color: "#2ECC8A", title: "Prêmio verde", desc: "EV e biodiesel recebem ágio de até 15% nas propostas." },
      { Icon: Smartphone, bg: "bg-[#1B6CB8]/20", color: "#3B89D4", title: "App do motorista", desc: "iOS, Android e PWA. Checkpoints e emergência offline." },
      { Icon: FileText, bg: "bg-[#1B6CB8]/20", color: "#3B89D4", title: "Contrato automático", desc: "Gerado em segundos. Assine no celular sem papelada." },
      { Icon: Target, bg: "bg-[#1B6CB8]/20", color: "#3B89D4", title: "Alertas por rota", desc: "Notificação automática de fretes na sua rota habitual." },
    ],
    docsTitle: "Documentos para cadastro",
    docs: ["CNPJ ativo", "RNTRC/ANTT", "Apólice RCTR-C", "CRLV dos caminhões", "CNH (C/D/E)", "Conta PIX"],
    stepsTitle: "Aprovação em até 48 horas",
    steps: ["Cadastro (5 min)", "Upload docs", "Verificação ANTT", "✅ Aprovado"],
    ctaPrimary: "Cadastrar transportadora →",
    ctaSecondary: "Ver sistema de score",
  },
  en: {
    eyebrow: "For carriers",
    h2a: "Access quality freight. ",
    h2b: "Get paid in 24 hours.",
    sub: "Register for free and access qualified steel freights with guaranteed payment.",
    benefits: [
      { Icon: Coins, bg: "bg-[#1A9B5E]/20", color: "#2ECC8A", title: "Guaranteed payment", desc: "Stripe escrow. PIX within 24h of confirmed delivery." },
      { Icon: Star, bg: "bg-[#1B6CB8]/20", color: "#3B89D4", title: "Reputation score", desc: "Digital history. Higher score = more freights available." },
      { Icon: Leaf, bg: "bg-[#1A9B5E]/20", color: "#2ECC8A", title: "Green premium", desc: "EV and biodiesel get up to 15% bid premium." },
      { Icon: Smartphone, bg: "bg-[#1B6CB8]/20", color: "#3B89D4", title: "Driver app", desc: "iOS, Android and PWA. Offline checkpoints and emergency." },
      { Icon: FileText, bg: "bg-[#1B6CB8]/20", color: "#3B89D4", title: "Automatic contract", desc: "Generated in seconds. Sign on mobile, no paperwork." },
      { Icon: Target, bg: "bg-[#1B6CB8]/20", color: "#3B89D4", title: "Route alerts", desc: "Automatic notifications for freights on your usual route." },
    ],
    docsTitle: "Documents for registration",
    docs: ["Active CNPJ", "RNTRC/ANTT", "RCTR-C policy", "Truck CRLV", "Driver license (C/D/E)", "PIX account"],
    stepsTitle: "Approval within 48 hours",
    steps: ["Sign up (5 min)", "Upload docs", "ANTT check", "✅ Approved"],
    ctaPrimary: "Register carrier →",
    ctaSecondary: "See scoring system",
  },
} as const;

export function CarrierSection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <section id="transportadoras" className="bg-[#F7F9FB] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="mb-12">
          <div className="text-[#1B6CB8] text-xs uppercase tracking-widest font-semibold mb-3">{c.eyebrow}</div>
          <h2 className="text-[#0F172A] font-bold text-4xl mb-4">
            {c.h2a}<span className="text-[#1A9B5E]">{c.h2b}</span>
          </h2>
          <p className="text-[#475569] text-lg">{c.sub}</p>
        </div>

        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {c.benefits.map(({ Icon, bg, color, title, desc }) => (
            <div key={title} className="flex items-start gap-3 rounded-[18px] border border-[#D8E1EA] bg-white p-4 shadow-sm">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${bg}`}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <div className="mb-1 text-sm font-semibold text-[#0F172A]">{title}</div>
                <p className="text-xs text-[#475569]" style={{ lineHeight: 1.6 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8 rounded-[24px] border border-[#D8E1EA] bg-white p-8 shadow-sm md:grid-cols-2">
          <div>
            <h3 className="mb-3 font-semibold text-[#0F172A]">{c.docsTitle}</h3>
            <div>
              {c.docs.map((doc, i) => (
                <div key={doc} className={`flex items-center gap-2 py-2 ${i === c.docs.length - 1 ? "" : "border-b border-[#E2E8F0]"}`}>
                  <CheckCircle2 size={16} className="text-[#1A9B5E]" />
                  <span className="text-sm text-[#334155]">{doc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 font-semibold text-[#0F172A]">{c.stepsTitle}</h3>
            <div className="flex items-center gap-0">
              {c.steps.map((label, i) => (
                <div key={label} className="contents">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1B6CB8] text-xs font-bold text-white">{i + 1}</div>
                    <div className="mt-1 max-w-[60px] text-center text-[10px] text-[#475569]">{label}</div>
                  </div>
                  {i < c.steps.length - 1 && <div className="h-px flex-1 bg-[#E2E8F0]" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "carrier" } as never })} className="bg-[#1B6CB8] text-white hover:bg-[#1758a0]">
            {c.ctaPrimary}
          </Button>
          <Button size="lg" variant="ghost" className="border-[#D8E1EA] text-[#334155] hover:bg-[#F8FAFC]">{c.ctaSecondary}</Button>
        </div>
      </div>
    </section>
  );
}
