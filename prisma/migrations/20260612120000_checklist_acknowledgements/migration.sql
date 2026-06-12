-- CreateTable
CREATE TABLE "checklist_acknowledgements" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "week_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "user_id" TEXT,
    "until_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_acknowledgements_week_key_idx" ON "checklist_acknowledgements"("week_key");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_ack_task_week_kind" ON "checklist_acknowledgements"("task_id", "week_key", "kind");
