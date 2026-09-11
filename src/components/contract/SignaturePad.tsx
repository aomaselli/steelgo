import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/steel";

interface Props {
  contractId: string;
  /**
   * L2a revisao 6: mantida APENAS para nomear o arquivo enviado ao Storage e
   * para o rotulo da tela. NAO e mais autoridade: quem decide qual parte
   * assinou e a RPC public.sign_contract, que deriva isso de auth.uid() contra
   * contracts.shipper_company_id e contracts.carrier_company_id. Este valor nao
   * e enviado na chamada.
   */
  party: "shipper" | "carrier";
  onSigned: () => void;
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function SignaturePad({ contractId, party, onSigned }: Props) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Idempotencia (L2a revisao 7).
  //
  // A impressao digital que a RPC calcula inclui o hash da assinatura. Logo o
  // request_id so pode ser reaproveitado enquanto o DESENHO for o mesmo:
  //   - mesma tentativa, mesmo desenho  -> mesmo request_id  -> replay legitimo
  //   - o usuario redesenha e tenta de novo -> hash diferente -> reapresentar o
  //     mesmo request_id daria 42501 ("parametros diferentes"), que a pessoa
  //     leria como falha do sistema. Por isso um request_id NOVO e cunhado
  //     sempre que o hash muda.
  const requestIdRef = useRef<string | null>(null);
  const requestHashRef = useRef<string | null>(null);

  const requestIdFor = (hash: string) => {
    if (requestIdRef.current === null || requestHashRef.current !== hash) {
      requestIdRef.current = crypto.randomUUID();
      requestHashRef.current = hash;
    }
    return requestIdRef.current;
  };

  const clear = () => {
    sigRef.current?.clear();
    requestIdRef.current = null;
    requestHashRef.current = null;
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

      // O hash e REFERENCIA DE ARTEFATO, nunca autoridade. Deriva apenas do
      // desenho e do contrato: nada de Date.now() nem de user.id, que fariam a
      // retentativa produzir um hash diferente e quebrar a idempotencia.
      const hashHex = await sha256Hex(`${base64}|${contractId}`);

      // FAIL-CLOSED (auditoria pos-tipos oficiais). A RPC so e chamada depois
      // que existe URL assinada de verdade. Antes, uma falha silenciosa do
      // Storage produzia sigUrl = null e a assinatura era registrada SEM
      // referencia ao desenho: um contrato assinado apontando para nada.
      // Sem `as string`, sem `as any`, sem `!` - o guard abaixo estreita o tipo
      // de `string | undefined` para `string`, e e isso que a RPC recebe.
      const { data: signed, error: urlErr } = await supabase.storage
        .from("contract-pdfs")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);
      if (urlErr) throw urlErr;
      const sigUrl = signed?.signedUrl;
      if (!sigUrl) {
        throw new Error(
          "O Storage nao devolveu a URL assinada do desenho. A assinatura NAO foi registrada.",
        );
      }

      // UMA chamada. Nao ha UPDATE direto em public.contracts - o privilegio foi
      // revogado na migration 20260903100600 - e nao ha chamada separada a
      // mark_freight_contracted, que foi removida. A segunda assinatura valida
      // ativa o contrato e move o frete para contracted na mesma transacao.
      const { data, error: rpcErr } = await supabase.rpc("sign_contract", {
        p_contract_id: contractId,
        p_signature_hash: hashHex,
        p_signature_url: sigUrl,
        p_request_id: requestIdFor(hashHex),
      });
      if (rpcErr) throw rpcErr;

      const row = Array.isArray(data) ? data[0] : data;
      toast.success(
        row?.new_contract_status === "active"
          ? "✅ Contrato ativado. Frete contratado."
          : "✅ Assinatura registrada. Aguardando a outra parte.",
      );
      onSigned();
    } catch (e) {
      // O UPLOAD do desenho pode ter dado certo e a RPC ter falhado logo em
      // seguida. Nesse caso NADA foi assinado: a transacao do banco abortou por
      // inteiro e o arquivo no Storage e apenas um rascunho orfao. A mensagem
      // precisa dizer isso sem ambiguidade - o usuario nao pode sair daqui
      // achando que assinou.
      //
      // O erro do servidor E exibido, em vez de trocado por uma mensagem
      // generica: 22023 de sequencia, 23505 de assinatura repetida e 42501 de
      // parte nao autorizada dizem coisas diferentes.
      const detail = (e as { message?: string })?.message ?? "erro desconhecido";
      console.error(e);
      setError(`A assinatura NÃO foi registrada. ${detail}`);
      toast.error("A assinatura não foi registrada");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-graphite-200">Assine abaixo:</span>
        <button onClick={clear} className="text-xs text-graphite-400 hover:text-graphite-100">
          Limpar
        </button>
      </div>
      <div className={`rounded-[10px] bg-bg-input ${error ? "ring-2 ring-red-500" : ""}`}>
        <SignatureCanvas
          ref={(r) => {
            sigRef.current = r;
          }}
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
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <Button onClick={submit} disabled={saving} className="w-full mt-2">
        {saving ? "Salvando..." : "Confirmar assinatura →"}
      </Button>
    </div>
  );
}
