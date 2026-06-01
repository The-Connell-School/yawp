import { createPassword } from './utils';

export type PreviewLoginPasswordResetConfig = {
  email: string;
  password: string;
};

type PreviewLoginPasswordResetClient = {
  user: {
    findFirst(args: {
      where: { email: { equals: string; mode: 'insensitive' } };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
  password: {
    upsert(args: {
      where: { userId: string };
      update: { hash: string };
      create: { userId: string; hash: string };
    }): Promise<unknown>;
  };
};

function requiredEnv(env: Record<string, string | undefined>, name: string) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to reset the preview login password`);
  }
  return value;
}

export function normalizePreviewLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getPreviewLoginPasswordResetConfig(
  env: Record<string, string | undefined> = process.env,
): PreviewLoginPasswordResetConfig {
  return {
    email: normalizePreviewLoginEmail(requiredEnv(env, 'PREVIEW_LOGIN_EMAIL')),
    password: requiredEnv(env, 'PREVIEW_LOGIN_PASSWORD'),
  };
}

export async function resetPreviewLoginPassword(
  client: PreviewLoginPasswordResetClient,
  config: PreviewLoginPasswordResetConfig,
) {
  const email = normalizePreviewLoginEmail(config.email);
  const user = await client.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`Preview login user not found: ${email}`);
  }

  const { hash } = createPassword(config.password);
  await client.password.upsert({
    where: { userId: user.id },
    update: { hash },
    create: { userId: user.id, hash },
  });

  return { email, userId: user.id };
}
