-- CreateTable
CREATE TABLE "DocumentGrade" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "percentageGrade" DOUBLE PRECISION NOT NULL,
    "letterGrade" TEXT,
    "overallComment" TEXT NOT NULL,
    "isReleased" BOOLEAN NOT NULL DEFAULT false,
    "gradedBy" TEXT,
    "gradedAt" TIMESTAMPTZ(6),

    CONSTRAINT "DocumentGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricDimension" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RubricDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricScore" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradeId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "feedback" TEXT,

    CONSTRAINT "RubricScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentGrade_documentId_key" ON "DocumentGrade"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "RubricDimension_name_key" ON "RubricDimension"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RubricScore_gradeId_dimensionId_key" ON "RubricScore"("gradeId", "dimensionId");

-- AddForeignKey
ALTER TABLE "DocumentGrade" ADD CONSTRAINT "DocumentGrade_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "DocumentGrade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricScore" ADD CONSTRAINT "RubricScore_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "RubricDimension"("id") ON DELETE CASCADE ON UPDATE CASCADE;
