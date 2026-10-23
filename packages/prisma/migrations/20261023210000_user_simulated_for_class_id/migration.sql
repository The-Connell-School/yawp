-- Dev panel class simulation marker (nullable, additive).
ALTER TABLE "User" ADD COLUMN "simulatedForClassId" TEXT;

CREATE INDEX "User_simulatedForClassId_idx" ON "User"("simulatedForClassId");
