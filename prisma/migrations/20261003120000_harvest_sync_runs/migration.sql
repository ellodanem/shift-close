-- Queued harvest sync: one month, four steps, claimed by the Windows agent.

CREATE TABLE "harvest_sync_runs" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "agent_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harvest_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "harvest_sync_steps" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "task_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "harvest_sync_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "harvest_sync_runs_status_created_at_idx" ON "harvest_sync_runs"("status", "created_at");

CREATE UNIQUE INDEX "harvest_sync_steps_run_id_position_key" ON "harvest_sync_steps"("run_id", "position");

CREATE UNIQUE INDEX "harvest_sync_steps_run_id_task_key_key" ON "harvest_sync_steps"("run_id", "task_key");

CREATE UNIQUE INDEX "harvest_sync_runs_one_active_idx"
ON "harvest_sync_runs" ((1))
WHERE "status" IN ('pending', 'running');

ALTER TABLE "harvest_sync_runs" ADD CONSTRAINT "harvest_sync_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "harvest_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "harvest_sync_steps" ADD CONSTRAINT "harvest_sync_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "harvest_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
