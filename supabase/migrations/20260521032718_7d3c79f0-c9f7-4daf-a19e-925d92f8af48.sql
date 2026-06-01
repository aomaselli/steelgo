-- profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.companies ADD CONSTRAINT companies_cnpj_key UNIQUE (cnpj);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.companies ADD CONSTRAINT companies_stripe_customer_id_key UNIQUE (stripe_customer_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- company_members (existing schema uses user_id, not profile_id)
DO $$ BEGIN
  ALTER TABLE public.company_members
    ADD CONSTRAINT company_members_company_user_unique UNIQUE (company_id, user_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- carriers
ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.carriers ADD CONSTRAINT carriers_antt_rntrc_key UNIQUE (antt_rntrc);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- drivers
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS mopp_certified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.drivers ADD CONSTRAINT drivers_profile_id_key UNIQUE (profile_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- trucks
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS max_weight_tons numeric(10,2),
  ADD COLUMN IF NOT EXISTS co2_per_km numeric(8,4);