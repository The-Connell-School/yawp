import { faker } from '@faker-js/faker';
import { PrismaClient } from '../generated/prisma';
import bcrypt from 'bcryptjs';
import { truncateAllPublicTables } from './local-dev/truncate-all';

export function createPassword(password: string = faker.internet.password()) {
  return {
    hash: bcrypt.hashSync(password, 10),
  };
}

export async function cleanupDb(prisma: PrismaClient) {
  await truncateAllPublicTables(prisma);
}
