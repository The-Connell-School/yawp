-- CreateTable
CREATE TABLE "ClassAssignmentStudentFirstOpen" (
    "id" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classAssignmentId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,

    CONSTRAINT "ClassAssignmentStudentFirstOpen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassAssignmentStudentFirstOpen_classAssignmentId_membershipI_key" ON "ClassAssignmentStudentFirstOpen"("classAssignmentId", "membershipId");

-- CreateIndex
CREATE INDEX "ClassAssignmentStudentFirstOpen_membershipId_idx" ON "ClassAssignmentStudentFirstOpen"("membershipId");

-- AddForeignKey
ALTER TABLE "ClassAssignmentStudentFirstOpen" ADD CONSTRAINT "ClassAssignmentStudentFirstOpen_classAssignmentId_fkey" FOREIGN KEY ("classAssignmentId") REFERENCES "ClassAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassAssignmentStudentFirstOpen" ADD CONSTRAINT "ClassAssignmentStudentFirstOpen_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "OrgMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
