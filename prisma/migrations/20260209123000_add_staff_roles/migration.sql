-- Create staff_roles table for managing staff roles (e.g. Cashier, Pump Attendant, Supervisor)
CREATE TABLE "staff_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "badge_color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_roles_name_key" UNIQUE ("name")
);

-- Seed some default roles
INSERT INTO "staff_roles" ("id", "name", "badge_color", "sort_order")
VALUES
  ('role_cashier', 'Cashier', '#6b7280', 1),
  ('role_pump_attendant', 'Pump Attendant', '#22c55e', 2),
  ('role_supervisor', 'Supervisor', '#eab308', 3),
  ('role_manager', 'Manager', '#3b82f6', 4),
  ('role_admin', 'Admin', '#a855f7', 5);

-- Add optional foreign key from staff to staff_roles
ALTER TABLE "staff"
ADD COLUMN "role_id" TEXT;

ALTER TABLE "staff"
ADD CONSTRAINT "staff_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "staff_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill role_id for existing staff based on current role string
UPDATE "staff" SET "role_id" = 'role_cashier' WHERE "role" = 'cashier';
UPDATE "staff" SET "role_id" = 'role_supervisor' WHERE "role" = 'supervisor';
UPDATE "staff" SET "role_id" = 'role_manager' WHERE "role" = 'manager';
UPDATE "staff" SET "role_id" = 'role_admin' WHERE "role" = 'admin';

