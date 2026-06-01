-- freights additions
ALTER TABLE public.freights ADD COLUMN IF NOT EXISTS delivery_date date;
ALTER TABLE public.freights ADD COLUMN IF NOT EXISTS matched_driver_id uuid;
ALTER TABLE public.freights ADD COLUMN IF NOT EXISTS matched_truck_id uuid;
ALTER TABLE public.freights ADD COLUMN IF NOT EXISTS pickup_window text;
ALTER TABLE public.freights ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- bids unique constraint
DO $$ BEGIN
  ALTER TABLE public.bids ADD CONSTRAINT bids_freight_carrier_unique UNIQUE (freight_id, carrier_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- contracts additions
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.contracts ADD CONSTRAINT contracts_bid_id_unique UNIQUE (bid_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.contracts ADD CONSTRAINT contracts_contract_number_unique UNIQUE (contract_number);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;