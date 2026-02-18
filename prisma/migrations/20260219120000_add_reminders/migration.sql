-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "notes" TEXT,
    "notify_email" BOOLEAN NOT NULL DEFAULT true,
    "notify_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "notify_days_before" TEXT NOT NULL DEFAULT '7,3,1,0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminders_date_idx" ON "reminders"("date");
