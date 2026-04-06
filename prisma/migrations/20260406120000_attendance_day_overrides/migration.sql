-- CreateTable
CREATE TABLE "attendance_day_overrides" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "manual_present" BOOLEAN NOT NULL DEFAULT false,
    "late_reason" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_day_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_day_override_staff_date" ON "attendance_day_overrides"("staff_id", "date");

-- AddForeignKey
ALTER TABLE "attendance_day_overrides" ADD CONSTRAINT "attendance_day_overrides_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
