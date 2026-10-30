-- CreateTable
CREATE TABLE "page_visits" (
    "id" TEXT NOT NULL,
    "login_event_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_visits_login_event_id_visited_at_idx" ON "page_visits"("login_event_id", "visited_at");

-- CreateIndex
CREATE INDEX "page_visits_visited_at_idx" ON "page_visits"("visited_at");

-- AddForeignKey
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_login_event_id_fkey" FOREIGN KEY ("login_event_id") REFERENCES "login_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
