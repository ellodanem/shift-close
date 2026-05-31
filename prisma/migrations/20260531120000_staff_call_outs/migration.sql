-- Call-out log (phone); one per staff per work date; visual only for roster
CREATE TABLE "staff_call_outs" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "called_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_call_outs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_call_out_staff_date" ON "staff_call_outs"("staff_id", "date");
CREATE INDEX "staff_call_outs_date_idx" ON "staff_call_outs"("date");

ALTER TABLE "staff_call_outs" ADD CONSTRAINT "staff_call_outs_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_call_outs" ADD CONSTRAINT "staff_call_outs_recorded_by_user_id_fkey"
    FOREIGN KEY ("recorded_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
