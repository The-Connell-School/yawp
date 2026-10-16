import { expect, test } from 'bun:test';
import { applyPreviewSignonFlag, isYawpPrPreviewDatabase } from './unified-signon-flag.mjs';

const databaseUrl = 'postgresql://yawp_pr_565_app:fixture@preview-postgres:5432/yawp_pr_565';
const valid = { YAWP_ENVIRONMENT: 'preview', DATABASE_URL: databaseUrl };

for (const url of [undefined, '', 'garbage/yawp_pr_565', 'https://preview-postgres/yawp_pr_565',
  databaseUrl.replace('yawp_pr_565', 'yawp_demo'), databaseUrl.replace('/yawp_pr_565', '/yawp'),
  databaseUrl.replace('/yawp_pr_565', '/yawp_pr_0'), databaseUrl + '/extra',
  databaseUrl + '?host=production', databaseUrl + '?schema=public', databaseUrl + '#fragment',
  databaseUrl.replace('preview-postgres', 'production.rds.amazonaws.com'),
  databaseUrl.replace('yawp_pr_565_app', 'postgres'), databaseUrl.replace(':5432', ':5433'),
  databaseUrl.replace('/yawp_pr_565', '/yawp_pr_566'),
  databaseUrl.replace('/yawp_pr_565', '/extra/../yawp_pr_565'),
  databaseUrl.replace('fixture', '%ZZ'), databaseUrl.replace('fixture', ''),
  databaseUrl + '\n', databaseUrl.replace('preview-postgres', 'preview-postgres\n'),
]) {
  test(`rejects invalid or shared database target ${url?.replace(/:fixture@/, ':***@')}`, async () => {
    expect(isYawpPrPreviewDatabase(url)).toBe(false);
    let connections = 0;
    await expect(applyPreviewSignonFlag({ ...valid, DATABASE_URL: url, PREVIEW_UNIFIED_SIGN_ON: 'true' }, () => { connections++; throw Error('must not connect'); })).rejects.toThrow('isolated PR preview');
    expect(connections).toBe(0);
  });
}
for (const environment of [undefined, '', 'demo', 'production', 'Preview']) {
  test(`rejects environment ${environment} before opening database`, async () => {
    let connections = 0;
    await expect(applyPreviewSignonFlag({ ...valid, YAWP_ENVIRONMENT: environment, PREVIEW_UNIFIED_SIGN_ON: 'true' }, () => { connections++; throw Error('must not connect'); })).rejects.toThrow('preview environment');
    expect(connections).toBe(0);
  });
}
test('accepts only the current isolated host, role and positive PR database naming convention', () => {
  expect(isYawpPrPreviewDatabase(databaseUrl)).toBe(true);
  expect(isYawpPrPreviewDatabase(databaseUrl.replace('postgresql:', 'postgres:'))).toBe(true);
});
test('everyone, repeated enable, removal and repeated OFF affect only the sign-on setting', async () => {
  const rows = new Map([['feature_flag.free_tier', 'false']]);
  let disconnects = 0;
  const client = {
    setting: { upsert: async ({ where, create, update }) => {
      expect(where).toEqual({ name: 'feature_flag.unified-sign-on' });
      expect(create.name).toBe(where.name);
      expect(create.valueType).toBe('json');
      expect(update.valueType).toBe('json');
      rows.set(where.name, rows.has(where.name) ? update.value : create.value);
    } },
    $disconnect: async () => { disconnects++; },
  };
  for (const enabled of ['true', 'true', undefined, 'false', 'false']) {
    await applyPreviewSignonFlag({ ...valid, PREVIEW_UNIFIED_SIGN_ON: enabled }, async () => client);
    expect(JSON.parse(rows.get('feature_flag.unified-sign-on')!)).toEqual({ mode: enabled === 'true' ? 'everyone' : 'off', orgIds: [] });
    expect(rows.get('feature_flag.free_tier')).toBe('false');
    expect(rows.size).toBe(2);
  }
  expect(disconnects).toBe(5);
});
test('malformed boolean fails before opening database', async () => {
  let connections = 0;
  await expect(applyPreviewSignonFlag({ ...valid, PREVIEW_UNIFIED_SIGN_ON: 'TRUE' }, () => { connections++; })).rejects.toThrow('true or false');
  expect(connections).toBe(0);
});
test('write failure propagates and disconnects', async () => {
  let disconnected = false;
  await expect(applyPreviewSignonFlag(valid, async () => ({ setting: { upsert: async () => { throw Error('write failed'); } }, $disconnect: async () => { disconnected = true; } }))).rejects.toThrow('write failed');
  expect(disconnected).toBe(true);
});
