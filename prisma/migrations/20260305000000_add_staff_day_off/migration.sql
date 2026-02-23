-- CreateTable
CREATE TABLE "staff_day_off" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_day_off_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_day_off_staff_date" ON "staff_day_off"("staff_id", "date");

-- AddForeignKey
ALTER TABLE "staff_day_off" ADD CONSTRAINT "staff_day_off_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
