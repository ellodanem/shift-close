-- AlterTable
ALTER TABLE "pay_periods" ADD COLUMN "email_sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "pay_periods_email_sent_at_idx" ON "pay_periods"("email_sent_at");
