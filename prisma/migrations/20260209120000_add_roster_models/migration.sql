-- CreateTable: shift_templates (shift presets for roster)
CREATE TABLE "shift_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: roster_weeks (one record per week, Monday start)
CREATE TABLE "roster_weeks" (
    "id" TEXT NOT NULL,
    "week_start" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_weeks_pkey" PRIMARY KEY ("id")
);

-- Ensure only one week record per Monday date
CREATE UNIQUE INDEX "roster_week_week_start" ON "roster_weeks"("week_start");

-- CreateTable: roster_entries (individual staff/date assignments)
CREATE TABLE "roster_entries" (
    "id" TEXT NOT NULL,
    "roster_week_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "shift_template_id" TEXT,
    "date" TEXT NOT NULL,
    "position" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "roster_entries_roster_week_id_fkey" FOREIGN KEY ("roster_week_id") REFERENCES "roster_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_entries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "roster_entries_shift_template_id_fkey" FOREIGN KEY ("shift_template_id") REFERENCES "shift_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- One entry per staff per date within a week
CREATE UNIQUE INDEX "roster_week_staff_date" ON "roster_entries"("roster_week_id", "staff_id", "date");

