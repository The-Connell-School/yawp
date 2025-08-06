/*
  Warnings:

  - You are about to drop the column `answerKey` on the `CourseModuleInstruction` table. All the data in the column will be lost.
  - You are about to drop the column `answerType` on the `CourseModuleInstruction` table. All the data in the column will be lost.
  - You are about to drop the column `answerTypeOptions` on the `CourseModuleInstruction` table. All the data in the column will be lost.
  - You are about to drop the column `canAskQuestion` on the `CourseModuleInstruction` table. All the data in the column will be lost.
  - You are about to drop the column `interactiveType` on the `CourseModuleInstruction` table. All the data in the column will be lost.
  - You are about to drop the column `nextInstructionBtnLabel` on the `CourseModuleInstruction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CourseModuleInstruction" DROP COLUMN "answerKey",
DROP COLUMN "answerType",
DROP COLUMN "answerTypeOptions",
DROP COLUMN "interactiveType",
DROP COLUMN "nextInstructionBtnLabel";

ALTER TABLE "CourseModuleInstruction" RENAME COLUMN "canAskQuestion" TO "showChatButton";
ALTER TABLE "CourseModuleInstruction" ADD COLUMN "showNextButton" BOOLEAN DEFAULT true;
