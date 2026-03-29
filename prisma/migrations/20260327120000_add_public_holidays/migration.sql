-- CreateTable
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "station_closed" BOOLEAN NOT NULL DEFAULT false,
    "country_code" TEXT NOT NULL DEFAULT 'LC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_holidays_date_idx" ON "public_holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "public_holiday_date_country" ON "public_holidays"("date", "country_code");
