import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { flushOutbox, pendingCommandCount, pendingLocationBatches } from "@/lib/outbox";
import { toast } from "sonner";

// Modulo 3: a fila offline e o outbox (comandos com command_id + lotes de
// posicao). Ao reconectar, envia em ordem; recusas ficam visiveis no painel.
export function OfflineIndicator() {
  const online = useOnlineStatus();
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (online) {
      (async () => {
        const n = (await pendingCommandCount()) + (await pendingLocationBatches());
        if (n > 0) {
          setJustReconnected(true);
          const rep = await flushOutbox();
          const sent = rep.sent + rep.locations;
          if (sent > 0)
            toast.success(`${sent} registro${sent > 1 ? "s" : ""} enviado${sent > 1 ? "s" : ""}`);
          if (rep.rejected > 0)
            toast.error(
              `${rep.rejected} comando(s) recusado(s) pelo servidor — veja o painel da viagem`,
            );
          setTimeout(() => setJustReconnected(false), 3000);
        }
      })();
    }
  }, [online]);

  if (!online) {
    return (
      <div
        className="w-full flex items-center justify-center gap-2 text-amber-400"
        style={{
          height: 36,
          background: "#1F1500",
          borderBottom: "1px solid #CC8800",
          fontSize: 12,
        }}
      >
        <WifiOff size={14} />
        <span>Sem internet — modo offline ativo</span>
      </div>
    );
  }
  if (justReconnected) {
    return (
      <div
        className="w-full flex items-center justify-center gap-2 text-esg-green-400"
        style={{
          height: 36,
          background: "#0A2118",
          borderBottom: "1px solid #1A9B5E",
          fontSize: 12,
        }}
      >
        <Wifi size={14} />
        <span>Conectado — sincronizando...</span>
      </div>
    );
  }
  return null;
}
