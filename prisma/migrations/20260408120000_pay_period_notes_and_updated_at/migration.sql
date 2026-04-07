-- Pay period notes + updated_at (audit trail on edits)

ALTER TABLE "pay_periods" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';

ALTER TABLE "pay_periods" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

UPDATE "pay_periods" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "pay_periods" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "pay_periods" ALTER COLUMN "updated_at" SET NOT NULL;
