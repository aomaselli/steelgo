// Nome exibivel da transportadora num pedido de vinculo do motorista.
// driver_carrier_requests -> carriers(company_id) -> companies(name, trade_name):
// `carriers` NAO tem company_name/trade_name (o embed antigo devolvia 42703/400).
export type CarrierRequestLike = {
  carriers?: {
    company_id: string;
    companies?: { name?: string | null; trade_name?: string | null } | null;
  } | null;
};

/** Select do PostgREST para o embed correto (fonte unica, testada). */
export const CARRIER_REQUEST_SELECT =
  "id, carrier_id, status, message, created_at, carriers(company_id, companies(name, trade_name))";

export function carrierRequestLabel(req: CarrierRequestLike): string {
  return req.carriers?.companies?.name ?? req.carriers?.companies?.trade_name ?? "Transportadora";
}
