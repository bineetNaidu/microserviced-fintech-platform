CREATE TABLE "account_limits" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"account_id" varchar(26) NOT NULL,
	"daily_velocity_limit_paise" bigint DEFAULT 50000000 NOT NULL,
	"single_transaction_limit_paise" bigint DEFAULT 10000000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_limits_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "account_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar(26) NOT NULL,
	"previous_status" varchar(30) NOT NULL,
	"new_status" varchar(30) NOT NULL,
	"changed_by" varchar(255) NOT NULL,
	"changed_by_role" varchar(50) NOT NULL,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(30) NOT NULL,
	"status" varchar(30) DEFAULT 'ACTIVE' NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_limits" ADD CONSTRAINT "account_limits_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_status_history" ADD CONSTRAINT "account_status_history_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user_currency" ON "accounts" USING btree ("user_id","currency") WHERE "accounts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "idx_accounts_status_verification" ON "accounts" USING btree ("id","status");