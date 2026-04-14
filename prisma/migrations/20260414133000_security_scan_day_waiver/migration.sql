-- CreateTable
CREATE TABLE "security_scan_day_waivers" (
    "date" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_scan_day_waivers_pkey" PRIMARY KEY ("date")
);
