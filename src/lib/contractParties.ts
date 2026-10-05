/**
 * Identificação das partes de um contrato, para quem está olhando.
 *
 * O detalhe do contrato lia `companies` e `drivers` direto pelo PostgREST. A
 * policy `companies_select` deixa cada empresa ler apenas a si mesma, e
 * `drivers` só é visível para a transportadora dona do registro — então, para o
 * embarcador, a leitura da contraparte voltava nula e a tela escrevia "—".
 * Resultado: o embarcador assinava um contrato sem ver com quem.
 *
 * "—" é a mesma marca usada para dado inexistente. O defeito não era só de
 * conteúdo: a tela **misturava "não existe" com "você não pode ver"**.
 *
 * A correção não afrouxa RLS. Os nomes vêm de
 * `list_visible_contract_counterparties` (SECURITY DEFINER, já usada em
 * src/lib/paymentLedger.ts) e o motorista vem do rótulo sanitizado da viagem
 * (`list_my_trips`). O que continua invisível é declarado como invisível.
 */

/** O que a tela pode dizer sobre um documento (CNPJ, CPF, ANTT). */
export type DocumentVisibility =
  /** Valor legível pelo espectador. */
  | { known: true; value: string }
  /** O registro existe, mas a autorização do espectador não alcança o dado. */
  | { known: false; reason: "nao_visivel" }
  /** Não há registro a mostrar. */
  | { known: false; reason: "sem_registro" };

export type PartyIdentity = {
  /** Nome comercial; null só quando realmente não há nome em lugar nenhum. */
  name: string | null;
  document: DocumentVisibility;
  /** Verdadeiro quando o nome veio da RPC sanitizada, não da leitura direta. */
  fromCounterpartyRpc: boolean;
};

export type DriverIdentity = {
  name: string | null;
  cpf: DocumentVisibility;
  license: DocumentVisibility;
  /** Verdadeiro quando o nome veio do rótulo sanitizado da viagem. */
  fromTripLabel: boolean;
};

export type ContractPartiesInput = {
  /** Leitura direta das tabelas; nula na parte que a RLS esconde. */
  direct: {
    shipper: { name: string | null; cnpj: string | null } | null;
    carrier: { name: string | null; cnpj: string | null } | null;
    driver: {
      full_name: string | null;
      cpf: string | null;
      license_number: string | null;
      license_category: string | null;
    } | null;
  };
  /** Linha de list_visible_contract_counterparties para este contrato. */
  counterparty: {
    shipper_company_name: string | null;
    carrier_company_name: string | null;
  } | null;
  /** Rótulo sanitizado do motorista, vindo da viagem. */
  tripDriverLabel?: string | null;
  /** ANTT lido de `carriers` — também sujeito a RLS. */
  carrierAntt?: string | null;
  /** O contrato referencia essas partes? Separa "não existe" de "não vejo". */
  refs: { shipperCompany: boolean; carrierCompany: boolean; driver: boolean };
};

export type ContractParties = {
  shipper: PartyIdentity;
  carrier: PartyIdentity & { antt: DocumentVisibility };
  driver: DriverIdentity;
};

function visibility(value: string | null | undefined, referenced: boolean): DocumentVisibility {
  const v = (value ?? "").trim();
  if (v) return { known: true, value: v };
  return { known: false, reason: referenced ? "nao_visivel" : "sem_registro" };
}

function party(
  direct: { name: string | null; cnpj: string | null } | null,
  rpcName: string | null | undefined,
  referenced: boolean,
): PartyIdentity {
  const directName = (direct?.name ?? "").trim();
  const fallback = (rpcName ?? "").trim();
  return {
    name: directName || fallback || null,
    document: visibility(direct?.cnpj, referenced),
    fromCounterpartyRpc: !directName && !!fallback,
  };
}

export function resolveContractParties(input: ContractPartiesInput): ContractParties {
  const { direct, counterparty, refs } = input;

  const driverDirectName = (direct.driver?.full_name ?? "").trim();
  const driverLabel = (input.tripDriverLabel ?? "").trim();

  return {
    shipper: party(direct.shipper, counterparty?.shipper_company_name, refs.shipperCompany),
    carrier: {
      ...party(direct.carrier, counterparty?.carrier_company_name, refs.carrierCompany),
      antt: visibility(input.carrierAntt, refs.carrierCompany),
    },
    driver: {
      name: driverDirectName || driverLabel || null,
      cpf: visibility(direct.driver?.cpf, refs.driver),
      license: visibility(direct.driver?.license_number, refs.driver),
      fromTripLabel: !driverDirectName && !!driverLabel,
    },
  };
}

/** Texto curto para um documento, sem inventar "—" para dado que existe. */
export function documentText(
  d: DocumentVisibility,
  labels: { naoVisivel: string; semRegistro: string } = {
    naoVisivel: "não visível para você",
    semRegistro: "não informado",
  },
): string {
  if (d.known) return d.value;
  return d.reason === "nao_visivel" ? labels.naoVisivel : labels.semRegistro;
}
