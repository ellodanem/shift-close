-- CreateTable
CREATE TABLE "cashbook_description_exclusions" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "cashbook_description_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cashbook_description_exclusions_description_type_key" ON "cashbook_description_exclusions"("description", "type");
