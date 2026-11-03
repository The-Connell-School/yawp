/* eslint-disable no-console */
import { createPrismaClient } from './connection';
import {
  assertEnsureInternQaTeachersTarget,
  ensureInternQaTeachers,
  formatEnsureInternQaTeachersSummary,
  isDemoInternQaEnvironment,
} from './ensure-intern-qa-teachers';

if (isDemoInternQaEnvironment()) {
  process.env.ENSURE_INTERN_QA_REQUIRE_DEMO = '1';
}

assertEnsureInternQaTeachersTarget();

const prisma = createPrismaClient();

const result = await ensureInternQaTeachers(prisma);
console.log(formatEnsureInternQaTeachersSummary(result));

await prisma.$disconnect();
