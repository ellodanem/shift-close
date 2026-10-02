-- CreateTable
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_events_logged_at_idx" ON "login_events"("logged_at");

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
