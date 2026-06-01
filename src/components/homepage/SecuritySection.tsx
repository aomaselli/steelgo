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
      { borderColor: "#1B6CB8", tag: "Rastreamento", tagClass: "bg-[#1B6CB8]/20 text-[#79B8F8] border-[#1B6CB8]/40", icon: "📍", title: "GPS contínuo 30s", body: "Posição a cada 30s. Alerta para desvio de rota acima de 2km. Histórico imutável de toda a jornada." },
      { borderColor: "#1B6CB8", tag: "Identidade", tagClass: "bg-[#1B6CB8]/20 text-[#79B8F8] border-[#1B6CB8]/40", icon: "🪪", title: "Verificação biométrica", body: "CPF, CNH e selfie do motorista no embarque. Transportadora confirma motorista 2h antes." },
      { borderColor: "#C23333", tag: "Emergência", tagClass: "bg-[#C23333]/20 text-[#FF6B6B] border-[#C23333]/40", icon: "🚨", title: "Botão de pânico 24/7", body: "3 segundos ativa alerta para central, transportadora e SteelGo com GPS ao vivo. Resposta em 2 min." },
      { borderColor: "#1A9B5E", tag: "Financeiro", tagClass: "bg-[#1A9B5E]/20 text-[#2ECC8A] border-[#1A9B5E]/40", icon: "🔐", title: "Seu dinheiro fica protegido", body: "O valor do frete fica guardado em uma conta segura. A transportadora só recebe depois que você confirmar que a carga chegou em boas condições." },
      { borderColor: "#CC8800", tag: "Checkpoint", tagClass: "bg-[#CC8800]/20 text-[#F0A500] border-[#CC8800]/40", icon: "📸", title: "Fotos obrigatórias", body: "Foto com geolocalização na origem, waypoints e destino. Alerta imediato ao embarcador via WhatsApp." },
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
      { borderColor: "#1B6CB8", tag: "Tracking", tagClass: "bg-[#1B6CB8]/20 text-[#79B8F8] border-[#1B6CB8]/40", icon: "📍", title: "Continuous GPS 30s", body: "Position every 30s. Alert for route deviation over 2km. Immutable journey log." },
      { borderColor: "#1B6CB8", tag: "Identity", tagClass: "bg-[#1B6CB8]/20 text-[#79B8F8] border-[#1B6CB8]/40", icon: "🪪", title: "Biometric verification", body: "Driver ID, license and selfie at pickup. Carrier confirms driver 2h ahead." },
      { borderColor: "#C23333", tag: "Emergency", tagClass: "bg-[#C23333]/20 text-[#FF6B6B] border-[#C23333]/40", icon: "🚨", title: "Panic button 24/7", body: "Hold 3 seconds to alert dispatch, carrier and SteelGo with live GPS. 2-minute response." },
      { borderColor: "#1A9B5E", tag: "Financial", tagClass: "bg-[#1A9B5E]/20 text-[#2ECC8A] border-[#1A9B5E]/40", icon: "🔐", title: "Escrow protects payment", body: "100% held until geotagged-photo delivery. No proof, no release." },
      { borderColor: "#CC8800", tag: "Checkpoint", tagClass: "bg-[#CC8800]/20 text-[#F0A500] border-[#CC8800]/40", icon: "📸", title: "Mandatory photos", body: "Geotagged photo at origin, waypoints and destination. Instant WhatsApp alert to shipper." },
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
  const c = COPY[language];

  return (
    <section id="seguranca" className="bg-[#161B22] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="bg-[#CC8800]/10 border border-[#CC8800]/30 rounded-[12px] p-4 flex gap-3 items-start mb-12">
          <AlertTriangle size={20} className="text-[#F0A500] flex-shrink-0 mt-0.5" />
          <p className="text-[#C9D1D9] text-sm" style={{ lineHeight: 1.6 }}>{c.alert}</p>
        </div>

        <div className="mb-12">
          <div className="text-[#F0A500] text-xs uppercase tracking-widest font-medium mb-3">{c.eyebrow}</div>
          <h2 className="text-[#E6EDF3] font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#8B949E] text-lg">{c.sub}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {c.cards.map((card) => (
            <div key={card.title} className="bg-[#1C2128] rounded-[14px] p-5 relative border-t-4" style={{ borderTopColor: card.borderColor }}>
              <Badge variant="outline" className={`absolute top-4 right-4 ${card.tagClass}`}>{card.tag}</Badge>
              <div className="text-2xl mb-3">{card.icon}</div>
              <div className="text-[#E6EDF3] font-semibold text-sm mb-2">{card.title}</div>
              <p className="text-[#8B949E] text-xs" style={{ lineHeight: 1.7 }}>{card.body}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#1C2128] border border-[#30363D] rounded-[16px] p-6">
          <h3 className="text-[#E6EDF3] font-semibold text-lg mb-4">{c.legalTitle}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {c.legalItems.map(({ Icon, title, desc }) => (
              <div key={title} className="flex gap-3 items-start">
                <div className="w-8 h-8 bg-[#1B6CB8]/10 rounded-[8px] flex items-center justify-center flex-shrink-0">
                  <Icon size={16} className="text-[#79B8F8]" />
                </div>
                <div>
                  <div className="text-sm font-medium text-[#C9D1D9]">{title}</div>
                  <div className="text-xs text-[#8B949E] mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
