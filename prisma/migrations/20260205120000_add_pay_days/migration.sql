-- CreateTable
CREATE TABLE "pay_days" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pay_days_date_idx" ON "pay_days"("date");
