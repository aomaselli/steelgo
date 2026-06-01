UPDATE storage.buckets SET public = false WHERE id = 'contract-pdfs';

DROP POLICY IF EXISTS "contract-pdfs public read" ON storage.objects;

DROP POLICY IF EXISTS "contract-pdfs auth read" ON storage.objects;
CREATE POLICY "contract-pdfs auth read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contract-pdfs');