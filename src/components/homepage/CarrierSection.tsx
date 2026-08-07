import { Coins, Star, Leaf, Smartphone, FileText, Target, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    eyebrow: "Para transportadoras",
    h2a: "Mais oportunidades. ",
    h2b: "Mais controle operacional.",
    sub: "Conecte sua transportadora a operações compatíveis com suas rotas, veículos e capacidade disponível.",
    benefits: [
      { Icon: Coins, bg: "bg-[#2FA98A]/20", color: "#2FA98A", title: "Gestão de recebimentos", desc: "Acompanhe condições, evidências de entrega e andamento do pagamento." },
      { Icon: Star, bg: "bg-[#16263F]/20", color: "#2C4568", title: "Reputação operacional", desc: "Construa um histórico digital com indicadores de desempenho e segurança." },
      { Icon: Leaf, bg: "bg-[#2FA98A]/20", color: "#2FA98A", title: "Alternativas verdes", desc: "Destaque veículos e combustíveis de menor emissão quando disponíveis." },
      { Icon: Smartphone, bg: "bg-[#16263F]/20", color: "#2C4568", title: "App do motorista", desc: "Rotas, checkpoints, fotos, QR de lacre e recursos de emergência." },
      { Icon: FileText, bg: "bg-[#16263F]/20", color: "#2C4568", title: "Documentação digital", desc: "Centralize contratos, documentos e evidências operacionais." },
      { Icon: Target, bg: "bg-[#16263F]/20", color: "#2C4568", title: "Alertas por rota", desc: "Receba notificações de oportunidades alinhadas à sua operação." },
    ],
    docsTitle: "Documentos para habilitação",
    docs: ["CNPJ ativo", "RNTRC/ANTT", "Apólice RCTR-C", "CRLV dos veículos", "CNH (C/D/E)", "Dados bancários"],
    stepsTitle: "Etapas de habilitação",
    steps: ["Cadastro", "Envio de documentos", "Verificação", "✅ Habilitação"],
    ctaPrimary: "Cadastrar transportadora →",
    ctaSecondary: "Conhecer o sistema de reputação",
  },
  en: {
    eyebrow: "For carriers",
    h2a: "More opportunities. ",
    h2b: "More operating control.",
    sub: "Connect your carrier to operations that match your routes, vehicles and available capacity.",
    benefits: [
      { Icon: Coins, bg: "bg-[#2FA98A]/20", color: "#2FA98A", title: "Receivables management", desc: "Track conditions, delivery evidence and payment progress." },
      { Icon: Star, bg: "bg-[#16263F]/20", color: "#2C4568", title: "Operating reputation", desc: "Build a digital history with performance and safety indicators." },
      { Icon: Leaf, bg: "bg-[#2FA98A]/20", color: "#2FA98A", title: "Green alternatives", desc: "Highlight lower-emission vehicles and fuels when available." },
      { Icon: Smartphone, bg: "bg-[#16263F]/20", color: "#2C4568", title: "Driver app", desc: "Routes, checkpoints, photos, seal QR and emergency resources." },
      { Icon: FileText, bg: "bg-[#16263F]/20", color: "#2C4568", title: "Digital documentation", desc: "Centralize contracts, documents and operating evidence." },
      { Icon: Target, bg: "bg-[#16263F]/20", color: "#2C4568", title: "Route alerts", desc: "Receive opportunity notifications aligned with your operation." },
    ],
    docsTitle: "Qualification documents",
    docs: ["Active CNPJ", "RNTRC/ANTT", "RCTR-C policy", "Vehicle CRLV", "Driver license (C/D/E)", "Bank details"],
    stepsTitle: "Qualification stages",
    steps: ["Registration", "Document upload", "Verification", "✅ Qualification"],
    ctaPrimary: "Register carrier →",
    ctaSecondary: "Explore reputation system",
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
          <div className="text-[#16263F] text-xs uppercase tracking-widest font-semibold mb-3">{c.eyebrow}</div>
          <h2 className="text-[#16263F] font-bold text-4xl mb-4">
            {c.h2a}<span className="text-[#2FA98A]">{c.h2b}</span>
          </h2>
          <p className="text-[#5B6B80] text-lg">{c.sub}</p>
        </div>

        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {c.benefits.map(({ Icon, bg, color, title, desc }) => (
            <div key={title} className="flex items-start gap-3 rounded-[18px] border border-[#E6EAF0] bg-white p-4 shadow-sm">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${bg}`}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <div className="mb-1 text-sm font-semibold text-[#16263F]">{title}</div>
                <p className="text-xs text-[#5B6B80]" style={{ lineHeight: 1.6 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8 rounded-[24px] border border-[#E6EAF0] bg-white p-8 shadow-sm md:grid-cols-2">
          <div>
            <h3 className="mb-3 font-semibold text-[#16263F]">{c.docsTitle}</h3>
            <div>
              {c.docs.map((doc, i) => (
                <div key={doc} className={`flex items-center gap-2 py-2 ${i === c.docs.length - 1 ? "" : "border-b border-[#E6EAF0]"}`}>
                  <CheckCircle2 size={16} className="text-[#2FA98A]" />
                  <span className="text-sm text-[#1F2933]">{doc}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 font-semibold text-[#16263F]">{c.stepsTitle}</h3>
            <div className="flex items-center gap-0">
              {c.steps.map((label, i) => (
                <div key={label} className="contents">
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#16263F] text-xs font-bold text-white">{i + 1}</div>
                    <div className="mt-1 max-w-[60px] text-center text-[10px] text-[#5B6B80]">{label}</div>
                  </div>
                  {i < c.steps.length - 1 && <div className="h-px flex-1 bg-[#E6EAF0]" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "carrier" } as never })} className="bg-[#16263F] text-white hover:bg-[#101C30]">
            {c.ctaPrimary}
          </Button>
          <Button size="lg" variant="ghost" className="border-[#E6EAF0] text-[#1F2933] hover:bg-[#F7F9FB]">{c.ctaSecondary}</Button>
        </div>
      </div>
    </section>
  );
}
