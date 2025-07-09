-- CreateTable
CREATE TABLE "CourseModuleInstructionButton" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "courseModuleInstructionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "CourseModuleInstructionButton_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CourseModuleInstructionButton" ADD CONSTRAINT "CourseModuleInstructionButton_courseModuleInstructionId_fkey" FOREIGN KEY ("courseModuleInstructionId") REFERENCES "CourseModuleInstruction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: Convert existing answerTypeOptions to buttons
INSERT INTO "CourseModuleInstructionButton" ("id", "createdAt", "updatedAt", "courseModuleInstructionId", "position", "label", "action")
SELECT
    gen_random_uuid() as id,
    NOW() as createdAt,
    NOW() as updatedAt,
    i.id as courseModuleInstructionId,
    ROW_NUMBER() OVER (PARTITION BY i.id ORDER BY button_value) - 1 as position,
    TRIM(button_value) as label,
    CASE
        WHEN i."interactiveType" = 'answer' THEN 'advance'
        ELSE 'response'
    END as action
FROM "CourseModuleInstruction" i
CROSS JOIN LATERAL (
    SELECT TRIM(value) as button_value
    FROM unnest(string_to_array(i."answerTypeOptions", ',')) as value
    WHERE TRIM(value) != ''
) buttons
WHERE i."answerTypeOptions" IS NOT NULL AND i."answerTypeOptions" != '';

-- For instructions without answerTypeOptions, create a default button
INSERT INTO "CourseModuleInstructionButton" ("id", "createdAt", "updatedAt", "courseModuleInstructionId", "position", "label", "action")
SELECT
    gen_random_uuid() as id,
    NOW() as createdAt,
    NOW() as updatedAt,
    i.id as courseModuleInstructionId,
    0 as position,
    CASE
        WHEN i."interactiveType" = 'answer' THEN 'Next step'
        ELSE 'Response'
    END as label,
    CASE
        WHEN i."interactiveType" = 'answer' THEN 'advance'
        ELSE 'response'
    END as action
FROM "CourseModuleInstruction" i
WHERE i."answerTypeOptions" IS NULL OR i."answerTypeOptions" = '';

ALTER INDEX "TeacherCourseModuleSession_teacherCourseModuleId_teacherProfile" RENAME TO "TeacherCourseModuleSession_teacherCourseModuleId_teacherPro_key";
