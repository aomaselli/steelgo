import { useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Modal } from "@/components/steel";
import { formatBRL } from "@/lib/steel";

interface Props {
  open: boolean;
  onClose: () => void;
  contractId: string;
  amount: number;
  lastCheckpoint?: { recorded_at?: string | null; photo_url?: string | null } | null;
  driverName?: string | null;
  onReleased: () => void;
}

export function ReleasePaymentModal({
  open,
  onClose,
  contractId,
  amount,
  lastCheckpoint,
  driverName,
  onReleased,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Mesmo request_id em toda retentativa desta solicitação: a repetição devolve
  // replay em vez de virar uma segunda solicitação.
  const requestIdRef = useRef<string | null>(null);
  if (requestIdRef.current === null) requestIdRef.current = crypto.randomUUID();

  const submit = async () => {
    if (loading) return; // bloqueia clique duplo
    setLoading(true);
    setError(null);

    // L2a revisão 8: esta tela SOLICITA a liberação. Não a confirma.
    // A confirmação vem do provedor de pagamento — ou, enquanto não há provedor
    // integrado, de uma atestação de administrador SteelGo com comprovante.
    // O UPDATE direto em public.contracts foi revogado em 20260903100600.
    const { data, error: rpcErr } = await supabase.rpc("request_escrow_release", {
      p_contract_id: contractId,
      p_request_id: requestIdRef.current!,
    });
    setLoading(false);

    if (rpcErr) {
      setError(`A liberação NÃO foi solicitada. ${rpcErr.message}`);
      toast.error("A liberação não foi solicitada");
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    toast.success(
      row?.was_replayed
        ? "Solicitação já registrada."
        : "Liberação solicitada. Aguardando confirmação.",
    );
    onReleased();
    onClose();
    navigate({ to: "/shipper/review/$contractId", params: { contractId } });
  };

  return (
    <Modal open={open} onClose={onClose} title="">
      <div className="space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 className="w-16 h-16 text-esg-green-400" />
        </div>
        <h3 className="text-xl font-bold text-graphite-50 text-center">Confirmar entrega?</h3>
        <p className="text-sm text-graphite-200 text-center">
          Ao confirmar, você declara que a carga chegou em boas condições e{" "}
          <span className="font-bold text-graphite-50">solicita</span> a liberação de{" "}
          <span className="font-bold text-graphite-50">{formatBRL(amount)}</span> para a
          transportadora.
        </p>

        <div className="rounded-[12px] bg-amber-500/10 border border-amber-500/30 px-3 py-2 flex gap-2">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200">
            A solicitação fica registrada agora. O repasse só é dado como concluído depois que a
            SteelGo confirma a transferência, com comprovante.
          </p>
        </div>

        {lastCheckpoint && (
          <div className="rounded-[12px] bg-bg-elevated p-3 space-y-1 text-xs">
            {lastCheckpoint.photo_url && (
              <img
                src={lastCheckpoint.photo_url}
                alt="prova"
                className="w-20 h-20 rounded object-cover"
              />
            )}
            {lastCheckpoint.recorded_at && (
              <div className="text-graphite-200">
                Entrega registrada em {new Date(lastCheckpoint.recorded_at).toLocaleString("pt-BR")}
              </div>
            )}
            {driverName && <div className="text-graphite-200">Motorista: {driverName}</div>}
          </div>
        )}

        <label className="flex items-start gap-2 text-sm text-graphite-100 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Confirmo que recebi a carga em boas condições e autorizo a liberação do pagamento.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="green" onClick={submit} disabled={!confirmed || loading}>
            {loading ? "Enviando..." : `Solicitar liberação de ${formatBRL(amount)} →`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
