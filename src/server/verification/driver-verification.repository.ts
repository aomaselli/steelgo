/**
 * DriverVerificationRepository — única camada que fala com o Supabase.
 *
 * Usa o cliente de service role: as escritas em driver_verifications são
 * exclusivamente server-side (a policy de INSERT/UPDATE/DELETE para o
 * cliente simplesmente não existe).
 *
 * Nenhum provider importa este arquivo.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  DriverLicenseState,
  DriverRecordForVerification,
  DriverVerificationRepositoryPort,
  RecordVerificationEventInput,
  UpdateDriverVerificationStateInput,
} from "./types";

const DRIVER_COLUMNS =
  "id, profile_id, carrier_id, cpf, license_number, license_expiry, license_issuer_country, license_verification_status, is_verified";

type DriverRow = {
  id: string;
  profile_id: string | null;
  carrier_id: string | null;
  cpf: string | null;
  license_number: string | null;
  license_expiry: string | null;
  license_issuer_country: string | null;
  license_verification_status: string;
  is_verified: boolean;
};

function toDomain(row: DriverRow): DriverRecordForVerification {
  return {
    id: row.id,
    profileId: row.profile_id,
    carrierId: row.carrier_id,
    cpf: row.cpf,
    licenseNumber: row.license_number,
    licenseExpiry: row.license_expiry,
    licenseIssuerCountry: row.license_issuer_country,
    licenseVerificationStatus: row.license_verification_status as DriverLicenseState,
    isVerified: row.is_verified,
  };
}

export class SupabaseDriverVerificationRepository
  implements DriverVerificationRepositoryPort
{
  async getDriverById(driverId: string): Promise<DriverRecordForVerification | null> {
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select(DRIVER_COLUMNS)
      .eq("id", driverId)
      .maybeSingle();
    if (error) throw new Error(`getDriverById failed: ${error.message}`);
    return data ? toDomain(data as DriverRow) : null;
  }

  async getDriverByProfileId(profileId: string): Promise<DriverRecordForVerification | null> {
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select(DRIVER_COLUMNS)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw new Error(`getDriverByProfileId failed: ${error.message}`);
    return data ? toDomain(data as DriverRow) : null;
  }

  /**
   * ÚNICA escrita nesta tabela, e é sempre INSERT. Não existe UPDATE nem
   * DELETE em driver_verifications em lugar nenhum do código — e o banco
   * também bloqueia, por trigger.
   */
  async recordVerificationEvent(
    input: RecordVerificationEventInput,
  ): Promise<{ id: string }> {
    const { data, error } = await supabaseAdmin
      .from("driver_verifications")
      .insert({
        driver_id: input.driverId,
        provider: input.provider,
        verification_type: input.verificationType,
        status: input.status,
        decision: input.decision,
        provider_reference: input.providerReference,
        result_code: input.resultCode,
        internal_reason_code: input.internalReasonCode,
        rule_version: input.ruleVersion,
        decided_by: input.decidedBy,
        requested_at: input.requestedAt,
        completed_at: input.completedAt,
        expires_at: input.expiresAt,
      })
      .select("id")
      .single();
    if (error) throw new Error(`recordVerificationEvent failed: ${error.message}`);
    return { id: (data as { id: string }).id };
  }

  async updateDriverVerificationState(
    input: UpdateDriverVerificationStateInput,
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("drivers")
      .update({
        license_verification_status: input.status,
        is_verified: input.isVerified,
        license_verified_at: input.verifiedAt,
        license_verified_by: input.verifiedBy,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.driverId);
    if (error) throw new Error(`updateDriverVerificationState failed: ${error.message}`);
  }
}
