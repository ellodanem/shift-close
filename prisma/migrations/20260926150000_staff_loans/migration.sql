-- Interest-free staff loans with a remaining balance paid down on processed payrolls.
CREATE TABLE "staff_loans" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "principal" DOUBLE PRECISION NOT NULL,
    "term_pays" INTEGER NOT NULL,
    "installment" DOUBLE PRECISION NOT NULL,
    "start_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_loans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_loans_staff_id_status_idx" ON "staff_loans"("staff_id", "status");

ALTER TABLE "staff_loans" ADD CONSTRAINT "staff_loans_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
