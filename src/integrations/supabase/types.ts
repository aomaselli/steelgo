export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          driver_record_id: string | null
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
          driver_record_id?: string | null
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
          driver_record_id?: string | null
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
            foreignKeyName: "bids_driver_record_id_fkey"
            columns: ["driver_record_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_driver_record_matches_profile"
            columns: ["driver_record_id", "driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id", "profile_id"]
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
      bulk_withdrawal_preview_items: {
        Row: {
          budget_amount_at_preview: number | null
          budget_brl_at_preview: number | null
          created_at: string
          freight_id: string
          id: string
          is_legacy_at_preview: boolean
          last_publication_event_id_at_preview: string | null
          preview_id: string
          published_at_at_preview: string | null
          status_at_preview: Database["public"]["Enums"]["freight_status"]
        }
        Insert: {
          budget_amount_at_preview?: number | null
          budget_brl_at_preview?: number | null
          created_at?: string
          freight_id: string
          id?: string
          is_legacy_at_preview: boolean
          last_publication_event_id_at_preview?: string | null
          preview_id: string
          published_at_at_preview?: string | null
          status_at_preview: Database["public"]["Enums"]["freight_status"]
        }
        Update: {
          budget_amount_at_preview?: number | null
          budget_brl_at_preview?: number | null
          created_at?: string
          freight_id?: string
          id?: string
          is_legacy_at_preview?: boolean
          last_publication_event_id_at_preview?: string | null
          preview_id?: string
          published_at_at_preview?: string | null
          status_at_preview?: Database["public"]["Enums"]["freight_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bulk_withdrawal_preview_items_freight_fk"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_withdrawal_preview_items_pointer_fk"
            columns: ["last_publication_event_id_at_preview", "freight_id"]
            isOneToOne: false
            referencedRelation: "freight_publication_events"
            referencedColumns: ["id", "freight_id"]
          },
          {
            foreignKeyName: "bulk_withdrawal_preview_items_preview_fk"
            columns: ["preview_id"]
            isOneToOne: false
            referencedRelation: "bulk_withdrawal_previews"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_withdrawal_previews: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          filter_reason: string
          filter_snapshot: Json | null
          id: string
          item_count: number
          legacy_count: number
          params_fingerprint: string
          request_id: string
          rpc_name: string
          scope_company_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          filter_reason: string
          filter_snapshot?: Json | null
          id?: string
          item_count: number
          legacy_count: number
          params_fingerprint: string
          request_id: string
          rpc_name: string
          scope_company_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          filter_reason?: string
          filter_snapshot?: Json | null
          id?: string
          item_count?: number
          legacy_count?: number
          params_fingerprint?: string
          request_id?: string
          rpc_name?: string
          scope_company_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_withdrawal_previews_company_fk"
            columns: ["scope_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          reserved_by_trip_id: string | null
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
          reserved_by_trip_id?: string | null
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
          reserved_by_trip_id?: string | null
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
            foreignKeyName: "capacity_availability_reserved_trip_fk"
            columns: ["reserved_by_trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
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
      cargo_dispositions: {
        Row: {
          admin_id: string
          created_at: string
          custodian_label: string | null
          disposition: Database["public"]["Enums"]["cargo_disposition"]
          event_id: string | null
          evidence: Json
          exception_id: string
          geog: unknown
          id: string
          is_emergency: boolean
          location_text: string | null
          note: string
          occurred_at: string
          reason: string
          request_id: string
          trip_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          custodian_label?: string | null
          disposition: Database["public"]["Enums"]["cargo_disposition"]
          event_id?: string | null
          evidence?: Json
          exception_id: string
          geog?: unknown
          id?: string
          is_emergency?: boolean
          location_text?: string | null
          note: string
          occurred_at: string
          reason: string
          request_id: string
          trip_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          custodian_label?: string | null
          disposition?: Database["public"]["Enums"]["cargo_disposition"]
          event_id?: string | null
          evidence?: Json
          exception_id?: string
          geog?: unknown
          id?: string
          is_emergency?: boolean
          location_text?: string | null
          note?: string
          occurred_at?: string
          reason?: string
          request_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargo_dispositions_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "trip_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargo_dispositions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
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
          operational_contact_email: string | null
          operational_contact_phone: string | null
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
          operational_contact_email?: string | null
          operational_contact_phone?: string | null
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
          operational_contact_email?: string | null
          operational_contact_phone?: string | null
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
      company_member_events: {
        Row: {
          actor_id: string | null
          after_role: string | null
          before_role: string | null
          company_id: string
          created_at: string
          event_type: string
          id: number
          member_id: string
          reason: string | null
          request_id: string | null
        }
        Insert: {
          actor_id?: string | null
          after_role?: string | null
          before_role?: string | null
          company_id: string
          created_at?: string
          event_type: string
          id?: never
          member_id: string
          reason?: string | null
          request_id?: string | null
        }
        Update: {
          actor_id?: string | null
          after_role?: string | null
          before_role?: string | null
          company_id?: string
          created_at?: string
          event_type?: string
          id?: never
          member_id?: string
          reason?: string | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_member_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_member_events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string | null
          id: string
          invite_expires_at: string | null
          invite_token_hash: string | null
          invited_at: string | null
          invited_by: string | null
          invited_email: string | null
          member_role: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_at?: string | null
          invited_by?: string | null
          invited_email?: string | null
          member_role?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_at?: string | null
          invited_by?: string | null
          invited_email?: string | null
          member_role?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
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
      contract_lifecycle_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          amount_brl: number | null
          contract_id: string
          created_at: string
          delivery_completed_at: string | null
          dispute_case_id: string | null
          escrow_confirmed_at: string | null
          id: string
          new_escrow_status: string
          new_status: Database["public"]["Enums"]["contract_status"]
          params_fingerprint: string
          payment_intent_id: string | null
          previous_escrow_status: string | null
          previous_event_id: string | null
          previous_status: Database["public"]["Enums"]["contract_status"] | null
          reason: string | null
          request_id: string
          rpc_name: string
          transition: Database["public"]["Enums"]["contract_lifecycle_transition"]
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          amount_brl?: number | null
          contract_id: string
          created_at?: string
          delivery_completed_at?: string | null
          dispute_case_id?: string | null
          escrow_confirmed_at?: string | null
          id?: string
          new_escrow_status: string
          new_status: Database["public"]["Enums"]["contract_status"]
          params_fingerprint: string
          payment_intent_id?: string | null
          previous_escrow_status?: string | null
          previous_event_id?: string | null
          previous_status?:
            | Database["public"]["Enums"]["contract_status"]
            | null
          reason?: string | null
          request_id: string
          rpc_name: string
          transition: Database["public"]["Enums"]["contract_lifecycle_transition"]
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          amount_brl?: number | null
          contract_id?: string
          created_at?: string
          delivery_completed_at?: string | null
          dispute_case_id?: string | null
          escrow_confirmed_at?: string | null
          id?: string
          new_escrow_status?: string
          new_status?: Database["public"]["Enums"]["contract_status"]
          params_fingerprint?: string
          payment_intent_id?: string | null
          previous_escrow_status?: string | null
          previous_event_id?: string | null
          previous_status?:
            | Database["public"]["Enums"]["contract_status"]
            | null
          reason?: string | null
          request_id?: string
          rpc_name?: string
          transition?: Database["public"]["Enums"]["contract_lifecycle_transition"]
        }
        Relationships: [
          {
            foreignKeyName: "contract_lifecycle_events_contract_fk"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_lifecycle_events_dispute_fk"
            columns: ["dispute_case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_lifecycle_events_intent_fk"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_lifecycle_events_previous_fk"
            columns: ["previous_event_id", "contract_id"]
            isOneToOne: false
            referencedRelation: "contract_lifecycle_events"
            referencedColumns: ["id", "contract_id"]
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
          completion_reason: string | null
          contract_number: string | null
          created_at: string | null
          delivery_completed_at: string | null
          delivery_completed_by: string | null
          driver_id: string | null
          escrow_external_ref: string | null
          escrow_held_at: string | null
          escrow_provider: string | null
          escrow_released_at: string | null
          escrow_status: string
          freight_id: string
          id: string
          last_lifecycle_event_id: string | null
          pdf_url: string | null
          pickup_window: string | null
          platform_fee_brl: number | null
          pricing_rule_id: string | null
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
          completion_reason?: string | null
          contract_number?: string | null
          created_at?: string | null
          delivery_completed_at?: string | null
          delivery_completed_by?: string | null
          driver_id?: string | null
          escrow_external_ref?: string | null
          escrow_held_at?: string | null
          escrow_provider?: string | null
          escrow_released_at?: string | null
          escrow_status?: string
          freight_id: string
          id?: string
          last_lifecycle_event_id?: string | null
          pdf_url?: string | null
          pickup_window?: string | null
          platform_fee_brl?: number | null
          pricing_rule_id?: string | null
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
          completion_reason?: string | null
          contract_number?: string | null
          created_at?: string | null
          delivery_completed_at?: string | null
          delivery_completed_by?: string | null
          driver_id?: string | null
          escrow_external_ref?: string | null
          escrow_held_at?: string | null
          escrow_provider?: string | null
          escrow_released_at?: string | null
          escrow_status?: string
          freight_id?: string
          id?: string
          last_lifecycle_event_id?: string | null
          pdf_url?: string | null
          pickup_window?: string | null
          platform_fee_brl?: number | null
          pricing_rule_id?: string | null
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
            foreignKeyName: "contracts_last_lifecycle_event_fk"
            columns: ["last_lifecycle_event_id", "id"]
            isOneToOne: false
            referencedRelation: "contract_lifecycle_events"
            referencedColumns: ["id", "contract_id"]
          },
          {
            foreignKeyName: "contracts_pricing_rule_fk"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
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
      dispute_allocations: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string
          decision_id: string
          id: string
          note: string | null
          party_kind: Database["public"]["Enums"]["payment_party_kind"]
          percentage: number | null
        }
        Insert: {
          amount: number
          company_id?: string | null
          created_at?: string
          decision_id: string
          id?: string
          note?: string | null
          party_kind: Database["public"]["Enums"]["payment_party_kind"]
          percentage?: number | null
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string
          decision_id?: string
          id?: string
          note?: string | null
          party_kind?: Database["public"]["Enums"]["payment_party_kind"]
          percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_allocations_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_allocations_decision_fk"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "dispute_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_cases: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          case_number: string
          closed_at: string | null
          closed_by: string | null
          contract_id: string
          created_at: string
          currency_code: string
          description: string
          disputed_amount: number
          due_at: string | null
          freight_id: string
          id: string
          last_event_id: string | null
          opened_at: string
          opened_by: string
          opened_by_role: Database["public"]["Enums"]["dispute_party_role"]
          payment_intent_id: string | null
          previous_contract_status: Database["public"]["Enums"]["contract_status"]
          priority: Database["public"]["Enums"]["dispute_priority"]
          reason_code: Database["public"]["Enums"]["dispute_reason_code"]
          settlement_due_at: string | null
          settlement_state: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          case_number: string
          closed_at?: string | null
          closed_by?: string | null
          contract_id: string
          created_at?: string
          currency_code: string
          description: string
          disputed_amount: number
          due_at?: string | null
          freight_id: string
          id?: string
          last_event_id?: string | null
          opened_at?: string
          opened_by: string
          opened_by_role: Database["public"]["Enums"]["dispute_party_role"]
          payment_intent_id?: string | null
          previous_contract_status: Database["public"]["Enums"]["contract_status"]
          priority?: Database["public"]["Enums"]["dispute_priority"]
          reason_code: Database["public"]["Enums"]["dispute_reason_code"]
          settlement_due_at?: string | null
          settlement_state?: string
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          case_number?: string
          closed_at?: string | null
          closed_by?: string | null
          contract_id?: string
          created_at?: string
          currency_code?: string
          description?: string
          disputed_amount?: number
          due_at?: string | null
          freight_id?: string
          id?: string
          last_event_id?: string | null
          opened_at?: string
          opened_by?: string
          opened_by_role?: Database["public"]["Enums"]["dispute_party_role"]
          payment_intent_id?: string | null
          previous_contract_status?: Database["public"]["Enums"]["contract_status"]
          priority?: Database["public"]["Enums"]["dispute_priority"]
          reason_code?: Database["public"]["Enums"]["dispute_reason_code"]
          settlement_due_at?: string | null
          settlement_state?: string
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_cases_contract_fk"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_cases_freight_fk"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_cases_intent_fk"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_cases_last_event_fk"
            columns: ["last_event_id", "id"]
            isOneToOne: false
            referencedRelation: "dispute_events"
            referencedColumns: ["id", "case_id"]
          },
        ]
      }
      dispute_claims: {
        Row: {
          case_id: string
          claimed_amount: number | null
          claimed_by: string
          claimed_by_role: Database["public"]["Enums"]["dispute_party_role"]
          created_at: string
          currency_code: string | null
          id: string
          reason_code: Database["public"]["Enums"]["dispute_reason_code"]
          statement: string
        }
        Insert: {
          case_id: string
          claimed_amount?: number | null
          claimed_by: string
          claimed_by_role: Database["public"]["Enums"]["dispute_party_role"]
          created_at?: string
          currency_code?: string | null
          id?: string
          reason_code: Database["public"]["Enums"]["dispute_reason_code"]
          statement: string
        }
        Update: {
          case_id?: string
          claimed_amount?: number | null
          claimed_by?: string
          claimed_by_role?: Database["public"]["Enums"]["dispute_party_role"]
          created_at?: string
          currency_code?: string | null
          id?: string
          reason_code?: Database["public"]["Enums"]["dispute_reason_code"]
          statement?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_claims_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_comments: {
        Row: {
          author_id: string
          author_role: Database["public"]["Enums"]["dispute_party_role"]
          body: string
          case_id: string
          created_at: string
          id: string
          visibility: string
        }
        Insert: {
          author_id: string
          author_role: Database["public"]["Enums"]["dispute_party_role"]
          body: string
          case_id: string
          created_at?: string
          id?: string
          visibility?: string
        }
        Update: {
          author_id?: string
          author_role?: Database["public"]["Enums"]["dispute_party_role"]
          body?: string
          case_id?: string
          created_at?: string
          id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_comments_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_decisions: {
        Row: {
          carrier_delta: number
          carrier_final: number
          case_id: string
          currency_code: string
          decided_amount: number
          decided_at: string
          decided_by: string
          gross_amount: number
          id: string
          is_current: boolean
          original_platform_fee: number
          outcome: Database["public"]["Enums"]["dispute_decision_outcome"]
          platform_delta: number
          platform_fee_final: number
          rationale: string
          release_amount: number
          shipper_amount: number
          supersedes_decision_id: string | null
        }
        Insert: {
          carrier_delta: number
          carrier_final: number
          case_id: string
          currency_code: string
          decided_amount: number
          decided_at?: string
          decided_by: string
          gross_amount: number
          id?: string
          is_current?: boolean
          original_platform_fee: number
          outcome: Database["public"]["Enums"]["dispute_decision_outcome"]
          platform_delta: number
          platform_fee_final: number
          rationale: string
          release_amount: number
          shipper_amount: number
          supersedes_decision_id?: string | null
        }
        Update: {
          carrier_delta?: number
          carrier_final?: number
          case_id?: string
          currency_code?: string
          decided_amount?: number
          decided_at?: string
          decided_by?: string
          gross_amount?: number
          id?: string
          is_current?: boolean
          original_platform_fee?: number
          outcome?: Database["public"]["Enums"]["dispute_decision_outcome"]
          platform_delta?: number
          platform_fee_final?: number
          rationale?: string
          release_amount?: number
          shipper_amount?: number
          supersedes_decision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_decisions_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_decisions_supersedes_fk"
            columns: ["supersedes_decision_id"]
            isOneToOne: false
            referencedRelation: "dispute_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          case_id: string
          claim_id: string | null
          created_at: string
          decision_id: string | null
          event_type: string
          evidence_id: string | null
          evidence_request_id: string | null
          id: string
          new_status: Database["public"]["Enums"]["dispute_status"]
          note: string | null
          params_fingerprint: string
          previous_event_id: string | null
          previous_status: Database["public"]["Enums"]["dispute_status"] | null
          recovery_id: string | null
          request_id: string
          rpc_name: string
          transaction_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          case_id: string
          claim_id?: string | null
          created_at?: string
          decision_id?: string | null
          event_type: string
          evidence_id?: string | null
          evidence_request_id?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["dispute_status"]
          note?: string | null
          params_fingerprint: string
          previous_event_id?: string | null
          previous_status?: Database["public"]["Enums"]["dispute_status"] | null
          recovery_id?: string | null
          request_id: string
          rpc_name: string
          transaction_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          case_id?: string
          claim_id?: string | null
          created_at?: string
          decision_id?: string | null
          event_type?: string
          evidence_id?: string | null
          evidence_request_id?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["dispute_status"]
          note?: string | null
          params_fingerprint?: string
          previous_event_id?: string | null
          previous_status?: Database["public"]["Enums"]["dispute_status"] | null
          recovery_id?: string | null
          request_id?: string
          rpc_name?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_events_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_events_claim_fk"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "dispute_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_events_decision_fk"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "dispute_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_events_evidence_fk"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "dispute_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_events_evidence_request_same_case_fk"
            columns: ["evidence_request_id", "case_id"]
            isOneToOne: false
            referencedRelation: "dispute_evidence_requests"
            referencedColumns: ["id", "case_id"]
          },
          {
            foreignKeyName: "dispute_events_previous_fk"
            columns: ["previous_event_id", "case_id"]
            isOneToOne: false
            referencedRelation: "dispute_events"
            referencedColumns: ["id", "case_id"]
          },
          {
            foreignKeyName: "dispute_events_recovery_fk"
            columns: ["recovery_id"]
            isOneToOne: false
            referencedRelation: "payment_recoveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_events_transaction_fk"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_evidence: {
        Row: {
          artifact_etag: string | null
          artifact_mime: string | null
          artifact_ref: string | null
          artifact_size_bytes: number | null
          case_id: string
          claim_id: string | null
          content_hash: string
          description: string
          evidence_request_id: string | null
          id: string
          kind: string
          submitted_at: string
          submitted_by: string
          submitted_by_role: Database["public"]["Enums"]["dispute_party_role"]
        }
        Insert: {
          artifact_etag?: string | null
          artifact_mime?: string | null
          artifact_ref?: string | null
          artifact_size_bytes?: number | null
          case_id: string
          claim_id?: string | null
          content_hash: string
          description: string
          evidence_request_id?: string | null
          id?: string
          kind: string
          submitted_at?: string
          submitted_by: string
          submitted_by_role: Database["public"]["Enums"]["dispute_party_role"]
        }
        Update: {
          artifact_etag?: string | null
          artifact_mime?: string | null
          artifact_ref?: string | null
          artifact_size_bytes?: number | null
          case_id?: string
          claim_id?: string | null
          content_hash?: string
          description?: string
          evidence_request_id?: string | null
          id?: string
          kind?: string
          submitted_at?: string
          submitted_by?: string
          submitted_by_role?: Database["public"]["Enums"]["dispute_party_role"]
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_claim_same_case_fk"
            columns: ["claim_id", "case_id"]
            isOneToOne: false
            referencedRelation: "dispute_claims"
            referencedColumns: ["id", "case_id"]
          },
          {
            foreignKeyName: "dispute_evidence_request_same_case_fk"
            columns: ["evidence_request_id", "case_id"]
            isOneToOne: false
            referencedRelation: "dispute_evidence_requests"
            referencedColumns: ["id", "case_id"]
          },
        ]
      }
      dispute_evidence_requests: {
        Row: {
          case_id: string
          created_at: string
          description: string
          due_at: string
          evidence_id: string | null
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          requested_by: string
          rpc_request_id: string
          status: string
          target_role: Database["public"]["Enums"]["dispute_party_role"]
          waive_note: string | null
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          description: string
          due_at: string
          evidence_id?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          requested_by: string
          rpc_request_id: string
          status?: string
          target_role: Database["public"]["Enums"]["dispute_party_role"]
          waive_note?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          description?: string
          due_at?: string
          evidence_id?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          requested_by?: string
          rpc_request_id?: string
          status?: string
          target_role?: Database["public"]["Enums"]["dispute_party_role"]
          waive_note?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_requests_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_requests_evidence_same_case_fk"
            columns: ["evidence_id", "case_id"]
            isOneToOne: false
            referencedRelation: "dispute_evidence"
            referencedColumns: ["id", "case_id"]
          },
        ]
      }
      dispute_parties: {
        Row: {
          added_at: string
          added_by: string
          case_id: string
          company_id: string | null
          id: string
          role: Database["public"]["Enums"]["dispute_party_role"]
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          case_id: string
          company_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["dispute_party_role"]
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          case_id?: string
          company_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["dispute_party_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_parties_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_parties_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      driver_verifications: {
        Row: {
          completed_at: string
          created_at: string
          decided_by: string
          decision: string | null
          driver_id: string
          expires_at: string | null
          id: string
          internal_reason_code: string | null
          provider: string
          provider_reference: string | null
          requested_at: string
          result_code: string | null
          rule_version: string | null
          status: string
          verification_type: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          decided_by?: string
          decision?: string | null
          driver_id: string
          expires_at?: string | null
          id?: string
          internal_reason_code?: string | null
          provider: string
          provider_reference?: string | null
          requested_at?: string
          result_code?: string | null
          rule_version?: string | null
          status: string
          verification_type: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          decided_by?: string
          decision?: string | null
          driver_id?: string
          expires_at?: string | null
          id?: string
          internal_reason_code?: string | null
          provider?: string
          provider_reference?: string | null
          requested_at?: string
          result_code?: string | null
          rule_version?: string | null
          status?: string
          verification_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_verifications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
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
          privacy_notice_acknowledged_at: string | null
          privacy_notice_sha256: string | null
          privacy_notice_version: string | null
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
          privacy_notice_acknowledged_at?: string | null
          privacy_notice_sha256?: string | null
          privacy_notice_version?: string | null
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
          privacy_notice_acknowledged_at?: string | null
          privacy_notice_sha256?: string | null
          privacy_notice_version?: string | null
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
      external_reconciliation: {
        Row: {
          currency_code: string
          expected_amount: number
          id: string
          intent_id: string
          observed_amount: number | null
          opened_at: string
          opened_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string
          statement_ref: string | null
          status: string
          transaction_id: string | null
        }
        Insert: {
          currency_code: string
          expected_amount: number
          id?: string
          intent_id: string
          observed_amount?: number | null
          opened_at?: string
          opened_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source: string
          statement_ref?: string | null
          status?: string
          transaction_id?: string | null
        }
        Update: {
          currency_code?: string
          expected_amount?: number
          id?: string
          intent_id?: string
          observed_amount?: number | null
          opened_at?: string
          opened_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string
          statement_ref?: string | null
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_reconciliation_intent_fk"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_reconciliation_transaction_fk"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      freight_offer_versions: {
        Row: {
          budget_amount: number | null
          budget_brl: number | null
          created_at: string
          created_by: string
          currency_code: string
          distance_km: number | null
          freight_id: string
          id: string
          offer_snapshot: Json
          params_fingerprint: string
          provenance: string
          request_id: string
          rpc_name: string
          snapshot_basis: string
          supersedes_offer_version_id: string | null
          value_basis: string
          weight_tons: number | null
        }
        Insert: {
          budget_amount?: number | null
          budget_brl?: number | null
          created_at?: string
          created_by: string
          currency_code: string
          distance_km?: number | null
          freight_id: string
          id?: string
          offer_snapshot: Json
          params_fingerprint: string
          provenance: string
          request_id: string
          rpc_name: string
          snapshot_basis: string
          supersedes_offer_version_id?: string | null
          value_basis: string
          weight_tons?: number | null
        }
        Update: {
          budget_amount?: number | null
          budget_brl?: number | null
          created_at?: string
          created_by?: string
          currency_code?: string
          distance_km?: number | null
          freight_id?: string
          id?: string
          offer_snapshot?: Json
          params_fingerprint?: string
          provenance?: string
          request_id?: string
          rpc_name?: string
          snapshot_basis?: string
          supersedes_offer_version_id?: string | null
          value_basis?: string
          weight_tons?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "freight_offer_versions_freight_fk"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_offer_versions_supersedes_fk"
            columns: ["supersedes_offer_version_id", "freight_id"]
            isOneToOne: false
            referencedRelation: "freight_offer_versions"
            referencedColumns: ["id", "freight_id"]
          },
        ]
      }
      freight_publication_events: {
        Row: {
          actor_company_id: string
          actor_id: string
          actor_was_admin: boolean
          bulk_withdrawal_preview_id: string | null
          created_at: string
          freight_id: string
          id: string
          new_budget_amount: number | null
          new_budget_brl: number | null
          new_final_price_amount: number | null
          new_final_price_brl: number | null
          new_matched_carrier_id: string | null
          new_matched_driver_id: string | null
          new_matched_truck_id: string | null
          new_published_at: string | null
          new_status: Database["public"]["Enums"]["freight_status"]
          offer_version_id: string | null
          params_fingerprint: string
          previous_budget_amount: number | null
          previous_budget_brl: number | null
          previous_event_id: string | null
          previous_final_price_amount: number | null
          previous_final_price_brl: number | null
          previous_matched_carrier_id: string | null
          previous_matched_driver_id: string | null
          previous_matched_truck_id: string | null
          previous_published_at: string | null
          previous_status: Database["public"]["Enums"]["freight_status"] | null
          reason: string | null
          request_id: string
          rpc_name: string
          source_bid_id: string | null
          transition: Database["public"]["Enums"]["freight_lifecycle_transition"]
        }
        Insert: {
          actor_company_id: string
          actor_id: string
          actor_was_admin: boolean
          bulk_withdrawal_preview_id?: string | null
          created_at?: string
          freight_id: string
          id?: string
          new_budget_amount?: number | null
          new_budget_brl?: number | null
          new_final_price_amount?: number | null
          new_final_price_brl?: number | null
          new_matched_carrier_id?: string | null
          new_matched_driver_id?: string | null
          new_matched_truck_id?: string | null
          new_published_at?: string | null
          new_status: Database["public"]["Enums"]["freight_status"]
          offer_version_id?: string | null
          params_fingerprint: string
          previous_budget_amount?: number | null
          previous_budget_brl?: number | null
          previous_event_id?: string | null
          previous_final_price_amount?: number | null
          previous_final_price_brl?: number | null
          previous_matched_carrier_id?: string | null
          previous_matched_driver_id?: string | null
          previous_matched_truck_id?: string | null
          previous_published_at?: string | null
          previous_status?: Database["public"]["Enums"]["freight_status"] | null
          reason?: string | null
          request_id: string
          rpc_name: string
          source_bid_id?: string | null
          transition: Database["public"]["Enums"]["freight_lifecycle_transition"]
        }
        Update: {
          actor_company_id?: string
          actor_id?: string
          actor_was_admin?: boolean
          bulk_withdrawal_preview_id?: string | null
          created_at?: string
          freight_id?: string
          id?: string
          new_budget_amount?: number | null
          new_budget_brl?: number | null
          new_final_price_amount?: number | null
          new_final_price_brl?: number | null
          new_matched_carrier_id?: string | null
          new_matched_driver_id?: string | null
          new_matched_truck_id?: string | null
          new_published_at?: string | null
          new_status?: Database["public"]["Enums"]["freight_status"]
          offer_version_id?: string | null
          params_fingerprint?: string
          previous_budget_amount?: number | null
          previous_budget_brl?: number | null
          previous_event_id?: string | null
          previous_final_price_amount?: number | null
          previous_final_price_brl?: number | null
          previous_matched_carrier_id?: string | null
          previous_matched_driver_id?: string | null
          previous_matched_truck_id?: string | null
          previous_published_at?: string | null
          previous_status?: Database["public"]["Enums"]["freight_status"] | null
          reason?: string | null
          request_id?: string
          rpc_name?: string
          source_bid_id?: string | null
          transition?: Database["public"]["Enums"]["freight_lifecycle_transition"]
        }
        Relationships: [
          {
            foreignKeyName: "freight_publication_events_actor_company_fk"
            columns: ["actor_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_publication_events_freight_fk"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_publication_events_offer_version_fk"
            columns: ["offer_version_id", "freight_id"]
            isOneToOne: false
            referencedRelation: "freight_offer_versions"
            referencedColumns: ["id", "freight_id"]
          },
          {
            foreignKeyName: "freight_publication_events_preview_fk"
            columns: ["bulk_withdrawal_preview_id"]
            isOneToOne: false
            referencedRelation: "bulk_withdrawal_previews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_publication_events_previous_fk"
            columns: ["previous_event_id", "freight_id"]
            isOneToOne: false
            referencedRelation: "freight_publication_events"
            referencedColumns: ["id", "freight_id"]
          },
          {
            foreignKeyName: "freight_publication_events_source_bid_fk"
            columns: ["source_bid_id"]
            isOneToOne: false
            referencedRelation: "bids"
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
          last_publication_event_id: string | null
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
          last_publication_event_id?: string | null
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
          last_publication_event_id?: string | null
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
            foreignKeyName: "freights_last_publication_event_fk"
            columns: ["last_publication_event_id", "id"]
            isOneToOne: false
            referencedRelation: "freight_publication_events"
            referencedColumns: ["id", "freight_id"]
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
          case_id: string | null
          contract_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          profile_id: string
          read_at: string | null
          title: string | null
          type: string | null
        }
        Insert: {
          body?: string | null
          case_id?: string | null
          contract_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          profile_id: string
          read_at?: string | null
          title?: string | null
          type?: string | null
        }
        Update: {
          body?: string | null
          case_id?: string | null
          contract_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          profile_id?: string
          read_at?: string | null
          title?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_contract_fk"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_alerts: {
        Row: {
          ack_note: string | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          close_reason: string | null
          closed_at: string | null
          created_at: string
          details: Json
          detected_at: string
          exception_id: string | null
          id: string
          kind: Database["public"]["Enums"]["trip_alert_kind"]
          last_evaluated_at: string
          policy_version: number
          severity: Database["public"]["Enums"]["trip_exception_severity"]
          status: string
          trip_id: string
        }
        Insert: {
          ack_note?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          details?: Json
          detected_at?: string
          exception_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["trip_alert_kind"]
          last_evaluated_at?: string
          policy_version: number
          severity: Database["public"]["Enums"]["trip_exception_severity"]
          status?: string
          trip_id: string
        }
        Update: {
          ack_note?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          close_reason?: string | null
          closed_at?: string | null
          created_at?: string
          details?: Json
          detected_at?: string
          exception_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["trip_alert_kind"]
          last_evaluated_at?: string
          policy_version?: number
          severity?: Database["public"]["Enums"]["trip_exception_severity"]
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_alerts_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "trip_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_alerts_policy_version_fkey"
            columns: ["policy_version"]
            isOneToOne: false
            referencedRelation: "operational_policies"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "operational_alerts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_flags: {
        Row: {
          key: string
          reason: string | null
          request_id: string | null
          updated_at: string
          updated_by: string | null
          value: boolean
        }
        Insert: {
          key: string
          reason?: string | null
          request_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value: boolean
        }
        Update: {
          key?: string
          reason?: string | null
          request_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: boolean
        }
        Relationships: []
      }
      operational_policies: {
        Row: {
          accuracy_primary_m: number
          accuracy_reject_m: number
          alert_ack_target_min: number
          clock_future_tolerance_min: number
          comm_loss_critical_min: number
          created_at: string
          created_by: string | null
          effective_from: string
          eta_fallback_speed_kmh: number
          eta_route_factor: number
          geofence_radius_m: number
          id: string
          impossible_speed_kmh: number
          legal_hold_tail_days: number
          location_batch_max_points: number
          location_flush_interval_s: number | null
          location_max_age_hours: number
          location_min_distance_m: number | null
          location_min_interval_s: number | null
          location_silence_min_stationary: number
          location_silence_min_transit: number
          location_stationary_interval_s: number | null
          long_stop_min: number
          moving_away_min_km: number
          no_progress_min: number
          raw_retention_days: number
          reason: string
          request_id: string | null
          sos_ack_target_min: number
          summary_retention_years: number
          version: number
        }
        Insert: {
          accuracy_primary_m: number
          accuracy_reject_m: number
          alert_ack_target_min: number
          clock_future_tolerance_min: number
          comm_loss_critical_min: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          eta_fallback_speed_kmh: number
          eta_route_factor: number
          geofence_radius_m: number
          id?: string
          impossible_speed_kmh: number
          legal_hold_tail_days: number
          location_batch_max_points: number
          location_flush_interval_s?: number | null
          location_max_age_hours: number
          location_min_distance_m?: number | null
          location_min_interval_s?: number | null
          location_silence_min_stationary: number
          location_silence_min_transit: number
          location_stationary_interval_s?: number | null
          long_stop_min: number
          moving_away_min_km: number
          no_progress_min: number
          raw_retention_days: number
          reason: string
          request_id?: string | null
          sos_ack_target_min: number
          summary_retention_years: number
          version: number
        }
        Update: {
          accuracy_primary_m?: number
          accuracy_reject_m?: number
          alert_ack_target_min?: number
          clock_future_tolerance_min?: number
          comm_loss_critical_min?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          eta_fallback_speed_kmh?: number
          eta_route_factor?: number
          geofence_radius_m?: number
          id?: string
          impossible_speed_kmh?: number
          legal_hold_tail_days?: number
          location_batch_max_points?: number
          location_flush_interval_s?: number | null
          location_max_age_hours?: number
          location_min_distance_m?: number | null
          location_min_interval_s?: number | null
          location_silence_min_stationary?: number
          location_silence_min_transit?: number
          location_stationary_interval_s?: number | null
          long_stop_min?: number
          moving_away_min_km?: number
          no_progress_min?: number
          raw_retention_days?: number
          reason?: string
          request_id?: string | null
          sos_ack_target_min?: number
          summary_retention_years?: number
          version?: number
        }
        Relationships: []
      }
      operational_trips: {
        Row: {
          attempt_number: number
          cancel_reason: string | null
          cancelled_at: string | null
          cargo_disposition:
            | Database["public"]["Enums"]["cargo_disposition"]
            | null
          cargo_disposition_at: string | null
          carrier_company_id: string
          completed_at: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_exception: boolean
          delivery_geog: unknown
          departed_pickup_at: string | null
          driver_id: string | null
          eta_at: string | null
          eta_basis: Json | null
          eta_source: string | null
          eta_updated_at: string | null
          freight_id: string
          has_open_critical_exception: boolean
          id: string
          last_event_id: string | null
          last_location_at: string | null
          last_location_geog: unknown
          legal_hold_reason: string | null
          legal_hold_until: string | null
          loaded_at: string | null
          paused_by_contract: boolean
          paused_by_exception_id: string | null
          pickup_geog: unknown
          planned_delivery_at: string | null
          planned_distance_km: number | null
          planned_pickup_at: string | null
          policy_version: number
          previous_status: Database["public"]["Enums"]["trip_status"] | null
          raw_locations_purged_at: string | null
          retention_until: string | null
          returned_at: string | null
          shipper_company_id: string
          status: Database["public"]["Enums"]["trip_status"]
          summary_retention_until: string | null
          terminal_reason: string | null
          tracking_state: string
          trip_number: string
          truck_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          attempt_number: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cargo_disposition?:
            | Database["public"]["Enums"]["cargo_disposition"]
            | null
          cargo_disposition_at?: string | null
          carrier_company_id: string
          completed_at?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_exception?: boolean
          delivery_geog?: unknown
          departed_pickup_at?: string | null
          driver_id?: string | null
          eta_at?: string | null
          eta_basis?: Json | null
          eta_source?: string | null
          eta_updated_at?: string | null
          freight_id: string
          has_open_critical_exception?: boolean
          id?: string
          last_event_id?: string | null
          last_location_at?: string | null
          last_location_geog?: unknown
          legal_hold_reason?: string | null
          legal_hold_until?: string | null
          loaded_at?: string | null
          paused_by_contract?: boolean
          paused_by_exception_id?: string | null
          pickup_geog?: unknown
          planned_delivery_at?: string | null
          planned_distance_km?: number | null
          planned_pickup_at?: string | null
          policy_version: number
          previous_status?: Database["public"]["Enums"]["trip_status"] | null
          raw_locations_purged_at?: string | null
          retention_until?: string | null
          returned_at?: string | null
          shipper_company_id: string
          status?: Database["public"]["Enums"]["trip_status"]
          summary_retention_until?: string | null
          terminal_reason?: string | null
          tracking_state?: string
          trip_number: string
          truck_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          attempt_number?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cargo_disposition?:
            | Database["public"]["Enums"]["cargo_disposition"]
            | null
          cargo_disposition_at?: string | null
          carrier_company_id?: string
          completed_at?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_exception?: boolean
          delivery_geog?: unknown
          departed_pickup_at?: string | null
          driver_id?: string | null
          eta_at?: string | null
          eta_basis?: Json | null
          eta_source?: string | null
          eta_updated_at?: string | null
          freight_id?: string
          has_open_critical_exception?: boolean
          id?: string
          last_event_id?: string | null
          last_location_at?: string | null
          last_location_geog?: unknown
          legal_hold_reason?: string | null
          legal_hold_until?: string | null
          loaded_at?: string | null
          paused_by_contract?: boolean
          paused_by_exception_id?: string | null
          pickup_geog?: unknown
          planned_delivery_at?: string | null
          planned_distance_km?: number | null
          planned_pickup_at?: string | null
          policy_version?: number
          previous_status?: Database["public"]["Enums"]["trip_status"] | null
          raw_locations_purged_at?: string | null
          retention_until?: string | null
          returned_at?: string | null
          shipper_company_id?: string
          status?: Database["public"]["Enums"]["trip_status"]
          summary_retention_until?: string | null
          terminal_reason?: string | null
          tracking_state?: string
          trip_number?: string
          truck_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_trips_carrier_company_id_fkey"
            columns: ["carrier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_trips_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_trips_freight_id_fkey"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_trips_last_event_fk"
            columns: ["last_event_id", "id"]
            isOneToOne: false
            referencedRelation: "trip_events"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "operational_trips_paused_exception_fk"
            columns: ["paused_by_exception_id"]
            isOneToOne: false
            referencedRelation: "trip_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_trips_policy_version_fkey"
            columns: ["policy_version"]
            isOneToOne: false
            referencedRelation: "operational_policies"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "operational_trips_shipper_company_id_fkey"
            columns: ["shipper_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_trips_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          account_kind: string
          company_id: string
          created_at: string
          created_by: string | null
          external_account_ref: string | null
          id: string
          provider_code: string
          status: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          account_kind: string
          company_id: string
          created_at?: string
          created_by?: string | null
          external_account_ref?: string | null
          id?: string
          provider_code: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          account_kind?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          external_account_ref?: string | null
          id?: string
          provider_code?: string
          status?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_accounts_provider_fk"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          company_id: string | null
          created_at: string
          id: string
          note: string | null
          party_kind: Database["public"]["Enums"]["payment_party_kind"]
          transaction_id: string
        }
        Insert: {
          amount: number
          company_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          party_kind: Database["public"]["Enums"]["payment_party_kind"]
          transaction_id: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          party_kind?: Database["public"]["Enums"]["payment_party_kind"]
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_transaction_fk"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          amount: number | null
          confirmation_method:
            | Database["public"]["Enums"]["payment_confirmation_method"]
            | null
          created_at: string
          currency_code: string | null
          event_type: string
          external_reference: string | null
          failure_code: string | null
          failure_reason: string | null
          id: string
          intent_id: string
          new_status: Database["public"]["Enums"]["payment_internal_status"]
          note: string | null
          params_fingerprint: string
          previous_event_id: string | null
          previous_status:
            | Database["public"]["Enums"]["payment_internal_status"]
            | null
          request_id: string
          rpc_name: string
          source: string
          transaction_id: string | null
          webhook_event_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          amount?: number | null
          confirmation_method?:
            | Database["public"]["Enums"]["payment_confirmation_method"]
            | null
          created_at?: string
          currency_code?: string | null
          event_type: string
          external_reference?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          intent_id: string
          new_status: Database["public"]["Enums"]["payment_internal_status"]
          note?: string | null
          params_fingerprint: string
          previous_event_id?: string | null
          previous_status?:
            | Database["public"]["Enums"]["payment_internal_status"]
            | null
          request_id: string
          rpc_name: string
          source: string
          transaction_id?: string | null
          webhook_event_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          amount?: number | null
          confirmation_method?:
            | Database["public"]["Enums"]["payment_confirmation_method"]
            | null
          created_at?: string
          currency_code?: string | null
          event_type?: string
          external_reference?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          intent_id?: string
          new_status?: Database["public"]["Enums"]["payment_internal_status"]
          note?: string | null
          params_fingerprint?: string
          previous_event_id?: string | null
          previous_status?:
            | Database["public"]["Enums"]["payment_internal_status"]
            | null
          request_id?: string
          rpc_name?: string
          source?: string
          transaction_id?: string | null
          webhook_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_intent_fk"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_previous_fk"
            columns: ["previous_event_id", "intent_id"]
            isOneToOne: false
            referencedRelation: "payment_events"
            referencedColumns: ["id", "intent_id"]
          },
          {
            foreignKeyName: "payment_events_transaction_fk"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          carrier_net_amount: number
          contract_id: string
          created_at: string
          currency_code: string
          external_reference: string | null
          external_status: string | null
          failure_code: string | null
          failure_reason: string | null
          funding_confirmed_at: string | null
          gross_amount: number
          id: string
          internal_status: Database["public"]["Enums"]["payment_internal_status"]
          last_event_id: string | null
          platform_fee_amount: number
          pricing_rule_id: string | null
          provider_code: string
          reconciled_at: string | null
          reconciled_by: string | null
          release_blocked_by_dispute: boolean
          release_requested_at: string | null
          release_requested_by: string | null
          released_confirmed_at: string | null
          requested_at: string | null
          requested_by: string | null
          settled_at: string | null
          settlement_decision_id: string | null
          settlement_funding_amount: number | null
          settlement_refund_amount: number | null
          settlement_release_amount: number | null
          updated_at: string
        }
        Insert: {
          carrier_net_amount: number
          contract_id: string
          created_at?: string
          currency_code: string
          external_reference?: string | null
          external_status?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          funding_confirmed_at?: string | null
          gross_amount: number
          id?: string
          internal_status?: Database["public"]["Enums"]["payment_internal_status"]
          last_event_id?: string | null
          platform_fee_amount: number
          pricing_rule_id?: string | null
          provider_code: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          release_blocked_by_dispute?: boolean
          release_requested_at?: string | null
          release_requested_by?: string | null
          released_confirmed_at?: string | null
          requested_at?: string | null
          requested_by?: string | null
          settled_at?: string | null
          settlement_decision_id?: string | null
          settlement_funding_amount?: number | null
          settlement_refund_amount?: number | null
          settlement_release_amount?: number | null
          updated_at?: string
        }
        Update: {
          carrier_net_amount?: number
          contract_id?: string
          created_at?: string
          currency_code?: string
          external_reference?: string | null
          external_status?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          funding_confirmed_at?: string | null
          gross_amount?: number
          id?: string
          internal_status?: Database["public"]["Enums"]["payment_internal_status"]
          last_event_id?: string | null
          platform_fee_amount?: number
          pricing_rule_id?: string | null
          provider_code?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          release_blocked_by_dispute?: boolean
          release_requested_at?: string | null
          release_requested_by?: string | null
          released_confirmed_at?: string | null
          requested_at?: string | null
          requested_by?: string | null
          settled_at?: string | null
          settlement_decision_id?: string | null
          settlement_funding_amount?: number | null
          settlement_refund_amount?: number | null
          settlement_release_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_contract_fk"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_last_event_fk"
            columns: ["last_event_id", "id"]
            isOneToOne: false
            referencedRelation: "payment_events"
            referencedColumns: ["id", "intent_id"]
          },
          {
            foreignKeyName: "payment_intents_pricing_rule_fk"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_provider_fk"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payment_intents_settlement_decision_fk"
            columns: ["settlement_decision_id"]
            isOneToOne: false
            referencedRelation: "dispute_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          adapter_kind: string
          capabilities: Json
          code: string
          created_at: string
          display_name: string
          is_active: boolean
          notes: string | null
        }
        Insert: {
          adapter_kind: string
          capabilities?: Json
          code: string
          created_at?: string
          display_name: string
          is_active?: boolean
          notes?: string | null
        }
        Update: {
          adapter_kind?: string
          capabilities?: Json
          code?: string
          created_at?: string
          display_name?: string
          is_active?: boolean
          notes?: string | null
        }
        Relationships: []
      }
      payment_recoveries: {
        Row: {
          case_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          creditor_company_id: string
          currency_code: string
          debtor_company_id: string | null
          debtor_kind: string
          dispute_decision_id: string
          evidence_etag: string | null
          evidence_hash: string | null
          evidence_mime: string | null
          evidence_ref: string | null
          evidence_size_bytes: number | null
          expected_amount: number
          external_reference: string | null
          id: string
          intent_id: string
          note: string | null
          registered_at: string
          registered_by: string
          status: string
          write_off_note: string | null
          written_off_at: string | null
          written_off_by: string | null
        }
        Insert: {
          case_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          creditor_company_id: string
          currency_code: string
          debtor_company_id?: string | null
          debtor_kind: string
          dispute_decision_id: string
          evidence_etag?: string | null
          evidence_hash?: string | null
          evidence_mime?: string | null
          evidence_ref?: string | null
          evidence_size_bytes?: number | null
          expected_amount: number
          external_reference?: string | null
          id?: string
          intent_id: string
          note?: string | null
          registered_at?: string
          registered_by: string
          status?: string
          write_off_note?: string | null
          written_off_at?: string | null
          written_off_by?: string | null
        }
        Update: {
          case_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          creditor_company_id?: string
          currency_code?: string
          debtor_company_id?: string | null
          debtor_kind?: string
          dispute_decision_id?: string
          evidence_etag?: string | null
          evidence_hash?: string | null
          evidence_mime?: string | null
          evidence_ref?: string | null
          evidence_size_bytes?: number | null
          expected_amount?: number
          external_reference?: string | null
          id?: string
          intent_id?: string
          note?: string | null
          registered_at?: string
          registered_by?: string
          status?: string
          write_off_note?: string | null
          written_off_at?: string | null
          written_off_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_recoveries_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recoveries_creditor_company_fk"
            columns: ["creditor_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recoveries_debtor_company_fk"
            columns: ["debtor_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recoveries_decision_fk"
            columns: ["dispute_decision_id"]
            isOneToOne: false
            referencedRelation: "dispute_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recoveries_intent_fk"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          confirmation_evidence_etag: string | null
          confirmation_evidence_hash: string | null
          confirmation_evidence_mime: string | null
          confirmation_evidence_ref: string | null
          confirmation_evidence_size_bytes: number | null
          confirmation_method:
            | Database["public"]["Enums"]["payment_confirmation_method"]
            | null
          confirmation_note: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency_code: string
          dispute_decision_id: string | null
          external_reference: string | null
          external_status: string | null
          failure_code: string | null
          failure_reason: string | null
          id: string
          idempotency_key: string
          intent_id: string
          kind: Database["public"]["Enums"]["payment_transaction_kind"]
          provider_code: string
          requested_at: string
          requested_by: string | null
          status: Database["public"]["Enums"]["payment_transaction_status"]
        }
        Insert: {
          amount: number
          confirmation_evidence_etag?: string | null
          confirmation_evidence_hash?: string | null
          confirmation_evidence_mime?: string | null
          confirmation_evidence_ref?: string | null
          confirmation_evidence_size_bytes?: number | null
          confirmation_method?:
            | Database["public"]["Enums"]["payment_confirmation_method"]
            | null
          confirmation_note?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency_code: string
          dispute_decision_id?: string | null
          external_reference?: string | null
          external_status?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          intent_id: string
          kind: Database["public"]["Enums"]["payment_transaction_kind"]
          provider_code: string
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["payment_transaction_status"]
        }
        Update: {
          amount?: number
          confirmation_evidence_etag?: string | null
          confirmation_evidence_hash?: string | null
          confirmation_evidence_mime?: string | null
          confirmation_evidence_ref?: string | null
          confirmation_evidence_size_bytes?: number | null
          confirmation_method?:
            | Database["public"]["Enums"]["payment_confirmation_method"]
            | null
          confirmation_note?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency_code?: string
          dispute_decision_id?: string | null
          external_reference?: string | null
          external_status?: string | null
          failure_code?: string | null
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          intent_id?: string
          kind?: Database["public"]["Enums"]["payment_transaction_kind"]
          provider_code?: string
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["payment_transaction_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_dispute_decision_fk"
            columns: ["dispute_decision_id"]
            isOneToOne: false
            referencedRelation: "dispute_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_intent_fk"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_provider_fk"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["code"]
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
      pricing_rule_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          carrier_id: string | null
          country_code: string
          created_at: string
          currency_code: string
          effective_from: string
          effective_until: string | null
          event_type: string
          fee_percentage: number
          id: string
          is_active: boolean
          params_fingerprint: string
          previous_rule_id: string | null
          pricing_rule_id: string
          reason: string | null
          request_id: string
          rpc_name: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          carrier_id?: string | null
          country_code: string
          created_at?: string
          currency_code: string
          effective_from: string
          effective_until?: string | null
          event_type: string
          fee_percentage: number
          id?: string
          is_active: boolean
          params_fingerprint: string
          previous_rule_id?: string | null
          pricing_rule_id: string
          reason?: string | null
          request_id: string
          rpc_name: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          carrier_id?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          effective_from?: string
          effective_until?: string | null
          event_type?: string
          fee_percentage?: number
          id?: string
          is_active?: boolean
          params_fingerprint?: string
          previous_rule_id?: string | null
          pricing_rule_id?: string
          reason?: string | null
          request_id?: string
          rpc_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rule_events_previous_fk"
            columns: ["previous_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rule_events_rule_fk"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          carrier_id: string | null
          change_reason: string | null
          closed_at: string | null
          closed_by_admin: string | null
          country_code: string
          created_at: string
          created_by: string | null
          created_by_admin: string | null
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
          supersedes_id: string | null
          truck_type: Database["public"]["Enums"]["truck_type"] | null
          updated_at: string
          version: number
          waiting_hour_amount: number | null
        }
        Insert: {
          carrier_id?: string | null
          change_reason?: string | null
          closed_at?: string | null
          closed_by_admin?: string | null
          country_code: string
          created_at?: string
          created_by?: string | null
          created_by_admin?: string | null
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
          supersedes_id?: string | null
          truck_type?: Database["public"]["Enums"]["truck_type"] | null
          updated_at?: string
          version?: number
          waiting_hour_amount?: number | null
        }
        Update: {
          carrier_id?: string | null
          change_reason?: string | null
          closed_at?: string | null
          closed_by_admin?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          created_by_admin?: string | null
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
          supersedes_id?: string | null
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
          {
            foreignKeyName: "pricing_rules_supersedes_fk"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_notices: {
        Row: {
          body_md: string
          body_sha256: string
          effective_from: string
          id: string
          legal_basis: string
          published_at: string
          published_by: string
          request_id: string
          url: string | null
          version: string
        }
        Insert: {
          body_md: string
          body_sha256: string
          effective_from: string
          id?: string
          legal_basis?: string
          published_at?: string
          published_by: string
          request_id: string
          url?: string | null
          version: string
        }
        Update: {
          body_md?: string
          body_sha256?: string
          effective_from?: string
          id?: string
          legal_basis?: string
          published_at?: string
          published_by?: string
          request_id?: string
          url?: string | null
          version?: string
        }
        Relationships: []
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
      proof_of_delivery: {
        Row: {
          accuracy_m: number | null
          checkpoint_id: string | null
          command_id: string | null
          created_at: string
          delivered_at: string
          derived_from_attempt_id: string | null
          device_id: string | null
          event_id: string | null
          geofence_override_reason: string | null
          geog: unknown
          id: string
          inside_geofence: boolean
          is_current: boolean
          notes: string | null
          outcome: Database["public"]["Enums"]["pod_outcome"]
          photos: Json
          quantity_declared: number | null
          quantity_received: number | null
          received_at: string
          receiver_document_kind: string | null
          receiver_document_last4: string | null
          receiver_name: string
          request_id: string | null
          signature_object_path: string | null
          signature_sha256: string | null
          submitted_by: string
          submitted_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          supersede_reason: string | null
          superseded_at: string | null
          superseded_by: string | null
          supersedes_id: string | null
          trip_id: string
          version: number
        }
        Insert: {
          accuracy_m?: number | null
          checkpoint_id?: string | null
          command_id?: string | null
          created_at?: string
          delivered_at: string
          derived_from_attempt_id?: string | null
          device_id?: string | null
          event_id?: string | null
          geofence_override_reason?: string | null
          geog?: unknown
          id?: string
          inside_geofence: boolean
          is_current?: boolean
          notes?: string | null
          outcome: Database["public"]["Enums"]["pod_outcome"]
          photos: Json
          quantity_declared?: number | null
          quantity_received?: number | null
          received_at?: string
          receiver_document_kind?: string | null
          receiver_document_last4?: string | null
          receiver_name: string
          request_id?: string | null
          signature_object_path?: string | null
          signature_sha256?: string | null
          submitted_by: string
          submitted_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          supersede_reason?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          supersedes_id?: string | null
          trip_id: string
          version: number
        }
        Update: {
          accuracy_m?: number | null
          checkpoint_id?: string | null
          command_id?: string | null
          created_at?: string
          delivered_at?: string
          derived_from_attempt_id?: string | null
          device_id?: string | null
          event_id?: string | null
          geofence_override_reason?: string | null
          geog?: unknown
          id?: string
          inside_geofence?: boolean
          is_current?: boolean
          notes?: string | null
          outcome?: Database["public"]["Enums"]["pod_outcome"]
          photos?: Json
          quantity_declared?: number | null
          quantity_received?: number | null
          received_at?: string
          receiver_document_kind?: string | null
          receiver_document_last4?: string | null
          receiver_name?: string
          request_id?: string | null
          signature_object_path?: string | null
          signature_sha256?: string | null
          submitted_by?: string
          submitted_by_kind?: Database["public"]["Enums"]["trip_actor_kind"]
          supersede_reason?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          supersedes_id?: string | null
          trip_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pod_derived_fk"
            columns: ["derived_from_attempt_id"]
            isOneToOne: false
            referencedRelation: "proof_of_delivery_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "trip_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "proof_of_delivery"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      proof_of_delivery_attempts: {
        Row: {
          accuracy_m: number | null
          attempt_seq: number
          captured_at: string
          command_id: string | null
          created_at: string
          device_id: string | null
          event_id: string | null
          exception_id: string | null
          geofence_override_reason: string | null
          geog: unknown
          id: string
          inside_geofence: boolean
          notes: string
          outcome: Database["public"]["Enums"]["pod_outcome"]
          photos: Json
          quantity_declared: number | null
          quantity_received: number | null
          received_at: string
          receiver_document_kind: string | null
          receiver_document_last4: string | null
          receiver_name: string | null
          signature_object_path: string | null
          signature_sha256: string | null
          submitted_by: string
          trip_id: string
        }
        Insert: {
          accuracy_m?: number | null
          attempt_seq: number
          captured_at: string
          command_id?: string | null
          created_at?: string
          device_id?: string | null
          event_id?: string | null
          exception_id?: string | null
          geofence_override_reason?: string | null
          geog?: unknown
          id?: string
          inside_geofence: boolean
          notes: string
          outcome: Database["public"]["Enums"]["pod_outcome"]
          photos: Json
          quantity_declared?: number | null
          quantity_received?: number | null
          received_at?: string
          receiver_document_kind?: string | null
          receiver_document_last4?: string | null
          receiver_name?: string | null
          signature_object_path?: string | null
          signature_sha256?: string | null
          submitted_by: string
          trip_id: string
        }
        Update: {
          accuracy_m?: number | null
          attempt_seq?: number
          captured_at?: string
          command_id?: string | null
          created_at?: string
          device_id?: string | null
          event_id?: string | null
          exception_id?: string | null
          geofence_override_reason?: string | null
          geog?: unknown
          id?: string
          inside_geofence?: boolean
          notes?: string
          outcome?: Database["public"]["Enums"]["pod_outcome"]
          photos?: Json
          quantity_declared?: number | null
          quantity_received?: number | null
          received_at?: string
          receiver_document_kind?: string | null
          receiver_document_last4?: string | null
          receiver_name?: string | null
          signature_object_path?: string | null
          signature_sha256?: string | null
          submitted_by?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pod_attempts_exception_fk"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "trip_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_of_delivery_attempts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_webhook_conflicts: {
        Row: {
          detected_at: string
          existing_digest: string
          existing_event_id: string
          external_event_id: string
          id: string
          incoming_amount: number | null
          incoming_digest: string
          incoming_event_type: string | null
          incoming_occurred_at: string | null
          provider_code: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signature_verified: boolean
        }
        Insert: {
          detected_at?: string
          existing_digest: string
          existing_event_id: string
          external_event_id: string
          id?: string
          incoming_amount?: number | null
          incoming_digest: string
          incoming_event_type?: string | null
          incoming_occurred_at?: string | null
          provider_code: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signature_verified: boolean
        }
        Update: {
          detected_at?: string
          existing_digest?: string
          existing_event_id?: string
          external_event_id?: string
          id?: string
          incoming_amount?: number | null
          incoming_digest?: string
          incoming_event_type?: string | null
          incoming_occurred_at?: string | null
          provider_code?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "provider_webhook_conflicts_existing_fk"
            columns: ["existing_event_id"]
            isOneToOne: false
            referencedRelation: "provider_webhook_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_webhook_conflicts_provider_fk"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      provider_webhook_events: {
        Row: {
          amount: number | null
          currency_code: string | null
          event_type: string
          external_event_id: string
          external_reference: string | null
          id: string
          intent_id: string | null
          internal_seq: number
          occurred_at: string
          payload_digest: string
          processed_at: string | null
          processing_note: string | null
          processing_outcome: string | null
          provider_code: string
          provider_sequence: number | null
          received_at: string
          signature_algorithm: string | null
          signature_key_id: string | null
          signature_verified: boolean
        }
        Insert: {
          amount?: number | null
          currency_code?: string | null
          event_type: string
          external_event_id: string
          external_reference?: string | null
          id?: string
          intent_id?: string | null
          internal_seq?: never
          occurred_at: string
          payload_digest: string
          processed_at?: string | null
          processing_note?: string | null
          processing_outcome?: string | null
          provider_code: string
          provider_sequence?: number | null
          received_at?: string
          signature_algorithm?: string | null
          signature_key_id?: string | null
          signature_verified: boolean
        }
        Update: {
          amount?: number | null
          currency_code?: string | null
          event_type?: string
          external_event_id?: string
          external_reference?: string | null
          id?: string
          intent_id?: string | null
          internal_seq?: never
          occurred_at?: string
          payload_digest?: string
          processed_at?: string | null
          processing_note?: string | null
          processing_outcome?: string | null
          provider_code?: string
          provider_sequence?: number | null
          received_at?: string
          signature_algorithm?: string | null
          signature_key_id?: string | null
          signature_verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "provider_webhook_events_intent_fk"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_webhook_events_provider_fk"
            columns: ["provider_code"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["code"]
          },
        ]
      }
      push_devices: {
        Row: {
          app_version: string | null
          build: string | null
          device_id: string
          id: string
          last_seen_at: string
          platform: string
          profile_id: string
          registered_at: string
          revoke_reason: string | null
          revoked_at: string | null
          token: string
        }
        Insert: {
          app_version?: string | null
          build?: string | null
          device_id: string
          id?: string
          last_seen_at?: string
          platform: string
          profile_id: string
          registered_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          token: string
        }
        Update: {
          app_version?: string | null
          build?: string | null
          device_id?: string
          id?: string
          last_seen_at?: string
          platform?: string
          profile_id?: string
          registered_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          token?: string
        }
        Relationships: []
      }
      push_dispatch_nonces: {
        Row: {
          nonce: string
          seen_at: string
          ts: number
        }
        Insert: {
          nonce: string
          seen_at?: string
          ts: number
        }
        Update: {
          nonce?: string
          seen_at?: string
          ts?: number
        }
        Relationships: []
      }
      push_homologation: {
        Row: {
          acked_by: string | null
          app_version: string | null
          build: string | null
          device_received_at: string | null
          error: string | null
          expires_at: string
          fcm_accepted_at: string | null
          id: string
          nonce: string
          outbox_id: number | null
          platform: string
          profile_id: string
          push_device_id: string
          requested_at: string
          requested_by: string
          status: string
        }
        Insert: {
          acked_by?: string | null
          app_version?: string | null
          build?: string | null
          device_received_at?: string | null
          error?: string | null
          expires_at: string
          fcm_accepted_at?: string | null
          id?: string
          nonce: string
          outbox_id?: number | null
          platform: string
          profile_id: string
          push_device_id: string
          requested_at?: string
          requested_by: string
          status?: string
        }
        Update: {
          acked_by?: string | null
          app_version?: string | null
          build?: string | null
          device_received_at?: string | null
          error?: string | null
          expires_at?: string
          fcm_accepted_at?: string | null
          id?: string
          nonce?: string
          outbox_id?: number | null
          platform?: string
          profile_id?: string
          push_device_id?: string
          requested_at?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_homologation_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "push_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_homologation_push_device_id_fkey"
            columns: ["push_device_id"]
            isOneToOne: false
            referencedRelation: "push_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      push_outbox: {
        Row: {
          attempts: number
          body: string
          created_at: string
          data: Json
          fcm_accepted_at: string | null
          fcm_message_ids: Json
          id: number
          idempotency_key: string
          kind: string
          last_error: string | null
          lease_expires_at: string | null
          lease_token: string | null
          max_attempts: number
          next_attempt_at: string
          priority: string
          profile_id: string
          sent_at: string | null
          status: string
          title: string
          trip_id: string | null
        }
        Insert: {
          attempts?: number
          body: string
          created_at?: string
          data?: Json
          fcm_accepted_at?: string | null
          fcm_message_ids?: Json
          id?: never
          idempotency_key: string
          kind: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          max_attempts?: number
          next_attempt_at?: string
          priority?: string
          profile_id: string
          sent_at?: string | null
          status?: string
          title: string
          trip_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          created_at?: string
          data?: Json
          fcm_accepted_at?: string | null
          fcm_message_ids?: Json
          id?: never
          idempotency_key?: string
          kind?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          max_attempts?: number
          next_attempt_at?: string
          priority?: string
          profile_id?: string
          sent_at?: string | null
          status?: string
          title?: string
          trip_id?: string | null
        }
        Relationships: []
      }
      push_required_platforms: {
        Row: {
          homologated_at: string | null
          homologation_id: string | null
          note: string | null
          platform: string
          publishable: boolean
          required: boolean
          updated_at: string
        }
        Insert: {
          homologated_at?: string | null
          homologation_id?: string | null
          note?: string | null
          platform: string
          publishable?: boolean
          required: boolean
          updated_at?: string
        }
        Update: {
          homologated_at?: string | null
          homologation_id?: string | null
          note?: string | null
          platform?: string
          publishable?: boolean
          required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      regulatory_acts: {
        Row: {
          act_date: string | null
          act_number: string
          act_type: string
          act_year: number
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          issuer: string
          retention_policy: string
          summary: string | null
          superseded_by_act_id: string | null
          title: string | null
        }
        Insert: {
          act_date?: string | null
          act_number: string
          act_type: string
          act_year: number
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          issuer: string
          retention_policy?: string
          summary?: string | null
          superseded_by_act_id?: string | null
          title?: string | null
        }
        Update: {
          act_date?: string | null
          act_number?: string
          act_type?: string
          act_year?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          issuer?: string
          retention_policy?: string
          summary?: string | null
          superseded_by_act_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_acts_superseded_by_fk"
            columns: ["superseded_by_act_id"]
            isOneToOne: false
            referencedRelation: "regulatory_acts"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_assessment_findings: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          insufficient_reason: string | null
          offer_version_id: string | null
          rationale: string | null
          requirement_code: string
          requires_human_review: boolean
          state: string
          transport_operation_id: string | null
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          insufficient_reason?: string | null
          offer_version_id?: string | null
          rationale?: string | null
          requirement_code: string
          requires_human_review?: boolean
          state: string
          transport_operation_id?: string | null
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          insufficient_reason?: string | null
          offer_version_id?: string | null
          rationale?: string | null
          requirement_code?: string
          requires_human_review?: boolean
          state?: string
          transport_operation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_assessment_findings_assessment_same_offer_fk"
            columns: ["assessment_id", "offer_version_id"]
            isOneToOne: false
            referencedRelation: "regulatory_assessments"
            referencedColumns: ["id", "offer_version_id"]
          },
          {
            foreignKeyName: "regulatory_assessment_findings_assessment_same_operation_fk"
            columns: ["assessment_id", "transport_operation_id"]
            isOneToOne: false
            referencedRelation: "regulatory_assessments"
            referencedColumns: ["id", "transport_operation_id"]
          },
        ]
      }
      regulatory_assessments: {
        Row: {
          assessment_snapshot: Json | null
          blocking_reasons: Json | null
          coefficient_table_version: string | null
          computed_floor_amount_raw: number | null
          created_at: string
          decided_at: string
          decided_by: string | null
          decision_mode: string
          floor_applicability: string | null
          floor_currency: string | null
          id: string
          inputs_snapshot: Json | null
          offer_version_id: string | null
          operation_type_at_assessment: string | null
          pending_items: Json | null
          result: string
          retention_policy: string
          rounding_policy: string
          rule_id: string
          rule_version: string
          stage: string
          transport_operation_id: string | null
        }
        Insert: {
          assessment_snapshot?: Json | null
          blocking_reasons?: Json | null
          coefficient_table_version?: string | null
          computed_floor_amount_raw?: number | null
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision_mode?: string
          floor_applicability?: string | null
          floor_currency?: string | null
          id?: string
          inputs_snapshot?: Json | null
          offer_version_id?: string | null
          operation_type_at_assessment?: string | null
          pending_items?: Json | null
          result: string
          retention_policy?: string
          rounding_policy?: string
          rule_id: string
          rule_version: string
          stage: string
          transport_operation_id?: string | null
        }
        Update: {
          assessment_snapshot?: Json | null
          blocking_reasons?: Json | null
          coefficient_table_version?: string | null
          computed_floor_amount_raw?: number | null
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision_mode?: string
          floor_applicability?: string | null
          floor_currency?: string | null
          id?: string
          inputs_snapshot?: Json | null
          offer_version_id?: string | null
          operation_type_at_assessment?: string | null
          pending_items?: Json | null
          result?: string
          retention_policy?: string
          rounding_policy?: string
          rule_id?: string
          rule_version?: string
          stage?: string
          transport_operation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_assessments_offer_version_fk"
            columns: ["offer_version_id"]
            isOneToOne: false
            referencedRelation: "freight_offer_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulatory_assessments_operation_fk"
            columns: ["transport_operation_id"]
            isOneToOne: false
            referencedRelation: "transport_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulatory_assessments_rule_version_matches_fk"
            columns: ["rule_id", "rule_version"]
            isOneToOne: false
            referencedRelation: "regulatory_rule_sets"
            referencedColumns: ["id", "rule_version"]
          },
        ]
      }
      regulatory_finding_evidence: {
        Row: {
          created_at: string
          evidence_id: string
          finding_id: string
          offer_version_id: string | null
          transport_operation_id: string | null
          weight: string | null
        }
        Insert: {
          created_at?: string
          evidence_id: string
          finding_id: string
          offer_version_id?: string | null
          transport_operation_id?: string | null
          weight?: string | null
        }
        Update: {
          created_at?: string
          evidence_id?: string
          finding_id?: string
          offer_version_id?: string | null
          transport_operation_id?: string | null
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_finding_evidence_evidence_same_offer_fk"
            columns: ["evidence_id", "offer_version_id"]
            isOneToOne: false
            referencedRelation: "regulatory_requirement_evidence"
            referencedColumns: ["id", "offer_version_id"]
          },
          {
            foreignKeyName: "regulatory_finding_evidence_evidence_same_operation_fk"
            columns: ["evidence_id", "transport_operation_id"]
            isOneToOne: false
            referencedRelation: "regulatory_requirement_evidence"
            referencedColumns: ["id", "transport_operation_id"]
          },
          {
            foreignKeyName: "regulatory_finding_evidence_finding_same_offer_fk"
            columns: ["finding_id", "offer_version_id"]
            isOneToOne: false
            referencedRelation: "regulatory_assessment_findings"
            referencedColumns: ["id", "offer_version_id"]
          },
          {
            foreignKeyName: "regulatory_finding_evidence_finding_same_operation_fk"
            columns: ["finding_id", "transport_operation_id"]
            isOneToOne: false
            referencedRelation: "regulatory_assessment_findings"
            referencedColumns: ["id", "transport_operation_id"]
          },
        ]
      }
      regulatory_requirement_evidence: {
        Row: {
          collected_at: string
          collected_by: string | null
          contains_personal_data: boolean
          created_at: string
          divergence_flag: boolean
          divergence_note: string | null
          document_hash: string | null
          document_ref: string | null
          evidence_strength: string
          evidence_type: string
          id: string
          observed_value: Json | null
          offer_version_id: string | null
          requirement_code: string
          resolves_divergence_of_id: string | null
          retention_policy: string
          source: string
          supersedes_evidence_id: string | null
          transport_operation_id: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          collected_at?: string
          collected_by?: string | null
          contains_personal_data?: boolean
          created_at?: string
          divergence_flag?: boolean
          divergence_note?: string | null
          document_hash?: string | null
          document_ref?: string | null
          evidence_strength: string
          evidence_type: string
          id?: string
          observed_value?: Json | null
          offer_version_id?: string | null
          requirement_code: string
          resolves_divergence_of_id?: string | null
          retention_policy?: string
          source: string
          supersedes_evidence_id?: string | null
          transport_operation_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          collected_at?: string
          collected_by?: string | null
          contains_personal_data?: boolean
          created_at?: string
          divergence_flag?: boolean
          divergence_note?: string | null
          document_hash?: string | null
          document_ref?: string | null
          evidence_strength?: string
          evidence_type?: string
          id?: string
          observed_value?: Json | null
          offer_version_id?: string | null
          requirement_code?: string
          resolves_divergence_of_id?: string | null
          retention_policy?: string
          source?: string
          supersedes_evidence_id?: string | null
          transport_operation_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_requirement_evidence_offer_version_fk"
            columns: ["offer_version_id"]
            isOneToOne: false
            referencedRelation: "freight_offer_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulatory_requirement_evidence_operation_fk"
            columns: ["transport_operation_id"]
            isOneToOne: false
            referencedRelation: "transport_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulatory_requirement_evidence_resolves_same_offer_fk"
            columns: ["resolves_divergence_of_id", "offer_version_id"]
            isOneToOne: false
            referencedRelation: "regulatory_requirement_evidence"
            referencedColumns: ["id", "offer_version_id"]
          },
          {
            foreignKeyName: "regulatory_requirement_evidence_resolves_same_operation_fk"
            columns: ["resolves_divergence_of_id", "transport_operation_id"]
            isOneToOne: false
            referencedRelation: "regulatory_requirement_evidence"
            referencedColumns: ["id", "transport_operation_id"]
          },
          {
            foreignKeyName: "regulatory_requirement_evidence_supersedes_same_offer_fk"
            columns: ["supersedes_evidence_id", "offer_version_id"]
            isOneToOne: false
            referencedRelation: "regulatory_requirement_evidence"
            referencedColumns: ["id", "offer_version_id"]
          },
          {
            foreignKeyName: "regulatory_requirement_evidence_supersedes_same_operation_fk"
            columns: ["supersedes_evidence_id", "transport_operation_id"]
            isOneToOne: false
            referencedRelation: "regulatory_requirement_evidence"
            referencedColumns: ["id", "transport_operation_id"]
          },
        ]
      }
      regulatory_requirement_evidence_verifications: {
        Row: {
          created_at: string
          evidence_id: string
          id: string
          method: string
          notes: string | null
          retention_policy: string
          status: string
          supersedes_verification_id: string | null
          verified_at: string
          verified_by: string | null
          verified_by_process: string | null
        }
        Insert: {
          created_at?: string
          evidence_id: string
          id?: string
          method: string
          notes?: string | null
          retention_policy?: string
          status: string
          supersedes_verification_id?: string | null
          verified_at?: string
          verified_by?: string | null
          verified_by_process?: string | null
        }
        Update: {
          created_at?: string
          evidence_id?: string
          id?: string
          method?: string
          notes?: string | null
          retention_policy?: string
          status?: string
          supersedes_verification_id?: string | null
          verified_at?: string
          verified_by?: string | null
          verified_by_process?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_requirement_evidence_verifications_evidence_fk"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "regulatory_requirement_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulatory_requirement_evidence_verifications_supersedes_same_e"
            columns: ["supersedes_verification_id", "evidence_id"]
            isOneToOne: false
            referencedRelation: "regulatory_requirement_evidence_verifications"
            referencedColumns: ["id", "evidence_id"]
          },
        ]
      }
      regulatory_rule_set_acts: {
        Row: {
          act_id: string
          citation_context: string | null
          created_at: string
          notes: string | null
          rule_set_id: string
        }
        Insert: {
          act_id: string
          citation_context?: string | null
          created_at?: string
          notes?: string | null
          rule_set_id: string
        }
        Update: {
          act_id?: string
          citation_context?: string | null
          created_at?: string
          notes?: string | null
          rule_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_rule_set_acts_act_fk"
            columns: ["act_id"]
            isOneToOne: false
            referencedRelation: "regulatory_acts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulatory_rule_set_acts_rule_set_fk"
            columns: ["rule_set_id"]
            isOneToOne: false
            referencedRelation: "regulatory_rule_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_rule_set_artifacts: {
        Row: {
          act_id: string
          artifact_id: string
          created_at: string
          notes: string | null
          rule_set_id: string
        }
        Insert: {
          act_id: string
          artifact_id: string
          created_at?: string
          notes?: string | null
          rule_set_id: string
        }
        Update: {
          act_id?: string
          artifact_id?: string
          created_at?: string
          notes?: string | null
          rule_set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_rule_set_artifacts_act_cited_fk"
            columns: ["rule_set_id", "act_id"]
            isOneToOne: false
            referencedRelation: "regulatory_rule_set_acts"
            referencedColumns: ["rule_set_id", "act_id"]
          },
          {
            foreignKeyName: "regulatory_rule_set_artifacts_belongs_to_act_fk"
            columns: ["artifact_id", "act_id"]
            isOneToOne: false
            referencedRelation: "regulatory_source_artifacts"
            referencedColumns: ["id", "act_id"]
          },
        ]
      }
      regulatory_rule_sets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          parameters: Json | null
          retention_policy: string
          rule_version: string
          scope: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          parameters?: Json | null
          retention_policy?: string
          rule_version: string
          scope: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          parameters?: Json | null
          retention_policy?: string
          rule_version?: string
          scope?: string
          status?: string
        }
        Relationships: []
      }
      regulatory_source_artifact_validations: {
        Row: {
          artifact_id: string
          created_at: string
          id: string
          method: string
          notes: string | null
          retention_policy: string
          status: string
          supersedes_validation_id: string | null
          validated_at: string
          validated_by: string | null
          validated_by_process: string | null
        }
        Insert: {
          artifact_id: string
          created_at?: string
          id?: string
          method: string
          notes?: string | null
          retention_policy?: string
          status: string
          supersedes_validation_id?: string | null
          validated_at?: string
          validated_by?: string | null
          validated_by_process?: string | null
        }
        Update: {
          artifact_id?: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          retention_policy?: string
          status?: string
          supersedes_validation_id?: string | null
          validated_at?: string
          validated_by?: string | null
          validated_by_process?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_source_artifact_validations_artifact_fk"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "regulatory_source_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulatory_source_artifact_validations_supersedes_same_artifact"
            columns: ["supersedes_validation_id", "artifact_id"]
            isOneToOne: false
            referencedRelation: "regulatory_source_artifact_validations"
            referencedColumns: ["id", "artifact_id"]
          },
        ]
      }
      regulatory_source_artifacts: {
        Row: {
          accessed_at: string | null
          act_id: string
          created_at: string
          created_by: string | null
          document_hash: string
          document_ref: string
          id: string
          notes: string | null
          origin_type: string
          retention_policy: string
          size_bytes: number | null
        }
        Insert: {
          accessed_at?: string | null
          act_id: string
          created_at?: string
          created_by?: string | null
          document_hash: string
          document_ref: string
          id?: string
          notes?: string | null
          origin_type: string
          retention_policy?: string
          size_bytes?: number | null
        }
        Update: {
          accessed_at?: string | null
          act_id?: string
          created_at?: string
          created_by?: string | null
          document_hash?: string
          document_ref?: string
          id?: string
          notes?: string | null
          origin_type?: string
          retention_policy?: string
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_source_artifacts_act_fk"
            columns: ["act_id"]
            isOneToOne: false
            referencedRelation: "regulatory_acts"
            referencedColumns: ["id"]
          },
        ]
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
      rpc_call_log: {
        Row: {
          actor_id: string
          created_at: string
          detail: string | null
          id: string
          outcome: string
          params_fingerprint: string
          request_id: string
          rpc_name: string
          target_id: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          detail?: string | null
          id?: string
          outcome: string
          params_fingerprint: string
          request_id: string
          rpc_name: string
          target_id?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          outcome?: string
          params_fingerprint?: string
          request_id?: string
          rpc_name?: string
          target_id?: string | null
        }
        Relationships: []
      }
      scheduler_runs: {
        Row: {
          alerts_closed: number
          alerts_escalated: number
          alerts_opened: number
          error: string | null
          finished_at: string | null
          id: number
          kind: string
          outcome: string
          purges: number
          pushes_enqueued: number
          started_at: string
          trips_scanned: number
        }
        Insert: {
          alerts_closed?: number
          alerts_escalated?: number
          alerts_opened?: number
          error?: string | null
          finished_at?: string | null
          id?: never
          kind: string
          outcome?: string
          purges?: number
          pushes_enqueued?: number
          started_at?: string
          trips_scanned?: number
        }
        Update: {
          alerts_closed?: number
          alerts_escalated?: number
          alerts_opened?: number
          error?: string | null
          finished_at?: string | null
          id?: never
          kind?: string
          outcome?: string
          purges?: number
          pushes_enqueued?: number
          started_at?: string
          trips_scanned?: number
        }
        Relationships: []
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
      transport_operations: {
        Row: {
          actual_end_at: string | null
          actual_start_at: string | null
          carrier_company_id: string | null
          classification_version: number | null
          contract_id: string | null
          created_at: string
          destination_location: Json | null
          driver_id: string | null
          external_reference: string | null
          external_system: string | null
          floor_applicability: string | null
          floor_applicability_assessment_id: string | null
          freight_id: string | null
          id: string
          intermediate_points: Json | null
          location_specificity: Json | null
          operation_state: string
          operation_type: string | null
          operation_type_rule_version: string | null
          origin_kind: string
          origin_location: Json | null
          planned_end_at: string | null
          planned_start_at: string | null
          registered_by: string | null
          registration_note: string | null
          retention_policy: string
          shipper_company_id: string
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          carrier_company_id?: string | null
          classification_version?: number | null
          contract_id?: string | null
          created_at?: string
          destination_location?: Json | null
          driver_id?: string | null
          external_reference?: string | null
          external_system?: string | null
          floor_applicability?: string | null
          floor_applicability_assessment_id?: string | null
          freight_id?: string | null
          id?: string
          intermediate_points?: Json | null
          location_specificity?: Json | null
          operation_state?: string
          operation_type?: string | null
          operation_type_rule_version?: string | null
          origin_kind: string
          origin_location?: Json | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          registered_by?: string | null
          registration_note?: string | null
          retention_policy?: string
          shipper_company_id: string
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_end_at?: string | null
          actual_start_at?: string | null
          carrier_company_id?: string | null
          classification_version?: number | null
          contract_id?: string | null
          created_at?: string
          destination_location?: Json | null
          driver_id?: string | null
          external_reference?: string | null
          external_system?: string | null
          floor_applicability?: string | null
          floor_applicability_assessment_id?: string | null
          freight_id?: string | null
          id?: string
          intermediate_points?: Json | null
          location_specificity?: Json | null
          operation_state?: string
          operation_type?: string | null
          operation_type_rule_version?: string | null
          origin_kind?: string
          origin_location?: Json | null
          planned_end_at?: string | null
          planned_start_at?: string | null
          registered_by?: string | null
          registration_note?: string | null
          retention_policy?: string
          shipper_company_id?: string
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_operations_carrier_company_fk"
            columns: ["carrier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_operations_contract_fk"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_operations_driver_fk"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_operations_floor_assessment_same_operation_fk"
            columns: ["floor_applicability_assessment_id", "id"]
            isOneToOne: false
            referencedRelation: "regulatory_assessments"
            referencedColumns: ["id", "transport_operation_id"]
          },
          {
            foreignKeyName: "transport_operations_freight_fk"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_operations_shipper_company_fk"
            columns: ["shipper_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_operations_truck_fk"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_access_log: {
        Row: {
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          at: string
          id: number
          object_ref: string | null
          rpc_name: string
          trip_id: string
          what: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          at?: string
          id?: never
          object_ref?: string | null
          rpc_name: string
          trip_id: string
          what: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["trip_actor_kind"]
          at?: string
          id?: never
          object_ref?: string | null
          rpc_name?: string
          trip_id?: string
          what?: string
        }
        Relationships: []
      }
      trip_admin_actions: {
        Row: {
          action: string
          admin_id: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          reason: string
          request_id: string
          trip_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          reason: string
          request_id: string
          trip_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          reason?: string
          request_id?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_admin_actions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_assignments: {
        Row: {
          accepted_at: string | null
          assigned_at: string
          assigned_by: string
          assigned_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          carrier_company_id_at_assignment: string
          carrier_id_at_assignment: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_label_at_assignment: string
          driver_profile_id: string
          id: string
          note: string | null
          request_id: string
          revoke_reason: string | null
          revoked_at: string | null
          state: Database["public"]["Enums"]["trip_assignment_state"]
          superseded_by: string | null
          trip_id: string
          truck_id: string
          truck_plate_at_assignment: string | null
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string
          assigned_by: string
          assigned_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          carrier_company_id_at_assignment: string
          carrier_id_at_assignment: string
          decline_reason?: string | null
          declined_at?: string | null
          driver_id: string
          driver_label_at_assignment: string
          driver_profile_id: string
          id?: string
          note?: string | null
          request_id: string
          revoke_reason?: string | null
          revoked_at?: string | null
          state?: Database["public"]["Enums"]["trip_assignment_state"]
          superseded_by?: string | null
          trip_id: string
          truck_id: string
          truck_plate_at_assignment?: string | null
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string
          assigned_by?: string
          assigned_by_kind?: Database["public"]["Enums"]["trip_actor_kind"]
          carrier_company_id_at_assignment?: string
          carrier_id_at_assignment?: string
          decline_reason?: string | null
          declined_at?: string | null
          driver_id?: string
          driver_label_at_assignment?: string
          driver_profile_id?: string
          id?: string
          note?: string | null
          request_id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          state?: Database["public"]["Enums"]["trip_assignment_state"]
          superseded_by?: string | null
          trip_id?: string
          truck_id?: string
          truck_plate_at_assignment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_assignments_carrier_company_id_at_assignment_fkey"
            columns: ["carrier_company_id_at_assignment"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignments_carrier_id_at_assignment_fkey"
            columns: ["carrier_id_at_assignment"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignments_driver_identity"
            columns: ["driver_id", "driver_profile_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id", "profile_id"]
          },
          {
            foreignKeyName: "trip_assignments_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "trip_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignments_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_checkpoints: {
        Row: {
          accuracy_m: number | null
          actor_id: string
          actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          captured_at: string
          command_id: string | null
          created_at: string
          device_id: string | null
          distance_to_target_m: number | null
          event_id: string | null
          geofence_override_reason: string | null
          geog: unknown
          id: string
          inside_geofence: boolean | null
          kind: Database["public"]["Enums"]["trip_checkpoint_kind"]
          note: string | null
          photo_mime: string | null
          photo_object_path: string | null
          photo_sha256: string | null
          photo_size_bytes: number | null
          received_at: string
          seal_code: string | null
          seal_verified: boolean | null
          seq: number
          trip_id: string
        }
        Insert: {
          accuracy_m?: number | null
          actor_id: string
          actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          captured_at: string
          command_id?: string | null
          created_at?: string
          device_id?: string | null
          distance_to_target_m?: number | null
          event_id?: string | null
          geofence_override_reason?: string | null
          geog?: unknown
          id?: string
          inside_geofence?: boolean | null
          kind: Database["public"]["Enums"]["trip_checkpoint_kind"]
          note?: string | null
          photo_mime?: string | null
          photo_object_path?: string | null
          photo_sha256?: string | null
          photo_size_bytes?: number | null
          received_at?: string
          seal_code?: string | null
          seal_verified?: boolean | null
          seq: number
          trip_id: string
        }
        Update: {
          accuracy_m?: number | null
          actor_id?: string
          actor_kind?: Database["public"]["Enums"]["trip_actor_kind"]
          captured_at?: string
          command_id?: string | null
          created_at?: string
          device_id?: string | null
          distance_to_target_m?: number | null
          event_id?: string | null
          geofence_override_reason?: string | null
          geog?: unknown
          id?: string
          inside_geofence?: boolean | null
          kind?: Database["public"]["Enums"]["trip_checkpoint_kind"]
          note?: string | null
          photo_mime?: string | null
          photo_object_path?: string | null
          photo_sha256?: string | null
          photo_size_bytes?: number | null
          received_at?: string
          seal_code?: string | null
          seal_verified?: boolean | null
          seq?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_documents: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          issued_at: string | null
          kind: string
          mime: string
          note: string | null
          number: string | null
          object_path: string
          request_id: string
          sha256: string
          size_bytes: number
          superseded_at: string | null
          superseded_by: string | null
          trip_id: string
          uploaded_by: string
          uploaded_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          visibility: Database["public"]["Enums"]["trip_visibility"]
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          issued_at?: string | null
          kind: string
          mime: string
          note?: string | null
          number?: string | null
          object_path: string
          request_id: string
          sha256: string
          size_bytes: number
          superseded_at?: string | null
          superseded_by?: string | null
          trip_id: string
          uploaded_by: string
          uploaded_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          visibility?: Database["public"]["Enums"]["trip_visibility"]
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          issued_at?: string | null
          kind?: string
          mime?: string
          note?: string | null
          number?: string | null
          object_path?: string
          request_id?: string
          sha256?: string
          size_bytes?: number
          superseded_at?: string | null
          superseded_by?: string | null
          trip_id?: string
          uploaded_by?: string
          uploaded_by_kind?: Database["public"]["Enums"]["trip_actor_kind"]
          visibility?: Database["public"]["Enums"]["trip_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "trip_documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "trip_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_events: {
        Row: {
          accuracy_m: number | null
          actor_id: string | null
          actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          alert_id: string | null
          assignment_id: string | null
          captured_at: string | null
          checkpoint_id: string | null
          command_id: string | null
          created_at: string
          device_id: string | null
          document_id: string | null
          event_type: Database["public"]["Enums"]["trip_event_type"]
          exception_id: string | null
          from_status: Database["public"]["Enums"]["trip_status"] | null
          geog: unknown
          id: string
          internal_note: string | null
          note: string | null
          params_fingerprint: string | null
          payload: Json
          pod_id: string | null
          received_at: string
          request_id: string | null
          rpc_name: string
          seq: number
          seq_device: number | null
          to_status: Database["public"]["Enums"]["trip_status"] | null
          trip_id: string
        }
        Insert: {
          accuracy_m?: number | null
          actor_id?: string | null
          actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          alert_id?: string | null
          assignment_id?: string | null
          captured_at?: string | null
          checkpoint_id?: string | null
          command_id?: string | null
          created_at?: string
          device_id?: string | null
          document_id?: string | null
          event_type: Database["public"]["Enums"]["trip_event_type"]
          exception_id?: string | null
          from_status?: Database["public"]["Enums"]["trip_status"] | null
          geog?: unknown
          id?: string
          internal_note?: string | null
          note?: string | null
          params_fingerprint?: string | null
          payload?: Json
          pod_id?: string | null
          received_at?: string
          request_id?: string | null
          rpc_name: string
          seq: number
          seq_device?: number | null
          to_status?: Database["public"]["Enums"]["trip_status"] | null
          trip_id: string
        }
        Update: {
          accuracy_m?: number | null
          actor_id?: string | null
          actor_kind?: Database["public"]["Enums"]["trip_actor_kind"]
          alert_id?: string | null
          assignment_id?: string | null
          captured_at?: string | null
          checkpoint_id?: string | null
          command_id?: string | null
          created_at?: string
          device_id?: string | null
          document_id?: string | null
          event_type?: Database["public"]["Enums"]["trip_event_type"]
          exception_id?: string | null
          from_status?: Database["public"]["Enums"]["trip_status"] | null
          geog?: unknown
          id?: string
          internal_note?: string | null
          note?: string | null
          params_fingerprint?: string | null
          payload?: Json
          pod_id?: string | null
          received_at?: string
          request_id?: string | null
          rpc_name?: string
          seq?: number
          seq_device?: number | null
          to_status?: Database["public"]["Enums"]["trip_status"] | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "trip_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_exception_evidence: {
        Row: {
          captured_at: string | null
          created_at: string
          exception_id: string
          id: string
          mime: string
          object_path: string
          sha256: string
          size_bytes: number
          uploaded_by: string
        }
        Insert: {
          captured_at?: string | null
          created_at?: string
          exception_id: string
          id?: string
          mime: string
          object_path: string
          sha256: string
          size_bytes: number
          uploaded_by: string
        }
        Update: {
          captured_at?: string | null
          created_at?: string
          exception_id?: string
          id?: string
          mime?: string
          object_path?: string
          sha256?: string
          size_bytes?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_exception_evidence_exception_id_fkey"
            columns: ["exception_id"]
            isOneToOne: false
            referencedRelation: "trip_exceptions"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_exceptions: {
        Row: {
          ack_target_at: string | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledged_by_kind:
            | Database["public"]["Enums"]["trip_actor_kind"]
            | null
          assigned_admin: string | null
          blocks_delivery: boolean
          captured_at: string
          command_id: string | null
          created_at: string
          description: string
          device_id: string | null
          dispute_case_id: string | null
          escalated_at: string | null
          escalation_level: number
          event_id: string | null
          geog: unknown
          id: string
          kind: Database["public"]["Enums"]["trip_exception_kind"]
          opened_by: string | null
          opened_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          pauses_trip: boolean
          received_at: string
          request_id: string | null
          resolution_kind: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["trip_exception_severity"]
          status: Database["public"]["Enums"]["trip_exception_status"]
          trip_id: string
          visibility: Database["public"]["Enums"]["trip_visibility"]
        }
        Insert: {
          ack_target_at?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_by_kind?:
            | Database["public"]["Enums"]["trip_actor_kind"]
            | null
          assigned_admin?: string | null
          blocks_delivery?: boolean
          captured_at: string
          command_id?: string | null
          created_at?: string
          description: string
          device_id?: string | null
          dispute_case_id?: string | null
          escalated_at?: string | null
          escalation_level?: number
          event_id?: string | null
          geog?: unknown
          id?: string
          kind: Database["public"]["Enums"]["trip_exception_kind"]
          opened_by?: string | null
          opened_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          pauses_trip?: boolean
          received_at?: string
          request_id?: string | null
          resolution_kind?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: Database["public"]["Enums"]["trip_exception_severity"]
          status?: Database["public"]["Enums"]["trip_exception_status"]
          trip_id: string
          visibility?: Database["public"]["Enums"]["trip_visibility"]
        }
        Update: {
          ack_target_at?: string | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_by_kind?:
            | Database["public"]["Enums"]["trip_actor_kind"]
            | null
          assigned_admin?: string | null
          blocks_delivery?: boolean
          captured_at?: string
          command_id?: string | null
          created_at?: string
          description?: string
          device_id?: string | null
          dispute_case_id?: string | null
          escalated_at?: string | null
          escalation_level?: number
          event_id?: string | null
          geog?: unknown
          id?: string
          kind?: Database["public"]["Enums"]["trip_exception_kind"]
          opened_by?: string | null
          opened_by_kind?: Database["public"]["Enums"]["trip_actor_kind"]
          pauses_trip?: boolean
          received_at?: string
          request_id?: string | null
          resolution_kind?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["trip_exception_severity"]
          status?: Database["public"]["Enums"]["trip_exception_status"]
          trip_id?: string
          visibility?: Database["public"]["Enums"]["trip_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "trip_exceptions_dispute_case_id_fkey"
            columns: ["dispute_case_id"]
            isOneToOne: false
            referencedRelation: "dispute_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_exceptions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_geofences: {
        Row: {
          area_geog: unknown
          center_geog: unknown
          created_at: string
          created_by: string | null
          id: string
          is_current: boolean
          kind: string
          radius_m: number | null
          source: string
          trip_id: string
        }
        Insert: {
          area_geog?: unknown
          center_geog?: unknown
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean
          kind: string
          radius_m?: number | null
          source: string
          trip_id: string
        }
        Update: {
          area_geog?: unknown
          center_geog?: unknown
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean
          kind?: string
          radius_m?: number | null
          source?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_geofences_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_location_summaries: {
        Row: {
          avg_speed_kmh: number | null
          created_at: string
          distance_km: number
          first_at: string
          hour_bucket: string
          last_at: string
          max_speed_kmh: number | null
          n_accepted: number
          n_points: number
          path_simplified: unknown
          stops_count: number
          trip_id: string
        }
        Insert: {
          avg_speed_kmh?: number | null
          created_at?: string
          distance_km?: number
          first_at: string
          hour_bucket: string
          last_at: string
          max_speed_kmh?: number | null
          n_accepted: number
          n_points: number
          path_simplified?: unknown
          stops_count?: number
          trip_id: string
        }
        Update: {
          avg_speed_kmh?: number | null
          created_at?: string
          distance_km?: number
          first_at?: string
          hour_bucket?: string
          last_at?: string
          max_speed_kmh?: number | null
          n_accepted?: number
          n_points?: number
          path_simplified?: unknown
          stops_count?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_location_summaries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_locations: {
        Row: {
          accepted: boolean
          accuracy_m: number
          altitude_m: number | null
          batch_id: string
          battery_pct: number | null
          captured_at: string
          device_id: string
          flags: string[]
          geog: unknown
          heading: number | null
          is_moving: boolean | null
          received_at: string
          seq_device: number
          session_id: string
          speed_mps: number | null
          trip_id: string
        }
        Insert: {
          accepted: boolean
          accuracy_m: number
          altitude_m?: number | null
          batch_id: string
          battery_pct?: number | null
          captured_at: string
          device_id: string
          flags?: string[]
          geog: unknown
          heading?: number | null
          is_moving?: boolean | null
          received_at?: string
          seq_device: number
          session_id: string
          speed_mps?: number | null
          trip_id: string
        }
        Update: {
          accepted?: boolean
          accuracy_m?: number
          altitude_m?: number | null
          batch_id?: string
          battery_pct?: number | null
          captured_at?: string
          device_id?: string
          flags?: string[]
          geog?: unknown
          heading?: number | null
          is_moving?: boolean | null
          received_at?: string
          seq_device?: number
          session_id?: string
          speed_mps?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_locations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trip_tracking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_operational_facts: {
        Row: {
          aggregated_distance_km: number | null
          computed_at: string
          computed_by_rpc: string
          distance_source: string
          duration_min: number | null
          gaps_over_silence: number
          gps_distance_km: number | null
          moving_min: number | null
          planned_distance_km: number | null
          points_accepted: number
          points_flagged: number
          points_low_accuracy: number
          points_total: number
          sample_quality: string
          stops_count: number | null
          trip_id: string
          version: number
        }
        Insert: {
          aggregated_distance_km?: number | null
          computed_at?: string
          computed_by_rpc: string
          distance_source: string
          duration_min?: number | null
          gaps_over_silence?: number
          gps_distance_km?: number | null
          moving_min?: number | null
          planned_distance_km?: number | null
          points_accepted?: number
          points_flagged?: number
          points_low_accuracy?: number
          points_total?: number
          sample_quality: string
          stops_count?: number | null
          trip_id: string
          version?: number
        }
        Update: {
          aggregated_distance_km?: number | null
          computed_at?: string
          computed_by_rpc?: string
          distance_source?: string
          duration_min?: number | null
          gaps_over_silence?: number
          gps_distance_km?: number | null
          moving_min?: number | null
          planned_distance_km?: number | null
          points_accepted?: number
          points_flagged?: number
          points_low_accuracy?: number
          points_total?: number
          sample_quality?: string
          stops_count?: number | null
          trip_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_operational_facts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_tracking_sessions: {
        Row: {
          app_version: string | null
          assignment_id: string
          created_at: string
          device_id: string
          driver_id: string
          end_reason: string | null
          ended_at: string | null
          id: string
          last_point_at: string | null
          platform: string
          points_received: number
          privacy_notice_acknowledged_at: string
          privacy_notice_sha256: string
          privacy_notice_version: string
          provider: Database["public"]["Enums"]["tracking_provider"]
          started_at: string
          trip_id: string
        }
        Insert: {
          app_version?: string | null
          assignment_id: string
          created_at?: string
          device_id: string
          driver_id: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          last_point_at?: string | null
          platform: string
          points_received?: number
          privacy_notice_acknowledged_at: string
          privacy_notice_sha256: string
          privacy_notice_version: string
          provider: Database["public"]["Enums"]["tracking_provider"]
          started_at?: string
          trip_id: string
        }
        Update: {
          app_version?: string | null
          assignment_id?: string
          created_at?: string
          device_id?: string
          driver_id?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          last_point_at?: string | null
          platform?: string
          points_received?: number
          privacy_notice_acknowledged_at?: string
          privacy_notice_sha256?: string
          privacy_notice_version?: string
          provider?: Database["public"]["Enums"]["tracking_provider"]
          started_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_sessions_notice_fk"
            columns: ["privacy_notice_version"]
            isOneToOne: false
            referencedRelation: "privacy_notices"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "trip_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "operational_trips"
            referencedColumns: ["id"]
          },
        ]
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
      accept_bid_and_create_contract: {
        Args: { p_bid_id: string; p_freight_id: string; p_request_id: string }
        Returns: string
      }
      accept_company_member_invitation: {
        Args: { p_token: string }
        Returns: {
          company_id: string
          member_id: string
          member_role: string
        }[]
      }
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
      ack_push_homologation: {
        Args: {
          p_device_id: string
          p_homologation_id: string
          p_nonce: string
        }
        Returns: {
          device_received_at: string
          status: string
        }[]
      }
      acknowledge_privacy_notice: {
        Args: { p_sha256: string; p_version: string }
        Returns: {
          acknowledged: boolean
          version: string
        }[]
      }
      acknowledge_sos: {
        Args: { p_exception_id: string; p_note: string; p_request_id: string }
        Returns: {
          acknowledged_at: string
          acknowledged_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          was_replayed: boolean
        }[]
      }
      acknowledge_trip_exception: {
        Args: { p_exception_id: string; p_note: string; p_request_id: string }
        Returns: {
          status: Database["public"]["Enums"]["trip_exception_status"]
          was_replayed: boolean
        }[]
      }
      add_dispute_claim: {
        Args: {
          p_case_id: string
          p_claimed_amount: number
          p_reason_code: Database["public"]["Enums"]["dispute_reason_code"]
          p_request_id: string
          p_statement: string
        }
        Returns: string
      }
      add_dispute_comment: {
        Args: {
          p_body: string
          p_case_id: string
          p_internal: boolean
          p_request_id: string
        }
        Returns: string
      }
      add_dispute_evidence: {
        Args: {
          p_artifact_ref: string
          p_case_id: string
          p_content_hash: string
          p_description: string
          p_kind: string
          p_request_id: string
        }
        Returns: string
      }
      add_dispute_evidence_for_claim: {
        Args: {
          p_artifact_ref: string
          p_case_id: string
          p_claim_id: string
          p_content_hash: string
          p_description: string
          p_kind: string
          p_request_id: string
        }
        Returns: string
      }
      add_dispute_evidence_for_request: {
        Args: {
          p_artifact_ref: string
          p_case_id: string
          p_content_hash: string
          p_description: string
          p_evidence_request_id: string
          p_kind: string
          p_request_id: string
        }
        Returns: string
      }
      add_trip_document: {
        Args: {
          p_issued_at: string
          p_kind: string
          p_note: string
          p_number: string
          p_object_path: string
          p_request_id: string
          p_sha256: string
          p_trip_id: string
          p_visibility: Database["public"]["Enums"]["trip_visibility"]
        }
        Returns: {
          document_id: string
          was_replayed: boolean
        }[]
      }
      admin_close_pricing_rule: {
        Args: {
          p_effective_until: string
          p_reason: string
          p_request_id: string
          p_rule_id: string
        }
        Returns: string
      }
      admin_create_pricing_rule: {
        Args: {
          p_carrier_id: string
          p_country_code: string
          p_currency_code: string
          p_effective_from: string
          p_effective_until: string
          p_fee_percentage: number
          p_reason: string
          p_request_id: string
        }
        Returns: string
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
      admin_supersede_pricing_rule: {
        Args: {
          p_effective_from: string
          p_new_fee_percentage: number
          p_reason: string
          p_request_id: string
          p_rule_id: string
        }
        Returns: string
      }
      assert_dispute_evidence: {
        Args: {
          p_artifact_ref: string
          p_case_id: string
          p_content_hash: string
          p_kind: string
          p_uploader: string
        }
        Returns: {
          etag: string
          mime: string
          size_bytes: number
        }[]
      }
      assert_financial_evidence: {
        Args: {
          p_contract_id: string
          p_evidence_hash: string
          p_evidence_ref: string
          p_kind: string
          p_subject_id: string
        }
        Returns: {
          etag: string
          mime: string
          size_bytes: number
        }[]
      }
      assert_payment_evidence: {
        Args: {
          p_contract_id: string
          p_evidence_hash: string
          p_evidence_ref: string
          p_kind: Database["public"]["Enums"]["payment_transaction_kind"]
          p_transaction_id: string
        }
        Returns: {
          etag: string
          mime: string
          size_bytes: number
        }[]
      }
      assert_trip_media: {
        Args: {
          p_command_id: string
          p_kind: string
          p_min_bytes?: number
          p_object_path: string
          p_sha256: string
          p_trip_id: string
          p_uploader: string
        }
        Returns: {
          etag: string
          mime: string
          size_bytes: number
        }[]
      }
      assign_dispute_case: {
        Args: {
          p_assignee: string
          p_case_id: string
          p_note: string
          p_request_id: string
        }
        Returns: {
          assignee_label: string
          case_id: string
          was_reassigned: boolean
          was_replayed: boolean
        }[]
      }
      assign_trip: {
        Args: {
          p_driver_id: string
          p_note: string
          p_request_id: string
          p_trip_id: string
          p_truck_id: string
        }
        Returns: {
          assignment_id: string
          trip_status: Database["public"]["Enums"]["trip_status"]
          was_replayed: boolean
        }[]
      }
      can_govern_freight: {
        Args: { p_company_id: string; p_created_by: string }
        Returns: boolean
      }
      can_manage_capacity: {
        Args: { p_carrier_id: string; p_driver_id?: string }
        Returns: boolean
      }
      cancel_contract_for_unpaid_settlement: {
        Args: { p_case_id: string; p_note: string; p_request_id: string }
        Returns: {
          case_id: string
          contract_id: string
          new_contract_status: Database["public"]["Enums"]["contract_status"]
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          was_replayed: boolean
        }[]
      }
      cancel_driver_carrier_request: {
        Args: { p_request_id: string }
        Returns: boolean
      }
      cancel_freight: {
        Args: { p_freight_id: string; p_reason: string; p_request_id: string }
        Returns: string
      }
      cancel_trip: {
        Args: { p_reason: string; p_request_id: string; p_trip_id: string }
        Returns: {
          trip_status: Database["public"]["Enums"]["trip_status"]
          was_replayed: boolean
        }[]
      }
      change_company_member_role: {
        Args: {
          p_member_id: string
          p_reason: string
          p_request_id: string
          p_role: string
        }
        Returns: {
          member_role: string
          was_replayed: boolean
        }[]
      }
      claim_push_batch: {
        Args: { p_lease_seconds: number; p_limit: number }
        Returns: {
          attempts: number
          body: string
          data: Json
          devices: Json
          kind: string
          lease_token: string
          outbox_id: number
          priority: string
          profile_id: string
          title: string
        }[]
      }
      close_dispute_case: {
        Args: { p_case_id: string; p_note: string; p_request_id: string }
        Returns: {
          case_id: string
          dispute_state: Database["public"]["Enums"]["dispute_status"]
          new_contract_status: Database["public"]["Enums"]["contract_status"]
          was_replayed: boolean
        }[]
      }
      company_member_event_append: {
        Args: {
          p_actor: string
          p_after: string
          p_before: string
          p_company_id: string
          p_member_id: string
          p_reason: string
          p_request_id: string
          p_type: string
        }
        Returns: undefined
      }
      company_operational_role: {
        Args: { p_company_id: string }
        Returns: string
      }
      company_operational_users: {
        Args: { p_company_id: string }
        Returns: string[]
      }
      complete_company_registration: { Args: never; Returns: Json }
      complete_contract_delivery: {
        Args: { p_contract_id: string; p_request_id: string }
        Returns: {
          affected_contract_id: string
          contract_completed: boolean
          delivery_at: string
          new_escrow_status: string
          new_status: Database["public"]["Enums"]["contract_status"]
          was_replayed: boolean
        }[]
      }
      complete_contract_delivery_core: {
        Args: {
          p_actor: string
          p_actor_kind: string
          p_contract_id: string
          p_fp: string
          p_request_id: string
          p_rpc: string
        }
        Returns: {
          contract_completed: boolean
          delivery_at: string
        }[]
      }
      confirm_dispute_recovery: {
        Args: {
          p_evidence_hash: string
          p_evidence_ref: string
          p_external_reference: string
          p_note: string
          p_recovery_id: string
          p_request_id: string
        }
        Returns: {
          all_recoveries_closed: boolean
          new_status: string
          recovery_id: string
          was_replayed: boolean
        }[]
      }
      confirm_dispute_settlement: {
        Args: {
          p_contract_id: string
          p_evidence_hash: string
          p_evidence_ref: string
          p_external_reference: string
          p_note: string
          p_request_id: string
          p_transaction_id: string
        }
        Returns: {
          contract_id: string
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          settlement_complete: boolean
          transaction_id: string
          transaction_kind: Database["public"]["Enums"]["payment_transaction_kind"]
          was_replayed: boolean
        }[]
      }
      confirm_escrow_funding: {
        Args: {
          p_contract_id: string
          p_evidence_hash: string
          p_evidence_ref: string
          p_external_reference: string
          p_note: string
          p_request_id: string
        }
        Returns: {
          affected_contract_id: string
          intent_id: string
          new_escrow_status: string
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          was_replayed: boolean
        }[]
      }
      confirm_escrow_release: {
        Args: {
          p_contract_id: string
          p_evidence_hash: string
          p_evidence_ref: string
          p_external_reference: string
          p_note: string
          p_request_id: string
        }
        Returns: {
          affected_contract_id: string
          contract_completed: boolean
          intent_id: string
          new_contract_status: Database["public"]["Enums"]["contract_status"]
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          was_replayed: boolean
        }[]
      }
      consume_push_nonce: {
        Args: { p_nonce: string; p_ts: number }
        Returns: boolean
      }
      contract_dispute_role: {
        Args: { p_contract_id: string }
        Returns: string
      }
      contract_lifecycle_append: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_amount: number
          p_contract_id: string
          p_delivery_at: string
          p_dispute_case_id: string
          p_escrow_confirmed_at: string
          p_fingerprint: string
          p_intent_id: string
          p_new_escrow: string
          p_new_status: Database["public"]["Enums"]["contract_status"]
          p_reason: string
          p_request_id: string
          p_rpc_name: string
          p_transition: Database["public"]["Enums"]["contract_lifecycle_transition"]
        }
        Returns: string
      }
      contract_party_of: {
        Args: { p_carrier_company_id: string; p_shipper_company_id: string }
        Returns: string
      }
      count_my_unread_notifications: { Args: never; Returns: number }
      create_and_publish_freight: {
        Args: {
          p_budget_brl: number
          p_company_id: string
          p_payload: Json
          p_reason?: string
          p_request_id: string
        }
        Returns: string
      }
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
      create_freight_draft: {
        Args: { p_company_id: string; p_payload: Json; p_request_id: string }
        Returns: string
      }
      create_freight_draft_core: {
        Args: {
          p_actor_id: string
          p_company_id: string
          p_fingerprint: string
          p_payload: Json
          p_request_id: string
          p_rpc_name: string
        }
        Returns: string
      }
      create_trip_for_contract: {
        Args: { p_contract_id: string; p_request_id: string }
        Returns: {
          attempt_number: number
          trip_id: string
          trip_number: string
          was_replayed: boolean
        }[]
      }
      current_operational_policy: {
        Args: never
        Returns: {
          accuracy_primary_m: number
          accuracy_reject_m: number
          alert_ack_target_min: number
          clock_future_tolerance_min: number
          comm_loss_critical_min: number
          created_at: string
          created_by: string | null
          effective_from: string
          eta_fallback_speed_kmh: number
          eta_route_factor: number
          geofence_radius_m: number
          id: string
          impossible_speed_kmh: number
          legal_hold_tail_days: number
          location_batch_max_points: number
          location_flush_interval_s: number | null
          location_max_age_hours: number
          location_min_distance_m: number | null
          location_min_interval_s: number | null
          location_silence_min_stationary: number
          location_silence_min_transit: number
          location_stationary_interval_s: number | null
          long_stop_min: number
          moving_away_min_km: number
          no_progress_min: number
          raw_retention_days: number
          reason: string
          request_id: string | null
          sos_ack_target_min: number
          summary_retention_years: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "operational_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_privacy_notice: {
        Args: never
        Returns: {
          body_md: string
          body_sha256: string
          effective_from: string
          id: string
          legal_basis: string
          published_at: string
          published_by: string
          request_id: string
          url: string | null
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "privacy_notices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decide_dispute_case: {
        Args: {
          p_carrier_amount: number
          p_case_id: string
          p_decided_amount: number
          p_outcome: Database["public"]["Enums"]["dispute_decision_outcome"]
          p_platform_amount: number
          p_rationale: string
          p_request_id: string
          p_shipper_amount: number
          p_supersedes_decision_id?: string
        }
        Returns: {
          case_id: string
          decision_id: string
          dispute_state: Database["public"]["Enums"]["dispute_status"]
          was_replayed: boolean
        }[]
      }
      dispute_actor_json: {
        Args: {
          p_case_id: string
          p_user_id: string
          p_viewer: string
          p_viewer_admin: boolean
        }
        Returns: Json
      }
      dispute_case_visible: { Args: { p_case_id: string }; Returns: boolean }
      dispute_event_append: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_case_id: string
          p_claim_id: string
          p_decision_id: string
          p_event_type: string
          p_evidence_id: string
          p_evidence_request_id?: string
          p_fingerprint: string
          p_new_status: Database["public"]["Enums"]["dispute_status"]
          p_note: string
          p_recovery_id?: string
          p_request_id: string
          p_rpc_name: string
          p_transaction_id?: string
        }
        Returns: string
      }
      dispute_evidence_insert: {
        Args: {
          p_actor: string
          p_artifact_ref: string
          p_case_id: string
          p_claim_id: string
          p_content_hash: string
          p_description: string
          p_evidence_req: string
          p_fingerprint: string
          p_kind: string
          p_request_id: string
          p_rpc_name: string
        }
        Returns: string
      }
      dispute_expire_open_requests: {
        Args: {
          p_case_id: string
          p_fingerprint: string
          p_only_past_due: boolean
          p_request_id: string
          p_rpc_name: string
        }
        Returns: number
      }
      dispute_object_visible: { Args: { p_case: string }; Returns: boolean }
      dispute_party_role_of: {
        Args: { p_case_id: string; p_user_id: string }
        Returns: string
      }
      dispute_settlement_math: {
        Args: {
          p_disputed: number
          p_fee: number
          p_gross: number
          p_shipper: number
        }
        Returns: {
          carrier_delta: number
          carrier_final: number
          carrier_recovery: number
          carrier_u: number
          fee_final: number
          fee_u: number
          platform_delta: number
          platform_recovery: number
          r: number
          u: number
        }[]
      }
      dispute_upload_allowed: { Args: { p_case: string }; Returns: boolean }
      driver_label: { Args: { p_full_name: string }; Returns: string }
      emergency_withdraw_offers_by_ids: {
        Args: {
          p_freight_ids: string[]
          p_reason: string
          p_request_id: string
        }
        Returns: number
      }
      enable_push_dispatch: {
        Args: { p_request_id: string }
        Returns: {
          enabled: boolean
          gates: Json
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
      ensure_offer_version: {
        Args: {
          p_actor_id: string
          p_fingerprint: string
          p_freight_id: string
          p_request_id: string
          p_rpc_name: string
        }
        Returns: string
      }
      ensure_payment_intent: {
        Args: {
          p_actor_id: string
          p_contract_id: string
          p_fingerprint: string
          p_request_id: string
          p_rpc_name: string
        }
        Returns: {
          carrier_net_amount: number
          contract_id: string
          created_at: string
          currency_code: string
          external_reference: string | null
          external_status: string | null
          failure_code: string | null
          failure_reason: string | null
          funding_confirmed_at: string | null
          gross_amount: number
          id: string
          internal_status: Database["public"]["Enums"]["payment_internal_status"]
          last_event_id: string | null
          platform_fee_amount: number
          pricing_rule_id: string | null
          provider_code: string
          reconciled_at: string | null
          reconciled_by: string | null
          release_blocked_by_dispute: boolean
          release_requested_at: string | null
          release_requested_by: string | null
          released_confirmed_at: string | null
          requested_at: string | null
          requested_by: string | null
          settled_at: string | null
          settlement_decision_id: string | null
          settlement_funding_amount: number | null
          settlement_refund_amount: number | null
          settlement_release_amount: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payment_intents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      escalate_sos: {
        Args: { p_exception_id: string; p_note: string; p_request_id: string }
        Returns: {
          escalation_level: number
          was_replayed: boolean
        }[]
      }
      execute_bulk_withdrawal: {
        Args: { p_preview_id: string; p_request_id: string }
        Returns: number
      }
      export_my_trip_data: { Args: never; Returns: Json }
      fail_dispute_settlement_transaction: {
        Args: {
          p_contract_id: string
          p_failure_code: string
          p_failure_reason: string
          p_request_id: string
          p_transaction_id: string
        }
        Returns: {
          contract_id: string
          new_status: Database["public"]["Enums"]["payment_transaction_status"]
          transaction_id: string
          was_replayed: boolean
        }[]
      }
      fail_payment_transaction: {
        Args: {
          p_contract_id: string
          p_failure_code: string
          p_failure_reason: string
          p_request_id: string
        }
        Returns: {
          affected_contract_id: string
          intent_id: string
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          was_replayed: boolean
        }[]
      }
      force_trip_transition: {
        Args: {
          p_reason: string
          p_request_id: string
          p_to: Database["public"]["Enums"]["trip_status"]
          p_trip_id: string
        }
        Returns: {
          trip_status: Database["public"]["Enums"]["trip_status"]
          was_replayed: boolean
        }[]
      }
      freight_offer_snapshot: {
        Args: { p_f: Database["public"]["Tables"]["freights"]["Row"] }
        Returns: Json
      }
      freight_operational_transition: {
        Args: {
          p_actor: string
          p_freight_id: string
          p_new: Database["public"]["Enums"]["freight_status"]
          p_request_id: string
          p_rpc: string
        }
        Returns: undefined
      }
      get_current_privacy_notice: { Args: never; Returns: Json }
      get_dispute_case: { Args: { p_case_id: string }; Returns: Json }
      get_my_driver_trip: { Args: never; Returns: Json }
      get_push_activation_gates: { Args: never; Returns: Json }
      get_trip: { Args: { p_trip_id: string }; Returns: Json }
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
      ingest_trip_locations: {
        Args: {
          p_batch_id: string
          p_device_id: string
          p_points: Json
          p_trip_id: string
        }
        Returns: {
          accepted: number
          downsampled: number
          duplicates: number
          rejected: Json
          stored_flagged: number
          tracking_active: boolean
          trip_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      invite_company_member: {
        Args: {
          p_company_id: string
          p_email: string
          p_expires_in_hours: number
          p_request_id: string
          p_role: string
        }
        Returns: {
          expires_at: string
          invite_token: string
          member_id: string
          was_replayed: boolean
        }[]
      }
      is_company_operator: { Args: { p_company_id: string }; Returns: boolean }
      is_company_viewer: { Args: { p_company_id: string }; Returns: boolean }
      is_contract_visible: { Args: { p_contract_id: string }; Returns: boolean }
      is_current_user_company_member: {
        Args: { _company_id: string }
        Returns: boolean
      }
      is_current_user_company_owner: {
        Args: { _company_id: string }
        Returns: boolean
      }
      is_dispute_visible: { Args: { p_case_id: string }; Returns: boolean }
      list_company_members: {
        Args: { p_company_id: string }
        Returns: {
          accepted_at: string
          email_masked: string
          invited_at: string
          is_me: boolean
          label: string
          member_id: string
          member_role: string
          revoked_at: string
          status: string
        }[]
      }
      list_dispute_admins: {
        Args: never
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      list_dispute_cases: {
        Args: {
          p_limit?: number
          p_scope?: string
          p_status?: Database["public"]["Enums"]["dispute_status"][]
        }
        Returns: {
          assignee_label: string
          case_id: string
          case_number: string
          claimant_company_name: string
          contract_id: string
          contract_number: string
          currency_code: string
          disputed_amount: number
          due_at: string
          is_assigned: boolean
          my_role: string
          opened_at: string
          overdue: boolean
          previous_contract_status: Database["public"]["Enums"]["contract_status"]
          reason_code: Database["public"]["Enums"]["dispute_reason_code"]
          respondent_company_name: string
          settlement_due_at: string
          settlement_state: string
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
        }[]
      }
      list_legacy_operational_records: {
        Args: { p_kind: string; p_limit?: number }
        Returns: Json[]
      }
      list_my_notifications: {
        Args: { p_limit?: number; p_unread_only?: boolean }
        Returns: {
          body: string
          case_id: string
          contract_id: string
          created_at: string
          id: string
          is_read: boolean
          link: string
          read_at: string
          title: string
          type: string
        }[]
      }
      list_my_trips: {
        Args: {
          p_limit?: number
          p_scope?: string
          p_status?: Database["public"]["Enums"]["trip_status"][]
        }
        Returns: {
          attempt_number: number
          carrier_company_name: string
          contract_id: string
          contract_number: string
          delivery_exception: boolean
          destination: string
          driver_label: string
          eta_at: string
          eta_source: string
          eta_updated_at: string
          has_open_sos: boolean
          last_location_at: string
          my_role: string
          open_alerts: number
          open_exceptions: number
          origin: string
          paused: boolean
          planned_delivery_at: string
          planned_pickup_at: string
          shipper_company_name: string
          status: Database["public"]["Enums"]["trip_status"]
          tracking_state: string
          trip_id: string
          trip_number: string
          truck_plate_masked: string
          updated_at: string
        }[]
      }
      list_operational_alerts: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          acknowledged_at: string
          alert_id: string
          details: Json
          detected_at: string
          kind: Database["public"]["Enums"]["trip_alert_kind"]
          severity: Database["public"]["Enums"]["trip_exception_severity"]
          status: string
          trip_id: string
          trip_number: string
          trip_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      list_recovery_evidence_refs: { Args: never; Returns: string[] }
      list_settled_release_amounts: {
        Args: never
        Returns: {
          carrier_amount: number
          contract_id: string
          intent_id: string
          platform_amount: number
          release_amount: number
          transaction_id: string
        }[]
      }
      list_sos_queue: {
        Args: never
        Returns: {
          ack_target_at: string
          acknowledged_at: string
          acknowledged_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          captured_at: string
          carrier_company_name: string
          driver_label: string
          escalation_level: number
          exception_id: string
          lat: number
          lng: number
          seconds_open: number
          sos_mode: string
          status: Database["public"]["Enums"]["trip_exception_status"]
          trip_id: string
          trip_number: string
        }[]
      }
      list_trip_positions: {
        Args: { p_since?: string; p_trip_id: string }
        Returns: {
          accepted: boolean
          accuracy_m: number
          captured_at: string
          flags: string[]
          lat: number
          lng: number
          speed_kmh: number
        }[]
      }
      list_trip_positions_admin: {
        Args: never
        Returns: {
          carrier_company_name: string
          driver_label: string
          eta_at: string
          has_open_sos: boolean
          last_location_at: string
          lat: number
          lng: number
          open_alerts: number
          status: Database["public"]["Enums"]["trip_status"]
          trip_id: string
          trip_number: string
        }[]
      }
      list_visible_contract_counterparties: {
        Args: { p_contract_ids: string[] }
        Returns: {
          carrier_company_id: string
          carrier_company_name: string
          contract_id: string
          shipper_company_id: string
          shipper_company_name: string
        }[]
      }
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: number }
      mark_push_result: {
        Args: {
          p_dead_tokens: string[]
          p_error: string
          p_fcm_message_ids: Json
          p_lease_token: string
          p_outbox_id: number
          p_result: string
        }
        Returns: boolean
      }
      mask_plate: { Args: { p_plate: string }; Returns: string }
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
      my_driver_verifications: {
        Args: { p_limit?: number }
        Returns: {
          completed_at: string
          decision: string
          expires_at: string
          id: string
          internal_reason_code: string
          requested_at: string
          status: string
          verification_type: string
        }[]
      }
      normalize_identity_document: {
        Args: { p_value: string }
        Returns: string
      }
      notify_dispute_case: {
        Args: {
          p_body: string
          p_case_id: string
          p_exclude_user: string
          p_include_admins: boolean
          p_only_role?: string
          p_title: string
          p_type: string
        }
        Returns: number
      }
      notify_trip: {
        Args: {
          p_body: string
          p_exclude?: string
          p_priority?: string
          p_title: string
          p_to_admins: boolean
          p_to_carrier: boolean
          p_to_driver: boolean
          p_to_shipper: boolean
          p_trip_id: string
          p_type: string
        }
        Returns: number
      }
      notify_user: {
        Args: {
          p_body: string
          p_case_id: string
          p_contract_id: string
          p_link: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      open_dispute_case: {
        Args: {
          p_contract_id: string
          p_description: string
          p_disputed_amount: number
          p_exception_id?: string
          p_reason_code: Database["public"]["Enums"]["dispute_reason_code"]
          p_request_id: string
          p_statement: string
        }
        Returns: {
          case_id: string
          case_number: string
          dispute_state: Database["public"]["Enums"]["dispute_status"]
          release_suspended: boolean
          was_replayed: boolean
        }[]
      }
      open_payment_reconciliation: {
        Args: {
          p_contract_id: string
          p_expected_amount: number
          p_note: string
          p_observed_amount?: number
          p_request_id: string
          p_source: string
          p_statement_ref?: string
          p_transaction_id?: string
        }
        Returns: string
      }
      open_sos: {
        Args: {
          p_accuracy_m: number
          p_captured_at: string
          p_command_id: string
          p_device_id: string
          p_lat: number
          p_lng: number
          p_note: string
          p_trip_id: string
        }
        Returns: {
          ack_target_at: string
          applied: boolean
          duplicate: boolean
          exception_id: string
          rejection_code: string
          sos_mode: string
        }[]
      }
      open_trip_exception: {
        Args: {
          p_accuracy_m: number
          p_captured_at: string
          p_command_id: string
          p_description: string
          p_device_id: string
          p_evidence: Json
          p_kind: Database["public"]["Enums"]["trip_exception_kind"]
          p_lat: number
          p_lng: number
          p_severity: Database["public"]["Enums"]["trip_exception_severity"]
          p_trip_id: string
        }
        Returns: {
          applied: boolean
          duplicate: boolean
          exception_id: string
          rejection_code: string
          severity: Database["public"]["Enums"]["trip_exception_severity"]
        }[]
      }
      operational_flag: { Args: { p_key: string }; Returns: boolean }
      operational_policy_version: {
        Args: { p_version: number }
        Returns: {
          accuracy_primary_m: number
          accuracy_reject_m: number
          alert_ack_target_min: number
          clock_future_tolerance_min: number
          comm_loss_critical_min: number
          created_at: string
          created_by: string | null
          effective_from: string
          eta_fallback_speed_kmh: number
          eta_route_factor: number
          geofence_radius_m: number
          id: string
          impossible_speed_kmh: number
          legal_hold_tail_days: number
          location_batch_max_points: number
          location_flush_interval_s: number | null
          location_max_age_hours: number
          location_min_distance_m: number | null
          location_min_interval_s: number | null
          location_silence_min_stationary: number
          location_silence_min_transit: number
          location_stationary_interval_s: number | null
          long_stop_min: number
          moving_away_min_km: number
          no_progress_min: number
          raw_retention_days: number
          reason: string
          request_id: string | null
          sos_ack_target_min: number
          summary_retention_years: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "operational_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pause_trip: {
        Args: {
          p_exception_id: string
          p_reason: string
          p_request_id: string
          p_trip_id: string
        }
        Returns: {
          trip_status: Database["public"]["Enums"]["trip_status"]
          was_replayed: boolean
        }[]
      }
      payment_event_append: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_amount: number
          p_currency: string
          p_event_type: string
          p_external_ref: string
          p_failure_code: string
          p_failure_reason: string
          p_fingerprint: string
          p_intent_id: string
          p_method: Database["public"]["Enums"]["payment_confirmation_method"]
          p_new_status: Database["public"]["Enums"]["payment_internal_status"]
          p_note: string
          p_request_id: string
          p_rpc_name: string
          p_source: string
          p_transaction_id: string
          p_webhook_id: string
        }
        Returns: string
      }
      payment_status_rank: {
        Args: {
          p_status: Database["public"]["Enums"]["payment_internal_status"]
        }
        Returns: number
      }
      place_bid: {
        Args: {
          p_amount: number
          p_driver_id: string
          p_estimated_hours: number
          p_ev_certified: boolean
          p_freight_id: string
          p_request_id: string
          p_toll: number
          p_truck_id: string
        }
        Returns: {
          bid_id: string
          was_replayed: boolean
        }[]
      }
      platform_pricing_rule_for: {
        Args: {
          p_carrier_id: string
          p_country_code: string
          p_currency_code: string
        }
        Returns: {
          carrier_id: string | null
          change_reason: string | null
          closed_at: string | null
          closed_by_admin: string | null
          country_code: string
          created_at: string
          created_by: string | null
          created_by_admin: string | null
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
          supersedes_id: string | null
          truck_type: Database["public"]["Enums"]["truck_type"] | null
          updated_at: string
          version: number
          waiting_hour_amount: number | null
        }
        SetofOptions: {
          from: "*"
          to: "pricing_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      preview_bulk_withdrawal: {
        Args: {
          p_reason: string
          p_request_id: string
          p_scope_company_id: string
          p_ttl_minutes?: number
        }
        Returns: string
      }
      pricing_rule_scope_lock_key: {
        Args: {
          p_carrier_id: string
          p_country_code: string
          p_currency_code: string
        }
        Returns: number
      }
      publish_freight: {
        Args: {
          p_budget_brl: number
          p_freight_id: string
          p_reason?: string
          p_request_id: string
        }
        Returns: string
      }
      publish_freight_core: {
        Args: {
          p_actor_id: string
          p_budget_brl: number
          p_fingerprint: string
          p_freight_id: string
          p_is_admin: boolean
          p_reason: string
          p_request_id: string
          p_rpc_name: string
        }
        Returns: string
      }
      publish_operational_policy: {
        Args: { p_reason: string; p_request_id: string; p_values: Json }
        Returns: {
          version: number
          was_replayed: boolean
        }[]
      }
      publish_privacy_notice: {
        Args: {
          p_body_md: string
          p_effective_from: string
          p_request_id: string
          p_url: string
          p_version: string
        }
        Returns: {
          body_sha256: string
          version: string
          was_replayed: boolean
        }[]
      }
      purge_trip_raw_locations: {
        Args: { p_request_id: string; p_trip_id: string }
        Returns: {
          points_deleted: number
          was_replayed: boolean
        }[]
      }
      push_activation_gates: { Args: never; Returns: Json }
      push_enqueue: {
        Args: {
          p_body: string
          p_data: Json
          p_idempotency_key: string
          p_kind: string
          p_priority: string
          p_profile_id: string
          p_title: string
          p_trip_id: string
        }
        Returns: number
      }
      push_minimized_body: { Args: { p_kind: string }; Returns: string }
      push_text_is_minimized: { Args: { p_text: string }; Returns: boolean }
      reassign_trip: {
        Args: {
          p_driver_id: string
          p_reason: string
          p_request_id: string
          p_trip_id: string
          p_truck_id: string
        }
        Returns: {
          assignment_id: string
          trip_status: Database["public"]["Enums"]["trip_status"]
          was_replayed: boolean
        }[]
      }
      record_provider_webhook: {
        Args: {
          p_amount: number
          p_currency_code: string
          p_event_type: string
          p_external_event_id: string
          p_external_reference: string
          p_occurred_at: string
          p_payload_digest: string
          p_provider_code: string
          p_provider_sequence: number
          p_request_id: string
          p_signature_algorithm: string
          p_signature_key_id: string
          p_signature_verified: boolean
        }
        Returns: {
          intent_id: string
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          outcome: string
          webhook_id: string
        }[]
      }
      record_push_dispatch_run: {
        Args: { p_error: string; p_pushes: number }
        Returns: undefined
      }
      record_trip_checkpoint: {
        Args: {
          p_accuracy_m: number
          p_captured_at: string
          p_command_id: string
          p_device_id: string
          p_geofence_override_reason?: string
          p_kind: Database["public"]["Enums"]["trip_checkpoint_kind"]
          p_lat: number
          p_lng: number
          p_note: string
          p_photo_path: string
          p_photo_sha256: string
          p_seal_code: string
          p_seq: number
          p_trip_id: string
        }
        Returns: {
          applied: boolean
          checkpoint_id: string
          duplicate: boolean
          rejection_code: string
          trip_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      register_push_device: {
        Args: {
          p_app_version: string
          p_build: string
          p_device_id: string
          p_platform: string
          p_token: string
        }
        Returns: {
          push_device_id: string
          was_existing: boolean
        }[]
      }
      register_transshipment: {
        Args: {
          p_accuracy_m: number
          p_captured_at: string
          p_command_id: string
          p_device_id: string
          p_exception_id: string
          p_lat: number
          p_lng: number
          p_new_driver_id: string
          p_new_truck_id: string
          p_note: string
          p_photo_path: string
          p_photo_sha256: string
          p_seal_code: string
          p_trip_id: string
        }
        Returns: {
          applied: boolean
          assignment_id: string
          checkpoint_id: string
          duplicate: boolean
          trip_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      release_trip_legal_hold: {
        Args: { p_note: string; p_request_id: string; p_trip_id: string }
        Returns: {
          legal_hold_until: string
          was_replayed: boolean
        }[]
      }
      report_trip_eta: {
        Args: {
          p_eta_at: string
          p_note: string
          p_request_id: string
          p_trip_id: string
        }
        Returns: {
          eta_at: string
          eta_source: string
          was_replayed: boolean
        }[]
      }
      reprice_published_freight: {
        Args: {
          p_budget_brl: number
          p_freight_id: string
          p_reason: string
          p_request_id: string
        }
        Returns: string
      }
      request_dispute_evidence: {
        Args: {
          p_case_id: string
          p_description: string
          p_due_at: string
          p_request_id: string
          p_target_role: string
        }
        Returns: {
          evidence_request_id: string
          target_role: string
        }[]
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
      request_escrow_funding: {
        Args: { p_contract_id: string; p_request_id: string }
        Returns: {
          affected_contract_id: string
          intent_id: string
          new_escrow_status: string
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          was_replayed: boolean
        }[]
      }
      request_escrow_release: {
        Args: { p_contract_id: string; p_request_id: string }
        Returns: {
          affected_contract_id: string
          intent_id: string
          new_escrow_status: string
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          was_replayed: boolean
        }[]
      }
      request_push_homologation: {
        Args: { p_device_id: string }
        Returns: {
          expires_at: string
          homologation_id: string
        }[]
      }
      request_trip_media_access: {
        Args: { p_object_path: string }
        Returns: {
          expires_in_seconds: number
          granted: boolean
        }[]
      }
      require_steelgo_admin: { Args: { p_rpc_name: string }; Returns: string }
      resolve_cargo_disposition: {
        Args: {
          p_custodian_label: string
          p_disposition: Database["public"]["Enums"]["cargo_disposition"]
          p_evidence: Json
          p_is_emergency: boolean
          p_lat: number
          p_lng: number
          p_location_text: string
          p_note: string
          p_occurred_at: string
          p_reason: string
          p_request_id: string
          p_trip_id: string
        }
        Returns: {
          disposition: Database["public"]["Enums"]["cargo_disposition"]
          trip_status: Database["public"]["Enums"]["trip_status"]
          was_replayed: boolean
        }[]
      }
      resolve_delivery_exception: {
        Args: {
          p_exception_id: string
          p_new_delivery_lat: number
          p_new_delivery_lng: number
          p_note: string
          p_request_id: string
          p_resolution: Database["public"]["Enums"]["delivery_exception_resolution"]
        }
        Returns: {
          contract_completed: boolean
          delivery_completed: boolean
          resolution: Database["public"]["Enums"]["delivery_exception_resolution"]
          trip_status: Database["public"]["Enums"]["trip_status"]
          was_replayed: boolean
        }[]
      }
      resolve_payment_reconciliation: {
        Args: {
          p_note: string
          p_reconciliation_id: string
          p_request_id: string
          p_status: string
        }
        Returns: string
      }
      resolve_sos: {
        Args: {
          p_exception_id: string
          p_note: string
          p_outcome: string
          p_request_id: string
        }
        Returns: {
          status: Database["public"]["Enums"]["trip_exception_status"]
          was_replayed: boolean
        }[]
      }
      resolve_trip_exception: {
        Args: {
          p_exception_id: string
          p_note: string
          p_request_id: string
          p_resolution_kind: string
        }
        Returns: {
          status: Database["public"]["Enums"]["trip_exception_status"]
          was_replayed: boolean
        }[]
      }
      respond_trip_assignment: {
        Args: {
          p_accept: boolean
          p_assignment_id: string
          p_captured_at: string
          p_command_id: string
          p_reason: string
        }
        Returns: {
          applied: boolean
          duplicate: boolean
          rejection_code: string
          trip_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      resume_trip: {
        Args: { p_reason: string; p_request_id: string; p_trip_id: string }
        Returns: {
          trip_status: Database["public"]["Enums"]["trip_status"]
          was_replayed: boolean
        }[]
      }
      retry_dispute_settlement_transaction: {
        Args: {
          p_contract_id: string
          p_failed_transaction_id: string
          p_note: string
          p_request_id: string
        }
        Returns: {
          contract_id: string
          failed_transaction_id: string
          new_transaction_id: string
          transaction_kind: Database["public"]["Enums"]["payment_transaction_kind"]
          was_replayed: boolean
        }[]
      }
      retry_failed_payment_transaction: {
        Args: { p_contract_id: string; p_note: string; p_request_id: string }
        Returns: {
          affected_contract_id: string
          failed_transaction_id: string
          intent_id: string
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          new_transaction_id: string
          retried_kind: Database["public"]["Enums"]["payment_transaction_kind"]
          was_replayed: boolean
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
      revoke_company_member: {
        Args: { p_member_id: string; p_reason: string; p_request_id: string }
        Returns: {
          revoked: boolean
          was_replayed: boolean
        }[]
      }
      revoke_push_device: {
        Args: { p_device_id: string; p_reason: string }
        Returns: number
      }
      revoke_push_devices_of: {
        Args: { p_profile_id: string; p_reason: string }
        Returns: number
      }
      rpc_idempotency_probe: {
        Args: {
          p_actor_id: string
          p_fingerprint: string
          p_request_id: string
          p_rpc_name: string
          p_target_id: string
          p_target_is_output?: boolean
        }
        Returns: {
          actor_id: string
          created_at: string
          detail: string | null
          id: string
          outcome: string
          params_fingerprint: string
          request_id: string
          rpc_name: string
          target_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "rpc_call_log"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_params_fingerprint: { Args: { p_params: Json }; Returns: string }
      run_operational_scheduler: {
        Args: never
        Returns: {
          alerts_closed: number
          alerts_escalated: number
          alerts_opened: number
          outcome: string
          purges: number
          trips_scanned: number
        }[]
      }
      run_push_dispatch_tick: { Args: never; Returns: string }
      scheduler_health: {
        Args: never
        Returns: {
          kind: string
          last_error: string
          last_outcome: string
          last_started_at: string
          seconds_since_last: number
          stale: boolean
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
      set_company_operational_contact: {
        Args: {
          p_company_id: string
          p_email: string
          p_phone: string
          p_request_id: string
        }
        Returns: {
          was_replayed: boolean
        }[]
      }
      set_operational_flag: {
        Args: {
          p_key: string
          p_reason: string
          p_request_id: string
          p_value: boolean
        }
        Returns: {
          key: string
          value: boolean
          was_replayed: boolean
        }[]
      }
      set_trip_legal_hold: {
        Args: { p_note: string; p_request_id: string; p_trip_id: string }
        Returns: {
          legal_hold_reason: string
          was_replayed: boolean
        }[]
      }
      settle_dispute_decision: {
        Args: { p_case_id: string; p_request_id: string }
        Returns: {
          cancelled_transaction_id: string
          carrier_amount: number
          case_id: string
          intent_id: string
          new_internal_status: Database["public"]["Enums"]["payment_internal_status"]
          platform_amount: number
          refund_amount: number
          refund_transaction_id: string
          release_amount: number
          release_transaction_id: string
          was_replayed: boolean
        }[]
      }
      sign_contract: {
        Args: {
          p_contract_id: string
          p_request_id: string
          p_signature_hash: string
          p_signature_url: string
        }
        Returns: {
          new_contract_status: Database["public"]["Enums"]["contract_status"]
          new_freight_status: Database["public"]["Enums"]["freight_status"]
          signed_contract_id: string
          signed_freight_id: string
          signed_party: string
          was_replayed: boolean
        }[]
      }
      start_tracking_session: {
        Args: {
          p_app_version: string
          p_device_id: string
          p_platform: string
          p_provider: Database["public"]["Enums"]["tracking_provider"]
          p_trip_id: string
        }
        Returns: {
          policy: Json
          session_id: string
          was_existing: boolean
        }[]
      }
      start_trip_tracking: {
        Args: {
          p_accuracy_m: number
          p_altitude_m?: number
          p_app_version: string
          p_captured_at: string
          p_command_id: string
          p_device_id: string
          p_heading?: number
          p_lat: number
          p_lng: number
          p_platform: string
          p_provider: Database["public"]["Enums"]["tracking_provider"]
          p_seq: number
          p_speed_mps?: number
          p_trip_id: string
        }
        Returns: {
          applied: boolean
          duplicate: boolean
          point_accepted: boolean
          point_flags: string[]
          policy: Json
          rejection_code: string
          session_id: string
          session_was_existing: boolean
          trip_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      steelgo_now: { Args: never; Returns: string }
      submit_proof_of_delivery: {
        Args: {
          p_accuracy_m: number
          p_captured_at: string
          p_command_id: string
          p_device_id: string
          p_geofence_override_reason?: string
          p_lat: number
          p_lng: number
          p_notes: string
          p_outcome: Database["public"]["Enums"]["pod_outcome"]
          p_photos: Json
          p_qty_declared: number
          p_qty_received: number
          p_receiver_document_kind: string
          p_receiver_document_last4: string
          p_receiver_name: string
          p_seq: number
          p_signature_path: string
          p_signature_sha256: string
          p_trip_id: string
        }
        Returns: {
          applied: boolean
          attempt_id: string
          contract_completed: boolean
          delivery_completed: boolean
          duplicate: boolean
          outcome: Database["public"]["Enums"]["pod_outcome"]
          pod_id: string
          rejection_code: string
          trip_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      submit_return_receipt: {
        Args: {
          p_accuracy_m: number
          p_captured_at: string
          p_command_id: string
          p_device_id: string
          p_geofence_override_reason?: string
          p_lat: number
          p_lng: number
          p_note: string
          p_photo_path: string
          p_photo_sha256: string
          p_receiver_name: string
          p_seq: number
          p_trip_id: string
        }
        Returns: {
          applied: boolean
          duplicate: boolean
          rejection_code: string
          trip_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      supersede_proof_of_delivery: {
        Args: {
          p_notes: string
          p_photos: Json
          p_qty_declared: number
          p_qty_received: number
          p_reason: string
          p_receiver_document_kind: string
          p_receiver_document_last4: string
          p_receiver_name: string
          p_request_id: string
          p_signature_path: string
          p_signature_sha256: string
          p_trip_id: string
        }
        Returns: {
          pod_id: string
          version: number
          was_replayed: boolean
        }[]
      }
      transition_trip: {
        Args: {
          p_accuracy_m: number
          p_captured_at: string
          p_command_id: string
          p_device_id: string
          p_geofence_override_reason?: string
          p_lat: number
          p_lng: number
          p_note: string
          p_seq: number
          p_to: Database["public"]["Enums"]["trip_status"]
          p_trip_id: string
        }
        Returns: {
          alert_kind: string
          applied: boolean
          duplicate: boolean
          rejection_code: string
          trip_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      trip_access_append: {
        Args: {
          p_actor_id: string
          p_actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          p_object_ref: string
          p_rpc_name: string
          p_trip_id: string
          p_what: string
        }
        Returns: undefined
      }
      trip_actor_kind_of: {
        Args: { p_role: string }
        Returns: Database["public"]["Enums"]["trip_actor_kind"]
      }
      trip_alert_close: {
        Args: {
          p_kind: Database["public"]["Enums"]["trip_alert_kind"]
          p_reason: string
          p_rpc: string
          p_trip_id: string
        }
        Returns: boolean
      }
      trip_alert_open: {
        Args: {
          p_details: Json
          p_kind: Database["public"]["Enums"]["trip_alert_kind"]
          p_rpc: string
          p_severity: Database["public"]["Enums"]["trip_exception_severity"]
          p_trip: Database["public"]["Tables"]["operational_trips"]["Row"]
        }
        Returns: boolean
      }
      trip_apply_legal_hold: {
        Args: {
          p_actor: string
          p_reason: string
          p_rpc: string
          p_trip_id: string
        }
        Returns: undefined
      }
      trip_assign_core: {
        Args: {
          p_actor: string
          p_actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          p_driver_id: string
          p_fp: string
          p_is_reassignment: boolean
          p_note: string
          p_request_id: string
          p_rpc: string
          p_trip: Database["public"]["Tables"]["operational_trips"]["Row"]
          p_truck_id: string
        }
        Returns: {
          accepted_at: string | null
          assigned_at: string
          assigned_by: string
          assigned_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          carrier_company_id_at_assignment: string
          carrier_id_at_assignment: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_label_at_assignment: string
          driver_profile_id: string
          id: string
          note: string | null
          request_id: string
          revoke_reason: string | null
          revoked_at: string | null
          state: Database["public"]["Enums"]["trip_assignment_state"]
          superseded_by: string | null
          trip_id: string
          truck_id: string
          truck_plate_at_assignment: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trip_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trip_compute_eta: {
        Args: { p_rpc: string; p_trip_id: string }
        Returns: undefined
      }
      trip_create_core: {
        Args: {
          p_actor: string
          p_actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          p_contract_id: string
          p_fp: string
          p_request_id: string
          p_rpc: string
        }
        Returns: {
          attempt_number: number
          cancel_reason: string | null
          cancelled_at: string | null
          cargo_disposition:
            | Database["public"]["Enums"]["cargo_disposition"]
            | null
          cargo_disposition_at: string | null
          carrier_company_id: string
          completed_at: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_exception: boolean
          delivery_geog: unknown
          departed_pickup_at: string | null
          driver_id: string | null
          eta_at: string | null
          eta_basis: Json | null
          eta_source: string | null
          eta_updated_at: string | null
          freight_id: string
          has_open_critical_exception: boolean
          id: string
          last_event_id: string | null
          last_location_at: string | null
          last_location_geog: unknown
          legal_hold_reason: string | null
          legal_hold_until: string | null
          loaded_at: string | null
          paused_by_contract: boolean
          paused_by_exception_id: string | null
          pickup_geog: unknown
          planned_delivery_at: string | null
          planned_distance_km: number | null
          planned_pickup_at: string | null
          policy_version: number
          previous_status: Database["public"]["Enums"]["trip_status"] | null
          raw_locations_purged_at: string | null
          retention_until: string | null
          returned_at: string | null
          shipper_company_id: string
          status: Database["public"]["Enums"]["trip_status"]
          summary_retention_until: string | null
          terminal_reason: string | null
          tracking_state: string
          trip_number: string
          truck_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "operational_trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trip_driver_block: {
        Args: {
          p_role: string
          p_trip: Database["public"]["Tables"]["operational_trips"]["Row"]
        }
        Returns: Json
      }
      trip_end_tracking_sessions: {
        Args: { p_reason: string; p_trip_id: string }
        Returns: number
      }
      trip_evaluate_alerts: {
        Args: { p_rpc: string; p_trip_id: string }
        Returns: {
          closed: number
          opened: number
        }[]
      }
      trip_event_append: {
        Args: {
          p_accuracy_m?: number
          p_actor_id: string
          p_actor_kind: Database["public"]["Enums"]["trip_actor_kind"]
          p_alert_id?: string
          p_assignment_id?: string
          p_captured_at?: string
          p_checkpoint_id?: string
          p_command_id?: string
          p_device_id?: string
          p_document_id?: string
          p_event_type: Database["public"]["Enums"]["trip_event_type"]
          p_exception_id?: string
          p_fingerprint?: string
          p_from_status?: Database["public"]["Enums"]["trip_status"]
          p_internal_note?: string
          p_lat?: number
          p_lng?: number
          p_note?: string
          p_payload?: Json
          p_pod_id?: string
          p_request_id?: string
          p_rpc_name: string
          p_seq_device?: number
          p_to_status?: Database["public"]["Enums"]["trip_status"]
          p_trip_id: string
        }
        Returns: string
      }
      trip_is_active: {
        Args: { p_status: Database["public"]["Enums"]["trip_status"] }
        Returns: boolean
      }
      trip_live_assignment_of_caller: {
        Args: { p_trip_id: string }
        Returns: {
          accepted_at: string | null
          assigned_at: string
          assigned_by: string
          assigned_by_kind: Database["public"]["Enums"]["trip_actor_kind"]
          carrier_company_id_at_assignment: string
          carrier_id_at_assignment: string
          decline_reason: string | null
          declined_at: string | null
          driver_id: string
          driver_label_at_assignment: string
          driver_profile_id: string
          id: string
          note: string | null
          request_id: string
          revoke_reason: string | null
          revoked_at: string | null
          state: Database["public"]["Enums"]["trip_assignment_state"]
          superseded_by: string | null
          trip_id: string
          truck_id: string
          truck_plate_at_assignment: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trip_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trip_lock: {
        Args: { p_trip_id: string }
        Returns: {
          attempt_number: number
          cancel_reason: string | null
          cancelled_at: string | null
          cargo_disposition:
            | Database["public"]["Enums"]["cargo_disposition"]
            | null
          cargo_disposition_at: string | null
          carrier_company_id: string
          completed_at: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_exception: boolean
          delivery_geog: unknown
          departed_pickup_at: string | null
          driver_id: string | null
          eta_at: string | null
          eta_basis: Json | null
          eta_source: string | null
          eta_updated_at: string | null
          freight_id: string
          has_open_critical_exception: boolean
          id: string
          last_event_id: string | null
          last_location_at: string | null
          last_location_geog: unknown
          legal_hold_reason: string | null
          legal_hold_until: string | null
          loaded_at: string | null
          paused_by_contract: boolean
          paused_by_exception_id: string | null
          pickup_geog: unknown
          planned_delivery_at: string | null
          planned_distance_km: number | null
          planned_pickup_at: string | null
          policy_version: number
          previous_status: Database["public"]["Enums"]["trip_status"] | null
          raw_locations_purged_at: string | null
          retention_until: string | null
          returned_at: string | null
          shipper_company_id: string
          status: Database["public"]["Enums"]["trip_status"]
          summary_retention_until: string | null
          terminal_reason: string | null
          tracking_state: string
          trip_number: string
          truck_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "operational_trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trip_object_visible: { Args: { p_name: string }; Returns: boolean }
      trip_policy: {
        Args: {
          p_trip: Database["public"]["Tables"]["operational_trips"]["Row"]
        }
        Returns: {
          accuracy_primary_m: number
          accuracy_reject_m: number
          alert_ack_target_min: number
          clock_future_tolerance_min: number
          comm_loss_critical_min: number
          created_at: string
          created_by: string | null
          effective_from: string
          eta_fallback_speed_kmh: number
          eta_route_factor: number
          geofence_radius_m: number
          id: string
          impossible_speed_kmh: number
          legal_hold_tail_days: number
          location_batch_max_points: number
          location_flush_interval_s: number | null
          location_max_age_hours: number
          location_min_distance_m: number | null
          location_min_interval_s: number | null
          location_silence_min_stationary: number
          location_silence_min_transit: number
          location_stationary_interval_s: number | null
          long_stop_min: number
          moving_away_min_km: number
          no_progress_min: number
          raw_retention_days: number
          reason: string
          request_id: string | null
          sos_ack_target_min: number
          summary_retention_years: number
          version: number
        }
        SetofOptions: {
          from: "operational_trips"
          to: "operational_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      trip_purge_core: {
        Args: {
          p_actor: string
          p_request_id: string
          p_rpc: string
          p_trip_id: string
        }
        Returns: number
      }
      trip_release_capacity: { Args: { p_trip_id: string }; Returns: undefined }
      trip_reserve_capacity: {
        Args: { p_driver_id: string; p_trip_id: string; p_truck_id: string }
        Returns: undefined
      }
      trip_role_of: { Args: { p_trip_id: string }; Returns: string }
      trip_settle_legal_hold: {
        Args: { p_actor: string; p_rpc: string; p_trip_id: string }
        Returns: undefined
      }
      trip_upload_allowed: { Args: { p_trip: string }; Returns: boolean }
      trip_visible: { Args: { p_trip_id: string }; Returns: boolean }
      try_complete_contract: {
        Args: {
          p_actor_id: string
          p_actor_kind: string
          p_contract_id: string
          p_fingerprint: string
          p_request_id: string
          p_rpc_name: string
        }
        Returns: boolean
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
      waive_dispute_evidence_request: {
        Args: {
          p_case_id: string
          p_evidence_request_id: string
          p_note: string
          p_request_id: string
        }
        Returns: string
      }
      withdraw_dispute_case: {
        Args: { p_case_id: string; p_note: string; p_request_id: string }
        Returns: {
          case_id: string
          dispute_state: Database["public"]["Enums"]["dispute_status"]
          restored_contract_status: Database["public"]["Enums"]["contract_status"]
          was_replayed: boolean
        }[]
      }
      withdraw_freight: {
        Args: { p_freight_id: string; p_reason: string; p_request_id: string }
        Returns: string
      }
      withdraw_freight_core: {
        Args: {
          p_actor_id: string
          p_fingerprint: string
          p_freight_id: string
          p_is_admin: boolean
          p_preview_id: string
          p_reason: string
          p_request_id: string
          p_rpc_name: string
        }
        Returns: string
      }
      write_off_dispute_recovery: {
        Args: { p_note: string; p_recovery_id: string; p_request_id: string }
        Returns: {
          all_recoveries_closed: boolean
          new_status: string
          recovery_id: string
          was_replayed: boolean
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
      cargo_disposition:
        | "delivered_by_resolution"
        | "returned_to_origin"
        | "transferred_to_custodian"
        | "transshipped"
        | "emergency_release"
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
      contract_lifecycle_transition:
        | "shipper_signed"
        | "carrier_signed"
        | "activated"
        | "delivery_completed"
        | "escrow_funding_requested"
        | "escrow_funding_confirmed"
        | "escrow_release_requested"
        | "escrow_release_confirmed"
        | "payment_failed"
        | "reconciliation_required"
        | "completed"
        | "disputed"
        | "dispute_resolved"
        | "cancelled"
        | "escrow_settlement_requested"
        | "escrow_settlement_confirmed"
        | "dispute_withdrawn"
      contract_status:
        | "draft"
        | "awaiting_shipper_signature"
        | "awaiting_carrier_signature"
        | "active"
        | "completed"
        | "disputed"
        | "cancelled"
      delivery_exception_resolution:
        | "accept_delivery"
        | "retry_delivery"
        | "return_to_origin"
        | "transshipment"
        | "open_dispute"
      dispute_decision_outcome:
        | "release_to_carrier"
        | "refund_to_shipper"
        | "split"
        | "dismissed"
      dispute_party_role:
        | "claimant"
        | "respondent"
        | "driver"
        | "admin_reviewer"
      dispute_priority: "low" | "normal" | "high" | "critical"
      dispute_reason_code:
        | "cargo_damage"
        | "delivery_delay"
        | "quantity_mismatch"
        | "documentation_issue"
        | "payment_amount"
        | "service_not_rendered"
        | "route_deviation"
        | "other"
      dispute_status:
        | "open"
        | "under_review"
        | "awaiting_evidence"
        | "decided"
        | "closed"
        | "withdrawn"
      freight_category: "traditional" | "green_low_carbon" | "green_ev"
      freight_lifecycle_transition:
        | "publish"
        | "withdraw"
        | "reprice"
        | "cancel"
        | "contract_pending"
        | "contracted"
        | "in_transit"
        | "delivered"
        | "completed"
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
        | "withdrawn"
      payment_confirmation_method: "provider_webhook" | "manual_admin"
      payment_internal_status:
        | "pending_provider"
        | "awaiting_funding"
        | "funding_confirmed"
        | "release_requested"
        | "released_confirmed"
        | "failed"
        | "cancelled"
        | "reconciliation_required"
        | "settlement_requested"
        | "settled"
      payment_party_kind: "platform" | "carrier" | "shipper"
      payment_status:
        | "pending"
        | "escrow_held"
        | "released"
        | "refunded"
        | "disputed"
        | "failed"
      payment_transaction_kind: "funding" | "release" | "refund" | "adjustment"
      payment_transaction_status:
        | "requested"
        | "pending_provider"
        | "confirmed"
        | "failed"
        | "cancelled"
      pod_outcome:
        | "accepted"
        | "accepted_with_notes"
        | "partially_refused"
        | "refused"
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
      tracking_provider: "web" | "community-dev" | "transistorsoft" | "unknown"
      trip_actor_kind: "driver" | "carrier" | "shipper" | "admin" | "system"
      trip_alert_kind:
        | "no_update"
        | "late_eta"
        | "route_deviation"
        | "long_stop"
        | "no_progress"
        | "moving_away"
        | "geofence_exit"
        | "low_battery"
        | "gps_anomaly"
        | "pod_outside_geofence"
        | "sos_ack_overdue"
        | "cargo_without_progress"
        | "scheduler_stale"
        | "sos"
      trip_assignment_state:
        | "offered"
        | "accepted"
        | "declined"
        | "superseded"
        | "revoked"
      trip_checkpoint_kind:
        | "arrived_pickup"
        | "loading_started"
        | "loaded"
        | "departed_pickup"
        | "waypoint"
        | "border"
        | "rest_stop"
        | "arrived_delivery"
        | "unloading_started"
        | "unloaded"
        | "transshipment"
        | "return_receipt"
        | "custom"
      trip_event_type:
        | "trip_created"
        | "policy_frozen"
        | "assigned"
        | "reassigned"
        | "assignment_accepted"
        | "assignment_declined"
        | "assignment_revoked"
        | "transition"
        | "checkpoint"
        | "transshipment_registered"
        | "tracking_started"
        | "tracking_ended"
        | "eta_reported"
        | "exception_opened"
        | "exception_acknowledged"
        | "exception_resolved"
        | "exception_escalated"
        | "sos_opened"
        | "sos_acknowledged"
        | "sos_escalated"
        | "sos_resolved"
        | "document_added"
        | "pod_submitted"
        | "pod_attempt_refused"
        | "pod_superseded"
        | "delivery_exception_resolved"
        | "paused"
        | "resumed"
        | "cancelled"
        | "completed"
        | "contract_terminal_hold"
        | "cargo_disposition_resolved"
        | "emergency_release"
        | "admin_override"
        | "command_rejected"
        | "alert_opened"
        | "alert_acknowledged"
        | "alert_closed"
        | "legal_hold_set"
        | "legal_hold_released"
        | "raw_locations_purged"
        | "notification_sent"
      trip_exception_kind:
        | "delay"
        | "cargo_damage"
        | "cargo_refusal"
        | "document_issue"
        | "vehicle_breakdown"
        | "accident"
        | "theft"
        | "route_deviation"
        | "long_stop"
        | "comm_loss"
        | "delivery_mismatch"
        | "sos"
        | "cargo_disposition_required"
        | "other"
      trip_exception_severity: "low" | "medium" | "high" | "critical"
      trip_exception_status:
        | "open"
        | "acknowledged"
        | "in_progress"
        | "escalated"
        | "resolved"
        | "converted_to_dispute"
      trip_status:
        | "planned"
        | "assigned"
        | "driver_accepted"
        | "en_route_to_pickup"
        | "at_pickup"
        | "loading"
        | "in_transit"
        | "at_delivery"
        | "unloading"
        | "returning"
        | "delivered"
        | "returned"
        | "completed"
        | "cancelled"
      trip_visibility: "parties" | "carrier_admin" | "admin_only"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      cargo_disposition: [
        "delivered_by_resolution",
        "returned_to_origin",
        "transferred_to_custodian",
        "transshipped",
        "emergency_release",
      ],
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
      contract_lifecycle_transition: [
        "shipper_signed",
        "carrier_signed",
        "activated",
        "delivery_completed",
        "escrow_funding_requested",
        "escrow_funding_confirmed",
        "escrow_release_requested",
        "escrow_release_confirmed",
        "payment_failed",
        "reconciliation_required",
        "completed",
        "disputed",
        "dispute_resolved",
        "cancelled",
        "escrow_settlement_requested",
        "escrow_settlement_confirmed",
        "dispute_withdrawn",
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
      delivery_exception_resolution: [
        "accept_delivery",
        "retry_delivery",
        "return_to_origin",
        "transshipment",
        "open_dispute",
      ],
      dispute_decision_outcome: [
        "release_to_carrier",
        "refund_to_shipper",
        "split",
        "dismissed",
      ],
      dispute_party_role: [
        "claimant",
        "respondent",
        "driver",
        "admin_reviewer",
      ],
      dispute_priority: ["low", "normal", "high", "critical"],
      dispute_reason_code: [
        "cargo_damage",
        "delivery_delay",
        "quantity_mismatch",
        "documentation_issue",
        "payment_amount",
        "service_not_rendered",
        "route_deviation",
        "other",
      ],
      dispute_status: [
        "open",
        "under_review",
        "awaiting_evidence",
        "decided",
        "closed",
        "withdrawn",
      ],
      freight_category: ["traditional", "green_low_carbon", "green_ev"],
      freight_lifecycle_transition: [
        "publish",
        "withdraw",
        "reprice",
        "cancel",
        "contract_pending",
        "contracted",
        "in_transit",
        "delivered",
        "completed",
      ],
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
        "withdrawn",
      ],
      payment_confirmation_method: ["provider_webhook", "manual_admin"],
      payment_internal_status: [
        "pending_provider",
        "awaiting_funding",
        "funding_confirmed",
        "release_requested",
        "released_confirmed",
        "failed",
        "cancelled",
        "reconciliation_required",
        "settlement_requested",
        "settled",
      ],
      payment_party_kind: ["platform", "carrier", "shipper"],
      payment_status: [
        "pending",
        "escrow_held",
        "released",
        "refunded",
        "disputed",
        "failed",
      ],
      payment_transaction_kind: ["funding", "release", "refund", "adjustment"],
      payment_transaction_status: [
        "requested",
        "pending_provider",
        "confirmed",
        "failed",
        "cancelled",
      ],
      pod_outcome: [
        "accepted",
        "accepted_with_notes",
        "partially_refused",
        "refused",
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
      tracking_provider: ["web", "community-dev", "transistorsoft", "unknown"],
      trip_actor_kind: ["driver", "carrier", "shipper", "admin", "system"],
      trip_alert_kind: [
        "no_update",
        "late_eta",
        "route_deviation",
        "long_stop",
        "no_progress",
        "moving_away",
        "geofence_exit",
        "low_battery",
        "gps_anomaly",
        "pod_outside_geofence",
        "sos_ack_overdue",
        "cargo_without_progress",
        "scheduler_stale",
        "sos",
      ],
      trip_assignment_state: [
        "offered",
        "accepted",
        "declined",
        "superseded",
        "revoked",
      ],
      trip_checkpoint_kind: [
        "arrived_pickup",
        "loading_started",
        "loaded",
        "departed_pickup",
        "waypoint",
        "border",
        "rest_stop",
        "arrived_delivery",
        "unloading_started",
        "unloaded",
        "transshipment",
        "return_receipt",
        "custom",
      ],
      trip_event_type: [
        "trip_created",
        "policy_frozen",
        "assigned",
        "reassigned",
        "assignment_accepted",
        "assignment_declined",
        "assignment_revoked",
        "transition",
        "checkpoint",
        "transshipment_registered",
        "tracking_started",
        "tracking_ended",
        "eta_reported",
        "exception_opened",
        "exception_acknowledged",
        "exception_resolved",
        "exception_escalated",
        "sos_opened",
        "sos_acknowledged",
        "sos_escalated",
        "sos_resolved",
        "document_added",
        "pod_submitted",
        "pod_attempt_refused",
        "pod_superseded",
        "delivery_exception_resolved",
        "paused",
        "resumed",
        "cancelled",
        "completed",
        "contract_terminal_hold",
        "cargo_disposition_resolved",
        "emergency_release",
        "admin_override",
        "command_rejected",
        "alert_opened",
        "alert_acknowledged",
        "alert_closed",
        "legal_hold_set",
        "legal_hold_released",
        "raw_locations_purged",
        "notification_sent",
      ],
      trip_exception_kind: [
        "delay",
        "cargo_damage",
        "cargo_refusal",
        "document_issue",
        "vehicle_breakdown",
        "accident",
        "theft",
        "route_deviation",
        "long_stop",
        "comm_loss",
        "delivery_mismatch",
        "sos",
        "cargo_disposition_required",
        "other",
      ],
      trip_exception_severity: ["low", "medium", "high", "critical"],
      trip_exception_status: [
        "open",
        "acknowledged",
        "in_progress",
        "escalated",
        "resolved",
        "converted_to_dispute",
      ],
      trip_status: [
        "planned",
        "assigned",
        "driver_accepted",
        "en_route_to_pickup",
        "at_pickup",
        "loading",
        "in_transit",
        "at_delivery",
        "unloading",
        "returning",
        "delivered",
        "returned",
        "completed",
        "cancelled",
      ],
      trip_visibility: ["parties", "carrier_admin", "admin_only"],
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
