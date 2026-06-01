-- 1. Extend contracts table
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS shipper_signature_url text,
  ADD COLUMN IF NOT EXISTS carrier_signature_url text,
  ADD COLUMN IF NOT EXISTS shipper_signature_hash text,
  ADD COLUMN IF NOT EXISTS carrier_signature_hash text,
  ADD COLUMN IF NOT EXISTS shipper_signed_ip text,
  ADD COLUMN IF NOT EXISTS carrier_signed_ip text,
  ADD COLUMN IF NOT EXISTS pickup_window text,
  ADD COLUMN IF NOT EXISTS escrow_held_at timestamptz,
  ADD COLUMN IF NOT EXISTS escrow_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS escrow_status text NOT NULL DEFAULT 'pending';

-- Ensure escrow_status only allows known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_escrow_status_check'
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_escrow_status_check
      CHECK (escrow_status IN ('pending','escrow_held','released','refunded','disputed'));
  END IF;
END $$;

-- Ensure contract_status enum has needed values (idempotent additions)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_status') THEN
    BEGIN ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'awaiting_shipper_signature'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'awaiting_carrier_signature'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'active'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'completed'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'disputed'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'cancelled'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- 2. carrier_reviews table
CREATE TABLE IF NOT EXISTS public.carrier_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  carrier_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  on_time int CHECK (on_time BETWEEN 1 AND 3),
  cargo_condition int CHECK (cargo_condition BETWEEN 1 AND 3),
  communication int CHECK (communication BETWEEN 1 AND 3),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, reviewer_id)
);

ALTER TABLE public.carrier_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carrier_reviews_select_auth ON public.carrier_reviews;
CREATE POLICY carrier_reviews_select_auth ON public.carrier_reviews
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS carrier_reviews_insert_shipper ON public.carrier_reviews;
CREATE POLICY carrier_reviews_insert_shipper ON public.carrier_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.contracts c
      JOIN public.companies co ON co.id = c.shipper_company_id
      WHERE c.id = carrier_reviews.contract_id AND co.owner_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS carrier_reviews_carrier_idx ON public.carrier_reviews(carrier_id);

-- 3. contract-pdfs storage bucket (public read for previews)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-pdfs', 'contract-pdfs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "contract-pdfs public read" ON storage.objects;
CREATE POLICY "contract-pdfs public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'contract-pdfs');

DROP POLICY IF EXISTS "contract-pdfs auth upload" ON storage.objects;
CREATE POLICY "contract-pdfs auth upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contract-pdfs');

DROP POLICY IF EXISTS "contract-pdfs auth update" ON storage.objects;
CREATE POLICY "contract-pdfs auth update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'contract-pdfs');