import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";

type SegmentKey = "siderurgica" | "distribuidor" | "industria" | "varejo";

const COPY = {
  pt: {
    eyebrow: "PARA EMPRESAS",
    h2: "A infraestrutura digital logística da América Latina",
    sub: "Conectamos siderúrgicas, distribuidores, indústrias e varejo a transportadoras e motoristas, integrando fretes, documentos, pagamentos e rastreamento em uma única operação.",
    segments: {
      siderurgica: { label: "🏭 Siderúrgicas", title: "Siderúrgicas", body: "Gerencie o escoamento da produção com visibilidade e controle operacional.", bullets: ["Rastreamento de bobinas e chapas", "Contratos e documentos digitais", "Indicadores ESG"] },
      distribuidor: { label: "🏗️ Distribuidores", title: "Distribuidores", body: "Coordene múltiplas entregas, rotas, documentos e transportadoras.", bullets: ["Consolidação de rotas", "Gestão de transportadoras", "Dashboard de custos"] },
      industria: { label: "🔧 Indústrias", title: "Indústrias", body: "Acompanhe insumos, componentes e produtos acabados com rastreabilidade.", bullets: ["GPS e checkpoints", "Alertas operacionais", "Histórico auditável"] },
      varejo: { label: "🛒 Varejo", title: "Varejo", body: "Organize abastecimento, transferências e entregas com visibilidade ponta a ponta.", bullets: ["Abastecimento de lojas", "Transferências entre unidades", "Acompanhamento de entregas"] },
    },
    features: [
      "Publicação e gestão de fretes",
      "Matching com transportadoras",
      "Contratos e evidências digitais",
      "Rastreamento GPS em tempo real",
      "Gestão segura de pagamentos",
      "Indicadores e relatórios ESG",
      "Histórico completo e auditável",
      "Integração ERP — SAP e TOTVS",
    ],
    ctaPrimary: "Solicitar acesso →",
  },
  en: {
    eyebrow: "FOR COMPANIES",
    h2: "Latin America's digital logistics infrastructure",
    sub: "We connect steel mills, distributors, industries and retail to carriers and drivers, integrating freight, documents, payments and tracking in one operation.",
    segments: {
      siderurgica: { label: "🏭 Steel mills", title: "Steel mills", body: "Manage production outflow with visibility and operating control.", bullets: ["Coil and plate tracking", "Digital contracts and documents", "ESG indicators"] },
      distribuidor: { label: "🏗️ Distributors", title: "Distributors", body: "Coordinate multiple deliveries, routes, documents and carriers.", bullets: ["Route consolidation", "Carrier management", "Cost dashboard"] },
      industria: { label: "🔧 Industries", title: "Industries", body: "Track inputs, components and finished products with traceability.", bullets: ["GPS and checkpoints", "Operating alerts", "Auditable history"] },
      varejo: { label: "🛒 Retail", title: "Retail", body: "Organize replenishment, transfers and deliveries with end-to-end visibility.", bullets: ["Store replenishment", "Inter-unit transfers", "Delivery tracking"] },
    },
    features: [
      "Freight posting and management",
      "Carrier matching",
      "Digital contracts and evidence",
      "Real-time GPS tracking",
      "Secure payment management",
      "ESG indicators and reports",
      "Full auditable history",
      "ERP integration — SAP and TOTVS",
    ],
    ctaPrimary: "Request access →",
  },
} as const;

export function CompanySection() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = COPY[language] ?? COPY.en;
  const [active, setActive] = useState<SegmentKey>("siderurgica");
  const segment = c.segments[active];

  return (
    <section id="empresas" className="bg-[#0B1628] py-[100px]">
      <div className="max-w-[1280px] mx-auto px-6">
        <div className="mb-12">
          <div className="text-[#9FB4D4] text-xs uppercase tracking-widest font-semibold mb-3">{c.eyebrow}</div>
          <h2 className="text-white font-bold text-4xl mb-4">{c.h2}</h2>
          <p className="text-[#B8C6D9] text-lg">{c.sub}</p>
        </div>

        <div className="mb-10 flex flex-wrap gap-2">
          {(Object.keys(c.segments) as SegmentKey[]).map((key) => {
            const isActive = key === active;
            return (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-[#16263F] text-white shadow-sm" : "border border-[#29405F] bg-[#111E33] text-[#B8C6D9] hover:text-white"
                }`}
              >
                {c.segments[key].label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-16 rounded-[24px] border border-[#29405F] bg-[#111E33] p-8 shadow-sm md:grid-cols-2">
          <div>
            <h3 className="text-white font-bold text-xl mb-3">{segment.title}</h3>
            <p className="mb-4 text-sm text-[#B8C6D9]" style={{ lineHeight: 1.7 }}>{segment.body}</p>
            <div className="flex flex-col gap-2">
              {segment.bullets.map((b) => (
                <div key={b} className="flex items-start gap-2">
                  <Check size={16} className="mt-0.5 flex-shrink-0 text-[#2FA98A]" />
                  <span className="text-sm text-[#E7EDF5]">{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-[#29405F] bg-[#0E1A2D] p-6">
            {c.features.map((f, i) => (
              <div key={f} className={`flex items-center gap-2 py-2.5 ${i === c.features.length - 1 ? "" : "border-b border-[#29405F]"}`}>
                <Check size={16} className="text-[#2FA98A]" />
                <span className="text-sm text-[#E7EDF5]">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <Button size="lg" onClick={() => navigate({ to: "/register", search: { role: "shipper" } as never })} className="h-12 bg-[#16263F] px-8 text-base text-white hover:bg-[#101C30]">
            {c.ctaPrimary}
          </Button>
        </div>
      </div>
    </section>
  );
}
