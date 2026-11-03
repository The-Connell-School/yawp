import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEV_PANEL_SIGNED_OUT_TESTER_EMAIL,
  ensureDevPanelSignedOutTesterUser,
} from './dev-panel-signed-out-feedback.server';
import { isLocalDatabaseUrl } from '../../../../packages/prisma/scripts/local-dev/database-url';
import { submitDevPanelFeedback } from './dev-panel-feedback.server';

const run =
  process.env.DEV_PANEL_FEEDBACK_INTEGRATION_ISOLATED === '1' &&
  Boolean(
    process.env.DATABASE_URL && isLocalDatabaseUrl(String(process.env.DATABASE_URL))
  );
const tinyJpeg =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGCAjJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnL/2wBDAQ4ODhANDg4dERUQEBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Af//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAz8Cf//Z';

describe.skipIf(!run)('dev panel feedback integration', () => {
  let prisma: typeof import('~/utils/db.server').prisma;

  beforeAll(async () => {
    ({ prisma } = await import('~/utils/db.server'));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('feedback server sources exclude local dev persona imports', () => {
    for (const file of [
      'dev-panel-feedback.server.ts',
      'dev-panel-signed-out-feedback.server.ts',
    ]) {
      const src = readFileSync(path.join(import.meta.dir, file), 'utf8');
      expect(src.includes('dev-personas')).toBe(false);
      expect(src.includes('LOCAL_DEV_PASSWORD')).toBe(false);
      expect(src.includes('bcrypt')).toBe(false);
    }
  });

  test('production route handler returns 404 from real guard', async () => {
    const previous = {
      YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
      PREVIEW_SLUG: process.env.PREVIEW_SLUG,
      PR_NUMBER: process.env.PR_NUMBER,
      NODE_ENV: process.env.NODE_ENV,
    };
    delete process.env.YAWP_ENVIRONMENT;
    delete process.env.PREVIEW_SLUG;
    delete process.env.PR_NUMBER;
    process.env.NODE_ENV = 'production';
    try {
      const response = await submitDevPanelFeedback(
        new Request('http://localhost/api/dev-panel/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost' },
          body: JSON.stringify({ note: 'n', url: '/free', actions: [] }),
        })
      );
      expect(response.status).toBe(404);
    } finally {
      Object.assign(process.env, previous);
    }
  });

  test('signed-out tester user has no credentials or membership and stores screenshot', async () => {
    const userId = await ensureDevPanelSignedOutTesterUser();
    const password = await prisma.password.findUnique({ where: { userId } });
    const memberships = await prisma.orgMembership.count({ where: { userId } });
    expect(password).toBeNull();
    expect(memberships).toBe(0);

    const previousGate = process.env.PREVIEW_ACCESS_GATE;
    const previousEnv = process.env.YAWP_ENVIRONMENT;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.PREVIEW_ACCESS_GATE = 'off';
    process.env.YAWP_ENVIRONMENT = 'development';
    process.env.NODE_ENV = 'development';
    const note = `integration signed-out ${Date.now()}`;
    try {
      const response = await submitDevPanelFeedback(
        new Request('http://localhost:5173/api/dev-panel/feedback', {
          method: 'POST',
          headers: {
            origin: 'http://localhost:5173',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            note,
            url: '/free',
            actions: [{ type: 'route', path: '/free' }],
            screenshot: tinyJpeg,
          }),
        })
      );
      expect(response.status).toBe(201);
      const entry = await prisma.testerFeedback.findFirst({
        where: { userId, whatHappened: note },
      });
      expect(entry?.screenshot).toContain('data:image/jpeg');
      expect(entry?.userId).toBe(userId);
      if (entry) await prisma.testerFeedback.delete({ where: { id: entry.id } });
    } finally {
      if (previousGate === undefined) delete process.env.PREVIEW_ACCESS_GATE;
      else process.env.PREVIEW_ACCESS_GATE = previousGate;
      if (previousEnv === undefined) delete process.env.YAWP_ENVIRONMENT;
      else process.env.YAWP_ENVIRONMENT = previousEnv;
      if (previousNodeEnv === undefined) {
        process.env.NODE_ENV = 'test';
      } else process.env.NODE_ENV = previousNodeEnv;
    }

    const listed = await prisma.user.findUnique({
      where: { email: DEV_PANEL_SIGNED_OUT_TESTER_EMAIL },
      select: { email: true },
    });
    expect(listed?.email).toBe(DEV_PANEL_SIGNED_OUT_TESTER_EMAIL);
  });
});
