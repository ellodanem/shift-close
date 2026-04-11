-- Missing deposit slip alerts (calendar day, optional email digest)
CREATE TABLE "missing_deposit_slip_alerts" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "selections_json" TEXT NOT NULL DEFAULT '[]',
    "note" TEXT NOT NULL DEFAULT '',
    "first_notify_sent_at" TIMESTAMP(3),
    "last_notify_fingerprint" TEXT,
    "last_notify_sent_at" TIMESTAMP(3),
    "last_digest_sent_ymd" TEXT,
    "last_email_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missing_deposit_slip_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "missing_deposit_slip_alerts_date_key" ON "missing_deposit_slip_alerts"("date");
CREATE INDEX "missing_deposit_slip_alerts_open_idx" ON "missing_deposit_slip_alerts"("open");
