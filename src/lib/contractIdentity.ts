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
 * Alcance conferido no banco descartável, ator por ator:
 *   embarcador 1 linha · transportadora 1 linha · motorista 0 · admin 0 ·
 *   sem sessão 42501.
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

/** Mesmo limite da RPC irmã. */
const BATCH = 500;

export async function fetchContractPartyIdentification(
  contractIds: string[],
): Promise<Map<string, ContractPartyIdentification>> {
  const ids = Array.from(new Set(contractIds.filter(Boolean)));
  const out = new Map<string, ContractPartyIdentification>();
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    // Os tipos gerados do Supabase ainda não conhecem esta RPC: a migration
    // 20261005120000 não foi aplicada no ambiente remoto, e `types.ts` é
    // gerado de lá. O molde fica explícito aqui, num lugar só.
    const { data, error } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: ContractPartyIdentification[] | null; error: unknown }>
    )("list_contract_party_identification", { p_contract_ids: chunk });
    if (error) throw error;
    for (const row of data ?? []) out.set(row.contract_id, row);
  }
  return out;
}
