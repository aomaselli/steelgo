import { useState } from "react";
import { useLanguage } from "@/lib/i18n";

type TabKey = "shipper" | "carrier";

const COPY = {
  pt: {
    eyebrow: "COMO FUNCIONA",
    h2a: "Do frete à entrega em ",
    h2b: "menos de 30 minutos",
    sub: "Um fluxo desenhado para reduzir burocracia, custos e risco em cada etapa da operação.",
    tabShipper: "Para embarcadores",
    tabCarrier: "Para transportadoras",
    shipperSteps: [
      { emoji: "📦", title: "Publique seu frete", body: "Informe tipo de aço, peso, rota e data. Escolha entre frete tradicional ou logística verde. Receba propostas em minutos de transportadoras verificadas pela ANTT." },
      { emoji: "⚡", title: "Escolha com score", body: "Compare propostas por preço, score de segurança (0–10), rating ESG e histórico. Todas as transportadoras são verificadas e têm apólice RCTR-C ativa." },
      { emoji: "✍️", title: "Contrato digital", body: "Contrato gerado automaticamente com todos os termos legais. Assinatura digital com validade jurídica ICP-Brasil em menos de 2 minutos." },
      { emoji: "🔒", title: "Pagamento garantido", body: "Seu pagamento fica 100% protegido até a entrega confirmada com foto com geolocalização e GPS. Sem prova de entrega, sem liberação." },
      { emoji: "📊", title: "Rastreie cada km", body: "Mapa ao vivo atualizado a cada 30 segundos. Alertas automáticos por WhatsApp e push para desvio de rota, atraso ou incidente." },
    ],
    carrierSteps: [
      { emoji: "🔍", title: "Encontre fretes", body: "Veja fretes disponíveis filtrados por estado, tipo de caminhão e tipo de aço. Alertas automáticos quando surgir um frete que combina com sua frota." },
      { emoji: "💰", title: "Envie sua proposta", body: "Defina seu valor, escolha motorista e caminhão. Para fretes verdes, destaque se tem caminhão elétrico ou baixo carbono e garanta um diferencial competitivo." },
      { emoji: "✍️", title: "Assine em segundos", body: "Proposta aceita → contrato em segundos → assine no celular com validade jurídica plena. Conforme legislação brasileira de transporte de cargas." },
      { emoji: "🗺️", title: "App do motorista", body: "Motorista usa o app SteelGo com rota, checkpoints obrigatórios com foto, QR do lacre e botão de emergência. Tudo registrado e auditável." },
      { emoji: "💳", title: "Receba em 24 horas", body: "Após confirmação de entrega, pagamento liberado automaticamente. Via PIX ou transferência bancária. Sem 30, 60 ou 90 dias de espera." },
    ],
  },
  en: {
    eyebrow: "HOW IT WORKS",
    h2a: "From posting to delivery in ",
    h2b: "under 30 minutes",
    sub: "A flow designed to cut paperwork, cost and risk at every step of the operation.",
    tabShipper: "For shippers",
    tabCarrier: "For carriers",
    shipperSteps: [
      { emoji: "📦", title: "Post your freight", body: "Enter steel type, weight, route and date. Pick traditional or green logistics. Receive bids in minutes from ANTT-verified carriers." },
      { emoji: "⚡", title: "Pick by score", body: "Compare bids by price, safety score (0–10), ESG rating and history. Every carrier is verified and holds an active RCTR-C insurance policy." },
      { emoji: "✍️", title: "Digital contract", body: "Contract generated automatically with all legal terms. ICP-Brasil-grade digital signature in under 2 minutes." },
      { emoji: "🔒", title: "Escrow payment", body: "Your payment is 100% protected until delivery is confirmed with a geotagged photo and GPS. No proof, no release." },
      { emoji: "📊", title: "Track every km", body: "Live map refreshed every 30 seconds. Automatic WhatsApp and push alerts for route deviation, delay or incident." },
    ],
    carrierSteps: [
      { emoji: "🔍", title: "Find freights", body: "See available freights filtered by state, truck type and steel type. Automatic alerts when a freight matches your fleet." },
      { emoji: "💰", title: "Send your bid", body: "Set your price, pick driver and truck. For green freights, highlight EV or low-carbon trucks to stand out." },
      { emoji: "✍️", title: "Sign in seconds", body: "Bid accepted → contract in seconds → sign on mobile with full legal value. Compliant with Brazilian cargo transport law." },
      { emoji: "🗺️", title: "Driver app", body: "Driver uses the SteelGo app with route, mandatory photo checkpoints, seal QR and emergency button. All recorded and auditable." },
      { emoji: "💳", title: "Get paid in 24h", body: "After delivery confirmation, payment is auto-released via PIX or bank transfer. No 30, 60 or 90-day wait." },
    ],
  },
} as const;

export function HowItWorksSection() {
  const [tab, setTab] = useState<TabKey>("shipper");
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;
  const steps = tab === "shipper" ? c.shipperSteps : c.carrierSteps;
  const dotColor = tab === "shipper" ? "bg-[#16263F]" : "bg-[#2FA98A]";

  return (
    <section id="como-funciona" className="bg-[#F7F9FB]" style={{ padding: "100px 0" }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-16">
          <div className="mb-3">
            <span className="text-[#16263F] text-xs uppercase tracking-widest font-semibold">{c.eyebrow}</span>
          </div>
          <h2 className="text-[#16263F] font-bold text-4xl mb-4">
            {c.h2a}<span className="text-[#16263F]">{c.h2b}</span>
          </h2>
          <p className="text-[#5B6B80] text-lg max-w-xl mx-auto">{c.sub}</p>
        </div>

        <div className="flex justify-center gap-2 mb-12">
          {([{ key: "shipper" as const, label: c.tabShipper }, { key: "carrier" as const, label: c.tabCarrier }]).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={active
                  ? "bg-[#16263F] text-white rounded-full px-5 py-2 text-sm font-medium shadow-sm"
                  : "border border-[#E6EAF0] bg-white text-[#5B6B80] rounded-full px-5 py-2 text-sm hover:text-[#16263F] hover:border-[#16263F]/30 transition-colors"}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div key={tab} className="mx-auto max-w-2xl animate-fade-in">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <div key={s.title} className={`flex gap-6 items-start ${isLast ? "mb-0" : "mb-10"}`}>
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full ${dotColor} text-white font-bold text-sm flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    {i + 1}
                  </div>
                  {!isLast && <div className="mt-2 min-h-[44px] w-px flex-1 bg-[#E6EAF0]" />}
                </div>
                <div className={`flex-1 rounded-[20px] border border-[#E6EAF0] bg-white p-6 shadow-sm ${isLast ? "" : "mb-2"}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xl">{s.emoji}</span>
                    <h3 className="text-[#16263F] font-semibold text-lg">{s.title}</h3>
                  </div>
                  <p className="text-[#5B6B80] text-sm" style={{ lineHeight: 1.7 }}>{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default HowItWorksSection;
