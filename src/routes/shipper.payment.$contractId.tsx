import { createFileRoute, useParams, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Lock, Truck, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, Card, Spinner } from "@/components/steel";
import { formatBRL } from "@/lib/steel";

export const Route = createFileRoute("/shipper/payment/$contractId")({
  component: PaymentCheckoutPage,
});

function PaymentCheckoutPage() {
  const { contractId } = useParams({ from: "/shipper/payment/$contractId" });
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: contract, isLoading } = useQuery({
    queryKey: ["payment-contract", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, freights(origin_city, dest_city, steel_type, weight_tons)")
        .eq("id", contractId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // L2a revisao 7. Substitui dois UPDATE diretos por UMA RPC.
  //
  //   * o UPDATE em public.contracts foi revogado na migration 20260903100600.
  //     request_escrow_funding autentica, trava o contrato, deriva no servidor
  //     que o chamador e o embarcador, cria a intencao de pagamento e registra
  //     uma SOLICITACAO de aporte - nunca uma confirmacao;
  //   * o UPDATE em public.payments FOI REMOVIDO. Ele nunca funcionou para
  //     embarcador comum: public.payments so tem policy de SELECT para a parte
  //     e uma policy ALL restrita a admin. RLS filtrava a linha em vez de
  //     recusar, entao o erro vinha nulo e o codigo seguia como se tivesse
  //     gravado. Alem disso nenhum ponto do sistema INSERE em public.payments,
  //     de modo que nao havia linha a atualizar;
  //   * status="active" e activated_at NAO sao mais escritos aqui. Quem ativa o
  //     contrato e a segunda assinatura, em public.sign_contract. Escrever isso
  //     aqui era um caminho paralelo para o mesmo estado.
  const requestIdRef = useRef<string | null>(null);
  const simulate = async () => {
    setError(null);
    setProcessing(true);
    if (requestIdRef.current === null) requestIdRef.current = crypto.randomUUID();

    const { data, error: rpcErr } = await supabase.rpc("request_escrow_funding", {
      p_contract_id: contractId,
      p_request_id: requestIdRef.current,
    });

    setProcessing(false);

    if (rpcErr) {
      setError(`O aporte NÃO foi solicitado. ${rpcErr.message}`);
      return;
    }

    // HONESTIDADE DE ESTADO. Isto registra uma SOLICITAÇÃO. Nada foi retido:
    // a confirmação depende do provedor ou de atestação de um administrador
    // SteelGo, e só então o estado vira funding_confirmed.
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(
      row?.was_replayed
        ? "Solicitação já registrada."
        : "Aporte solicitado. Aguardando confirmação.",
    );
    navigate({ to: "/shipper/contracts/$id", params: { id: contractId } });
  };

  if (isLoading)
    return (
      <div className="p-12 flex justify-center">
        <Spinner />
      </div>
    );
  if (!contract)
    return <div className="p-12 text-center text-graphite-200">Contrato não encontrado.</div>;

  const f = contract.freights;
  const freightVal = (contract.total_amount_brl ?? 0) - (contract.platform_fee_brl ?? 0);

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* DEMO BANNER */}
      <div className="mb-6 rounded-[12px] bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-center gap-2">
        <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <p className="text-sm text-amber-200">
          Sem provedor de pagamento integrado. A solicitação fica registrada e a confirmação é feita
          pela SteelGo, com comprovante.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — summary */}
        <Card className="p-6 h-fit">
          <h2 className="text-lg font-semibold text-graphite-50">Resumo do pagamento</h2>

          <div className="mt-4 flex items-start gap-2 text-sm">
            <Truck className="w-4 h-4 mt-0.5 text-graphite-400" />
            <div>
              <div className="text-graphite-100">
                Frete {contract.contract_number ?? String(contract.id).slice(0, 8)}
              </div>
              <div className="text-xs text-graphite-400">
                {f?.origin_city} → {f?.dest_city}
              </div>
              <div className="text-xs text-graphite-400">
                {f?.steel_type ? `${f.steel_type} · ` : ""}
                {f?.weight_tons ?? "—"} t
              </div>
            </div>
          </div>

          <div className="border-t border-graphite-700/40 mt-4 pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-graphite-200">Valor do frete</span>
              <span className="tabular-nums">{formatBRL(freightVal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-graphite-400">Taxa plataforma (3,5%)</span>
              <span className="text-graphite-400 tabular-nums">
                {formatBRL(contract.platform_fee_brl)}
              </span>
            </div>
            <div className="flex justify-between border-t border-graphite-700/40 pt-2 mt-2">
              <span className="text-graphite-100 font-medium">Total a pagar</span>
              <span className="text-xl font-bold text-graphite-50 tabular-nums">
                {formatBRL(contract.total_amount_brl)}
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-[12px] bg-esg-green-400/10 border border-esg-green-400/30 p-4 flex gap-2">
            <Lock className="w-4 h-4 text-esg-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-esg-green-400">Pagamento garantido</div>
              <p className="text-xs text-graphite-200 mt-1">
                Seu pagamento fica retido com segurança. A transportadora só recebe após você
                confirmar a entrega da carga.
              </p>
            </div>
          </div>
        </Card>

        {/* RIGHT — simulated action */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-graphite-50 mb-2">Confirmar pagamento</h2>
          <p className="text-sm text-graphite-300 mb-6">
            Ao confirmar, o pagamento é <strong className="text-graphite-100">solicitado</strong> —
            e fica assim até que a SteelGo confirme o recebimento. Nada é retido neste momento. O
            contrato já está ativo desde a assinatura das duas partes.
          </p>

          <div className="rounded-[10px] bg-bg-elevated p-4 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-graphite-300">Valor a solicitar</span>
              <span className="text-graphite-50 font-semibold tabular-nums">
                {formatBRL(contract.total_amount_brl)}
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

          <Button onClick={simulate} disabled={processing} className="w-full h-12">
            {processing ? "Enviando..." : "Solicitar pagamento protegido →"}
          </Button>

          <Link
            to="/shipper/contracts/$id"
            params={{ id: contractId }}
            className="block text-center text-xs text-graphite-400 mt-3 hover:text-graphite-100"
          >
            ← Voltar ao contrato
          </Link>
        </Card>
      </div>
    </div>
  );
}
