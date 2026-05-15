-- Per-user post-login landing page (e.g. mobile attendance viewer).
ALTER TABLE "app_users" ADD COLUMN "home_path" TEXT;
