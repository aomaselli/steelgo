// Leitura dos convites de motorista de uma transportadora.
//
// Passa pela RPC `list_carrier_driver_invitations`, nao pela tabela:
// `driver_carrier_invitations` tem o SELECT revogado de `anon` e `authenticated`
// de proposito, porque guarda `token_hash`, `expected_cpf_hash` e
// `expected_license_hash`. Ver
// supabase/migrations/20261008120000_list_carrier_driver_invitations_rpc.sql.
//
// A chamada e tipada pelo nome da funcao, no mesmo padrao de `lib/trips.ts`:
// assim um erro de nome de parametro ou de coluna aparece no `tsc`, e nao so em
// tempo de execucao.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Fn = Database["public"]["Functions"];

export type CarrierDriverInvitation = Fn["list_carrier_driver_invitations"]["Returns"][number];

export function listCarrierDriverInvitations(carrierId: string): Promise<{
  data: CarrierDriverInvitation[] | null;
  error: { message: string; code?: string } | null;
}> {
  return supabase.rpc("list_carrier_driver_invitations", {
    p_carrier_id: carrierId,
  }) as unknown as Promise<{
    data: CarrierDriverInvitation[] | null;
    error: { message: string; code?: string } | null;
  }>;
}
