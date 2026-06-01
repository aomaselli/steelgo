-- 1) Fix companies_select self-referential bug
DROP POLICY IF EXISTS "companies_select" ON public.companies;
CREATE POLICY "companies_select" ON public.companies
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = companies.id AND cm.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 2) Lock down contract-pdfs bucket. Path convention: {contract_id}/file.pdf
DROP POLICY IF EXISTS "contract-pdfs auth upload" ON storage.objects;
DROP POLICY IF EXISTS "contract-pdfs auth update" ON storage.objects;
DROP POLICY IF EXISTS "contract-pdfs auth read"   ON storage.objects;

CREATE POLICY "contract_pdfs_party_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'contract-pdfs'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      LEFT JOIN public.companies cs ON cs.id = c.shipper_company_id
      LEFT JOIN public.companies cc ON cc.id = c.carrier_company_id
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
        AND (cs.owner_id = auth.uid() OR cc.owner_id = auth.uid() OR c.driver_id = auth.uid())
    )
  )
);

CREATE POLICY "contract_pdfs_party_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contract-pdfs'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      LEFT JOIN public.companies cs ON cs.id = c.shipper_company_id
      LEFT JOIN public.companies cc ON cc.id = c.carrier_company_id
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
        AND (cs.owner_id = auth.uid() OR cc.owner_id = auth.uid())
    )
  )
);

CREATE POLICY "contract_pdfs_party_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'contract-pdfs'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      LEFT JOIN public.companies cs ON cs.id = c.shipper_company_id
      LEFT JOIN public.companies cc ON cc.id = c.carrier_company_id
      WHERE c.id::text = (storage.foldername(storage.objects.name))[1]
        AND (cs.owner_id = auth.uid() OR cc.owner_id = auth.uid())
    )
  )
);

-- 3) Cargo photos: add party read policy alongside the existing driver-only one.
-- Path convention: {driver_uid}/{contract_id}/...
CREATE POLICY "cargo_photos_party_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'cargo-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      LEFT JOIN public.companies cs ON cs.id = c.shipper_company_id
      LEFT JOIN public.companies cc ON cc.id = c.carrier_company_id
      WHERE c.id::text = (storage.foldername(storage.objects.name))[2]
        AND (cs.owner_id = auth.uid() OR cc.owner_id = auth.uid())
    )
  )
);

-- 4) Remove broad listing policy on avatars bucket.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;