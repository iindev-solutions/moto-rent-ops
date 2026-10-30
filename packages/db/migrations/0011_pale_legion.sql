ALTER TABLE "allocations" ADD CONSTRAINT "allocations_amount_chk" CHECK ("allocations"."amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "deposit_dispositions" ADD CONSTRAINT "deposit_dispositions_amount_chk" CHECK ("deposit_dispositions"."amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_amount_nonnegative_chk" CHECK ("deposits"."amount_minor" IS NULL OR "deposits"."amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_cash_amount_chk" CHECK ("deposits"."type" <> 'cash' OR ("deposits"."amount_minor" IS NOT NULL AND "deposits"."amount_minor" > 0));--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_currency_chk" CHECK ("deposits"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_cost_chk" CHECK ("maintenance_orders"."cost_minor" >= 0);--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_currency_chk" CHECK ("maintenance_orders"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_amount_chk" CHECK ("obligations"."amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_currency_chk" CHECK ("obligations"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_amount_chk" CHECK ("receipts"."amount_minor" > 0);--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_currency_chk" CHECK ("receipts"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_dates_chk" CHECK ("rental_agreements"."end_date" IS NULL OR "rental_agreements"."start_date" IS NULL OR "rental_agreements"."end_date" >= "rental_agreements"."start_date");--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_dates_chk" CHECK ("rental_items"."end_date" >= "rental_items"."start_date");--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_daily_rate_chk" CHECK ("rental_items"."daily_rate_minor" > 0);--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_currency_chk" CHECK ("rental_items"."currency" ~ '^[A-Z]{3}$');