-- CreateTable
CREATE TABLE "email_recipients" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id")
);
