import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLocalDatabaseUrl } from './local-dev/connection';
import { LOCAL_DEV_PERSONAS } from './local-dev/dev-personas';
import { loadProdFidelityBundle } from './local-dev/import-prod-fidelity-fixtures';

describe('local dev seed fixtures', () => {
  test('loads committed prod-fidelity fixtures with expected counts', async () => {
    const bundle = await loadProdFidelityBundle();
    expect(bundle.manifest.version).toBe(2);
    expect(bundle.manifest.sourceDatabaseUrl).toBe('production-config-export');
    expect(bundle.assignmentTypes).toHaveLength(12);
    expect(bundle.rubrics).toHaveLength(2);
    expect(
      bundle.assignmentTypes.some(
        (assignmentType) =>
          assignmentType.rubricJson != null &&
          assignmentType.scoringScaleJson != null
      )
    ).toBe(true);
    expect(bundle.teacherTrainings.length).toBeGreaterThan(0);
  });

  test('tracks the current production assignment-type and rubric inventory', async () => {
    const bundle = await loadProdFidelityBundle();
    const assignmentTypeTitles = new Set(
      bundle.assignmentTypes.map((assignmentType) => assignmentType.title)
    );
    const rubricNames = new Set(bundle.rubrics.map((rubric) => rubric.name));

    expect(assignmentTypeTitles).toContain("GBA 300: Int'l Expansion Plan");
    expect(assignmentTypeTitles).toContain("GBA 300: Int'l Etiquette");
    expect(assignmentTypeTitles).toContain('Nonverbal Communication Assignment');
    expect(rubricNames).toEqual(
      new Set(['daily-pages-engagement', 'thesis-driven-essay'])
    );
  });

  test('retains the current production essay-review instruction snapshot', async () => {
    const bundle = await loadProdFidelityBundle();
    const reviewInstructions = bundle.assignmentModuleInstructions.filter(
      (instruction) =>
        typeof instruction.title === 'string' &&
        instruction.title.trim().toLowerCase() === 'review my essay!'
    );

    expect(reviewInstructions).toHaveLength(2);

    const reviewContent = reviewInstructions.map(
      (instruction) =>
        `${instruction.prompt ?? ''}\n${instruction.tutorInstructions ?? ''}`
    );

    expect(
      reviewContent.every((content) =>
        content.includes('Content, Organization, Syntax, and Grammar')
      )
    ).toBe(true);
    expect(
      reviewContent.some((content) =>
        content.includes('4th Edition of Strunk and White')
      )
    ).toBe(true);
    expect(
      reviewContent.some((content) =>
        content.includes('REVIEW BY THESE FIVE CATEGORIES')
      )
    ).toBe(true);
  });

  test('defines stable dev personas with shared password', () => {
    expect(LOCAL_DEV_PERSONAS.length).toBeGreaterThanOrEqual(8);
    expect(
      LOCAL_DEV_PERSONAS.every((persona) => persona.password === 'yawp-dev')
    ).toBe(true);
  });

  test('models staff dev personas as teacher, owner, then admin capabilities', () => {
    const personasByKey = new Map(
      LOCAL_DEV_PERSONAS.map((persona) => [persona.key, persona])
    );

    expect(personasByKey.get('teacher')?.role).toBe('TEACHER');
    expect(personasByKey.get('teacher')?.isOrgOwner).toBeFalsy();
    expect(personasByKey.get('teacher')?.isAdmin).toBeFalsy();

    expect(personasByKey.get('owner')?.role).toBe('TEACHER');
    expect(personasByKey.get('owner')?.isOrgOwner).toBe(true);
    expect(personasByKey.get('owner')?.isAdmin).toBeFalsy();

    expect(personasByKey.get('admin')?.role).toBe('TEACHER');
    expect(personasByKey.get('admin')?.isOrgOwner).toBe(true);
    expect(personasByKey.get('admin')?.isAdmin).toBe(true);
  });

  test('loads the synthetic seed module used by preview seed deploys', async () => {
    const seedModule = await import('./local-dev/seed-synthetic-data');

    expect(typeof seedModule.seedSyntheticLocalDevData).toBe('function');
  });

  test('keeps production export and existing-database sync PII-safe and non-destructive', () => {
    const exportSource = readFileSync(
      join(
        import.meta.dirname,
        'local-dev/export-prod-fidelity-fixtures.ts'
      ),
      'utf8'
    );
    const syncSource = readFileSync(
      join(import.meta.dirname, 'sync-prod-fidelity-fixtures.ts'),
      'utf8'
    );

    expect(exportSource).not.toMatch(
      /prisma\.(user|document|submission|orgMembership)\./
    );
    expect(exportSource).toContain(
      "sourceDatabaseUrl: 'production-config-export'"
    );
    expect(syncSource).toContain('syncProdFidelityFixtures');
    expect(syncSource).not.toContain('truncateAllPublicTables');
    expect(syncSource).not.toContain('deleteMany');
  });

  test('connects cumulative staff personas to seeded schools and classes', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'local-dev/seed-synthetic-data.ts'),
      'utf8'
    );

    const teacherMembershipIdsBlock =
      source.match(/const teacherMembershipIds = \[([\s\S]*?)\];/)?.[1] ??
      '';
    expect(teacherMembershipIdsBlock).toContain('primaryTeacher.membershipId');
    expect(teacherMembershipIdsBlock).toContain('ownerTeacher.membershipId');
    expect(teacherMembershipIdsBlock).toContain('adminTeacher.membershipId');

    const ownerClassConnects =
      source.match(/\{ id: ownerTeacher\.membershipId \}/g) ?? [];
    const adminClassConnects =
      source.match(/\{ id: adminTeacher\.membershipId \}/g) ?? [];

    expect(ownerClassConnects.length).toBeGreaterThanOrEqual(2);
    expect(adminClassConnects.length).toBeGreaterThanOrEqual(2);

    const studentMembershipIdsBlock =
      source.match(/const studentMembershipIds = \[([\s\S]*?)\];/)?.[1] ??
      '';
    expect(studentMembershipIdsBlock).not.toContain('Teacher.membershipId');
  });

  test('writes teacher training assignments as membership then training', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'local-dev/seed-synthetic-data.ts'),
      'utf8'
    );

    expect(source).toContain('VALUES (${teacherMembershipId}, ${training.id})');
    expect(source).not.toContain(
      'VALUES (${training.id}, ${teacherMembershipId})'
    );
  });

  test('does not create writing practice configuration in local dev seed or schema', () => {
    const seedSource = readFileSync(
      join(import.meta.dirname, 'seed-local-dev.ts'),
      'utf8'
    );
    const schemaSource = readFileSync(
      join(import.meta.dirname, '..', 'schema.prisma'),
      'utf8'
    );

    expect(seedSource).not.toContain(['organization', 'Flags'].join(''));
    expect(seedSource).not.toContain('writing_practice');
    expect(schemaSource).not.toContain(['Organization', 'Flag'].join(''));
    expect(schemaSource).not.toContain(['feature', 'Flag'].join(''));
  });

  test('enables Reporter and Class Summary for local development', () => {
    const seedSource = readFileSync(
      join(import.meta.dirname, 'seed-local-dev.ts'),
      'utf8'
    );

    expect(seedSource).toContain('reporterEnabled: true');
    expect(seedSource).toContain('enableClassInsightsForOrganizations');
    expect(seedSource).toContain('[LOCAL_DEV_ORG_ID]');
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
