// Real-database round trip for the global feature flags: the flag starts off,
// the management API turns it on and off, and the readers follow the Setting row.
//   FEATURE_FLAG_DB_TESTS=1 DATABASE_URL=... bun test app/domain/feature-flags/feature-flags.integration.test.ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  DAILY_PAGES_WRITING_CONDITIONS_FLAG,
  featureFlagSettingName,
} from './feature-flags';

const enabled = process.env.FEATURE_FLAG_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const flags = enabled ? await import('./feature-flags.server') : null;
const http = enabled
  ? await import('~/utils/internal-feature-flags-http.server')
  : null;
const { prisma } = enabled
  ? await import('~/utils/db.server')
  : { prisma: null };

const KEY = 'f'.repeat(43);
const NAME = featureFlagSettingName(DAILY_PAGES_WRITING_CONDITIONS_FLAG);
const URL_BASE = 'https://yawp.school/api/internal/v1/feature-flags';
const auth = { authorization: `Bearer ${KEY}` };

suite('feature flags against the database', () => {
  let oldKey: string | undefined;
  let original: { value: string } | null = null;

  beforeAll(async () => {
    oldKey = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = KEY;
    original = await prisma!.setting.findUnique({
      where: { name: NAME },
      select: { value: true },
    });
    await prisma!.setting.deleteMany({ where: { name: NAME } });
  });

  afterAll(async () => {
    await prisma!.setting.deleteMany({ where: { name: NAME } });
    if (original) {
      await prisma!.setting.create({
        data: { name: NAME, value: original.value, valueType: 'boolean' },
      });
    }
    if (oldKey === undefined) delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    else process.env.YAWP_MANAGEMENT_SERVICE_KEY = oldKey;
  });

  const setVia = (on: boolean) =>
    http!.featureFlagUpdate(
      new Request(`${URL_BASE}/${DAILY_PAGES_WRITING_CONDITIONS_FLAG}`, {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': 'application/json',
          'x-yawp-operator-email': 'ops@yawp.school',
        },
        body: JSON.stringify({ enabled: on }),
      }),
      DAILY_PAGES_WRITING_CONDITIONS_FLAG
    );

  test('with no row the flag is off', async () => {
    expect(await flags!.isDailyPagesWritingConditionsEnabled()).toBe(false);
    const list = await http!.featureFlagsList(
      new Request(URL_BASE, { headers: auth })
    );
    const body = (await list.json()) as { flags: { key: string; enabled: boolean }[] };
    expect(
      body.flags.find((f) => f.key === DAILY_PAGES_WRITING_CONDITIONS_FLAG)
        ?.enabled
    ).toBe(false);
  });

  test('turning it on through the management API is read at once', async () => {
    const res = await setVia(true);
    expect(res.status).toBe(200);
    expect(await flags!.isDailyPagesWritingConditionsEnabled()).toBe(true);
    const row = await prisma!.setting.findUnique({ where: { name: NAME } });
    expect(row?.value).toBe('true');
    expect(row?.description).toContain('ops@yawp.school');
  });

  test('turning it back off is read at once and keeps a single row', async () => {
    const res = await setVia(false);
    expect(res.status).toBe(200);
    expect(await flags!.isDailyPagesWritingConditionsEnabled()).toBe(false);
    expect(await prisma!.setting.count({ where: { name: NAME } })).toBe(1);
  });
});
