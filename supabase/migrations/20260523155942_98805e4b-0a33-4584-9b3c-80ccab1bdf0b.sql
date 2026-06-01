-- checkpoints additions
ALTER TABLE public.checkpoints ADD COLUMN IF NOT EXISTS accuracy_m numeric(8,2);
ALTER TABLE public.checkpoints ADD COLUMN IF NOT EXISTS notes text;

-- unique constraints
DO $$ BEGIN
  ALTER TABLE public.carrier_scores ADD CONSTRAINT carrier_scores_carrier_id_unique UNIQUE (carrier_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.carrier_reviews ADD CONSTRAINT carrier_reviews_contract_reviewer_unique UNIQUE (contract_id, reviewer_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

-- payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL UNIQUE,
  shipper_company_id uuid NOT NULL,
  carrier_company_id uuid NOT NULL,
  amount_brl numeric(14,2) NOT NULL,
  platform_fee_brl numeric(14,2) NOT NULL,
  carrier_payout_brl numeric(14,2) NOT NULL,
  stripe_payment_intent_id text UNIQUE,
  stripe_charge_id text,
  stripe_transfer_id text,
  status payment_status NOT NULL DEFAULT 'pending',
  escrow_held_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY payments_select_party ON public.payments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM companies co WHERE co.id = payments.shipper_company_id AND co.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM companies co WHERE co.id = payments.carrier_company_id AND co.owner_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY payments_admin_manage ON public.payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;