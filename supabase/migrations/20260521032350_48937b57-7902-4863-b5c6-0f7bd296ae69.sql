-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Create enum types (safely skip if already exists)
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('shipper','carrier','driver','admin'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE company_type AS ENUM ('steel_company','distributor','industry','carrier_company'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE freight_status AS ENUM ('draft','published','bidding','matched','contract_pending','contracted','in_transit','delivered','completed','cancelled','disputed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE freight_category AS ENUM ('traditional','green_low_carbon','green_ev'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE steel_type AS ENUM ('bobina_laminada_frio','bobina_laminada_quente','chapa_grossa','perfil_estrutural','cano_sem_costura','barra_redonda','vergalhao','tubo_galvanizado','blank_estampagem','outro'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE bid_status AS ENUM ('pending','accepted','rejected','expired','withdrawn'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE contract_status AS ENUM ('draft','published','bidding','matched','contract_pending','contracted','in_transit','delivered','completed','cancelled','disputed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending','escrow_held','released','refunded','disputed','failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE checkpoint_type AS ENUM ('origin_loading','waypoint','security_checkpoint','destination_unloading','incident'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE truck_type AS ENUM ('truck_simples','toco','truck','bitruck','carreta','carreta_extendida','rodotrem','bitrem','ev_carreta','ev_truck'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE alert_type AS ENUM ('route_deviation','panic_button','checkpoint_missed','cargo_tamper','driver_id_mismatch','payment_dispute','contract_expiry'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE alert_severity AS ENUM ('low','medium','high','critical'); EXCEPTION WHEN duplicate_object THEN null; END $$;