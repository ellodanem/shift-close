-- CreateTable
CREATE TABLE "harvest_agents" (
    "id" TEXT NOT NULL,
    "agent_key" TEXT NOT NULL,
    "hostname" TEXT,
    "version" TEXT,
    "last_heartbeat_at" TIMESTAMP(3) NOT NULL,
    "last_task_at" TIMESTAMP(3),
    "cstore_session_ok" BOOLEAN,
    "cstore_session_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harvest_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_task_runs" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "task_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "details" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_task_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "harvest_agents_agent_key_key" ON "harvest_agents"("agent_key");

-- CreateIndex
CREATE INDEX "harvest_task_runs_agent_id_finished_at_idx" ON "harvest_task_runs"("agent_id", "finished_at");

-- CreateIndex
CREATE INDEX "harvest_task_runs_finished_at_idx" ON "harvest_task_runs"("finished_at");

-- AddForeignKey
ALTER TABLE "harvest_task_runs" ADD CONSTRAINT "harvest_task_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "harvest_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
