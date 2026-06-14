import { describe, expect, test } from 'bun:test';
import { isLocalDatabaseUrl } from './local-dev/connection';
import { LOCAL_DEV_PERSONAS } from './local-dev/dev-personas';
import { loadProdFidelityBundle } from './local-dev/import-prod-fidelity-fixtures';

describe('local dev seed fixtures', () => {
  test('loads committed prod-fidelity fixtures with expected counts', async () => {
    const bundle = await loadProdFidelityBundle();
    expect(bundle.manifest.version).toBe(1);
    expect(bundle.assignmentTypes.length).toBeGreaterThan(0);
    expect(bundle.gradingAssistantTemplates.length).toBeGreaterThan(0);
    expect(bundle.teacherTrainings.length).toBeGreaterThan(0);
  });

  test('defines stable dev personas with shared password', () => {
    expect(LOCAL_DEV_PERSONAS.length).toBeGreaterThanOrEqual(8);
    expect(
      LOCAL_DEV_PERSONAS.every((persona) => persona.password === 'yawp-dev')
    ).toBe(true);
  });

  test('treats localhost database urls as local seed targets', () => {
    expect(
      isLocalDatabaseUrl('postgresql://postgres:postgres@localhost:5432/yawp')
    ).toBe(true);
    expect(
      isLocalDatabaseUrl(
        'postgresql://postgres:postgres@yawp-prod.abc.us-east-1.rds.amazonaws.com:5432/yawp'
      )
    ).toBe(false);
  });
});
