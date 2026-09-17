// Tela de conclusao do comprovante (Modulo 3). Sem numeros inventados: o
// pagamento e liberado pela SteelGo apos confirmacao humana (Modulo 1) e os
// fatos ESG saem dos fatos operacionais da viagem, nao de uma estimativa aqui.
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Coins } from "lucide-react";
import { DriverShell } from "@/components/driver/DriverShell";

type Search = { outcome?: "accepted" | "accepted_with_notes" | "partially_refused" | "refused" };

export const Route = createFileRoute("/driver/delivery-complete")({
  component: DeliveryCompletePage,
  validateSearch: (s: Record<string, unknown>): Search => {
    const o = s.outcome;
    return o === "accepted" ||
      o === "accepted_with_notes" ||
      o === "partially_refused" ||
      o === "refused"
      ? { outcome: o }
      : {};
  },
});

function DeliveryCompletePage() {
  const navigate = useNavigate();
  const { outcome = "accepted" } = Route.useSearch();
  const [mounted, setMounted] = useState(false);
  const refusal = outcome === "refused" || outcome === "partially_refused";

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <DriverShell activeTab="home" noNav>
      <div className="px-6 py-10 flex flex-col items-center text-center">
        <div
          className="rounded-full flex items-center justify-center transition-transform duration-300"
          style={{
            width: 88,
            height: 88,
            background: refusal ? "#2A1414" : "#0A2118",
            border: `3px solid ${refusal ? "#C23333" : "#1A9B5E"}`,
            transform: mounted ? "scale(1)" : "scale(0.5)",
          }}
        >
          {refusal ? (
            <AlertTriangle size={44} className="text-red-400" />
          ) : (
            <CheckCircle2 size={44} className="text-esg-green-400" />
          )}
        </div>
        <h1 className="mt-5 text-[24px] font-medium text-graphite-50">
          {refusal ? "Recusa registrada" : "Entrega registrada"}
        </h1>
        <div className="text-[14px] text-graphite-200 mt-1">
          {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </div>

        <div
          className="w-full mt-6 rounded-[16px] p-4 flex items-center gap-3 text-left"
          style={{
            background: refusal ? "#2A1414" : "#0A2118",
            border: `1px solid ${refusal ? "#C23333" : "#1A9B5E"}`,
          }}
        >
          <Coins size={28} className={refusal ? "text-red-400" : "text-esg-green-400"} />
          <div className="flex-1">
            {refusal ? (
              <>
                <div className="text-[13px] text-red-400">Isto NÃO é uma entrega</div>
                <div className="text-[13px] text-graphite-100 mt-1">
                  Uma divergência de entrega foi aberta. A SteelGo decidirá entre nova tentativa,
                  retorno à origem, transbordo ou aceite. Acompanhe no início.
                </div>
              </>
            ) : (
              <>
                <div className="text-[13px] text-esg-green-400">
                  Comprovante enviado{outcome === "accepted_with_notes" ? " com ressalvas" : ""}
                </div>
                <div className="text-[13px] text-graphite-100 mt-1">
                  O pagamento da transportadora é liberado pela SteelGo após a confirmação da
                  entrega e do repasse. Não há liberação automática.
                </div>
              </>
            )}
          </div>
        </div>

        <button
          onClick={() => navigate({ to: "/driver" })}
          className="mt-8 w-full rounded-[14px] bg-steel-blue text-white font-medium"
          style={{ height: 56, fontSize: 16 }}
        >
          Voltar ao início
        </button>
      </div>
    </DriverShell>
  );
}
