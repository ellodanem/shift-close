-- Staff sick leave periods + optional link from staff_document (schema was added without a migration).

-- CreateTable
CREATE TABLE "staff_sick_leave" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_sick_leave_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "staff_sick_leave" ADD CONSTRAINT "staff_sick_leave_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (optional sick-leave document link)
ALTER TABLE "staff_document" ADD COLUMN IF NOT EXISTS "sick_leave_id" TEXT;

-- AddForeignKey
ALTER TABLE "staff_document" ADD CONSTRAINT "staff_document_sick_leave_id_fkey" FOREIGN KEY ("sick_leave_id") REFERENCES "staff_sick_leave"("id") ON DELETE SET NULL ON UPDATE CASCADE;
