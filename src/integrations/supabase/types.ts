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
    PostgrestVersion: "14.5"
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
          id: string
          insurance_doc_url: string | null
          insurance_expiry: string | null
          is_active: boolean | null
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
          id?: string
          insurance_doc_url?: string | null
          insurance_expiry?: string | null
          is_active?: boolean | null
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
          id?: string
          insurance_doc_url?: string | null
          insurance_expiry?: string | null
          is_active?: boolean | null
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
          created_at: string | null
          id: string
          is_verified: boolean | null
          logo_url: string | null
          name: string
          owner_id: string
          stripe_customer_id: string | null
          tier: Database["public"]["Enums"]["company_tier"] | null
          trade_name: string | null
          type: string | null
          updated_at: string
          verification_doc_url: string | null
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          cnpj?: string | null
          created_at?: string | null
          id?: string
          is_verified?: boolean | null
          logo_url?: string | null
          name: string
          owner_id: string
          stripe_customer_id?: string | null
          tier?: Database["public"]["Enums"]["company_tier"] | null
          trade_name?: string | null
          type?: string | null
          updated_at?: string
          verification_doc_url?: string | null
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          cnpj?: string | null
          created_at?: string | null
          id?: string
          is_verified?: boolean | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          stripe_customer_id?: string | null
          tier?: Database["public"]["Enums"]["company_tier"] | null
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
          carrier_id: string
          cnh_category: string | null
          cnh_doc_url: string | null
          cnh_expiry: string | null
          cnh_number: string | null
          cpf: string | null
          created_at: string
          full_name: string
          has_mopp: boolean | null
          id: string
          is_active: boolean | null
          is_verified: boolean
          mopp_certified: boolean | null
          profile_id: string | null
          updated_at: string
        }
        Insert: {
          carrier_id: string
          cnh_category?: string | null
          cnh_doc_url?: string | null
          cnh_expiry?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
          full_name: string
          has_mopp?: boolean | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean
          mopp_certified?: boolean | null
          profile_id?: string | null
          updated_at?: string
        }
        Update: {
          carrier_id?: string
          cnh_category?: string | null
          cnh_doc_url?: string | null
          cnh_expiry?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
          full_name?: string
          has_mopp?: boolean | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean
          mopp_certified?: boolean | null
          profile_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
      freights: {
        Row: {
          bid_deadline: string | null
          budget_brl: number | null
          cargo_value_brl: number | null
          category: Database["public"]["Enums"]["freight_category"] | null
          company_id: string
          created_at: string | null
          created_by: string
          delivery_date: string | null
          dest_city: string | null
          dest_lat: number | null
          dest_lng: number | null
          dest_name: string | null
          dest_state: string | null
          distance_km: number | null
          final_price_brl: number | null
          id: string
          matched_carrier_id: string | null
          matched_driver_id: string | null
          matched_truck_id: string | null
          notes: string | null
          origin_city: string | null
          origin_lat: number | null
          origin_lng: number | null
          origin_name: string | null
          origin_state: string | null
          pickup_date: string | null
          pickup_window: string | null
          published_at: string | null
          required_truck: Database["public"]["Enums"]["truck_type"][] | null
          status: Database["public"]["Enums"]["freight_status"] | null
          steel_type: Database["public"]["Enums"]["steel_type"] | null
          updated_at: string
          weight_tons: number | null
        }
        Insert: {
          bid_deadline?: string | null
          budget_brl?: number | null
          cargo_value_brl?: number | null
          category?: Database["public"]["Enums"]["freight_category"] | null
          company_id: string
          created_at?: string | null
          created_by: string
          delivery_date?: string | null
          dest_city?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          dest_name?: string | null
          dest_state?: string | null
          distance_km?: number | null
          final_price_brl?: number | null
          id?: string
          matched_carrier_id?: string | null
          matched_driver_id?: string | null
          matched_truck_id?: string | null
          notes?: string | null
          origin_city?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          origin_state?: string | null
          pickup_date?: string | null
          pickup_window?: string | null
          published_at?: string | null
          required_truck?: Database["public"]["Enums"]["truck_type"][] | null
          status?: Database["public"]["Enums"]["freight_status"] | null
          steel_type?: Database["public"]["Enums"]["steel_type"] | null
          updated_at?: string
          weight_tons?: number | null
        }
        Update: {
          bid_deadline?: string | null
          budget_brl?: number | null
          cargo_value_brl?: number | null
          category?: Database["public"]["Enums"]["freight_category"] | null
          company_id?: string
          created_at?: string | null
          created_by?: string
          delivery_date?: string | null
          dest_city?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          dest_name?: string | null
          dest_state?: string | null
          distance_km?: number | null
          final_price_brl?: number | null
          id?: string
          matched_carrier_id?: string | null
          matched_driver_id?: string | null
          matched_truck_id?: string | null
          notes?: string | null
          origin_city?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          origin_state?: string | null
          pickup_date?: string | null
          pickup_window?: string | null
          published_at?: string | null
          required_truck?: Database["public"]["Enums"]["truck_type"][] | null
          status?: Database["public"]["Enums"]["freight_status"] | null
          steel_type?: Database["public"]["Enums"]["steel_type"] | null
          updated_at?: string
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
          brand: string | null
          capacity_tons: number | null
          carrier_id: string | null
          co2_per_km: number | null
          created_at: string | null
          crlv_url: string | null
          id: string
          is_ev: boolean | null
          max_weight_tons: number | null
          model: string | null
          plate: string | null
          type: Database["public"]["Enums"]["truck_type"] | null
          year: number | null
        }
        Insert: {
          brand?: string | null
          capacity_tons?: number | null
          carrier_id?: string | null
          co2_per_km?: number | null
          created_at?: string | null
          crlv_url?: string | null
          id?: string
          is_ev?: boolean | null
          max_weight_tons?: number | null
          model?: string | null
          plate?: string | null
          type?: Database["public"]["Enums"]["truck_type"] | null
          year?: number | null
        }
        Update: {
          brand?: string | null
          capacity_tons?: number | null
          carrier_id?: string | null
          co2_per_km?: number | null
          created_at?: string | null
          crlv_url?: string | null
          id?: string
          is_ev?: boolean | null
          max_weight_tons?: number | null
          model?: string | null
          plate?: string | null
          type?: Database["public"]["Enums"]["truck_type"] | null
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
