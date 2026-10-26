ALTER TABLE "staff"
ADD COLUMN "nis_exempt" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "staff"
ADD COLUMN "paye_exempt" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "pay_run_lines"
ADD COLUMN "nis_exempt" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "pay_run_lines"
ADD COLUMN "paye_exempt" BOOLEAN NOT NULL DEFAULT false;
