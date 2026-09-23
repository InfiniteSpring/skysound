CREATE TYPE "public"."object_status" AS ENUM('ready', 'fetching', 'failed');--> statement-breakpoint
CREATE TABLE "objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"canonical_key" text,
	"query" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"description" text,
	"position" jsonb,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"light_curve" jsonb,
	"sources" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "object_status" DEFAULT 'fetching' NOT NULL,
	"error" text,
	"fetched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "objects_slug_idx" ON "objects" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "objects_canonical_key_idx" ON "objects" USING btree ("canonical_key");--> statement-breakpoint
CREATE INDEX "objects_type_idx" ON "objects" USING btree ("type");--> statement-breakpoint
CREATE INDEX "objects_status_idx" ON "objects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "objects_name_trgm_idx" ON "objects" USING gin ("name" gin_trgm_ops);