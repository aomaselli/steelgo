import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/steel";

interface Props {
  contractId: string;
  freightId?: string | null;
  party: "shipper" | "carrier";
  onSigned: () => void;
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function SignaturePad({ contractId, freightId, party, onSigned }: Props) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = () => {
    sigRef.current?.clear();
    setError(null);
  };

  const submit = async () => {
    if (!user) return;
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) {
      setError("Por favor, assine antes de continuar");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const canvas = pad.getCanvas();
      const base64 = canvas.toDataURL("image/png");
      const blob = await (await fetch(base64)).blob();
      const filePath = `${contractId}/sig_${party}.png`;

      const { error: upErr } = await supabase.storage
        .from("contract-pdfs")
        .upload(filePath, blob, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;

      const hashHex = await sha256Hex(`${base64}|${contractId}|${Date.now()}|${user.id}`);

      const { data: signed } = await supabase.storage
        .from("contract-pdfs")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);
      const sigUrl = signed?.signedUrl ?? null;

      const ts = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = party === "shipper"
        ? {
            shipper_signed_at: ts,
            shipper_signature_hash: hashHex,
            shipper_signature_url: sigUrl,
            status: "awaiting_carrier_signature",
          }
        : {
            carrier_signed_at: ts,
            carrier_signature_hash: hashHex,
            carrier_signature_url: sigUrl,
            status: "active",
            activated_at: ts,
          };

      const { error: updErr } = await supabase.from("contracts").update(patch).eq("id", contractId);
      if (updErr) throw updErr;

      if (party === "carrier" && freightId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from("freights").update({ status: "contracted" } as any).eq("id", freightId);
      }

      toast.success("✅ Assinatura registrada");
      onSigned();
    } catch (e) {
      console.error(e);
      setError("Erro ao salvar assinatura. Tente novamente.");
      toast.error("Erro ao salvar assinatura");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-graphite-200">Assine abaixo:</span>
        <button onClick={clear} className="text-xs text-graphite-400 hover:text-graphite-100">Limpar</button>
      </div>
      <div className={`rounded-[10px] bg-bg-input ${error ? "ring-2 ring-red-500" : ""}`}>
        <SignatureCanvas
          ref={(r) => { sigRef.current = r; }}
          canvasProps={{
            className: "w-full h-32 rounded-[10px] cursor-crosshair touch-none",
            style: { border: "1.5px solid var(--graphite-700)" },
          }}
          penColor="#E6EDF3"
          minWidth={1.5}
          maxWidth={3}
          velocityFilterWeight={0.7}
        />
      </div>
      <p className="text-xs text-graphite-400">Use o mouse ou toque na tela para assinar</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <Button onClick={submit} disabled={saving} className="w-full mt-2">
        {saving ? "Salvando..." : "Confirmar assinatura →"}
      </Button>
    </div>
  );
}
