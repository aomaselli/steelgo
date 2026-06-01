
DROP POLICY IF EXISTS cargo_photos_party_read ON storage.objects;
CREATE POLICY cargo_photos_party_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cargo-photos' AND (
      EXISTS (
        SELECT 1 FROM public.contracts c
        LEFT JOIN public.companies co1 ON co1.id = c.shipper_company_id
        LEFT JOIN public.companies co2 ON co2.id = c.carrier_company_id
        WHERE c.id::text = (storage.foldername(storage.objects.name))[2]
          AND (co1.owner_id = auth.uid() OR co2.owner_id = auth.uid() OR c.driver_id = auth.uid())
      )
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY doc_buckets_delete_owner ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = ANY(ARRAY['company-docs','carrier-docs','truck-docs','driver-docs'])
    AND (auth.uid())::text = (storage.foldername(storage.objects.name))[1]
  );

CREATE POLICY contract_pdfs_delete_admin ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contract-pdfs' AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS security_alerts_select_party ON public.security_alerts;
CREATE POLICY security_alerts_select_party ON public.security_alerts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contracts c
      LEFT JOIN public.companies co1 ON co1.id = c.shipper_company_id
      LEFT JOIN public.companies co2 ON co2.id = c.carrier_company_id
      WHERE c.id = security_alerts.contract_id
        AND (co1.owner_id = auth.uid() OR co2.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.freights f
      JOIN public.companies co ON co.id = f.company_id
      WHERE f.id = security_alerts.freight_id
        AND co.owner_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
