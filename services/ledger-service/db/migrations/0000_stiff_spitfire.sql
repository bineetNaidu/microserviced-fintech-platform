CREATE TABLE "balance_snapshots" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"account_id" varchar(26) NOT NULL,
	"snapshot_date" date NOT NULL,
	"balance_paise" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"last_processed_entry_id" varchar(26) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_account_date_snapshot" UNIQUE("account_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"transaction_id" varchar(26) NOT NULL,
	"account_id" varchar(26) NOT NULL,
	"amount_paise" bigint NOT NULL,
	"direction" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_entries_tx_direction" UNIQUE("transaction_id","account_id","direction")
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"reference_id" varchar(26) NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"currency" char(3) NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_reference_id_unique" UNIQUE("reference_id")
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_entries_account_lookup" ON "ledger_entries" USING btree ("account_id","created_at");