CREATE TABLE "legacy_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(160),
	"status" varchar(16) DEFAULT 'dry_run' NOT NULL,
	"source_checksum" varchar(64) NOT NULL,
	"source_row_count" integer DEFAULT 0 NOT NULL,
	"valid_row_count" integer DEFAULT 0 NOT NULL,
	"invalid_row_count" integer DEFAULT 0 NOT NULL,
	"duplicate_row_count" integer DEFAULT 0 NOT NULL,
	"imported_row_count" integer DEFAULT 0 NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "legacy_import_batches_status_chk" CHECK ("legacy_import_batches"."status" IN ('dry_run', 'applied', 'failed')),
	CONSTRAINT "legacy_import_batches_counts_chk" CHECK ("legacy_import_batches"."source_row_count" >= 0 AND "legacy_import_batches"."valid_row_count" >= 0 AND "legacy_import_batches"."invalid_row_count" >= 0 AND "legacy_import_batches"."duplicate_row_count" >= 0 AND "legacy_import_batches"."imported_row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "legacy_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_table" varchar(40) NOT NULL,
	"source_id" varchar(120) NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"target_entity_type" varchar(40),
	"target_entity_id" uuid,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_import_rows_status_chk" CHECK ("legacy_import_rows"."status" IN ('pending', 'valid', 'invalid', 'imported', 'duplicate', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_limit_buckets_count_chk" CHECK ("rate_limit_buckets"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "legacy_import_batches" ADD CONSTRAINT "legacy_import_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_import_rows" ADD CONSTRAINT "legacy_import_rows_batch_id_legacy_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."legacy_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_import_batches_created_idx" ON "legacy_import_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "legacy_import_rows_batch_source_idx" ON "legacy_import_rows" USING btree ("batch_id","source_table","source_id");--> statement-breakpoint
CREATE INDEX "legacy_import_rows_batch_idx" ON "legacy_import_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "legacy_import_rows_target_idx" ON "legacy_import_rows" USING btree ("target_entity_type","target_entity_id");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_reset_idx" ON "rate_limit_buckets" USING btree ("reset_at");