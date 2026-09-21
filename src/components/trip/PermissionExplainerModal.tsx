// Explicacao contextual ANTES de qualquer pedido de permissao do sistema
// (localizacao ou notificacoes). Aparece somente depois de uma acao explicita do
// motorista ("Iniciar deslocamento", "Estou disponivel", "Ativar notificacoes da
// viagem"); "Cancelar" encerra sem tocar em navigator.geolocation nem em
// PushNotifications.requestPermissions. So apos "Continuar" a autoridade unica
// (lib/geoTracker ou lib/pushClient) faz o pedido - e e nesse momento, e nao
// antes, que o Android pode mostrar o dialogo.
import { BellRing, MapPin } from "lucide-react";

export type PermissionExplainerKind = "trip_start" | "capacity_availability" | "push";

const COPY: Record<PermissionExplainerKind, { title: string; lines: string[]; confirm: string }> = {
  trip_start: {
    title: "Localização durante a viagem",
    lines: [
      "Ao continuar, o SteelGo vai pedir acesso à sua localização e registrar sua posição durante esta viagem.",
      "Nesta versão a localização é usada somente com o app aberto (primeiro plano). Nada é coletado com o app fechado ou em segundo plano.",
      "A viagem só passa para “A caminho da coleta” depois de uma primeira posição válida. Se você recusar, nada muda e você pode tentar de novo.",
    ],
    confirm: "Continuar e iniciar",
  },
  capacity_availability: {
    title: "Localização para a disponibilidade",
    lines: [
      "Para ficar disponível, o SteelGo precisa de UMA leitura da sua posição atual, usada para encontrar cargas perto de você.",
      "É uma leitura única, agora: não inicia rastreamento nem sessão de viagem.",
      "Se você recusar, a disponibilidade não é ativada e nada é registrado.",
    ],
    confirm: "Continuar",
  },
  push: {
    title: "Notificações da viagem",
    lines: [
      "Ao continuar, o SteelGo vai pedir permissão para mostrar notificações neste aparelho.",
      "Elas avisam sobre designações, alterações da viagem e mensagens da torre de controle. Nenhuma localização é enviada por esse canal.",
      "Se você recusar, o app continua funcionando normalmente e você pode ativar depois.",
    ],
    confirm: "Continuar",
  },
};

export function PermissionExplainerModal({
  kind,
  onCancel,
  onConfirm,
  busy = false,
}: {
  kind: PermissionExplainerKind | null;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  if (!kind) return null;
  const c = COPY[kind];
  const Icon = kind === "push" ? BellRing : MapPin;
  return (
    // z-[60]: acima da barra inferior do motorista (DriverBottomNav, z-50).
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="permission-explainer-title"
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
    >
      <div className="w-full max-w-[520px] rounded-t-[18px] sm:rounded-[18px] bg-bg-surface border border-graphite-700">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2 border-b border-graphite-700">
          <Icon className="text-esg-green-400" size={22} />
          <div id="permission-explainer-title" className="text-[16px] font-medium text-graphite-50">
            {c.title}
          </div>
        </div>
        <div className="px-5 py-4 space-y-2 text-[14px] text-graphite-200">
          {c.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-[12px] border border-graphite-600 py-3 text-[15px] text-graphite-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-[12px] bg-[#1B6CB8] py-3 text-[15px] font-medium text-white disabled:opacity-50"
          >
            {busy ? "Aguarde..." : c.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
