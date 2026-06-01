import { useState } from "react";
import { FileEdit, Gavel, FileSignature, Truck, Package, Search, Send, MapPin } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const STEPS = {
  shipper: {
    pt: [
      { icon: FileEdit, title: "Publique seu frete", desc: "Origem, destino, tipo de aço, peso e janela de coleta." },
      { icon: Gavel, title: "Receba propostas", desc: "Transportadoras verificadas enviam ofertas em minutos." },
      { icon: FileSignature, title: "Contrato e conta protegida", desc: "Aceite, assine digitalmente e o pagamento fica protegido." },
      { icon: Truck, title: "Acompanhe e libere", desc: "Rastreamento ponta a ponta. Pagamento liberado na entrega." },
    ],
    en: [
      { icon: FileEdit, title: "Post your freight", desc: "Origin, destination, steel type, weight and pickup window." },
      { icon: Gavel, title: "Receive bids", desc: "Verified carriers submit offers in minutes." },
      { icon: FileSignature, title: "Contract & escrow", desc: "Accept, sign digitally, payment held in escrow." },
      { icon: Truck, title: "Track & release", desc: "End-to-end tracking. Payment released on delivery." },
    ],
  },
  carrier: {
    pt: [
      { icon: Search, title: "Encontre cargas", desc: "Marketplace filtrado por rota, tipo de aço e veículo." },
      { icon: Send, title: "Envie sua proposta", desc: "Defina preço e prazo. Responda rápido para ganhar." },
      { icon: Package, title: "Carregue com confiança", desc: "Contrato e seguro digital antes do carregamento." },
      { icon: MapPin, title: "Entregue e receba", desc: "Checkpoints atualizam o status. Pagamento em D+1." },
    ],
    en: [
      { icon: Search, title: "Find loads", desc: "Marketplace filtered by route, steel type and vehicle." },
      { icon: Send, title: "Submit your bid", desc: "Set price and ETA. Quick answers win." },
      { icon: Package, title: "Load with confidence", desc: "Digital contract and insurance before loading." },
      { icon: MapPin, title: "Deliver & get paid", desc: "Checkpoints update status. Payment in D+1." },
    ],
  },
};

export function HowItWorks() {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState<"shipper" | "carrier">("shipper");
  const steps = STEPS[tab][language];

  return (
    <section id="how" className="border-b border-graphite-800 bg-bg-surface/30 py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-steel-blue-400">
            {t("howItWorks.sectionLabel")}
          </span>
          <h2 className="mt-2 text-3xl font-bold text-graphite-50 md:text-4xl">
            {t("howItWorks.headline")}
          </h2>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-lg border border-graphite-700 bg-bg-elevated p-1">
            {(["shipper", "carrier"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  "rounded-md px-5 py-2 text-sm font-medium transition-colors",
                  tab === k ? "bg-steel-blue-400 text-white" : "text-graphite-200 hover:text-graphite-50",
                )}
              >
                {t(`howItWorks.tab${k === "shipper" ? "Shipper" : "Carrier"}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={i} className="relative rounded-lg border border-graphite-800 bg-bg-surface p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-steel-blue-100 text-steel-blue-400">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="text-xs font-semibold text-graphite-400">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-graphite-50">{s.title}</h3>
              <p className="mt-2 text-sm text-graphite-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
