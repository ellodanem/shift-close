-- Staff pay cadence for hours → BSC/OTH split (default = Pay+ semi-monthly).
ALTER TABLE "staff" ADD COLUMN "pay_cycle" TEXT NOT NULL DEFAULT 'semimonthly';
