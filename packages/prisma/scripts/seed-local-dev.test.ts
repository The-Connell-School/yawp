import { describe, expect, test } from 'bun:test';
import { isLocalDatabaseUrl } from './local-dev/connection';
import { LOCAL_DEV_PERSONAS } from './local-dev/dev-personas';
import { loadProdFidelityBundle } from './local-dev/import-prod-fidelity-fixtures';

describe('local dev seed fixtures', () => {
  test('loads committed prod-fidelity fixtures with expected counts', async () => {
    const bundle = await loadProdFidelityBundle();
    expect(bundle.manifest.version).toBe(1);
    expect(bundle.assignmentTypes.length).toBeGreaterThan(0);
    expect(
      bundle.assignmentTypes.some(
        (assignmentType) =>
          assignmentType.rubricJson != null &&
          assignmentType.scoringScaleJson != null
      )
    ).toBe(true);
    expect(bundle.teacherTrainings.length).toBeGreaterThan(0);
  });

  test('aligns thesis module review instructions with the grading assistant rubric', async () => {
    const bundle = await loadProdFidelityBundle();
    const reviewInstructions = bundle.assignmentModuleInstructions.filter(
      (instruction) =>
        typeof instruction.title === 'string' &&
        instruction.title.trim().toLowerCase() === 'review my essay!'
    );

    expect(reviewInstructions.length).toBeGreaterThanOrEqual(2);

    for (const instruction of reviewInstructions) {
      const content = `${instruction.prompt ?? ''}\n${instruction.tutorInstructions ?? ''}`;

      expect(content).not.toContain(
        'Content, Organization, Syntax, and Grammar'
      );
      expect(content).toContain('Thesis/Content (25%)');
      expect(content).toContain('Organization/Structure (25%)');
      expect(content).toContain('Evidence/Support (20%)');
      expect(content).toContain('Voice/Style (20%)');
      expect(content).toContain('Grammar/Syntax/Formatting (10%)');
    }
  });

  test('defines stable dev personas with shared password', () => {
    expect(LOCAL_DEV_PERSONAS.length).toBeGreaterThanOrEqual(8);
    expect(
      LOCAL_DEV_PERSONAS.every((persona) => persona.password === 'yawp-dev')
    ).toBe(true);
  });

  test('loads the synthetic seed module used by preview seed deploys', async () => {
    const seedModule = await import('./local-dev/seed-synthetic-data');

    expect(typeof seedModule.seedSyntheticLocalDevData).toBe('function');
  });

  test('treats localhost database urls as local seed targets', () => {
    expect(
      isLocalDatabaseUrl('postgresql://postgres:postgres@localhost:5432/yawp')
    ).toBe(true);
    expect(
      isLocalDatabaseUrl(
        'postgresql://postgres:postgres@preview-postgres:5432/yawp_pr_184'
      )
    ).toBe(true);
    expect(
      isLocalDatabaseUrl(
        'postgresql://postgres:postgres@yawp-prod.abc.us-east-1.rds.amazonaws.com:5432/yawp'
      )
    ).toBe(false);
  });
});
