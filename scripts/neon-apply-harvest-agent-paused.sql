-- Add paused state columns to harvest_agents (run once in Neon SQL editor).
ALTER TABLE "harvest_agents"
  ADD COLUMN IF NOT EXISTS "paused" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "harvest_agents"
  ADD COLUMN IF NOT EXISTS "pause_reason" TEXT;

ALTER TABLE "harvest_agents"
  ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMPTZ;
