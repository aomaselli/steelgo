import { AlertTriangle, Scale, FileLock2 as FileSignature, Receipt, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/i18n";

type CardDef = { borderColor: string; tag: string; tagClass: string; icon: string; title: string; body: string };

const COPY = {
  pt: {
    alert: "O Brasil perde R$ 1,2 bilhão em roubos de carga por ano. A SteelGo foi construída para eliminar esse risco de ponta a ponta.",
    eyebrow: "Segurança de carga",
    h2: "Proteção total em cada etapa do transporte",
    sub: "Tecnologia, processos e proteção legal em cada frete.",
    legalTitle: "⚖️ Proteção legal completa",
    cards: [
      { borderColor: "#16263F", tag: "Rastreamento", tagClass: "bg-[#16263F]/20 text-[#9FB4D4] border-[#16263F]/40", icon: "📍", title: "GPS contínuo 30s", body: "Posição a cada 30s. Alerta para desvio de rota acima de 2km. Histórico imutável de toda a jornada." },
      { borderColor: "#16263F", tag: "Identidade", tagClass: "bg-[#16263F]/20 text-[#9FB4D4] border-[#16263F]/40", icon: "🪪", title: "Verificação biométrica", body: "CPF, CNH e selfie do motorista no embarque. Transportadora confirma motorista 2h antes." },
      { borderColor: "#C0392B", tag: "Emergência", tagClass: "bg-[#C0392B]/20 text-[#C0392B] border-[#C0392B]/40", icon: "🚨", title: "Botão de pânico 24/7", body: "3 segundos ativa alerta para central, transportadora e SteelGo com GPS ao vivo. Resposta em 2 min." },
      { borderColor: "#2FA98A", tag: "Financeiro", tagClass: "bg-[#2FA98A]/20 text-[#2FA98A] border-[#2FA98A]/40", icon: "🔐", title: "Seu dinheiro fica protegido", body: "O valor do frete fica guardado em uma conta segura. A transportadora só recebe depois que você confirmar que a carga chegou em boas condições." },
      { borderColor: "#9A5B00", tag: "Checkpoint", tagClass: "bg-[#9A5B00]/20 text-[#E0A23A] border-[#9A5B00]/40", icon: "📸", title: "Fotos obrigatórias", body: "Foto com geolocalização na origem, waypoints e destino. Alerta imediato ao embarcador via WhatsApp." },
      { borderColor: "#7C3AED", tag: "Anti-adulteração", tagClass: "bg-purple-900/30 text-purple-400 border-purple-700/30", icon: "🏷️", title: "Lacre QR digital", body: "QR único escaneado em sequência em cada checkpoint. Adulteração detectada instantaneamente." },
    ] as CardDef[],
    legalItems: [
      { Icon: Scale, title: "RCTR-C automático", desc: "Seguro de responsabilidade civil incluído em todos os fretes por padrão." },
      { Icon: FileSignature, title: "Contrato ICP-Brasil", desc: "Assinatura digital com validade jurídica plena. Timestamping criptográfico." },
      { Icon: Receipt, title: "CTE e MDF-e", desc: "Geração e validação de documentos fiscais eletrônicos integrados." },
      { Icon: Search, title: "Auditoria SHA-256", desc: "Cada ação registrada com timestamp e hash imutável. Auditável judicialmente." },
    ],
  },
  en: {
    alert: "Brazil loses R$1.2 billion to cargo theft every year. SteelGo was built to eliminate that risk end to end.",
    eyebrow: "Cargo security",
    h2: "Full protection at every step of transport",
    sub: "Technology, process and legal protection on every freight.",
    legalTitle: "⚖️ Full legal protection",
    cards: [
      { borderColor: "#16263F", tag: "Tracking", tagClass: "bg-[#16263F]/20 text-[#9FB4D4] border-[#16263F]/40", icon: "📍", title: "Continuous GPS 30s", body: "Position every 30s. Alert for route deviation over 2km. Immutable journey log." },
      { borderColor: "#16263F", tag: "Identity", tagClass: "bg-[#16263F]/20 text-[#9FB4D4] border-[#16263F]/40", icon: "🪪", title: "Biometric verification", body: "Driver ID, license and selfie at pickup. Carrier confirms driver 2h ahead." },
      { borderColor: "#C0392B", tag: "Emergency", tagClass: "bg-[#C0392B]/20 text-[#C0392B] border-[#C0392B]/40", icon: "🚨", title: "Panic button 24/7", body: "Hold 3 seconds to alert dispatch, carrier and SteelGo with live GPS. 2-minute response." },
      { borderColor: "#2FA98A", tag: "Financial", tagClass: "bg-[#2FA98A]/20 text-[#2FA98A] border-[#2FA98A]/40", icon: "🔐", title: "Escrow protects payment", body: "100% held until geotagged-photo delivery. No proof, no release." },
      { borderColor: "#9A5B00", tag: "Checkpoint", tagClass: "bg-[#9A5B00]/20 text-[#E0A23A] border-[#9A5B00]/40", icon: "📸", title: "Mandatory photos", body: "Geotagged photo at origin, waypoints and destination. Instant WhatsApp alert to shipper." },
      { borderColor: "#7C3AED", tag: "Anti-tamper", tagClass: "bg-purple-900/30 text-purple-400 border-purple-700/30", icon: "🏷️", title: "Digital QR seal", body: "Unique QR scanned in sequence at every checkpoint. Tampering detected instantly." },
    ] as CardDef[],
    legalItems: [
      { Icon: Scale, title: "Auto RCTR-C", desc: "Civil liability insurance included by default on every freight." },
      { Icon: FileSignature, title: "ICP-Brasil contract", desc: "Digital signature with full legal value. Cryptographic timestamping." },
      { Icon: Receipt, title: "CTE & MDF-e", desc: "Integrated generation and validation of electronic fiscal documents." },
      { Icon: Search, title: "SHA-256 audit log", desc: "Every action logged with timestamp and immutable hash. Court-admissible." },
    ],
  },
} as const;

export function SecuritySection() {
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;

  return (
    <section id="seguranca" className="bg-[#F7F9FB] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="mb-12 flex items-start gap-3 rounded-[12px] border border-[#E0A23A]/40 bg-[#FBEED8] p-4">
          <AlertTriangle size={20} className="mt-0.5 flex-shrink-0 text-[#9A5B00]" />
          <p className="text-sm text-[#9A5B00]" style={{ lineHeight: 1.6 }}>{c.alert}</p>
        </div>

        <div className="mb-12">
          <div className="text-[#9A5B00] text-xs uppercase tracking-widest font-semibold mb-3">{c.eyebrow}</div>
          <h2 className="text-[#16263F] font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#5B6B80] text-lg">{c.sub}</p>
        </div>

        <div className="mb-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {c.cards.map((card) => (
            <div key={card.title} className="relative rounded-[16px] border border-[#E6EAF0] bg-white p-5 shadow-sm" style={{ borderTopColor: card.borderColor }}>
              <Badge variant="outline" className={`absolute right-4 top-4 ${card.tagClass}`}>{card.tag}</Badge>
              <div className="mb-3 text-2xl">{card.icon}</div>
              <div className="mb-2 text-sm font-semibold text-[#16263F]">{card.title}</div>
              <p className="text-xs text-[#5B6B80]" style={{ lineHeight: 1.7 }}>{card.body}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[20px] border border-[#E6EAF0] bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-[#16263F]">{c.legalTitle}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {c.legalItems.map(({ Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] bg-[#16263F]/10">
                  <Icon size={16} className="text-[#16263F]" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[#16263F]">{title}</div>
                  <div className="mt-0.5 text-xs text-[#5B6B80]">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
