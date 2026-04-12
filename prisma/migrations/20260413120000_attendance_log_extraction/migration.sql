-- AlterTable
ALTER TABLE "attendance_logs" ADD COLUMN "extracted_at" TIMESTAMP(3),
ADD COLUMN "extracted_pay_period_id" TEXT;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_extracted_pay_period_id_fkey" FOREIGN KEY ("extracted_pay_period_id") REFERENCES "pay_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "attendance_logs_extracted_at_idx" ON "attendance_logs"("extracted_at");

-- CreateIndex
CREATE INDEX "attendance_logs_extracted_pay_period_id_idx" ON "attendance_logs"("extracted_pay_period_id");
