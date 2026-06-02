CREATE TYPE "public"."bank_account_status" AS ENUM('pending', 'verified', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."bank_connection_provider" AS ENUM('paystack', 'stripe');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" "bank_connection_provider" NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"account_number" varchar(255),
	"bank_name" varchar(255),
	"account_holder_name" varchar(255),
	"status" "bank_account_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp,
	"disconnected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_organization_id_idx" ON "bank_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_provider_account_id_idx" ON "bank_accounts" USING btree ("provider_account_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_status_idx" ON "bank_accounts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_provider_account_id_unique" ON "bank_accounts" USING btree ("provider_account_id");
