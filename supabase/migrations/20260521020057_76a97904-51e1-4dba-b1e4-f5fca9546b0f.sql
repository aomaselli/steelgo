-- 1. profiles: onboarding + preferences
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_onboarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. companies: verification doc
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS verification_doc_url text;

-- 3. carriers: insurance + operating states
ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS insurance_doc_url text,
  ADD COLUMN IF NOT EXISTS operating_states text[];

-- 4. trucks: complete fleet data
ALTER TABLE public.trucks
  ADD COLUMN IF NOT EXISTS capacity_tons numeric,
  ADD COLUMN IF NOT EXISTS year integer,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS crlv_url text;

-- 5. drivers table
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id uuid NOT NULL,
  profile_id uuid,
  full_name text NOT NULL,
  cpf text,
  cnh_number text,
  cnh_category text,
  cnh_expiry date,
  has_mopp boolean DEFAULT false,
  cnh_doc_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY drivers_select_party ON public.drivers
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM carriers ca
      JOIN companies co ON co.id = ca.company_id
      WHERE ca.id = drivers.carrier_id AND co.owner_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY drivers_manage_owner ON public.drivers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM carriers ca
      JOIN companies co ON co.id = ca.company_id
      WHERE ca.id = drivers.carrier_id AND co.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM carriers ca
      JOIN companies co ON co.id = ca.company_id
      WHERE ca.id = drivers.carrier_id AND co.owner_id = auth.uid()
    )
  );

-- 6. Storage buckets (private)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('company-docs', 'company-docs', false),
  ('carrier-docs', 'carrier-docs', false),
  ('truck-docs', 'truck-docs', false),
  ('driver-docs', 'driver-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users access only their own folder (first segment = user id)
CREATE POLICY "doc_buckets_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('company-docs','carrier-docs','truck-docs','driver-docs')
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "doc_buckets_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('company-docs','carrier-docs','truck-docs','driver-docs')
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "doc_buckets_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('company-docs','carrier-docs','truck-docs','driver-docs')
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "doc_buckets_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id IN ('company-docs','carrier-docs','truck-docs','driver-docs')
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    bucket_id IN ('company-docs','carrier-docs','truck-docs','driver-docs')
    AND has_role(auth.uid(), 'admin'::app_role)
  );