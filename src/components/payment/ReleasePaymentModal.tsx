import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
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

export function ReleasePaymentModal({ open, onClose, contractId, amount, lastCheckpoint, driverName, onReleased }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const release = async () => {
    setLoading(true);
    const ts = new Date().toISOString();
    const { error } = await supabase
      .from("contracts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ escrow_status: "released", escrow_released_at: ts, status: "completed", completed_at: ts } as any)
      .eq("id", contractId);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`✅ Pagamento de ${formatBRL(amount)} liberado!`);
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
          Ao confirmar, você declara que a carga chegou em boas condições. O pagamento de{" "}
          <span className="font-bold text-graphite-50">{formatBRL(amount)}</span> será liberado para a transportadora.
        </p>

        {lastCheckpoint && (
          <div className="rounded-[12px] bg-bg-elevated p-3 space-y-1 text-xs">
            {lastCheckpoint.photo_url && (
              <img src={lastCheckpoint.photo_url} alt="prova" className="w-20 h-20 rounded object-cover" />
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
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          <span>Confirmo que recebi a carga em boas condições e autorizo a liberação do pagamento.</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant="green" onClick={release} disabled={!confirmed || loading}>
            {loading ? "Liberando..." : `Liberar ${formatBRL(amount)} →`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
