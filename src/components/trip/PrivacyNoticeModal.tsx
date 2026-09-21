// Aviso de privacidade do motorista (LGPD): exibido ANTES do primeiro aceite
// de viagem rastreada e sempre que uma versao nova for publicada. O
// reconhecimento grava versao + SHA-256 no cadastro do motorista; sem aviso
// publicado nao ha reconhecimento nem rastreamento (o servidor recusa).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { acknowledgePrivacyNotice, fetchCurrentPrivacyNotice } from "@/lib/trips";

export function PrivacyNoticeModal({
  open,
  onClose,
  onAcknowledged,
}: {
  open: boolean;
  onClose: () => void;
  onAcknowledged: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["privacy-notice", "current"],
    enabled: open,
    queryFn: fetchCurrentPrivacyNotice,
  });

  if (!open) return null;
  const notice = data && data.published ? data : null;

  async function acknowledge() {
    if (!notice) return;
    setBusy(true);
    try {
      await acknowledgePrivacyNotice(notice.version, notice.sha256);
      toast.success(`Aviso v${notice.version} reconhecido`);
      onAcknowledged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar o reconhecimento");
    } finally {
      setBusy(false);
    }
  }

  return (
    // z-[60]: acima da barra inferior do motorista (DriverBottomNav, z-50), que cobria os
    // botoes "Agora nao"/"Reconhecer" no aparelho (achado da homologacao no APK).
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full max-w-[520px] max-h-[92dvh] flex flex-col rounded-t-[18px] sm:rounded-[18px] bg-bg-surface border border-graphite-700">
        <div className="px-5 pt-5 pb-3 flex items-center gap-2 border-b border-graphite-700">
          <ShieldCheck className="text-esg-green-400" size={22} />
          <div>
            <div className="text-[16px] font-medium text-graphite-50">
              Aviso de privacidade — rastreamento de viagem
            </div>
            {notice && (
              <div className="text-[11px] text-graphite-400">
                Versão {notice.version} · vigente desde{" "}
                {new Date(notice.effective_from).toLocaleDateString("pt-BR")} · SHA-256{" "}
                {notice.sha256.slice(0, 12)}…
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-[14px] leading-relaxed text-graphite-100 whitespace-pre-wrap">
          {isLoading ? (
            "Carregando…"
          ) : notice ? (
            notice.body_md
          ) : (
            <div className="text-amber-400">
              Nenhum aviso de privacidade foi publicado ainda. Sem o aviso vigente, o aceite de
              viagens rastreadas fica bloqueado. Fale com a transportadora ou com o suporte SteelGo.
            </div>
          )}
          {notice?.url && (
            <div className="mt-3 text-[12px] text-graphite-400">
              Versão pública:{" "}
              <a href={notice.url} target="_blank" rel="noreferrer" className="underline">
                {notice.url}
              </a>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-graphite-700 space-y-3">
          {notice && (
            <label className="flex items-start gap-2 text-[13px] text-graphite-100">
              <input
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>
                Li e compreendi que minha localização é coletada{" "}
                <b>somente durante viagens ativas</b>, com os prazos e acessos descritos acima. Este
                registro comprova que recebi e li esta versão; não é consentimento e é mantido pelo
                prazo de retenção informado, sem prejuízo dos meus direitos previstos na LGPD.
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-[12px] border border-graphite-600 text-graphite-100"
              style={{ height: 48 }}
            >
              Agora não
            </button>
            <button
              type="button"
              disabled={!notice || !checked || busy}
              onClick={() => void acknowledge()}
              className="flex-1 rounded-[12px] bg-esg-green text-white font-medium disabled:opacity-40"
              style={{ height: 48 }}
            >
              {busy ? "Registrando…" : "Reconhecer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
