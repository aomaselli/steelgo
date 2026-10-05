/**
 * Identificação empresarial da contraparte — consulta restrita às PARTES.
 *
 * `list_visible_contract_counterparties` devolve só o nome comercial, de
 * propósito. Quem assina via o nome da contraparte e nada mais: CNPJ e
 * RNTRC/ANTT apareciam como indisponíveis.
 *
 * `list_contract_party_identification` (migration 20261005120000) devolve a
 * identificação empresarial e **apenas para quem é parte do contrato** — dono
 * de uma das duas empresas. É deliberadamente mais estreita que
 * `is_contract_visible`: motorista vinculado e administrador **não** recebem.
 * Nenhuma policy de `companies` ou `drivers` foi ampliada.
 *
 * TRÊS DESFECHOS, NUNCA DOIS. Falha de integração não pode se disfarçar de
 * restrição de acesso:
 *
 *   autorizado      a RPC respondeu e este contrato veio: os campos valem,
 *                   inclusive quando vazios — aí é "não informado";
 *   sem_autorizacao a RPC respondeu e este contrato NÃO veio: o chamador não é
 *                   parte. É restrição de acesso, e a tela diz isso;
 *   falha           a chamada não completou: rede, função ausente (migration
 *                   não aplicada), permissão de execução, erro do servidor.
 *                   A tela diz "indisponível", nunca "não visível".
 *
 * A diferença importa na prática: se a migration não estiver aplicada no
 * destino, o desfecho é `falha` — e mostrar "não visível para você" nesse caso
 * esconderia um problema de implantação atrás de uma mensagem de autorização.
 */
import { supabase } from "@/integrations/supabase/client";

export type ContractPartyIdentification = {
  contract_id: string;
  shipper_company_id: string;
  shipper_cnpj: string | null;
  carrier_company_id: string;
  carrier_cnpj: string | null;
  carrier_antt_rntrc: string | null;
};

export type IdentificationOutcome =
  | ({ status: "autorizado" } & ContractPartyIdentification)
  | { status: "sem_autorizacao" }
  | { status: "falha"; detalhe: string };

/** Mesmo limite da RPC irmã. */
const BATCH = 500;

/**
 * Identificação dos contratos informados. O mapa traz uma entrada por contrato
 * pedido — nunca ausências silenciosas: contrato que a RPC não devolveu vira
 * `sem_autorizacao`, e falha da chamada vira `falha` para todos os ids do lote.
 */
export async function fetchContractPartyIdentification(
  contractIds: string[],
): Promise<Map<string, IdentificationOutcome>> {
  const ids = Array.from(new Set(contractIds.filter(Boolean)));
  const out = new Map<string, IdentificationOutcome>();

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const { data, error } = await supabase.rpc("list_contract_party_identification", {
      p_contract_ids: chunk,
    });

    if (error) {
      const detalhe = [error.code, error.message].filter(Boolean).join(" ");
      for (const id of chunk) out.set(id, { status: "falha", detalhe });
      continue;
    }

    const vistos = new Set<string>();
    for (const row of (data ?? []) as ContractPartyIdentification[]) {
      vistos.add(row.contract_id);
      out.set(row.contract_id, { status: "autorizado", ...row });
    }
    // Pedido e não devolvido = o chamador não é parte deste contrato.
    for (const id of chunk) if (!vistos.has(id)) out.set(id, { status: "sem_autorizacao" });
  }

  return out;
}
