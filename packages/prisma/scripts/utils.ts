import { faker } from '@faker-js/faker';
import { PrismaClient } from '../generated/prisma';
import bcrypt from 'bcryptjs';

export function createPassword(password: string = faker.internet.password()) {
  return {
    hash: bcrypt.hashSync(password, 10),
  };
}

export async function cleanupDb(prisma: PrismaClient) {
  // Delete child records before parents to satisfy FK constraints
  // Student course related
  await prisma.studentCourseModuleInstructionButton.deleteMany();
  await prisma.studentCourseModuleInstruction.deleteMany();
  await prisma.studentCourseModuleSessionMessage.deleteMany();
  await prisma.studentCourseModuleSession.deleteMany();
  await prisma.studentCourseModule.deleteMany();
  await prisma.studentCourseImage.deleteMany();
  await prisma.studentCourse.deleteMany();

  // Teacher course related
  await prisma.teacherCourseModuleSession.deleteMany();
  await prisma.teacherCourseModuleResource.deleteMany();
  await prisma.teacherCourseModule.deleteMany();
  await prisma.teacherCourseResource.deleteMany();
  await prisma.teacherCourseImage.deleteMany();
  await prisma.teacherCourse.deleteMany();

  // Documents and comments
  await prisma.gradeCommentResponse.deleteMany();
  await prisma.gradeComment.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.documentCommentResponse.deleteMany();
  await prisma.documentComment.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.document.deleteMany();

  // Profiles and related
  await prisma.studentProfile.deleteMany();
  await prisma.teacherProfile.deleteMany();
  await prisma.profile.deleteMany();

  // Schools and classes
  await prisma.class.deleteMany();
  await prisma.school.deleteMany();

  // Misc
  await prisma.session.deleteMany();
  await prisma.password.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.organization.deleteMany();
}
