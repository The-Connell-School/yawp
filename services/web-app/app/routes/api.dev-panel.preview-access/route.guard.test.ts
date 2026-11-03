import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { CLOUDFRONT_IPV4_RANGES } from '~/utils/cloudfront-ranges.server';
import {
  DEV_PANEL_UNLOCK_COOKIE_NAME,
  getPreviewAccessSeat,
  PREVIEW_ACCESS_COOKIE_NAME,
} from '~/utils/preview-access.server';
import { resetPreviewAccessRateLimitForTests } from '~/utils/preview-access-rate-limit.server';

const PRIMARY_SEAT_CODE = 'brave-otter-4193';
const SECOND_SEAT_CODE = 'calm-panda-8127';

mock.module('~/utils/db.server', () => ({
  prisma: {
    organization: {
      findUnique: mock(
        async ({
          where,
        }: {
          where: { previewSeatCode?: string; id?: string };
        }) => {
          if (where.previewSeatCode === SECOND_SEAT_CODE) {
            return { id: 'preview-seat-2', name: 'Preview seat two' };
          }
          if (where.id === 'local-dev-org') {
            return {
              id: 'local-dev-org',
              name: 'Master seat',
              previewSeatCode: PRIMARY_SEAT_CODE,
            };
          }
          if (where.id === 'preview-seat-2') {
            return {
              id: 'preview-seat-2',
              name: 'Preview seat two',
              previewSeatCode: SECOND_SEAT_CODE,
            };
          }
          return null;
        }
      ),
    },
  },
  basePrisma: {},
}));

const envKeys = [
  'YAWP_ENVIRONMENT',
  'PREVIEW_SLUG',
  'PR_NUMBER',
  'PREVIEW_ACCESS_GATE',
  'PREVIEW_DATA_MODE',
  'PREVIEW_ACCESS_SEATS',
  'PREVIEW_ACCESS_SECRET',
  'PREVIEW_MASTER_ACCESS_CODE',
  'SESSION_SECRET',
  'NODE_ENV',
  'DATABASE_URL',
] as const;

const MASTER_CODE = 'yawp-rocks-master-only';
const INVALID_CODE = 'wrong-seat-code-9999';

const CLOUDFRONT_EDGE_IP = `${CLOUDFRONT_IPV4_RANGES[0]!.split('/')[0]!.replace(/\d+$/, (n) => String(Number(n) + 1))}`;

function snapshotEnv() {
  const previous = {} as Record<(typeof envKeys)[number], string | undefined>;
  for (const key of envKeys) previous[key] = process.env[key];
  return previous;
}

function restoreEnv(previous: Record<(typeof envKeys)[number], string | undefined>) {
  const env = process.env as Record<string, string | undefined>;
  for (const key of envKeys) {
    if (previous[key] === undefined) delete env[key];
    else env[key] = previous[key];
  }
}

function demoGateEnv() {
  Object.assign(process.env, {
    YAWP_ENVIRONMENT: 'preview',
    PREVIEW_SLUG: 'demo',
    PR_NUMBER: '',
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@remote:5432/yawp',
    PREVIEW_ACCESS_GATE: 'on',
    PREVIEW_DATA_MODE: 'seed',
    PREVIEW_ACCESS_SEATS: JSON.stringify([
      {
        code: PRIMARY_SEAT_CODE,
        organizationId: 'local-dev-org',
        label: 'Master seat',
      },
      {
        code: SECOND_SEAT_CODE,
        organizationId: 'preview-seat-2',
        label: 'Preview seat two',
      },
    ]),
    PREVIEW_ACCESS_SECRET: 'unit-test-preview-access-secret-32-chars',
    PREVIEW_MASTER_ACCESS_CODE: MASTER_CODE,
    SESSION_SECRET: 'unit-test-session-secret-32-characters',
  });
}

function postPreviewAccess(body: { code: string }, clientIp = '203.0.113.44') {
  return new Request('http://localhost/api/dev-panel/preview-access', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `${clientIp}, ${CLOUDFRONT_EDGE_IP}`,
    },
    body: JSON.stringify(body),
  });
}

describe('api.dev-panel.preview-access guard integration', () => {
  let previousEnv: Record<(typeof envKeys)[number], string | undefined>;

  beforeEach(() => {
    previousEnv = snapshotEnv();
    resetPreviewAccessRateLimitForTests();
  });

  afterEach(() => {
    restoreEnv(previousEnv);
    resetPreviewAccessRateLimitForTests();
  });

  test('with gate on and no cookie, a valid seat code unlocks and sets the seat cookie', async () => {
    demoGateEnv();
    const { action } = await import('./route');
    const response = await action({
      request: postPreviewAccess({ code: SECOND_SEAT_CODE }),
    } as never);
    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie?.() ?? [
      response.headers.get('set-cookie') ?? '',
    ];
    expect(setCookies.join(';')).toContain(`${PREVIEW_ACCESS_COOKIE_NAME}=`);
    expect(setCookies.join(';')).toContain(`${DEV_PANEL_UNLOCK_COOKIE_NAME}=`);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.seatLabel).toBe('Preview seat two');
  });

  test('invalid codes return 401 through code validation and count toward rate limiting', async () => {
    demoGateEnv();
    const { action } = await import('./route');
    const clientIp = '203.0.113.55';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await action({
        request: postPreviewAccess({ code: INVALID_CODE }, clientIp),
      } as never);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('That access code did not work.');
    }
    const blocked = await action({
      request: postPreviewAccess({ code: INVALID_CODE }, clientIp),
    } as never);
    expect(blocked.status).toBe(429);
    const blockedBody = await blocked.json();
    expect(blockedBody.error).toBe('Too many attempts. Try again later.');
  });

  test('master credentials unlock with a master access cookie for the configured primary org', async () => {
    demoGateEnv();
    const { action } = await import('./route');
    const response = await action({
      request: postPreviewAccess({ code: MASTER_CODE }),
    } as never);
    expect(response.status).toBe(200);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${PREVIEW_ACCESS_COOKIE_NAME}=`);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.seatLabel).toBe('Master seat');
    const cookiePair = setCookie.split(';', 1)[0] ?? '';
    const seat = await getPreviewAccessSeat(
      new Request('http://localhost/', {
        headers: { cookie: cookiePair },
      })
    );
    expect(seat).toEqual({
      organizationId: 'local-dev-org',
      label: 'Master seat',
      accessKind: 'master',
    });
  });

  test('master credentials return 401 when no configured master organization exists', async () => {
    demoGateEnv();
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: SECOND_SEAT_CODE,
        organizationId: 'preview-seat-2',
        label: 'Preview seat two',
      },
    ]);
    const { action } = await import('./route');
    const response = await action({
      request: postPreviewAccess({ code: MASTER_CODE }),
    } as never);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('That access code did not work.');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  test('production runtime returns 404 before any code check', async () => {
    const env = process.env as Record<string, string | undefined>;
    for (const key of envKeys) delete env[key];
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/yawp',
      PREVIEW_ACCESS_GATE: 'on',
      PREVIEW_DATA_MODE: 'seed',
      PREVIEW_ACCESS_SEATS: JSON.stringify([
        {
          code: SECOND_SEAT_CODE,
          organizationId: 'preview-seat-2',
          label: 'Preview seat two',
        },
      ]),
      PREVIEW_ACCESS_SECRET: 'unit-test-preview-access-secret-32-chars',
    });
    const { action } = await import('./route');
    const response = await action({
      request: postPreviewAccess({ code: SECOND_SEAT_CODE }),
    } as never);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Not found');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
