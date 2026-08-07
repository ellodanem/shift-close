-- Optional night deposit bag numbers per shift (JSON string array; typically 1–2 bags)
ALTER TABLE "shift_close" ADD COLUMN "deposit_bag_numbers" TEXT NOT NULL DEFAULT '[]';
