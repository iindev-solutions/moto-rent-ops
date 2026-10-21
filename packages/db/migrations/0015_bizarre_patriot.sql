ALTER TABLE "deposit_dispositions" ADD CONSTRAINT "deposit_dispositions_type_chk" CHECK ("deposit_dispositions"."type" IN ('applied', 'returned'));--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_type_chk" CHECK ("deposits"."type" IN ('cash', 'document_custody'));--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_status_chk" CHECK ("deposits"."status" IN ('held', 'applied', 'returned'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION allocations_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  receipt_amount bigint;
  receipt_currency varchar(8);
  obligation_amount bigint;
  obligation_currency varchar(8);
  receipt_allocated bigint;
  obligation_allocated bigint;
BEGIN
  SELECT amount_minor, currency INTO obligation_amount, obligation_currency
    FROM obligations WHERE id = NEW.obligation_id FOR UPDATE;
  SELECT amount_minor, currency INTO receipt_amount, receipt_currency
    FROM receipts WHERE id = NEW.receipt_id FOR UPDATE;

  IF receipt_amount IS NULL OR obligation_amount IS NULL THEN
    RETURN NEW;
  END IF;

  IF receipt_currency <> obligation_currency THEN
    RAISE EXCEPTION 'allocation currency mismatch' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(amount_minor), 0) INTO receipt_allocated
    FROM allocations WHERE receipt_id = NEW.receipt_id AND id <> NEW.id;
  IF receipt_allocated + NEW.amount_minor > receipt_amount THEN
    RAISE EXCEPTION 'allocation total exceeds the receipt amount' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(amount_minor), 0) INTO obligation_allocated
    FROM allocations WHERE obligation_id = NEW.obligation_id AND id <> NEW.id;
  IF obligation_allocated + NEW.amount_minor > obligation_amount THEN
    RAISE EXCEPTION 'allocation total exceeds the obligation amount' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER allocations_guard_trigger
BEFORE INSERT OR UPDATE ON allocations
FOR EACH ROW EXECUTE FUNCTION allocations_guard();--> statement-breakpoint
CREATE OR REPLACE FUNCTION deposit_dispositions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  deposit_amount bigint;
  deposit_type varchar(32);
  disposed bigint;
BEGIN
  SELECT amount_minor, type INTO deposit_amount, deposit_type
    FROM deposits WHERE id = NEW.deposit_id FOR UPDATE;

  IF deposit_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF deposit_amount IS NULL THEN
    RAISE EXCEPTION 'document custody deposit cannot be disposed as cash' USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM(amount_minor), 0) INTO disposed
    FROM deposit_dispositions WHERE deposit_id = NEW.deposit_id AND id <> NEW.id;
  IF disposed + NEW.amount_minor > deposit_amount THEN
    RAISE EXCEPTION 'deposit dispositions exceed the deposit amount' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER deposit_dispositions_guard_trigger
BEFORE INSERT OR UPDATE ON deposit_dispositions
FOR EACH ROW EXECUTE FUNCTION deposit_dispositions_guard();