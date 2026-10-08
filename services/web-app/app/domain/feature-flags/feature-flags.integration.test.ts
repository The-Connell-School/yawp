// Real-database round trip for the global feature flags: the flag starts off,
// the management API turns it on and off, and the readers follow the Setting row.
//   FEATURE_FLAG_DB_TESTS=1 DATABASE_URL=... bun test app/domain/feature-flags/feature-flags.integration.test.ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { LESSON_PLANNER_FLAG, featureFlagSettingName } from './feature-flags';

const enabled = process.env.FEATURE_FLAG_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;

const KEY = 'f'.repeat(43);
const NAME = featureFlagSettingName(LESSON_PLANNER_FLAG);
const URL_BASE = 'https://yawp.school/api/internal/v1/feature-flags';
const auth = { authorization: `Bearer ${KEY}` };

let prisma: import('~/utils/db.server').prisma | null = null;
let flags: typeof import('./feature-flags.server') | null = null;
let http: typeof import('~/utils/internal-feature-flags-http.server') | null = null;

async function loadDbModules() {
  if (!enabled) return;
  if (!prisma) {
    ({ prisma } = await import('~/utils/db.server'));
    flags = await import('./feature-flags.server');
    http = await import('~/utils/internal-feature-flags-http.server');
  }
}

suite('feature flags against the database', () => {
  let oldKey: string | undefined;
  let original: { value: string; valueType: string } | null = null;
  let orgId = '';

  beforeAll(async () => {
    if (!enabled) return;
    await loadDbModules();
    oldKey = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = KEY;
    original = await prisma!.setting.findUnique({
      where: { name: NAME },
      select: { value: true, valueType: true },
    });
    await prisma!.setting.deleteMany({ where: { name: NAME } });
    orgId = (
      await prisma!.organization.create({
        data: { name: 'Feature flag targeting test school' },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (!enabled) return;
    await prisma!.setting.deleteMany({ where: { name: NAME } });
    if (original) {
      await prisma!.setting.create({
        data: { name: NAME, value: original.value, valueType: original.valueType },
      });
    }
    if (orgId) await prisma!.organization.delete({ where: { id: orgId } });
    if (oldKey === undefined) delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    else process.env.YAWP_MANAGEMENT_SERVICE_KEY = oldKey;
  });

  const setVia = (body: unknown) =>
    http!.featureFlagUpdate(
      new Request(`${URL_BASE}/${LESSON_PLANNER_FLAG}`, {
        method: 'POST',
        headers: {
          ...auth,
          'content-type': 'application/json',
          'x-yawp-operator-email': 'ops@yawp.school',
        },
        body: JSON.stringify(body),
      }),
      LESSON_PLANNER_FLAG
    );

  test('with no row the flag is off', async () => {
    expect(await flags!.isLessonPlannerEnabled(orgId)).toBe(false);
    const list = await http!.featureFlagsList(
      new Request(URL_BASE, { headers: auth })
    );
    const body = (await list.json()) as { flags: { key: string; enabled: boolean }[] };
    expect(
      body.flags.find((f) => f.key === LESSON_PLANNER_FLAG)
        ?.enabled
    ).toBe(false);
  });

  test('a legacy "true" row still reads as on for everyone', async () => {
    await prisma!.setting.create({
      data: { name: NAME, value: 'true', valueType: 'boolean' },
    });
    expect(await flags!.isLessonPlannerEnabled(orgId)).toBe(true);
    expect(await flags!.isLessonPlannerEnabled(null)).toBe(true);
    await prisma!.setting.deleteMany({ where: { name: NAME } });
  });

  test('turning it on through the management API is read at once', async () => {
    const res = await setVia({ enabled: true });
    expect(res.status).toBe(200);
    expect(await flags!.isLessonPlannerEnabled(orgId)).toBe(true);
    const row = await prisma!.setting.findUnique({ where: { name: NAME } });
    expect(JSON.parse(row!.value)).toEqual({ mode: 'everyone', orgIds: [] });
    expect(row?.description).toContain('ops@yawp.school');
  });

  test('targeting one school turns it on there only', async () => {
    const res = await setVia({ mode: 'targeted', orgIds: [orgId] });
    expect(res.status).toBe(200);
    expect(await flags!.isLessonPlannerEnabled(orgId)).toBe(true);
    expect(await flags!.isLessonPlannerEnabled('another-school')).toBe(false);
    expect(await flags!.isLessonPlannerEnabled(null)).toBe(false);
  });

  test('refuses to target a school that does not exist', async () => {
    const res = await setVia({ mode: 'targeted', orgIds: [orgId, 'no-such-school'] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Unknown organizations',
      unknownOrgIds: ['no-such-school'],
    });
    expect(await flags!.isLessonPlannerEnabled(orgId)).toBe(true);
  });

  test('turning it back off is read at once and keeps a single row', async () => {
    const res = await setVia({ enabled: false });
    expect(res.status).toBe(200);
    expect(await flags!.isLessonPlannerEnabled(orgId)).toBe(false);
    expect(await prisma!.setting.count({ where: { name: NAME } })).toBe(1);
  });
});

// Daily Pages paragraph type and writing time were removed with their flag.
// A Setting row left behind is kept as data, but the management API neither
// lists nor accepts the key.
const REMOVED_KEY = 'daily_pages_paragraph_type_and_writing_time';
const REMOVED_NAME = `feature_flag.${REMOVED_KEY}`;

suite('the removed writing-conditions flag against the database', () => {
  let oldKey: string | undefined;
  let original: { value: string; valueType: string } | null = null;

  beforeAll(async () => {
    if (!enabled) return;
    await loadDbModules();
    oldKey = process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    process.env.YAWP_MANAGEMENT_SERVICE_KEY = KEY;
    original = await prisma!.setting.findUnique({
      where: { name: REMOVED_NAME },
      select: { value: true, valueType: true },
    });
    if (!original) {
      await prisma!.setting.create({
        data: { name: REMOVED_NAME, value: 'true', valueType: 'boolean' },
      });
    }
  });

  afterAll(async () => {
    if (!enabled) return;
    if (!original) {
      await prisma!.setting.deleteMany({ where: { name: REMOVED_NAME } });
    }
    if (oldKey === undefined) delete process.env.YAWP_MANAGEMENT_SERVICE_KEY;
    else process.env.YAWP_MANAGEMENT_SERVICE_KEY = oldKey;
  });

  test('is not listed, cannot be set, and its row is left alone', async () => {
    const before = await prisma!.setting.findUnique({ where: { name: REMOVED_NAME } });
    const list = await http!.featureFlagsList(new Request(URL_BASE, { headers: auth }));
    const body = (await list.json()) as { flags: { key: string }[] };
    expect(body.flags.map((f) => f.key)).not.toContain(REMOVED_KEY);

    const res = await http!.featureFlagUpdate(
      new Request(`${URL_BASE}/${REMOVED_KEY}`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }),
      REMOVED_KEY
    );
    expect(res.status).toBe(404);
    const after = await prisma!.setting.findUnique({ where: { name: REMOVED_NAME } });
    expect(after).toEqual(before);
  });
});
