ALTER TABLE "angles" ADD COLUMN "type" text DEFAULT 'problem' NOT NULL;--> statement-breakpoint
ALTER TABLE "angles" ADD COLUMN "hook" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "angles" ADD COLUMN "status" text DEFAULT 'idea' NOT NULL;--> statement-breakpoint
ALTER TABLE "angles" ADD COLUMN "source" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "angles" ADD COLUMN "stop_reason" text;