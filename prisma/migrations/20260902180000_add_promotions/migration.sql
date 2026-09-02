-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "draw_details" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_draws" (
    "id" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "draw_date" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_winners" (
    "id" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "winner_name" TEXT NOT NULL,
    "prize_notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_entries" (
    "id" TEXT NOT NULL,
    "draw_id" TEXT NOT NULL,
    "staff_id" TEXT,
    "entrant_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotions_slug_key" ON "promotions"("slug");

-- CreateIndex
CREATE INDEX "promotions_status_idx" ON "promotions"("status");

-- CreateIndex
CREATE INDEX "promotion_draws_promotion_id_draw_date_idx" ON "promotion_draws"("promotion_id", "draw_date");

-- CreateIndex
CREATE INDEX "promotion_winners_draw_id_idx" ON "promotion_winners"("draw_id");

-- CreateIndex
CREATE INDEX "promotion_winners_staff_id_idx" ON "promotion_winners"("staff_id");

-- CreateIndex
CREATE INDEX "promotion_entries_draw_id_idx" ON "promotion_entries"("draw_id");

-- CreateIndex
CREATE INDEX "promotion_entries_staff_id_idx" ON "promotion_entries"("staff_id");

-- AddForeignKey
ALTER TABLE "promotion_draws" ADD CONSTRAINT "promotion_draws_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_winners" ADD CONSTRAINT "promotion_winners_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "promotion_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_winners" ADD CONSTRAINT "promotion_winners_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_entries" ADD CONSTRAINT "promotion_entries_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "promotion_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_entries" ADD CONSTRAINT "promotion_entries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
