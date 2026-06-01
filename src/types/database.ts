// SteelGo domain types (mirror DB schema)
export type UserRole = 'shipper' | 'carrier' | 'driver' | 'admin';

export type FreightStatus =
  | 'draft' | 'published' | 'bidding' | 'matched'
  | 'contract_pending' | 'contracted' | 'in_transit'
  | 'delivered' | 'completed' | 'cancelled' | 'disputed';

export type FreightCategory = 'traditional' | 'green_low_carbon' | 'green_ev';

export type SteelType =
  | 'bobina_laminada_frio' | 'bobina_laminada_quente' | 'chapa_grossa'
  | 'perfil_estrutural' | 'cano_sem_costura' | 'barra_redonda'
  | 'vergalhao' | 'tubo_galvanizado' | 'blank_estampagem' | 'outro';

export type TruckType =
  | 'truck_simples' | 'toco' | 'truck' | 'bitruck'
  | 'carreta' | 'carreta_extendida' | 'rodotrem' | 'bitrem'
  | 'ev_carreta' | 'ev_truck';

export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';

export type ContractStatus =
  | 'draft' | 'awaiting_shipper_signature' | 'awaiting_carrier_signature'
  | 'active' | 'completed' | 'disputed' | 'cancelled';

export type PaymentStatus =
  | 'pending' | 'escrow_held' | 'released' | 'refunded' | 'disputed' | 'failed';

export type CompanyTier = 'free' | 'pro' | 'enterprise';
export type BadgeTier = 'standard' | 'silver' | 'gold' | 'platinum';
export type CheckpointType =
  | 'origin_loading' | 'waypoint' | 'security_checkpoint'
  | 'destination_unloading' | 'incident';
export type SecurityAlertType =
  | 'route_deviation' | 'panic_button' | 'checkpoint_missed'
  | 'cargo_tamper' | 'driver_id_mismatch';
export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  role: UserRole | null; // populated client-side from user_roles
  avatar_url: string | null;
  language: string | null;
  is_verified: boolean;
  is_active: boolean;
  is_onboarded: boolean;
  preferences: Record<string, unknown> | null;
  created_at: string;
}

export interface Company {
  id: string;
  owner_id: string;
  name: string;
  trade_name: string | null;
  cnpj: string | null;
  type: string | null;
  address_city: string | null;
  address_state: string | null;
  logo_url: string | null;
  is_verified: boolean;
  tier: CompanyTier;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface Freight {
  id: string;
  company_id: string;
  created_by: string;
  steel_type: SteelType | null;
  weight_tons: number | null;
  cargo_value_brl: number | null;
  origin_name: string | null;
  origin_city: string | null;
  origin_state: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  dest_name: string | null;
  dest_city: string | null;
  dest_state: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  distance_km: number | null;
  category: FreightCategory;
  required_truck: TruckType[] | null;
  pickup_date: string | null;
  budget_brl: number | null;
  final_price_brl: number | null;
  status: FreightStatus;
  published_at: string | null;
  bid_deadline: string | null;
  matched_carrier_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Bid {
  id: string;
  freight_id: string;
  carrier_id: string;
  driver_id: string | null;
  truck_id: string | null;
  amount_brl: number;
  toll_brl: number;
  estimated_hours: number | null;
  ev_certified: boolean;
  status: BidStatus;
  submitted_at: string;
  expires_at: string | null;
}

export interface Contract {
  id: string;
  bid_id: string | null;
  freight_id: string;
  shipper_company_id: string;
  carrier_company_id: string;
  driver_id: string | null;
  truck_id: string | null;
  total_amount_brl: number | null;
  platform_fee_brl: number | null;
  carrier_payout_brl: number | null;
  status: ContractStatus;
  shipper_signed_at: string | null;
  carrier_signed_at: string | null;
  pdf_url: string | null;
  contract_number: string | null;
  activated_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Carrier {
  id: string;
  company_id: string;
  antt_rntrc: string | null;
  fleet_size: number;
  truck_types: TruckType[] | null;
  has_ev_trucks: boolean;
  ev_truck_count: number;
  insurance_expiry: string | null;
  rctr_c_active: boolean;
  is_active: boolean;
}

export interface CarrierScore {
  id: string;
  carrier_id: string;
  safety_score: number;
  delivery_score: number;
  esg_score: number;
  security_score: number;
  client_score: number;
  overall_score: number;
  total_freights: number;
  on_time_count: number;
  is_verified: boolean;
  esg_certified: boolean;
  badge_tier: BadgeTier;
  updated_at: string;
}

export interface Checkpoint {
  id: string;
  contract_id: string;
  driver_id: string | null;
  type: CheckpointType;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  qr_seal_code: string | null;
  qr_verified: boolean;
  expected_at: string | null;
  recorded_at: string | null;
}

export interface ESGLog {
  id: string;
  contract_id: string | null;
  carrier_id: string | null;
  truck_id: string | null;
  freight_id: string | null;
  company_id: string | null;
  distance_km: number | null;
  weight_tons: number | null;
  is_green: boolean;
  co2_emitted_kg: number | null;
  co2_baseline_kg: number | null;
  co2_saved_kg: number | null;
  category: FreightCategory | null;
  esg_rating: string | null;
  logged_at: string;
}

export interface Notification {
  id: string;
  profile_id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SecurityAlert {
  id: string;
  contract_id: string | null;
  freight_id: string | null;
  type: SecurityAlertType;
  severity: SecuritySeverity;
  title: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}
