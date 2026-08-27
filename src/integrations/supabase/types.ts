export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bids: {
        Row: {
          amount_brl: number
          carrier_id: string
          driver_id: string | null
          estimated_hours: number | null
          ev_certified: boolean | null
          expires_at: string | null
          freight_id: string
          id: string
          status: Database["public"]["Enums"]["bid_status"] | null
          submitted_at: string | null
          toll_brl: number | null
          truck_id: string | null
        }
        Insert: {
          amount_brl: number
          carrier_id: string
          driver_id?: string | null
          estimated_hours?: number | null
          ev_certified?: boolean | null
          expires_at?: string | null
          freight_id: string
          id?: string
          status?: Database["public"]["Enums"]["bid_status"] | null
          submitted_at?: string | null
          toll_brl?: number | null
          truck_id?: string | null
        }
        Update: {
          amount_brl?: number
          carrier_id?: string
          driver_id?: string | null
          estimated_hours?: number | null
          ev_certified?: boolean | null
          expires_at?: string | null
          freight_id?: string
          id?: string
          status?: Database["public"]["Enums"]["bid_status"] | null
          submitted_at?: string | null
          toll_brl?: number | null
          truck_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bids_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_freight_id_fkey"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_availability: {
        Row: {
          accepts_backhaul: boolean
          available_from: string
          available_until: string | null
          carrier_id: string
          created_at: string
          currency_code: string
          current_geog: unknown
          current_lat: number
          current_lng: number
          driver_id: string
          id: string
          location_accuracy_m: number | null
          location_updated_at: string
          max_pickup_radius_km: number
          metadata: Json
          min_rate_per_loaded_km: number | null
          min_total_amount: number | null
          preferred_destination_countries: string[]
          preferred_destination_subdivisions: string[]
          status: string
          truck_id: string
          updated_at: string
        }
        Insert: {
          accepts_backhaul?: boolean
          available_from?: string
          available_until?: string | null
          carrier_id: string
          created_at?: string
          currency_code?: string
          current_geog: unknown
          current_lat: number
          current_lng: number
          driver_id: string
          id?: string
          location_accuracy_m?: number | null
          location_updated_at?: string
          max_pickup_radius_km?: number
          metadata?: Json
          min_rate_per_loaded_km?: number | null
          min_total_amount?: number | null
          preferred_destination_countries?: string[]
          preferred_destination_subdivisions?: string[]
          status?: string
          truck_id: string
          updated_at?: string
        }
        Update: {
          accepts_backhaul?: boolean
          available_from?: string
          available_until?: string | null
          carrier_id?: string
          created_at?: string
          currency_code?: string
          current_geog?: unknown
          current_lat?: number
          current_lng?: number
          driver_id?: string
          id?: string
          location_accuracy_m?: number | null
          location_updated_at?: string
          max_pickup_radius_km?: number
          metadata?: Json
          min_rate_per_loaded_km?: number | null
          min_total_amount?: number | null
          preferred_destination_countries?: string[]
          preferred_destination_subdivisions?: string[]
          status?: string
          truck_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_availability_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_availability_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_availability_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_matches: {
        Row: {
          availability_score: number | null
          capacity_availability_id: string
          carrier_id: string
          compliance_score: number | null
          created_at: string
          eligibility_status: string
          empty_distance_km: number | null
          equipment_score: number | null
          freight_id: string
          id: string
          performance_score: number | null
          pickup_eta_minutes: number | null
          proximity_score: number | null
          quote_id: string | null
          rank_position: number | null
          reasons: Json
          rejection_reasons: Json
          sustainability_score: number | null
          total_score: number | null
          updated_at: string
        }
        Insert: {
          availability_score?: number | null
          capacity_availability_id: string
          carrier_id: string
          compliance_score?: number | null
          created_at?: string
          eligibility_status?: string
          empty_distance_km?: number | null
          equipment_score?: number | null
          freight_id: string
          id?: string
          performance_score?: number | null
          pickup_eta_minutes?: number | null
          proximity_score?: number | null
          quote_id?: string | null
          rank_position?: number | null
          reasons?: Json
          rejection_reasons?: Json
          sustainability_score?: number | null
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          availability_score?: number | null
          capacity_availability_id?: string
          carrier_id?: string
          compliance_score?: number | null
          created_at?: string
          eligibility_status?: string
          empty_distance_km?: number | null
          equipment_score?: number | null
          freight_id?: string
          id?: string
          performance_score?: number | null
          pickup_eta_minutes?: number | null
          proximity_score?: number | null
          quote_id?: string | null
          rank_position?: number | null
          reasons?: Json
          rejection_reasons?: Json
          sustainability_score?: number | null
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_matches_capacity_availability_id_fkey"
            columns: ["capacity_availability_id"]
            isOneToOne: false
            referencedRelation: "capacity_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_matches_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_matches_freight_id_fkey"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capacity_matches_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "freight_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_reviews: {
        Row: {
          cargo_condition: number | null
          carrier_id: string
          comment: string | null
          communication: number | null
          contract_id: string
          created_at: string
          id: string
          on_time: number | null
          rating: number
          reviewer_id: string
        }
        Insert: {
          cargo_condition?: number | null
          carrier_id: string
          comment?: string | null
          communication?: number | null
          contract_id: string
          created_at?: string
          id?: string
          on_time?: number | null
          rating: number
          reviewer_id: string
        }
        Update: {
          cargo_condition?: number | null
          carrier_id?: string
          comment?: string | null
          communication?: number | null
          contract_id?: string
          created_at?: string
          id?: string
          on_time?: number | null
          rating?: number
          reviewer_id?: string
        }
        Relationships: []
      }
      carrier_scores: {
        Row: {
          badge_tier: Database["public"]["Enums"]["badge_tier"] | null
          carrier_id: string
          client_score: number | null
          delivery_score: number | null
          esg_certified: boolean | null
          esg_score: number | null
          id: string
          is_verified: boolean | null
          on_time_count: number | null
          overall_score: number | null
          safety_score: number | null
          security_score: number | null
          total_freights: number | null
          updated_at: string | null
        }
        Insert: {
          badge_tier?: Database["public"]["Enums"]["badge_tier"] | null
          carrier_id: string
          client_score?: number | null
          delivery_score?: number | null
          esg_certified?: boolean | null
          esg_score?: number | null
          id?: string
          is_verified?: boolean | null
          on_time_count?: number | null
          overall_score?: number | null
          safety_score?: number | null
          security_score?: number | null
          total_freights?: number | null
          updated_at?: string | null
        }
        Update: {
          badge_tier?: Database["public"]["Enums"]["badge_tier"] | null
          carrier_id?: string
          client_score?: number | null
          delivery_score?: number | null
          esg_certified?: boolean | null
          esg_score?: number | null
          id?: string
          is_verified?: boolean | null
          on_time_count?: number | null
          overall_score?: number | null
          safety_score?: number | null
          security_score?: number | null
          total_freights?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carrier_scores_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: true
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          antt_rntrc: string | null
          company_id: string
          created_at: string | null
          ev_truck_count: number | null
          fleet_size: number | null
          has_ev_trucks: boolean | null
          home_country_code: string
          id: string
          insurance_doc_url: string | null
          insurance_expiry: string | null
          is_active: boolean | null
          operating_countries: string[]
          operating_states: string[] | null
          rctr_c_active: boolean | null
          truck_types: Database["public"]["Enums"]["truck_type"][] | null
          updated_at: string
        }
        Insert: {
          antt_rntrc?: string | null
          company_id: string
          created_at?: string | null
          ev_truck_count?: number | null
          fleet_size?: number | null
          has_ev_trucks?: boolean | null
          home_country_code?: string
          id?: string
          insurance_doc_url?: string | null
          insurance_expiry?: string | null
          is_active?: boolean | null
          operating_countries?: string[]
          operating_states?: string[] | null
          rctr_c_active?: boolean | null
          truck_types?: Database["public"]["Enums"]["truck_type"][] | null
          updated_at?: string
        }
        Update: {
          antt_rntrc?: string | null
          company_id?: string
          created_at?: string | null
          ev_truck_count?: number | null
          fleet_size?: number | null
          has_ev_trucks?: boolean | null
          home_country_code?: string
          id?: string
          insurance_doc_url?: string | null
          insurance_expiry?: string | null
          is_active?: boolean | null
          operating_countries?: string[]
          operating_states?: string[] | null
          rctr_c_active?: boolean | null
          truck_types?: Database["public"]["Enums"]["truck_type"][] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carriers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          accuracy_m: number | null
          contract_id: string
          driver_id: string | null
          expected_at: string | null
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          photo_url: string | null
          qr_seal_code: string | null
          qr_verified: boolean | null
          recorded_at: string | null
          type: Database["public"]["Enums"]["checkpoint_type"] | null
        }
        Insert: {
          accuracy_m?: number | null
          contract_id: string
          driver_id?: string | null
          expected_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          photo_url?: string | null
          qr_seal_code?: string | null
          qr_verified?: boolean | null
          recorded_at?: string | null
          type?: Database["public"]["Enums"]["checkpoint_type"] | null
        }
        Update: {
          accuracy_m?: number | null
          contract_id?: string
          driver_id?: string | null
          expected_at?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          photo_url?: string | null
          qr_seal_code?: string | null
          qr_verified?: boolean | null
          recorded_at?: string | null
          type?: Database["public"]["Enums"]["checkpoint_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_city: string | null
          address_state: string | null
          cnpj: string | null
          country_code: string
          created_at: string | null
          currency_code: string
          id: string
          is_verified: boolean | null
          logo_url: string | null
          name: string
          owner_id: string
          stripe_customer_id: string | null
          tier: Database["public"]["Enums"]["company_tier"] | null
          timezone: string
          trade_name: string | null
          type: string | null
          updated_at: string
          verification_doc_url: string | null
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          cnpj?: string | null
          country_code?: string
          created_at?: string | null
          currency_code?: string
          id?: string
          is_verified?: boolean | null
          logo_url?: string | null
          name: string
          owner_id: string
          stripe_customer_id?: string | null
          tier?: Database["public"]["Enums"]["company_tier"] | null
          timezone?: string
          trade_name?: string | null
          type?: string | null
          updated_at?: string
          verification_doc_url?: string | null
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          cnpj?: string | null
          country_code?: string
          created_at?: string | null
          currency_code?: string
          id?: string
          is_verified?: boolean | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          stripe_customer_id?: string | null
          tier?: Database["public"]["Enums"]["company_tier"] | null
          timezone?: string
          trade_name?: string | null
          type?: string | null
          updated_at?: string
          verification_doc_url?: string | null
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          member_role: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          member_role?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          member_role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          activated_at: string | null
          bid_id: string | null
          carrier_company_id: string
          carrier_payout_brl: number | null
          carrier_signature_hash: string | null
          carrier_signature_url: string | null
          carrier_signed_at: string | null
          carrier_signed_ip: string | null
          completed_at: string | null
          contract_number: string | null
          created_at: string | null
          driver_id: string | null
          escrow_held_at: string | null
          escrow_released_at: string | null
          escrow_status: string
          freight_id: string
          id: string
          pdf_url: string | null
          pickup_window: string | null
          platform_fee_brl: number | null
          shipper_company_id: string
          shipper_signature_hash: string | null
          shipper_signature_url: string | null
          shipper_signed_at: string | null
          shipper_signed_ip: string | null
          status: Database["public"]["Enums"]["contract_status"] | null
          total_amount_brl: number | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          bid_id?: string | null
          carrier_company_id: string
          carrier_payout_brl?: number | null
          carrier_signature_hash?: string | null
          carrier_signature_url?: string | null
          carrier_signed_at?: string | null
          carrier_signed_ip?: string | null
          completed_at?: string | null
          contract_number?: string | null
          created_at?: string | null
          driver_id?: string | null
          escrow_held_at?: string | null
          escrow_released_at?: string | null
          escrow_status?: string
          freight_id: string
          id?: string
          pdf_url?: string | null
          pickup_window?: string | null
          platform_fee_brl?: number | null
          shipper_company_id: string
          shipper_signature_hash?: string | null
          shipper_signature_url?: string | null
          shipper_signed_at?: string | null
          shipper_signed_ip?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          total_amount_brl?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          bid_id?: string | null
          carrier_company_id?: string
          carrier_payout_brl?: number | null
          carrier_signature_hash?: string | null
          carrier_signature_url?: string | null
          carrier_signed_at?: string | null
          carrier_signed_ip?: string | null
          completed_at?: string | null
          contract_number?: string | null
          created_at?: string | null
          driver_id?: string | null
          escrow_held_at?: string | null
          escrow_released_at?: string | null
          escrow_status?: string
          freight_id?: string
          id?: string
          pdf_url?: string | null
          pickup_window?: string | null
          platform_fee_brl?: number | null
          shipper_company_id?: string
          shipper_signature_hash?: string | null
          shipper_signature_url?: string | null
          shipper_signed_at?: string | null
          shipper_signed_ip?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          total_amount_brl?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_bid_id_fkey"
            columns: ["bid_id"]
            isOneToOne: true
            referencedRelation: "bids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_carrier_company_id_fkey"
            columns: ["carrier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_freight_id_fkey"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_shipper_company_id_fkey"
            columns: ["shipper_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_carrier_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          carrier_id: string
          created_at: string
          created_by: string
          driver_id: string
          expected_cpf_hash: string | null
          expected_license_country: string
          expected_license_hash: string | null
          expires_at: string
          id: string
          invited_email: string | null
          invited_phone: string | null
          revoked_at: string | null
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          carrier_id: string
          created_at?: string
          created_by: string
          driver_id: string
          expected_cpf_hash?: string | null
          expected_license_country?: string
          expected_license_hash?: string | null
          expires_at?: string
          id?: string
          invited_email?: string | null
          invited_phone?: string | null
          revoked_at?: string | null
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          carrier_id?: string
          created_at?: string
          created_by?: string
          driver_id?: string
          expected_cpf_hash?: string | null
          expected_license_country?: string
          expected_license_hash?: string | null
          expires_at?: string
          id?: string
          invited_email?: string | null
          invited_phone?: string | null
          revoked_at?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_carrier_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_carrier_invitations_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_carrier_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_carrier_invitations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_carrier_requests: {
        Row: {
          carrier_id: string
          created_at: string
          id: string
          message: string | null
          profile_id: string
          proposed_driver_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_cpf: string | null
          submitted_license_category: string | null
          submitted_license_country: string
          submitted_license_expiry: string | null
          submitted_license_number: string
          updated_at: string
        }
        Insert: {
          carrier_id: string
          created_at?: string
          id?: string
          message?: string | null
          profile_id: string
          proposed_driver_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_cpf?: string | null
          submitted_license_category?: string | null
          submitted_license_country: string
          submitted_license_expiry?: string | null
          submitted_license_number: string
          updated_at?: string
        }
        Update: {
          carrier_id?: string
          created_at?: string
          id?: string
          message?: string | null
          profile_id?: string
          proposed_driver_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_cpf?: string | null
          submitted_license_category?: string | null
          submitted_license_country?: string
          submitted_license_expiry?: string | null
          submitted_license_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_carrier_requests_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_carrier_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_carrier_requests_proposed_driver_id_fkey"
            columns: ["proposed_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_carrier_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_positions: {
        Row: {
          accuracy: number | null
          contract_id: string
          driver_id: string
          id: string
          lat: number
          lng: number
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          contract_id: string
          driver_id: string
          id?: string
          lat: number
          lng: number
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          contract_id?: string
          driver_id?: string
          id?: string
          lat?: number
          lng?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_positions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_positions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          carrier_id: string | null
          country_code: string
          cpf: string | null
          created_at: string
          full_name: string
          has_mopp: boolean | null
          id: string
          is_active: boolean | null
          is_verified: boolean
          license_category: string | null
          license_doc_url: string | null
          license_expiry: string | null
          license_issuer_country: string
          license_number: string | null
          license_verification_status: string
          license_verified_at: string | null
          license_verified_by: string | null
          mopp_certified: boolean | null
          profile_id: string | null
          regulatory_attributes: Json
          updated_at: string
        }
        Insert: {
          carrier_id?: string | null
          country_code?: string
          cpf?: string | null
          created_at?: string
          full_name: string
          has_mopp?: boolean | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean
          license_category?: string | null
          license_doc_url?: string | null
          license_expiry?: string | null
          license_issuer_country?: string
          license_number?: string | null
          license_verification_status?: string
          license_verified_at?: string | null
          license_verified_by?: string | null
          mopp_certified?: boolean | null
          profile_id?: string | null
          regulatory_attributes?: Json
          updated_at?: string
        }
        Update: {
          carrier_id?: string | null
          country_code?: string
          cpf?: string | null
          created_at?: string
          full_name?: string
          has_mopp?: boolean | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean
          license_category?: string | null
          license_doc_url?: string | null
          license_expiry?: string | null
          license_issuer_country?: string
          license_number?: string | null
          license_verification_status?: string
          license_verified_at?: string | null
          license_verified_by?: string | null
          mopp_certified?: boolean | null
          profile_id?: string | null
          regulatory_attributes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_license_verified_by_fkey"
            columns: ["license_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      esg_logs: {
        Row: {
          carrier_id: string | null
          category: Database["public"]["Enums"]["freight_category"] | null
          co2_baseline_kg: number | null
          co2_emitted_kg: number | null
          co2_saved_kg: number | null
          company_id: string | null
          contract_id: string | null
          distance_km: number | null
          esg_rating: string | null
          freight_id: string | null
          id: string
          is_green: boolean | null
          logged_at: string | null
          truck_id: string | null
          weight_tons: number | null
        }
        Insert: {
          carrier_id?: string | null
          category?: Database["public"]["Enums"]["freight_category"] | null
          co2_baseline_kg?: number | null
          co2_emitted_kg?: number | null
          co2_saved_kg?: number | null
          company_id?: string | null
          contract_id?: string | null
          distance_km?: number | null
          esg_rating?: string | null
          freight_id?: string | null
          id?: string
          is_green?: boolean | null
          logged_at?: string | null
          truck_id?: string | null
          weight_tons?: number | null
        }
        Update: {
          carrier_id?: string | null
          category?: Database["public"]["Enums"]["freight_category"] | null
          co2_baseline_kg?: number | null
          co2_emitted_kg?: number | null
          co2_saved_kg?: number | null
          company_id?: string | null
          contract_id?: string | null
          distance_km?: number | null
          esg_rating?: string | null
          freight_id?: string | null
          id?: string
          is_green?: boolean | null
          logged_at?: string | null
          truck_id?: string | null
          weight_tons?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "esg_logs_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esg_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esg_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esg_logs_freight_id_fkey"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esg_logs_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      freight_quotes: {
        Row: {
          accepted_at: string | null
          base_freight_amount: number
          border_amount: number
          calculation_breakdown: Json
          calculation_version: string
          capacity_availability_id: string | null
          carrier_id: string | null
          carrier_payout_amount: number
          created_at: string
          currency_code: string
          discount_amount: number
          driver_payout_amount: number | null
          empty_km_amount: number
          freight_id: string
          fuel_surcharge_amount: number
          id: string
          insurance_amount: number
          margin_amount: number | null
          platform_fee_amount: number
          pricing_rule_id: string | null
          risk_amount: number
          route_estimate_id: string | null
          shipper_total_amount: number
          status: string
          toll_amount: number
          valid_until: string
          waiting_amount: number
        }
        Insert: {
          accepted_at?: string | null
          base_freight_amount?: number
          border_amount?: number
          calculation_breakdown?: Json
          calculation_version: string
          capacity_availability_id?: string | null
          carrier_id?: string | null
          carrier_payout_amount?: number
          created_at?: string
          currency_code: string
          discount_amount?: number
          driver_payout_amount?: number | null
          empty_km_amount?: number
          freight_id: string
          fuel_surcharge_amount?: number
          id?: string
          insurance_amount?: number
          margin_amount?: number | null
          platform_fee_amount?: number
          pricing_rule_id?: string | null
          risk_amount?: number
          route_estimate_id?: string | null
          shipper_total_amount?: number
          status?: string
          toll_amount?: number
          valid_until: string
          waiting_amount?: number
        }
        Update: {
          accepted_at?: string | null
          base_freight_amount?: number
          border_amount?: number
          calculation_breakdown?: Json
          calculation_version?: string
          capacity_availability_id?: string | null
          carrier_id?: string | null
          carrier_payout_amount?: number
          created_at?: string
          currency_code?: string
          discount_amount?: number
          driver_payout_amount?: number | null
          empty_km_amount?: number
          freight_id?: string
          fuel_surcharge_amount?: number
          id?: string
          insurance_amount?: number
          margin_amount?: number | null
          platform_fee_amount?: number
          pricing_rule_id?: string | null
          risk_amount?: number
          route_estimate_id?: string | null
          shipper_total_amount?: number
          status?: string
          toll_amount?: number
          valid_until?: string
          waiting_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "freight_quotes_capacity_availability_id_fkey"
            columns: ["capacity_availability_id"]
            isOneToOne: false
            referencedRelation: "capacity_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_quotes_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_quotes_freight_id_fkey"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_quotes_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_quotes_route_estimate_id_fkey"
            columns: ["route_estimate_id"]
            isOneToOne: false
            referencedRelation: "route_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      freights: {
        Row: {
          bid_deadline: string | null
          budget_amount: number | null
          budget_brl: number | null
          cargo_description: string | null
          cargo_value_amount: number | null
          cargo_value_brl: number | null
          category: Database["public"]["Enums"]["freight_category"] | null
          company_id: string
          created_at: string | null
          created_by: string
          currency_code: string
          delivery_date: string | null
          dest_city: string | null
          dest_lat: number | null
          dest_lng: number | null
          dest_name: string | null
          dest_state: string | null
          destination_country_code: string
          destination_geog: unknown
          destination_postal_code: string | null
          destination_subdivision_code: string | null
          destination_timezone: string
          distance_km: number | null
          final_price_amount: number | null
          final_price_brl: number | null
          goods_type_code: string | null
          handling_requirements: Json
          id: string
          internal_reference: string | null
          matched_carrier_id: string | null
          matched_driver_id: string | null
          matched_truck_id: string | null
          notes: string | null
          operation_scope: string
          origin_city: string | null
          origin_country_code: string
          origin_geog: unknown
          origin_lat: number | null
          origin_lng: number | null
          origin_name: string | null
          origin_postal_code: string | null
          origin_state: string | null
          origin_subdivision_code: string | null
          origin_timezone: string
          pickup_date: string | null
          pickup_window: string | null
          published_at: string | null
          regulatory_requirements: Json
          required_truck: Database["public"]["Enums"]["truck_type"][] | null
          requires_mopp: boolean
          search_radius_km: number
          status: Database["public"]["Enums"]["freight_status"] | null
          steel_type: Database["public"]["Enums"]["steel_type"] | null
          toll_included: boolean
          updated_at: string
          volume_m3: number | null
          waypoints: Json
          weight_tons: number | null
        }
        Insert: {
          bid_deadline?: string | null
          budget_amount?: number | null
          budget_brl?: number | null
          cargo_description?: string | null
          cargo_value_amount?: number | null
          cargo_value_brl?: number | null
          category?: Database["public"]["Enums"]["freight_category"] | null
          company_id: string
          created_at?: string | null
          created_by: string
          currency_code?: string
          delivery_date?: string | null
          dest_city?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          dest_name?: string | null
          dest_state?: string | null
          destination_country_code?: string
          destination_geog?: unknown
          destination_postal_code?: string | null
          destination_subdivision_code?: string | null
          destination_timezone?: string
          distance_km?: number | null
          final_price_amount?: number | null
          final_price_brl?: number | null
          goods_type_code?: string | null
          handling_requirements?: Json
          id?: string
          internal_reference?: string | null
          matched_carrier_id?: string | null
          matched_driver_id?: string | null
          matched_truck_id?: string | null
          notes?: string | null
          operation_scope?: string
          origin_city?: string | null
          origin_country_code?: string
          origin_geog?: unknown
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          origin_postal_code?: string | null
          origin_state?: string | null
          origin_subdivision_code?: string | null
          origin_timezone?: string
          pickup_date?: string | null
          pickup_window?: string | null
          published_at?: string | null
          regulatory_requirements?: Json
          required_truck?: Database["public"]["Enums"]["truck_type"][] | null
          requires_mopp?: boolean
          search_radius_km?: number
          status?: Database["public"]["Enums"]["freight_status"] | null
          steel_type?: Database["public"]["Enums"]["steel_type"] | null
          toll_included?: boolean
          updated_at?: string
          volume_m3?: number | null
          waypoints?: Json
          weight_tons?: number | null
        }
        Update: {
          bid_deadline?: string | null
          budget_amount?: number | null
          budget_brl?: number | null
          cargo_description?: string | null
          cargo_value_amount?: number | null
          cargo_value_brl?: number | null
          category?: Database["public"]["Enums"]["freight_category"] | null
          company_id?: string
          created_at?: string | null
          created_by?: string
          currency_code?: string
          delivery_date?: string | null
          dest_city?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          dest_name?: string | null
          dest_state?: string | null
          destination_country_code?: string
          destination_geog?: unknown
          destination_postal_code?: string | null
          destination_subdivision_code?: string | null
          destination_timezone?: string
          distance_km?: number | null
          final_price_amount?: number | null
          final_price_brl?: number | null
          goods_type_code?: string | null
          handling_requirements?: Json
          id?: string
          internal_reference?: string | null
          matched_carrier_id?: string | null
          matched_driver_id?: string | null
          matched_truck_id?: string | null
          notes?: string | null
          operation_scope?: string
          origin_city?: string | null
          origin_country_code?: string
          origin_geog?: unknown
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          origin_postal_code?: string | null
          origin_state?: string | null
          origin_subdivision_code?: string | null
          origin_timezone?: string
          pickup_date?: string | null
          pickup_window?: string | null
          published_at?: string | null
          regulatory_requirements?: Json
          required_truck?: Database["public"]["Enums"]["truck_type"][] | null
          requires_mopp?: boolean
          search_radius_km?: number
          status?: Database["public"]["Enums"]["freight_status"] | null
          steel_type?: Database["public"]["Enums"]["steel_type"] | null
          toll_included?: boolean
          updated_at?: string
          volume_m3?: number | null
          waypoints?: Json
          weight_tons?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "freights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freights_matched_carrier_id_fkey"
            columns: ["matched_carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          profile_id: string
          title: string | null
          type: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          profile_id: string
          title?: string | null
          type?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          profile_id?: string
          title?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_brl: number
          carrier_company_id: string
          carrier_payout_brl: number
          contract_id: string
          created_at: string
          escrow_held_at: string | null
          id: string
          platform_fee_brl: number
          released_at: string | null
          shipper_company_id: string
          status: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_brl: number
          carrier_company_id: string
          carrier_payout_brl: number
          contract_id: string
          created_at?: string
          escrow_held_at?: string | null
          id?: string
          platform_fee_brl: number
          released_at?: string | null
          shipper_company_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_brl?: number
          carrier_company_id?: string
          carrier_payout_brl?: number
          contract_id?: string
          created_at?: string
          escrow_held_at?: string | null
          id?: string
          platform_fee_brl?: number
          released_at?: string | null
          shipper_company_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          carrier_id: string | null
          country_code: string
          created_at: string
          created_by: string | null
          currency_code: string
          destination_subdivision_code: string | null
          effective_from: string
          effective_until: string | null
          goods_type_code: string | null
          id: string
          insurance_percentage: number
          is_active: boolean
          minimum_freight_amount: number | null
          origin_subdivision_code: string | null
          parameters: Json
          platform_fee_percentage: number
          priority: number
          rate_per_empty_km: number | null
          rate_per_loaded_km: number | null
          rate_per_ton: number | null
          risk_percentage: number
          truck_type: Database["public"]["Enums"]["truck_type"] | null
          updated_at: string
          version: number
          waiting_hour_amount: number | null
        }
        Insert: {
          carrier_id?: string | null
          country_code: string
          created_at?: string
          created_by?: string | null
          currency_code: string
          destination_subdivision_code?: string | null
          effective_from?: string
          effective_until?: string | null
          goods_type_code?: string | null
          id?: string
          insurance_percentage?: number
          is_active?: boolean
          minimum_freight_amount?: number | null
          origin_subdivision_code?: string | null
          parameters?: Json
          platform_fee_percentage?: number
          priority?: number
          rate_per_empty_km?: number | null
          rate_per_loaded_km?: number | null
          rate_per_ton?: number | null
          risk_percentage?: number
          truck_type?: Database["public"]["Enums"]["truck_type"] | null
          updated_at?: string
          version?: number
          waiting_hour_amount?: number | null
        }
        Update: {
          carrier_id?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          destination_subdivision_code?: string | null
          effective_from?: string
          effective_until?: string | null
          goods_type_code?: string | null
          id?: string
          insurance_percentage?: number
          is_active?: boolean
          minimum_freight_amount?: number | null
          origin_subdivision_code?: string | null
          parameters?: Json
          platform_fee_percentage?: number
          priority?: number
          rate_per_empty_km?: number | null
          rate_per_loaded_km?: number | null
          rate_per_ton?: number | null
          risk_percentage?: number
          truck_type?: Database["public"]["Enums"]["truck_type"] | null
          updated_at?: string
          version?: number
          waiting_hour_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cpf: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          is_onboarded: boolean
          is_verified: boolean | null
          language: string | null
          last_login_at: string | null
          phone: string | null
          preferences: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          is_onboarded?: boolean
          is_verified?: boolean | null
          language?: string | null
          last_login_at?: string | null
          phone?: string | null
          preferences?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          is_onboarded?: boolean
          is_verified?: boolean | null
          language?: string | null
          last_login_at?: string | null
          phone?: string | null
          preferences?: Json
          updated_at?: string
        }
        Relationships: []
      }
      route_estimates: {
        Row: {
          border_crossings: Json
          calculated_at: string
          capacity_availability_id: string | null
          currency_code: string
          duration_minutes: number | null
          empty_distance_km: number
          expires_at: string | null
          freight_id: string
          id: string
          loaded_distance_km: number
          provider: string
          provider_route_id: string | null
          route_payload: Json
          toll_amount: number
        }
        Insert: {
          border_crossings?: Json
          calculated_at?: string
          capacity_availability_id?: string | null
          currency_code: string
          duration_minutes?: number | null
          empty_distance_km?: number
          expires_at?: string | null
          freight_id: string
          id?: string
          loaded_distance_km: number
          provider?: string
          provider_route_id?: string | null
          route_payload?: Json
          toll_amount?: number
        }
        Update: {
          border_crossings?: Json
          calculated_at?: string
          capacity_availability_id?: string | null
          currency_code?: string
          duration_minutes?: number | null
          empty_distance_km?: number
          expires_at?: string | null
          freight_id?: string
          id?: string
          loaded_distance_km?: number
          provider?: string
          provider_route_id?: string | null
          route_payload?: Json
          toll_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_estimates_capacity_availability_id_fkey"
            columns: ["capacity_availability_id"]
            isOneToOne: false
            referencedRelation: "capacity_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_estimates_freight_id_fkey"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          acknowledged_at: string | null
          contract_id: string | null
          created_at: string | null
          description: string | null
          freight_id: string | null
          id: string
          lat: number | null
          lng: number | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["security_severity"] | null
          title: string | null
          type: Database["public"]["Enums"]["security_alert_type"] | null
        }
        Insert: {
          acknowledged_at?: string | null
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          freight_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["security_severity"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["security_alert_type"] | null
        }
        Update: {
          acknowledged_at?: string | null
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          freight_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["security_severity"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["security_alert_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "security_alerts_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_alerts_freight_id_fkey"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts_tracking: {
        Row: {
          alert_id: string
          driver_id: string
          id: string
          lat: number | null
          lng: number | null
          recorded_at: string
        }
        Insert: {
          alert_id: string
          driver_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          recorded_at?: string
        }
        Update: {
          alert_id?: string
          driver_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          recorded_at?: string
        }
        Relationships: []
      }
      trucks: {
        Row: {
          body_type: string | null
          brand: string | null
          capacity_tons: number | null
          carrier_id: string | null
          co2_per_km: number | null
          country_code: string
          created_at: string | null
          crlv_url: string | null
          fuel_type: string | null
          id: string
          is_active: boolean
          is_ev: boolean | null
          max_weight_tons: number | null
          model: string | null
          payload_tons: number | null
          plate: string | null
          registration_number: string | null
          regulatory_attributes: Json
          type: Database["public"]["Enums"]["truck_type"] | null
          updated_at: string
          volume_capacity_m3: number | null
          year: number | null
        }
        Insert: {
          body_type?: string | null
          brand?: string | null
          capacity_tons?: number | null
          carrier_id?: string | null
          co2_per_km?: number | null
          country_code?: string
          created_at?: string | null
          crlv_url?: string | null
          fuel_type?: string | null
          id?: string
          is_active?: boolean
          is_ev?: boolean | null
          max_weight_tons?: number | null
          model?: string | null
          payload_tons?: number | null
          plate?: string | null
          registration_number?: string | null
          regulatory_attributes?: Json
          type?: Database["public"]["Enums"]["truck_type"] | null
          updated_at?: string
          volume_capacity_m3?: number | null
          year?: number | null
        }
        Update: {
          body_type?: string | null
          brand?: string | null
          capacity_tons?: number | null
          carrier_id?: string | null
          co2_per_km?: number | null
          country_code?: string
          created_at?: string | null
          crlv_url?: string | null
          fuel_type?: string | null
          id?: string
          is_active?: boolean
          is_ev?: boolean | null
          max_weight_tons?: number | null
          model?: string | null
          payload_tons?: number | null
          plate?: string | null
          registration_number?: string | null
          regulatory_attributes?: Json
          type?: Database["public"]["Enums"]["truck_type"] | null
          updated_at?: string
          volume_capacity_m3?: number | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trucks_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_driver_invitation: {
        Args: {
          p_cpf: string
          p_license_country?: string
          p_license_number: string
          p_token: string
        }
        Returns: {
          carrier_id: string
          driver_id: string
          linked_at: string
        }[]
      }
      admin_set_profile_status: {
        Args: {
          p_is_active?: boolean
          p_is_verified?: boolean
          p_profile_id: string
        }
        Returns: {
          id: string
          is_active: boolean
          is_verified: boolean
        }[]
      }
      can_manage_capacity: {
        Args: { p_carrier_id: string; p_driver_id?: string }
        Returns: boolean
      }
      cancel_driver_carrier_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      complete_company_registration: { Args: never; Returns: Json }
      create_driver_invitation: {
        Args: {
          p_driver_id: string
          p_email?: string
          p_expires_in_hours?: number
          p_phone?: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          invitation_token: string
        }[]
      }
      ensure_driver_record: {
        Args: never
        Returns: {
          carrier_id: string
          id: string
          license_verification_status: string
          profile_id: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_current_user_company_member: {
        Args: { _company_id: string }
        Returns: boolean
      }
      is_current_user_company_owner: {
        Args: { _company_id: string }
        Returns: boolean
      }
      match_capacity_for_freight: {
        Args: {
          p_freight_id: string
          p_limit?: number
          p_location_max_age_minutes?: number
          p_max_radius_km?: number
        }
        Returns: {
          carrier_id: string
          distance_km: number
          eligibility_status: string
          match_id: string
          payload_tons: number
          pickup_eta_minutes: number
          radius_band_km: number
          total_score: number
          truck_type: Database["public"]["Enums"]["truck_type"]
        }[]
      }
      normalize_identity_document: {
        Args: { p_value: string }
        Returns: string
      }
      request_driver_carrier_link: {
        Args: {
          p_carrier_id: string
          p_cpf?: string
          p_license_category?: string
          p_license_country?: string
          p_license_expiry?: string
          p_license_number: string
          p_message?: string
        }
        Returns: {
          created_at: string
          request_id: string
          request_status: string
        }[]
      }
      review_driver_carrier_request: {
        Args: {
          p_decision: string
          p_driver_id?: string
          p_rejection_reason?: string
          p_request_id: string
        }
        Returns: {
          driver_id: string
          profile_id: string
          request_id: string
          request_status: string
        }[]
      }
      review_driver_license: {
        Args: { p_driver_id: string; p_reason?: string; p_status: string }
        Returns: {
          driver_id: string
          verification_status: string
          verified_at: string
        }[]
      }
      search_carriers_for_driver: {
        Args: { p_country_code?: string; p_limit?: number; p_query?: string }
        Returns: {
          carrier_id: string
          city: string
          company_name: string
          country_code: string
          subdivision: string
          trade_name: string
          verified: boolean
        }[]
      }
      set_capacity_available: {
        Args: {
          p_accepts_backhaul?: boolean
          p_accuracy_m?: number
          p_available_from?: string
          p_available_until?: string
          p_currency_code?: string
          p_driver_id: string
          p_lat: number
          p_lng: number
          p_max_pickup_radius_km?: number
          p_min_rate_per_loaded_km?: number
          p_min_total_amount?: number
          p_preferred_destination_countries?: string[]
          p_preferred_destination_subdivisions?: string[]
          p_truck_id: string
        }
        Returns: {
          availability_id: string
          availability_status: string
          available_from: string
          available_until: string
          location_updated_at: string
          max_pickup_radius_km: number
        }[]
      }
      set_capacity_status: {
        Args: { p_availability_id: string; p_status: string }
        Returns: {
          availability_id: string
          availability_status: string
          updated_at: string
        }[]
      }
      update_capacity_location: {
        Args: {
          p_accuracy_m?: number
          p_availability_id: string
          p_lat: number
          p_lng: number
        }
        Returns: {
          availability_id: string
          availability_status: string
          location_updated_at: string
        }[]
      }
    }
    Enums: {
      alert_severity: "low" | "medium" | "high" | "critical"
      alert_type:
        | "route_deviation"
        | "panic_button"
        | "checkpoint_missed"
        | "cargo_tamper"
        | "driver_id_mismatch"
        | "payment_dispute"
        | "contract_expiry"
      app_role: "shipper" | "carrier" | "driver" | "admin"
      badge_tier: "standard" | "silver" | "gold" | "platinum"
      bid_status: "pending" | "accepted" | "rejected" | "expired" | "withdrawn"
      checkpoint_type:
        | "origin_loading"
        | "waypoint"
        | "security_checkpoint"
        | "destination_unloading"
        | "incident"
      company_tier: "free" | "pro" | "enterprise"
      company_type:
        | "steel_company"
        | "distributor"
        | "industry"
        | "carrier_company"
      contract_status:
        | "draft"
        | "awaiting_shipper_signature"
        | "awaiting_carrier_signature"
        | "active"
        | "completed"
        | "disputed"
        | "cancelled"
      freight_category: "traditional" | "green_low_carbon" | "green_ev"
      freight_status:
        | "draft"
        | "published"
        | "bidding"
        | "matched"
        | "contract_pending"
        | "contracted"
        | "in_transit"
        | "delivered"
        | "completed"
        | "cancelled"
        | "disputed"
      payment_status:
        | "pending"
        | "escrow_held"
        | "released"
        | "refunded"
        | "disputed"
        | "failed"
      security_alert_type:
        | "route_deviation"
        | "panic_button"
        | "checkpoint_missed"
        | "cargo_tamper"
        | "driver_id_mismatch"
      security_severity: "low" | "medium" | "high" | "critical"
      steel_type:
        | "bobina_laminada_frio"
        | "bobina_laminada_quente"
        | "chapa_grossa"
        | "perfil_estrutural"
        | "cano_sem_costura"
        | "barra_redonda"
        | "vergalhao"
        | "tubo_galvanizado"
        | "blank_estampagem"
        | "outro"
      truck_type:
        | "truck_simples"
        | "toco"
        | "truck"
        | "bitruck"
        | "carreta"
        | "carreta_extendida"
        | "rodotrem"
        | "bitrem"
        | "ev_carreta"
        | "ev_truck"
      user_role: "shipper" | "carrier" | "driver" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      alert_severity: ["low", "medium", "high", "critical"],
      alert_type: [
        "route_deviation",
        "panic_button",
        "checkpoint_missed",
        "cargo_tamper",
        "driver_id_mismatch",
        "payment_dispute",
        "contract_expiry",
      ],
      app_role: ["shipper", "carrier", "driver", "admin"],
      badge_tier: ["standard", "silver", "gold", "platinum"],
      bid_status: ["pending", "accepted", "rejected", "expired", "withdrawn"],
      checkpoint_type: [
        "origin_loading",
        "waypoint",
        "security_checkpoint",
        "destination_unloading",
        "incident",
      ],
      company_tier: ["free", "pro", "enterprise"],
      company_type: [
        "steel_company",
        "distributor",
        "industry",
        "carrier_company",
      ],
      contract_status: [
        "draft",
        "awaiting_shipper_signature",
        "awaiting_carrier_signature",
        "active",
        "completed",
        "disputed",
        "cancelled",
      ],
      freight_category: ["traditional", "green_low_carbon", "green_ev"],
      freight_status: [
        "draft",
        "published",
        "bidding",
        "matched",
        "contract_pending",
        "contracted",
        "in_transit",
        "delivered",
        "completed",
        "cancelled",
        "disputed",
      ],
      payment_status: [
        "pending",
        "escrow_held",
        "released",
        "refunded",
        "disputed",
        "failed",
      ],
      security_alert_type: [
        "route_deviation",
        "panic_button",
        "checkpoint_missed",
        "cargo_tamper",
        "driver_id_mismatch",
      ],
      security_severity: ["low", "medium", "high", "critical"],
      steel_type: [
        "bobina_laminada_frio",
        "bobina_laminada_quente",
        "chapa_grossa",
        "perfil_estrutural",
        "cano_sem_costura",
        "barra_redonda",
        "vergalhao",
        "tubo_galvanizado",
        "blank_estampagem",
        "outro",
      ],
      truck_type: [
        "truck_simples",
        "toco",
        "truck",
        "bitruck",
        "carreta",
        "carreta_extendida",
        "rodotrem",
        "bitrem",
        "ev_carreta",
        "ev_truck",
      ],
      user_role: ["shipper", "carrier", "driver", "admin"],
    },
  },
} as const
