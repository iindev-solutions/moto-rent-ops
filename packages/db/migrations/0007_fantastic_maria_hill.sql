CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motorcycle_id" uuid,
	"client_id" uuid,
	"title" varchar(160) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"priority" varchar(16) DEFAULT 'medium' NOT NULL,
	"assigned_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motorcycle_id" uuid NOT NULL,
	"type" varchar(64) DEFAULT 'service' NOT NULL,
	"status" varchar(32) DEFAULT 'planned' NOT NULL,
	"due_date" timestamp with time zone,
	"cost_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'VND' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_motorcycle_id_motorcycles_id_fk" FOREIGN KEY ("motorcycle_id") REFERENCES "public"."motorcycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_motorcycle_id_motorcycles_id_fk" FOREIGN KEY ("motorcycle_id") REFERENCES "public"."motorcycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_motorcycle_idx" ON "incidents" USING btree ("motorcycle_id");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "maintenance_motorcycle_idx" ON "maintenance_orders" USING btree ("motorcycle_id");--> statement-breakpoint
CREATE INDEX "maintenance_status_idx" ON "maintenance_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "maintenance_due_idx" ON "maintenance_orders" USING btree ("due_date");