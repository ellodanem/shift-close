-- Add sort_order for roster/list ordering (move names up and down)
ALTER TABLE "staff" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
