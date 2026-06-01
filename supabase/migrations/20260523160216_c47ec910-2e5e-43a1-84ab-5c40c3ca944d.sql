-- Auto updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_profiles_upd ON public.profiles;
CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_companies_upd ON public.companies;
CREATE TRIGGER trg_companies_upd BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_freights_upd ON public.freights;
CREATE TRIGGER trg_freights_upd BEFORE UPDATE ON public.freights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_contracts_upd ON public.contracts;
CREATE TRIGGER trg_contracts_upd BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_payments_upd ON public.payments;
CREATE TRIGGER trg_payments_upd BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Contract number generator
CREATE OR REPLACE FUNCTION public.generate_contract_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE year_str text := to_char(now(),'YYYY'); seq_num int;
BEGIN
  IF NEW.contract_number IS NULL THEN
    SELECT count(*)+1 INTO seq_num FROM public.contracts
      WHERE extract(year FROM created_at) = extract(year FROM now());
    NEW.contract_number := 'SG-'||year_str||'-'||lpad(seq_num::text,5,'0');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_contract_number ON public.contracts;
CREATE TRIGGER trg_contract_number BEFORE INSERT ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.generate_contract_number();

-- Auto-create carrier_scores row
CREATE OR REPLACE FUNCTION public.create_carrier_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.carrier_scores(carrier_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_carrier_score_init ON public.carriers;
CREATE TRIGGER trg_carrier_score_init AFTER INSERT ON public.carriers
FOR EACH ROW EXECUTE FUNCTION public.create_carrier_score();