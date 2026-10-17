CREATE TABLE "ClassStudentHandle" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "handle" VARCHAR(30) NOT NULL,
  "handleKey" VARCHAR(90) NOT NULL,
  CONSTRAINT "ClassStudentHandle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassStudentHandle_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClassStudentHandle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClassStudentHandle_classId_handleKey_key" ON "ClassStudentHandle"("classId", "handleKey");
CREATE UNIQUE INDEX "ClassStudentHandle_classId_userId_key" ON "ClassStudentHandle"("classId", "userId");
CREATE INDEX "ClassStudentHandle_userId_idx" ON "ClassStudentHandle"("userId");

CREATE TRIGGER internal_impersonation_mutation_audit
  AFTER INSERT OR UPDATE OR DELETE ON "ClassStudentHandle"
  FOR EACH ROW EXECUTE FUNCTION internal_impersonation_mutation_audit();

CREATE TRIGGER internal_impersonation_truncate_guard
  BEFORE TRUNCATE ON "ClassStudentHandle"
  FOR EACH STATEMENT EXECUTE FUNCTION internal_impersonation_truncate_guard();
