-- Run once in Neon SQL Editor (safe to re-run). Creates Promotions tables.
-- After this, reload /promotions — Bus Driver Gas seeds on first page load.

CREATE TABLE IF NOT EXISTS "promotions" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '',
  "draw_details" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'active',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "promotions_slug_key" ON "promotions"("slug");
CREATE INDEX IF NOT EXISTS "promotions_status_idx" ON "promotions"("status");

CREATE TABLE IF NOT EXISTS "promotion_draws" (
  "id" TEXT NOT NULL,
  "promotion_id" TEXT NOT NULL,
  "draw_date" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_draws_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "promotion_draws_promotion_id_draw_date_idx"
  ON "promotion_draws"("promotion_id", "draw_date");

CREATE TABLE IF NOT EXISTS "promotion_winners" (
  "id" TEXT NOT NULL,
  "draw_id" TEXT NOT NULL,
  "staff_id" TEXT,
  "winner_name" TEXT NOT NULL,
  "prize_notes" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_winners_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "promotion_winners_draw_id_idx" ON "promotion_winners"("draw_id");
CREATE INDEX IF NOT EXISTS "promotion_winners_staff_id_idx" ON "promotion_winners"("staff_id");

CREATE TABLE IF NOT EXISTS "promotion_entries" (
  "id" TEXT NOT NULL,
  "draw_id" TEXT NOT NULL,
  "staff_id" TEXT,
  "entrant_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "promotion_entries_draw_id_idx" ON "promotion_entries"("draw_id");
CREATE INDEX IF NOT EXISTS "promotion_entries_staff_id_idx" ON "promotion_entries"("staff_id");

DO $$ BEGIN
  ALTER TABLE "promotion_draws"
    ADD CONSTRAINT "promotion_draws_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "promotion_winners"
    ADD CONSTRAINT "promotion_winners_draw_id_fkey"
    FOREIGN KEY ("draw_id") REFERENCES "promotion_draws"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "promotion_winners"
    ADD CONSTRAINT "promotion_winners_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "promotion_entries"
    ADD CONSTRAINT "promotion_entries_draw_id_fkey"
    FOREIGN KEY ("draw_id") REFERENCES "promotion_draws"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "promotion_entries"
    ADD CONSTRAINT "promotion_entries_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Seed default promotion (idempotent)
INSERT INTO "promotions" (
  "id", "slug", "name", "details", "draw_details", "status", "sort_order", "created_at", "updated_at"
)
SELECT
  'seed_bus_driver_gas',
  'bus-driver-gas',
  'Bus Driver Gas',
  'Every other week we give bus drivers gas. Bus drivers enter the draw; a winner is selected each cycle.',
  'Draw held every other week.',
  'active',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "promotions" WHERE "slug" = 'bus-driver-gas'
);
