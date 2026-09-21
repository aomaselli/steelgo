// Cartao de privacidade e notificacoes do motorista: versao do aviso
// reconhecido, exportacao dos proprios dados (LGPD art. 18), estado do push
// (registro + homologacao ponta a ponta) e provedor de rastreamento.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Download, ShieldCheck } from "lucide-react";
import { PrivacyNoticeModal } from "./PrivacyNoticeModal";
import { isNativePlatform, platformName } from "@/lib/device";
import { selectLocationProvider } from "@/lib/geoTracker";
import {
  enablePush,
  getPushStatus,
  requestHomologation,
  subscribePush,
  type PushStatus,
} from "@/lib/pushClient";
import { PermissionExplainerModal } from "./PermissionExplainerModal";
import { exportMyTripData, fetchCurrentPrivacyNotice } from "@/lib/trips";
import { fmtDateTime } from "@/lib/tripStatus";

export function DriverPrivacyCard() {
  const [open, setOpen] = useState(false);
  const [push, setPush] = useState<PushStatus>(getPushStatus());
  const [pushExplain, setPushExplain] = useState(false); // explicacao ANTES de pedir POST_NOTIFICATIONS
  const [busy, setBusy] = useState(false);
  const { data: notice, refetch } = useQuery({
    queryKey: ["privacy-notice", "current"],
    queryFn: fetchCurrentPrivacyNotice,
  });
  const sel = selectLocationProvider();
  useEffect(() => subscribePush(setPush), []);

  async function exportData() {
    setBusy(true);
    try {
      const data = await exportMyTripData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `steelgo-minhas-viagens-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-4 mt-3 rounded-[14px] bg-bg-surface p-4 space-y-3 text-[13px]">
      <PrivacyNoticeModal
        open={open}
        onClose={() => setOpen(false)}
        onAcknowledged={() => void refetch()}
      />
      <div className="flex items-center gap-2 text-graphite-50 font-medium">
        <ShieldCheck size={18} className="text-esg-green-400" /> Privacidade e rastreamento
      </div>
      <div className="text-graphite-200">
        {notice?.published
          ? notice.acknowledged
            ? `Aviso v${notice.version} reconhecido em ${fmtDateTime(notice.acknowledged_at)}.`
            : `Aviso v${notice.version} vigente — ainda não reconhecido (necessário para aceitar viagens).`
          : "Nenhum aviso de privacidade publicado; o aceite de viagens rastreadas está bloqueado."}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-[10px] px-3 py-2"
          style={{ border: "1px solid #30363D", color: "#E6EDF3" }}
        >
          Ler aviso
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void exportData()}
          className="rounded-[10px] px-3 py-2 flex items-center gap-1 disabled:opacity-50"
          style={{ border: "1px solid #30363D", color: "#E6EDF3" }}
        >
          <Download size={14} /> Exportar meus dados
        </button>
      </div>
      <div className="text-graphite-400 text-[12px]">
        Provedor de localização: {sel.provider?.label ?? "nenhum"} · {sel.reason}
      </div>
      <div className="pt-2 border-t border-graphite-700 space-y-2">
        <div className="flex items-center gap-2 text-graphite-50 font-medium">
          <BellRing size={18} className="text-steel-blue-400" /> Notificações push ({platformName()}
          )
        </div>
        {!isNativePlatform() ? (
          <div className="text-graphite-400 text-[12px]">
            Indisponível no navegador. O push nativo é registrado no aplicativo Android (iOS não
            homologado).
          </div>
        ) : (
          <>
            <div className="text-graphite-200 text-[12px]">
              {push.registered
                ? "Aparelho registrado."
                : push.attempt === "not_granted" || push.permission === "denied"
                  ? "Permissão de notificações não concedida (pode tentar de novo)."
                  : push.supported
                    ? "Notificações ainda não ativadas."
                    : "Plugin de push indisponível nesta build."}
              {push.lastAck
                ? ` Homologação confirmada por este aparelho em ${fmtDateTime(push.lastAck)}.`
                : ""}
              {push.error ? ` Erro: ${push.error}` : ""}
            </div>
            <div className="flex gap-2 flex-wrap">
              <PermissionExplainerModal
                kind={pushExplain ? "push" : null}
                busy={push.busy}
                onCancel={() => setPushExplain(false)}
                onConfirm={() => {
                  setPushExplain(false);
                  void enablePush().then((s) => {
                    if (s.registered) toast.success("Aparelho registrado para push.");
                    else if (s.attempt === "not_granted")
                      toast("Permissão de notificações não concedida.");
                    else if (s.error) toast.error(s.error);
                  });
                }}
              />
              <button
                type="button"
                disabled={push.busy}
                onClick={() => setPushExplain(true)}
                className="rounded-[10px] px-3 py-2 disabled:opacity-50"
                style={{ border: "1px solid #30363D", color: "#E6EDF3" }}
              >
                {push.busy ? "Ativando..." : "Ativar notificações"}
              </button>
              <button
                type="button"
                disabled={!push.registered}
                onClick={async () => {
                  try {
                    const r = await requestHomologation();
                    toast.success(
                      `Notificação de homologação solicitada (expira ${fmtDateTime(r?.expires_at)}). Ao recebê-la, o aparelho confirma automaticamente.`,
                    );
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
                className="rounded-[10px] px-3 py-2 disabled:opacity-50"
                style={{ border: "1px solid #1B6CB8", color: "#E6EDF3" }}
              >
                Testar homologação
              </button>
            </div>
            <div className="text-graphite-400 text-[11px]">
              A homologação só conta quando ESTE aparelho recebe a notificação e responde ao
              servidor (ACK com nonce). "Enviado ao FCM" não é recebimento.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
