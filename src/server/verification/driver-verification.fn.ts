/**
 * Server function da verificação de motorista.
 *
 * Fronteira de segurança: é o único ponto que o browser alcança, e devolve
 * exclusivamente { status, decision, reasonCode }. Nenhuma resposta de
 * provedor externo, nenhum código de provedor, nenhum dado pessoal.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildVerificationProviders } from "./providers";
import { SupabaseDriverVerificationRepository } from "./driver-verification.repository";
import {
  DriverVerificationService,
  resolveActorRole,
  VerificationAuthorizationError,
  VerificationNotFoundError,
} from "./driver-verification.service";
import type { DriverVerificationPublicResult } from "./types";

const inputSchema = z.object({
  /**
   * Só é considerado quando o solicitante é admin. Motorista SEMPRE verifica
   * o próprio registro, resolvido pelo profile_id do token — informar id de
   * terceiro aqui não tem efeito algum.
   */
  driverId: z.string().uuid().optional(),
});

export const verifyDriverFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<DriverVerificationPublicResult> => {
    const { supabase, userId } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) throw new Error("Unauthorized: could not resolve role");

    const role = resolveActorRole((roles ?? []).map((r) => r.role as string));
    if (!role) {
      throw new Error("Forbidden: driver or admin role required");
    }
    const isAdmin = role === "admin";

    const repository = new SupabaseDriverVerificationRepository();
    const providers = buildVerificationProviders();
    const service = new DriverVerificationService({
      repository,
      gcc: providers.gcc,
      datavalid: providers.datavalid,
      senatran: providers.senatran,
    });

    // Resolução do alvo: para motorista, ignora o input e usa o próprio
    // profile. É o que fecha a porta de IDOR.
    let targetDriverId: string;
    if (isAdmin && data.driverId) {
      targetDriverId = data.driverId;
    } else {
      const own = await repository.getDriverByProfileId(userId);
      if (!own) throw new Error("Not found: driver record does not exist for this account");
      targetDriverId = own.id;
    }

    try {
      const result = await service.verifyDriver({
        driverId: targetDriverId,
        actorId: userId,
        actorRole: isAdmin && data.driverId ? "admin" : "driver",
      });
      return {
        status: result.status,
        decision: result.decision,
        reasonCode: result.reasonCode,
      };
    } catch (err) {
      if (err instanceof VerificationAuthorizationError) throw new Error("Forbidden");
      if (err instanceof VerificationNotFoundError) throw new Error("Not found");
      // Não vaza mensagem interna nem corpo de provedor para o browser.
      console.error("[verification] unexpected failure", err);
      throw new Error("Verification failed");
    }
  });
