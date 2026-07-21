import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Coins, Leaf } from "lucide-react";
import { DriverShell } from "@/components/driver/DriverShell";

export const Route = createFileRoute("/driver/delivery-complete")({ component: DeliveryCompletePage });

function DeliveryCompletePage() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [rating, setRating] = useState<"bad" | "ok" | "great">("great");

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <DriverShell activeTab="trip" noNav>
      <div className="px-6 py-10 flex flex-col items-center text-center">
        <div
          className="rounded-full flex items-center justify-center transition-transform duration-300"
          style={{
            width: 88,
            height: 88,
            background: "#0A2118",
            border: "3px solid #1A9B5E",
            transform: mounted ? "scale(1)" : "scale(0.5)",
          }}
        >
          <CheckCircle2 size={44} className="text-esg-green-400" />
        </div>
        <h1 className="mt-5 text-[24px] font-medium text-graphite-50">Entrega feita!</h1>
        <div className="text-[14px] text-graphite-200 mt-1">
          {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </div>

        <div
          className="w-full mt-6 rounded-[16px] p-4 flex items-center gap-3"
          style={{ background: "#0A2118", border: "1px solid #1A9B5E" }}
        >
          <Coins size={28} className="text-esg-green-400" />
          <div className="flex-1 text-left">
            <div className="text-[13px] text-esg-green-400">Pagamento liberado</div>
            <div className="text-[22px] font-medium text-graphite-50 tabular-nums">R$ 4.250,00</div>
            <div className="text-[12px] text-graphite-200">PIX em até 24 horas</div>
          </div>
        </div>

        <div className="w-full mt-2.5 rounded-[16px] bg-bg-surface p-4 flex items-center gap-3">
          <Leaf size={24} className="text-esg-green-400" />
          <div className="flex-1 text-left">
            <div className="text-[12px] text-graphite-200">Você evitou</div>
            <div className="text-[18px] text-esg-green-400 font-medium tabular-nums">87 kg CO₂</div>
            <div className="text-[12px] text-graphite-200">= 4 árvores por 1 ano</div>
          </div>
        </div>

        <div className="w-full mt-6">
          <div className="text-[14px] text-graphite-200 mb-3">Como foi essa entrega?</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: "bad", emoji: "😐", label: "Ruim" },
              { id: "ok", emoji: "🙂", label: "Normal" },
              { id: "great", emoji: "😊", label: "Ótimo" },
            ] as const).map((o) => (
              <button
                key={o.id}
                onClick={() => setRating(o.id)}
                className="flex flex-col items-center justify-center rounded-[14px] transition-colors"
                style={{
                  height: 72,
                  background: rating === o.id ? "#0A2118" : "#21262D",
                  border: `1.5px solid ${rating === o.id ? "#1A9B5E" : "#30363D"}`,
                }}
              >
                <span style={{ fontSize: 28 }}>{o.emoji}</span>
                <span className="text-[11px] mt-1 text-graphite-100">{o.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => navigate({ to: "/driver" })}
          className="mt-6 w-full rounded-[14px] bg-steel-blue text-white font-medium"
          style={{ height: 56, fontSize: 16 }}
        >
          Voltar ao início
        </button>
      </div>
    </DriverShell>
  );
}
