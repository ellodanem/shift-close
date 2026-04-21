-- Manual O/S review + "legit as-is" flag (replaces account-activity tally for workflow).
ALTER TABLE "shift_close" ADD COLUMN "os_reviewed" DOUBLE PRECISION;
ALTER TABLE "shift_close" ADD COLUMN "os_legit_as_is" BOOLEAN NOT NULL DEFAULT false;
