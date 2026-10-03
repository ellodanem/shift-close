-- Westline bank reconciliation: one statement at a time, ticked cashbook lines.

CREATE TABLE "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL DEFAULT 'westline',
    "statement_end_date" TEXT NOT NULL,
    "statement_end_balance" DOUBLE PRECISION NOT NULL,
    "opening_balance" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_reconciliation_lines" (
    "id" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "cashbook_entry_id" TEXT NOT NULL,
    "cleared" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bank_reconciliation_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_reconciliations_account_status_idx" ON "bank_reconciliations"("account", "status");

CREATE INDEX "bank_reconciliations_account_statement_end_date_idx" ON "bank_reconciliations"("account", "statement_end_date");

CREATE UNIQUE INDEX "bank_reconciliation_lines_reconciliation_id_cashbook_entry_id_key" ON "bank_reconciliation_lines"("reconciliation_id", "cashbook_entry_id");

CREATE INDEX "bank_reconciliation_lines_cashbook_entry_id_idx" ON "bank_reconciliation_lines"("cashbook_entry_id");

ALTER TABLE "bank_reconciliation_lines" ADD CONSTRAINT "bank_reconciliation_lines_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bank_reconciliation_lines" ADD CONSTRAINT "bank_reconciliation_lines_cashbook_entry_id_fkey" FOREIGN KEY ("cashbook_entry_id") REFERENCES "cashbook_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "bank_reconciliations_one_in_progress_idx"
ON "bank_reconciliations" ("account")
WHERE "status" = 'in_progress';
