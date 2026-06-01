import { describe, expect, test } from 'bun:test';
import bcrypt from 'bcryptjs';
import {
  getPreviewLoginPasswordResetConfig,
  resetPreviewLoginPassword,
} from './preview-login-password-reset.helpers';

describe('preview login password reset helpers', () => {
  test('reads and normalizes explicit preview login credentials', () => {
    expect(
      getPreviewLoginPasswordResetConfig({
        PREVIEW_LOGIN_EMAIL: ' KGREGORIO@SJPREP.ORG ',
        PREVIEW_LOGIN_PASSWORD: 'preview-password',
      }),
    ).toEqual({
      email: 'kgregorio@sjprep.org',
      password: 'preview-password',
    });
  });

  test('requires both preview login email and password', () => {
    expect(() =>
      getPreviewLoginPasswordResetConfig({
        PREVIEW_LOGIN_EMAIL: 'kgregorio@sjprep.org',
      }),
    ).toThrow('PREVIEW_LOGIN_PASSWORD');
    expect(() =>
      getPreviewLoginPasswordResetConfig({
        PREVIEW_LOGIN_PASSWORD: 'preview-password',
      }),
    ).toThrow('PREVIEW_LOGIN_EMAIL');
  });

  test('upserts a bcrypt password for the existing preview login user', async () => {
    const calls: unknown[] = [];
    const client = {
      user: {
        findFirst: async (args: unknown) => {
          calls.push({ userFindFirst: args });
          return { id: 'user-1' };
        },
      },
      password: {
        upsert: async (args: unknown) => {
          calls.push({ passwordUpsert: args });
          return {};
        },
      },
    };

    await resetPreviewLoginPassword(client, {
      email: ' KGREGORIO@SJPREP.ORG ',
      password: 'new-preview-password',
    });

    expect(calls[0]).toEqual({
      userFindFirst: {
        where: {
          email: {
            equals: 'kgregorio@sjprep.org',
            mode: 'insensitive',
          },
        },
        select: { id: true },
      },
    });

    const upsert = calls[1] as {
      passwordUpsert: {
        where: { userId: string };
        update: { hash: string };
        create: { userId: string; hash: string };
      };
    };
    expect(upsert.passwordUpsert.where.userId).toBe('user-1');
    expect(upsert.passwordUpsert.create.userId).toBe('user-1');
    expect(upsert.passwordUpsert.update.hash).not.toBe('new-preview-password');
    expect(upsert.passwordUpsert.create.hash).toBe(upsert.passwordUpsert.update.hash);
    expect(
      bcrypt.compareSync('new-preview-password', upsert.passwordUpsert.update.hash),
    ).toBe(true);
  });

  test('fails when the configured preview login user is not in the cloned database', async () => {
    const client = {
      user: {
        findFirst: async () => null,
      },
      password: {
        upsert: async () => {
          throw new Error('should not upsert');
        },
      },
    };

    await expect(
      resetPreviewLoginPassword(client, {
        email: 'missing@example.com',
        password: 'new-preview-password',
      }),
    ).rejects.toThrow('Preview login user not found: missing@example.com');
  });
});
