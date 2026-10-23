CREATE TABLE "outbox_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"epoch" integer DEFAULT 0 NOT NULL,
	"attempt" integer NOT NULL,
	"status" varchar(16) NOT NULL,
	"http_status" integer,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_attempts_status_chk" CHECK ("outbox_attempts"."status" IN ('sent', 'failed')),
	CONSTRAINT "outbox_attempts_attempt_chk" CHECK ("outbox_attempts"."attempt" > 0),
	CONSTRAINT "outbox_attempts_epoch_chk" CHECK ("outbox_attempts"."epoch" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"aggregate_type" varchar(60) NOT NULL,
	"aggregate_id" uuid,
	"dedupe_key" varchar(200) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"replay_epoch" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_status_chk" CHECK ("outbox_events"."status" IN ('pending', 'processing', 'sent', 'dead_letter')),
	CONSTRAINT "outbox_events_attempts_chk" CHECK ("outbox_events"."attempts" >= 0),
	CONSTRAINT "outbox_events_replay_epoch_chk" CHECK ("outbox_events"."replay_epoch" >= 0)
);
--> statement-breakpoint
ALTER TABLE "outbox_attempts" ADD CONSTRAINT "outbox_attempts_event_id_outbox_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."outbox_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_attempts_event_epoch_attempt_uidx" ON "outbox_attempts" USING btree ("event_id","epoch","attempt");--> statement-breakpoint
CREATE INDEX "outbox_attempts_event_idx" ON "outbox_attempts" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_dedupe_key_uidx" ON "outbox_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "outbox_events_status_next_idx" ON "outbox_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "outbox_events_created_idx" ON "outbox_events" USING btree ("created_at");