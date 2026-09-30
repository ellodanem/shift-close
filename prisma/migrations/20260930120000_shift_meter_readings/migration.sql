-- Optional pump totalizer readings on shift close.
-- Revert the app commit, then drop these columns only if you also want them gone from the database:
--   unleaded_meter_open, unleaded_meter_close, unleaded_meter_test,
--   diesel_meter_open, diesel_meter_close, diesel_meter_test
ALTER TABLE "shift_close" ADD COLUMN "unleaded_meter_open" DOUBLE PRECISION;
ALTER TABLE "shift_close" ADD COLUMN "unleaded_meter_close" DOUBLE PRECISION;
ALTER TABLE "shift_close" ADD COLUMN "unleaded_meter_test" DOUBLE PRECISION;
ALTER TABLE "shift_close" ADD COLUMN "diesel_meter_open" DOUBLE PRECISION;
ALTER TABLE "shift_close" ADD COLUMN "diesel_meter_close" DOUBLE PRECISION;
ALTER TABLE "shift_close" ADD COLUMN "diesel_meter_test" DOUBLE PRECISION;
