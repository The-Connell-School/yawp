import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export function createPassword(password: string = faker.internet.password()) {
  return {
    hash: bcrypt.hashSync(password, 10),
  };
}

export async function cleanupDb(prisma: PrismaClient) {
  await prisma.user.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.course.deleteMany();
}
