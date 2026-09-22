import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLocalDatabaseUrl } from './local-dev/connection';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_PERSONAS,
  UA_PREVIEW_ORG_ID,
  UA_PREVIEW_ORG_NAME,
} from './local-dev/dev-personas';
import {
  loadProdFidelityBundle,
  syncProdFidelityFixtures,
} from './local-dev/import-prod-fidelity-fixtures';

describe('local dev seed fixtures', () => {
  test('loads committed prod-fidelity fixtures with expected counts', async () => {
    const bundle = await loadProdFidelityBundle();
    expect(bundle.manifest.version).toBe(2);
    expect(bundle.manifest.sourceDatabaseUrl).toBe('production-config-export');
    // 12 exported from production, plus the Exit Ticket type the product
    // seeds itself because the admin creator cannot set `kind`.
    expect(bundle.assignmentTypes).toHaveLength(13);
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
    expect(assignmentTypeTitles).toContain(
      'Nonverbal Communication Assignment'
    );
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

  test('seeds an isolated University of Alabama organization for preview checkout', () => {
    const seedSource = readFileSync(
      join(import.meta.dirname, 'seed-local-dev.ts'),
      'utf8'
    );

    expect(UA_PREVIEW_ORG_ID).toBe('university-of-alabama-preview');
    expect(UA_PREVIEW_ORG_NAME).toBe('University of Alabama');
    expect(seedSource).toContain('id: UA_PREVIEW_ORG_ID');
    expect(seedSource).toContain('name: UA_PREVIEW_ORG_NAME');
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

  test('keeps production export and existing-database sync PII-safe', async () => {
    const exportSource = readFileSync(
      join(import.meta.dirname, 'local-dev/export-prod-fidelity-fixtures.ts'),
      'utf8'
    );
    const importSource = readFileSync(
      join(import.meta.dirname, 'local-dev/import-prod-fidelity-fixtures.ts'),
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
    expect(importSource).not.toMatch(
      /prisma\.(user|document|submission|orgMembership)\.(delete|deleteMany|update|updateMany)/
    );

    const bundle = await loadProdFidelityBundle();
    const fixtureText = JSON.stringify({
      ...bundle,
      assignmentTypeImages: [],
      teacherTrainingImages: [],
      teacherTrainingModuleResources: [],
    });
    expect(fixtureText).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+@/i);
    expect(fixtureText).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(fixtureText).not.toMatch(/sk-ant-[A-Za-z0-9_-]+/);

    for (const resource of bundle.teacherTrainingModuleResources) {
      if (!String(resource.contentType ?? '').startsWith('text/')) continue;
      const decoded = Buffer.from(resource.blob.base64, 'base64').toString(
        'utf8'
      );
      expect(decoded).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      expect(decoded).not.toMatch(
        /(?:\+?1[-. (]*)?\d{3}[-. )]*\d{3}[-. ]*\d{4}/
      );
    }
  });

  test('reconciles stale fixture buttons and preserves assignment-type ownership scope', async () => {
    const bundle = await loadProdFidelityBundle();
    const buttonDeleteMany = mock(async () => ({ count: 0 }));
    const visibilityDeleteMany = mock(async () => ({ count: 0 }));
    const assignmentTypeUpsert = mock(
      async (args: { create: { id: string } }) => args.create
    );
    const upsert = mock(
      async (args: { create: { id: string } }) => args.create
    );
    const rubricUpsert = mock(
      async (args: { create: { id: string; name: string } }) => args.create
    );
    const createMany = mock(async () => ({ count: 0 }));
    const prisma = {
      rubric: { upsert: rubricUpsert },
      assignmentType: { upsert: assignmentTypeUpsert },
      assignmentTypeImage: { upsert },
      assignmentModule: { upsert },
      assignmentModuleInstruction: { upsert },
      assignmentModuleInstructionButton: {
        upsert,
        deleteMany: buttonDeleteMany,
      },
      teacherTraining: { upsert },
      teacherTrainingImage: { upsert },
      teacherTrainingModule: { upsert },
      teacherTrainingModuleResource: { upsert },
      teacherTrainingResource: { upsert },
      apHistoryPromptLibraryEntry: { upsert },
      apHistoryPromptLibrarySource: { upsert },
      organization: {
        findMany: mock(async () => [
          { id: LOCAL_DEV_ORG_ID },
          { id: 'preview-seat-2' },
        ]),
      },
      organizationAssignmentType: {
        createMany,
        deleteMany: visibilityDeleteMany,
      },
    };

    await syncProdFidelityFixtures(prisma as never, bundle);

    const fixtureInstructionIds = bundle.assignmentModuleInstructions.map(
      ({ id }) => String(id)
    );
    const fixtureButtonIds = bundle.assignmentModuleInstructionButtons.map(
      ({ id }) => String(id)
    );
    expect(buttonDeleteMany).toHaveBeenCalledWith({
      where: {
        assignmentModuleInstructionId: { in: fixtureInstructionIds },
        id: { notIn: fixtureButtonIds },
      },
    });

    const thesisUpsert = assignmentTypeUpsert.mock.calls.find(
      ([args]) => args.create.title === 'The Thesis-Driven Essay'
    )?.[0];
    const productionQaUpsert = assignmentTypeUpsert.mock.calls.find(
      ([args]) => args.create.id === 'prodqa-free-nav-at'
    )?.[0];
    expect(thesisUpsert?.create.ownerOrgId).toBeNull();
    expect(productionQaUpsert?.create.ownerOrgId).toBe(LOCAL_DEV_ORG_ID);
    expect(visibilityDeleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'preview-seat-2',
        assignmentTypeId: {
          in: expect.arrayContaining(['prodqa-free-nav-at']),
        },
      },
    });
  });

  test('connects cumulative staff personas to seeded schools and classes', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'local-dev/seed-synthetic-data.ts'),
      'utf8'
    );

    const teacherMembershipIdsBlock =
      source.match(/const teacherMembershipIds = \[([\s\S]*?)\];/)?.[1] ?? '';
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
      source.match(/const studentMembershipIds = \[([\s\S]*?)\];/)?.[1] ?? '';
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
    expect(seedSource).toContain('lessonPlannerEnabled: true');
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
