import { useState } from "react";
import { useLanguage } from "@/lib/i18n";

type TabKey = "shipper" | "carrier";

const COPY = {
  pt: {
    eyebrow: "COMO FUNCIONA",
    h2a: "Do planejamento à entrega, em ",
    h2b: "um único fluxo digital",
    sub: "Menos burocracia e mais controle em cada etapa da operação logística.",
    tabShipper: "Para embarcadores",
    tabCarrier: "Para transportadoras",
    shipperSteps: [
      { emoji: "📦", title: "Publique sua operação", body: "Informe o perfil da carga, peso, rota, janela de coleta e requisitos da operação." },
      { emoji: "⚡", title: "Compare condições", body: "Avalie propostas, histórico operacional, indicadores de segurança e critérios ESG em um único ambiente." },
      { emoji: "✍️", title: "Formalize digitalmente", body: "Centralize contratos, documentos e evidências digitais com rastreabilidade e validade jurídica." },
      { emoji: "🔒", title: "Gerencie o pagamento", body: "Acompanhe as condições de pagamento e a liberação vinculada às evidências da entrega." },
      { emoji: "📊", title: "Acompanhe cada etapa", body: "Visualize a jornada do frete, checkpoints e alertas operacionais em tempo real." },
    ],
    carrierSteps: [
      { emoji: "🔍", title: "Encontre oportunidades", body: "Consulte operações compatíveis com suas rotas, veículos e capacidade disponível." },
      { emoji: "💰", title: "Envie sua proposta", body: "Defina condições, motorista e veículo, incluindo alternativas de menor emissão quando disponíveis." },
      { emoji: "✍️", title: "Formalize a operação", body: "Assine contratos e mantenha documentos e responsabilidades organizados em um único fluxo." },
      { emoji: "🗺️", title: "Conecte o motorista", body: "Use o app SteelGo para rota, checkpoints, fotos, QR de lacre e recursos de emergência." },
      { emoji: "💳", title: "Acompanhe o recebimento", body: "Consulte a confirmação de entrega, as evidências e o andamento do pagamento pela plataforma." },
    ],
  },
  en: {
    eyebrow: "HOW IT WORKS",
    h2a: "From planning to delivery in ",
    h2b: "one digital workflow",
    sub: "Less paperwork and more control at every stage of the logistics operation.",
    tabShipper: "For shippers",
    tabCarrier: "For carriers",
    shipperSteps: [
      { emoji: "📦", title: "Post your operation", body: "Enter cargo profile, weight, route, pickup window and operation requirements." },
      { emoji: "⚡", title: "Compare conditions", body: "Review bids, operating history, safety indicators and ESG criteria in one place." },
      { emoji: "✍️", title: "Formalize digitally", body: "Centralize contracts, documents and digital evidence with traceability and legal validity." },
      { emoji: "🔒", title: "Manage payment", body: "Track payment conditions and release linked to delivery evidence." },
      { emoji: "📊", title: "Follow every stage", body: "View the freight journey, checkpoints and operational alerts in real time." },
    ],
    carrierSteps: [
      { emoji: "🔍", title: "Find opportunities", body: "Browse operations that match your routes, vehicles and available capacity." },
      { emoji: "💰", title: "Send your bid", body: "Set conditions, driver and vehicle, including lower-emission alternatives when available." },
      { emoji: "✍️", title: "Formalize the operation", body: "Sign contracts and keep documents and responsibilities organized in one workflow." },
      { emoji: "🗺️", title: "Connect the driver", body: "Use the SteelGo app for route, checkpoints, photos, seal QR and emergency resources." },
      { emoji: "💳", title: "Track receivables", body: "Check delivery confirmation, evidence and payment progress through the platform." },
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
    <section id="como-funciona" className="bg-[#0B1628]" style={{ padding: "100px 0" }}>
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="text-center mb-16">
          <div className="mb-3">
            <span className="text-[#9FB4D4] text-xs uppercase tracking-widest font-semibold">{c.eyebrow}</span>
          </div>
          <h2 className="text-white font-bold text-4xl mb-4">
            {c.h2a}<span className="text-[#9FB4D4]">{c.h2b}</span>
          </h2>
          <p className="text-[#B8C6D9] text-lg max-w-xl mx-auto">{c.sub}</p>
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
                  : "border border-[#29405F] bg-[#111E33] text-[#B8C6D9] rounded-full px-5 py-2 text-sm hover:text-white hover:border-[#9FB4D4]/50 transition-colors"}
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
                  {!isLast && <div className="mt-2 min-h-[44px] w-px flex-1 bg-[#29405F]" />}
                </div>
                <div className={`flex-1 rounded-[20px] border border-[#29405F] bg-[#111E33] p-6 shadow-sm ${isLast ? "" : "mb-2"}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xl">{s.emoji}</span>
                    <h3 className="text-white font-semibold text-lg">{s.title}</h3>
                  </div>
                  <p className="text-[#B8C6D9] text-sm" style={{ lineHeight: 1.7 }}>{s.body}</p>
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
