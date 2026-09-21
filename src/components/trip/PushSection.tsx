// Secao contextual "Notificacoes da viagem" (painel do motorista, so em build
// nativa). NUNCA pede permissao ao montar: o pedido de POST_NOTIFICATIONS so
// acontece depois do clique em "Ativar notificacoes da viagem" + explicacao
// contextual + "Continuar". Negar e um estado normal; sem FCM configurado
// (homolog) o registro falha de forma controlada e a secao diz "indisponivel".
import { useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { isNativePlatform } from "@/lib/device";
import { enablePush } from "@/lib/pushClient";
import { usePushStatus } from "@/hooks/usePushStatus";
import { PermissionExplainerModal } from "./PermissionExplainerModal";

export function PushSection() {
  const push = usePushStatus();
  const [explain, setExplain] = useState(false);
  if (!isNativePlatform()) return null;

  async function confirm() {
    setExplain(false);
    const s = await enablePush();
    if (s.registered) toast.success("Notificações da viagem ativadas neste aparelho.");
    else if (s.attempt === "not_granted")
      toast("Notificações não ativadas: permissão não concedida. Você pode tentar de novo.");
    else if (s.error) toast.error(s.error);
  }

  // "attempt" distingue "tentou e o sistema nao concedeu" de "ainda nao solicitado"
  const state = push.registered
    ? "Ativas neste aparelho."
    : push.attempt === "not_granted" || push.permission === "denied"
      ? "Permissão não concedida. Você pode tentar de novo ou ativar nas configurações do aparelho."
      : push.error
        ? `Indisponível: ${push.error}`
        : "Ainda não ativadas.";

  return (
    <div
      className="mx-4 mt-2.5 rounded-[16px] p-4"
      style={{ background: "#0F1720", border: "1px solid #30363D" }}
    >
      <PermissionExplainerModal
        kind={explain ? "push" : null}
        busy={push.busy}
        onCancel={() => setExplain(false)}
        onConfirm={() => void confirm()}
      />
      <div className="flex items-center gap-2">
        {push.registered ? (
          <BellRing size={18} className="text-esg-green-400" />
        ) : (
          <BellOff size={18} style={{ color: "#8B949E" }} />
        )}
        <div className="text-[14px] font-medium" style={{ color: "#E6EDF3" }}>
          Notificações da viagem
        </div>
      </div>
      <div className="mt-1 text-[12px]" style={{ color: "#8B949E" }}>
        {state}
      </div>
      {!push.registered && (
        <button
          type="button"
          disabled={push.busy}
          onClick={() => setExplain(true)} // nada e pedido ate "Continuar"
          className="mt-3 rounded-[10px] px-3 py-2 text-[13px] disabled:opacity-50"
          style={{ border: "1px solid #30363D", color: "#E6EDF3" }}
        >
          {push.busy ? "Ativando..." : "Ativar notificações da viagem"}
        </button>
      )}
    </div>
  );
}
