-- CreateTable
CREATE TABLE "pay_periods" (
    "id" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "report_date" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL DEFAULT 'Total Auto Service Station',
    "rows" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pay_periods_start_date_end_date_idx" ON "pay_periods"("start_date", "end_date");
