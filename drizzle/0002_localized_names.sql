ALTER TABLE "objects" ADD COLUMN "names" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "objects" ADD COLUMN "descriptions" jsonb DEFAULT '{}'::jsonb NOT NULL;