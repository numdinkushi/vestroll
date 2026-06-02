CREATE TYPE "payroll_draft_status" AS ENUM('active', 'processed', 'cancelled');
--> statement-breakpoint
CREATE TABLE "payroll_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "payroll_draft_status" DEFAULT 'active' NOT NULL,
	"employees_payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_drafts" ADD CONSTRAINT "payroll_drafts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "payroll_drafts_organization_id_idx" ON "payroll_drafts" ("organization_id");
--> statement-breakpoint
CREATE INDEX "payroll_drafts_status_idx" ON "payroll_drafts" ("status");
