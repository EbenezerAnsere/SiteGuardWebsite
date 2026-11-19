ALTER TABLE "scans" ADD COLUMN "level" text DEFAULT 'tight' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "scan_level" text DEFAULT 'tight' NOT NULL;