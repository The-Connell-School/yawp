/* eslint-disable no-console */
import { PrismaClient } from '@app/prisma';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDeleteUserCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const prisma = new PrismaClient();

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function resetCognitoPool() {
  console.time('🧹 Reset Cognito pool');
  const listUsersCommand = new ListUsersCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
  });
  const users = await cognitoClient.send(listUsersCommand);

  if (users.Users) {
    for (const user of users.Users) {
      const deleteCommand = new AdminDeleteUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: user.Username,
      });
      await cognitoClient.send(deleteCommand);
    }
  }
  console.timeEnd('🧹 Reset Cognito pool');
}

async function createSeedUser(email: string, password: string, name: string) {
  const createUserCommand = new AdminCreateUserCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'name', Value: name },
    ],
    MessageAction: 'SUPPRESS',
  });

  const createUserResponse = await cognitoClient.send(createUserCommand);
  const cognitoId = createUserResponse.User?.Username;

  if (!cognitoId) throw new Error('Failed to create Cognito user');

  const setPasswordCommand = new AdminSetUserPasswordCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: email,
    Password: password,
    Permanent: true,
  });

  await cognitoClient.send(setPasswordCommand);

  return cognitoId;
}

export async function cleanupDb(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations';`;

  await prisma.$transaction([
    // Disable FK constraints to avoid relation conflicts during deletion
    prisma.$executeRawUnsafe(`SET CONSTRAINTS ALL DEFERRED`),
    // Delete all rows from each table, preserving table structures
    ...tables.map(({ tablename }: { tablename: string }) =>
      prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE`)
    ),
    prisma.$executeRawUnsafe(`SET CONSTRAINTS ALL IMMEDIATE`),
  ]);
}

async function seed() {
  console.log('🌱 Seeding...');
  console.time(`🌱 Database has been seeded`);

  console.time('🧹 Cleaned up the database...');
  await cleanupDb(prisma);
  console.timeEnd('🧹 Cleaned up the database...');

  console.time('🧹 Reset Cognito pool...');
  await resetCognitoPool();
  console.timeEnd('🧹 Reset Cognito pool...');

  console.time(`🔒 Created users`);
  const seedUsers = [
    { email: 'dev@one.com', password: 'Password123!', name: 'Dev One' },
    { email: 'admin@one.com', password: 'Password123!', name: 'Admin One' },
  ];

  for (const user of seedUsers) {
    const cognitoId = await createSeedUser(
      user.email,
      user.password,
      user.name
    );
    await prisma.user.create({
      data: {
        email: user.email,
        cognitoId,
        name: user.name,
        role: user.email.includes('admin') ? 'ADMIN' : 'USER',
      },
    });
  }
  console.timeEnd(`🔒 Created users`);

  console.timeEnd(`🌱 Database has been seeded`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
