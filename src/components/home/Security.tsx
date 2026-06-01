import { ShieldCheck, FileLock2, Eye, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

const COPY = {
  pt: {
    label: "Segurança",
    headline: "Construído para proteger cargas de alto valor",
    desc: "Aço é alvo de roubo. Trabalhamos para que isso nunca aconteça na sua operação.",
    items: [
      { icon: ShieldCheck, title: "KYC obrigatório", desc: "Toda transportadora passa por verificação de documentos, ANTT e antecedentes." },
      { icon: Eye, title: "Rastreamento ao vivo", desc: "Telemetria do veículo + checkpoints fotográficos em cada parada." },
      { icon: AlertTriangle, title: "Alertas de desvio", desc: "Notificação automática se a rota sair do plano ou parar em zona de risco." },
      { icon: FileLock2, title: "Contrato + conta protegida", desc: "Pagamento guardado com segurança até entrega confirmada — protege ambos os lados." },
    ],
  },
  en: {
    label: "Security",
    headline: "Built to protect high-value cargo",
    desc: "Steel is a theft target. We work so it never happens on your operation.",
    items: [
      { icon: ShieldCheck, title: "Mandatory KYC", desc: "Every carrier goes through document, ANTT and background verification." },
      { icon: Eye, title: "Live tracking", desc: "Vehicle telemetry + photo checkpoints at every stop." },
      { icon: AlertTriangle, title: "Deviation alerts", desc: "Automatic notification if the route deviates or stops in a risk zone." },
      { icon: FileLock2, title: "Contract + escrow", desc: "Payment held until confirmed delivery — protects both sides." },
    ],
  },
};

export function Security() {
  const { language } = useLanguage();
  const c = COPY[language];
  return (
    <section id="security" className="border-b border-graphite-800 py-20">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-graphite-700 bg-bg-surface px-3 py-1 text-xs font-medium text-amber-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            {c.label}
          </div>
          <h2 className="mt-4 text-3xl font-bold text-graphite-50 md:text-4xl">{c.headline}</h2>
          <p className="mt-3 text-base text-graphite-300">{c.desc}</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {c.items.map((it) => (
            <div key={it.title} className="rounded-lg border border-graphite-800 bg-bg-surface p-6">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-400">
                <it.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-graphite-50">{it.title}</h3>
              <p className="mt-2 text-sm text-graphite-400">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
