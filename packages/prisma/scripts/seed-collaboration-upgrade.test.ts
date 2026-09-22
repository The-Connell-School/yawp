import { describe, expect, test } from 'bun:test';
import { seedCollaborationDemoData } from './local-dev/seed-collaboration';
import { GBA300_GROUP_PLANS } from './local-dev/collab-demo-plan';

/**
 * The reconcile path: what happens when the demo is already in the database.
 *
 * This is the case that actually runs on a preview. A preview's database
 * outlives its deploys, so after the first one this is the only path there is —
 * and while it did nothing, every later addition to the demo was invisible until
 * somebody recreated the database by hand.
 *
 * Driven against a hand-written stand-in for the client rather than a database,
 * because what needs pinning down is which writes it makes and which it refuses
 * to make. Both matter: a preview is somewhere people click, and work they did
 * there must survive the next deploy.
 */

type Call = { table: string; op: string; args: any };

function fakePrisma({
  existingLabels,
  gradedSubmissions = {},
}: {
  existingLabels: string[];
  /** documentId -> the submission rows that document already has. */
  gradedSubmissions?: Record<string, { id: string; rubricScores: unknown }[]>;
}) {
  const calls: Call[] = [];
  const record = (table: string, op: string) => (args: any) => {
    calls.push({ table, op, args });
    return undefined;
  };

  const groups = existingLabels.map((label, index) => ({
    id: `group-${index}`,
    label,
    documentId: `doc-${index}`,
  }));

  const prisma: any = {
    assignmentType: {
      findFirst: async () => ({ id: 'at-1', title: "GBA 300: Int'l Expansion Plan" }),
    },
    school: { findFirst: async () => ({ id: 'school-1', name: 'Dev School' }) },
    orgMembership: {
      findFirst: async () => ({ id: 'membership-teacher' }),
      create: async (args: any) => {
        record('orgMembership', 'create')(args);
        return { id: `membership-${calls.length}` };
      },
    },
    user: { findUnique: async () => null },
    assignmentModule: { findMany: async () => [] },
    class: {
      findFirst: async () => ({ id: 'class-1' }),
      update: async (args: any) => {
        record('class', 'update')(args);
        return { id: 'class-1' };
      },
      create: async (args: any) => {
        record('class', 'create')(args);
        return { id: 'class-new' };
      },
    },
    classAssignment: {
      findFirst: async () => ({ id: 'ca-1', assignmentId: 'assignment-1' }),
    },
    documentGroup: {
      findMany: async () => groups,
      create: async (args: any) => {
        record('documentGroup', 'create')(args);
        return { id: `group-new-${calls.length}` };
      },
    },
    document: {
      create: async (args: any) => {
        record('document', 'create')(args);
        return { id: `doc-new-${calls.length}` };
      },
    },
    documentCollabUpdate: {
      create: record('documentCollabUpdate', 'create'),
      createMany: record('documentCollabUpdate', 'createMany'),
    },
    documentCollabAuthor: {
      create: record('documentCollabAuthor', 'create'),
      createMany: record('documentCollabAuthor', 'createMany'),
      upsert: record('documentCollabAuthor', 'upsert'),
    },
    documentComment: {
      create: async (args: any) => {
        record('documentComment', 'create')(args);
        return { id: 'comment-1' };
      },
    },
    documentCommentResponse: { create: record('documentCommentResponse', 'create') },
    documentGroupMemberGrade: {
      createMany: record('documentGroupMemberGrade', 'createMany'),
    },
    submission: {
      findMany: async (args: any) => {
        calls.push({ table: 'submission', op: 'findMany', args });
        return gradedSubmissions[args.where.documentId] ?? [];
      },
      create: async (args: any) => {
        record('submission', 'create')(args);
        return { id: 'sub-new' };
      },
      update: async (args: any) => {
        record('submission', 'update')(args);
        return { id: args.where.id };
      },
    },
  };

  return { prisma, calls };
}

const PERSONAS = [
  { key: 'teacher', role: 'TEACHER', email: 'dev.teacher@yawp.local', name: 'Dev Teacher', password: 'x', label: 'Teacher' },
  { key: 'student', role: 'STUDENT', email: 'dev.student@yawp.local', name: 'Sam Student', password: 'x', label: 'Student' },
  { key: 'student-submitted', role: 'STUDENT', email: 'a@yawp.local', name: 'A', password: 'x', label: 'A' },
  { key: 'student-graded', role: 'STUDENT', email: 'b@yawp.local', name: 'B', password: 'x', label: 'B' },
  { key: 'student-unreleased', role: 'STUDENT', email: 'c@yawp.local', name: 'C', password: 'x', label: 'C' },
] as any;

const run = (prisma: any) =>
  seedCollaborationDemoData(prisma, {
    organizationId: 'local-dev-org',
    schoolCode: 'DEV-SCH-1',
    personas: PERSONAS,
  });

const ALL_LABELS = GBA300_GROUP_PLANS.map((plan) => plan.label);

describe('reconciling a demo that is already there', () => {
  test('adds a group the plan has gained since the first seed', async () => {
    // The whole reason this path exists. Group 7 was added to the plan after
    // previews had already seeded Groups 1-6; before this it could only arrive
    // by recreating the database.
    const { prisma, calls } = fakePrisma({
      existingLabels: ALL_LABELS.slice(0, -1),
    });

    const result = await run(prisma);

    const created = calls.filter(
      (call) => call.table === 'documentGroup' && call.op === 'create'
    );
    expect(created).toHaveLength(1);
    expect(created[0]!.args.data.label).toBe(ALL_LABELS[ALL_LABELS.length - 1]);
    expect(result?.groupIds).toHaveLength(ALL_LABELS.length);
  });

  test('leaves every group it already has alone', async () => {
    // A preview is somewhere people click. Rewriting a seeded group would throw
    // away edits, grades and comments made there since.
    const { prisma, calls } = fakePrisma({ existingLabels: ALL_LABELS });

    await run(prisma);

    expect(
      calls.filter((call) => call.table === 'documentGroup' && call.op === 'create')
    ).toHaveLength(0);
    expect(
      calls.filter((call) => call.table === 'document' && call.op === 'create')
    ).toHaveLength(0);
  });

  test('backfills rubric scores onto a brief graded before they existed', async () => {
    const gradedPlanIndex = ALL_LABELS.findIndex(
      (_, index) => GBA300_GROUP_PLANS[index]!.grade
    );
    const { prisma, calls } = fakePrisma({
      existingLabels: ALL_LABELS,
      gradedSubmissions: {
        [`doc-${gradedPlanIndex}`]: [{ id: 'sub-old', rubricScores: null }],
      },
    });

    await run(prisma);

    const updates = calls.filter(
      (call) => call.table === 'submission' && call.op === 'update'
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]!.args.where.id).toBe('sub-old');
    expect(updates[0]!.args.data.rubricScores).toEqual(
      GBA300_GROUP_PLANS[gradedPlanIndex]!.grade!.categoryScores
    );
  });

  test('never overwrites scores a teacher already entered', async () => {
    const gradedPlanIndex = ALL_LABELS.findIndex(
      (_, index) => GBA300_GROUP_PLANS[index]!.grade
    );
    const { prisma, calls } = fakePrisma({
      existingLabels: ALL_LABELS,
      gradedSubmissions: {
        [`doc-${gradedPlanIndex}`]: [
          { id: 'sub-real', rubricScores: { budget: { score: 12 } } },
        ],
      },
    });

    await run(prisma);

    expect(
      calls.filter((call) => call.table === 'submission' && call.op === 'update')
    ).toHaveLength(0);
  });

  test('puts newly added students on the class roster', async () => {
    // A cohort student created after the first seed is on nobody's roster, so
    // nothing they write is visible to the teacher.
    const { prisma, calls } = fakePrisma({ existingLabels: ALL_LABELS });

    await run(prisma);

    const update = calls.find(
      (call) => call.table === 'class' && call.op === 'update'
    );
    expect(update?.args.data.students.connect.length).toBeGreaterThan(0);
  });

  test('does not create the class a second time', async () => {
    const { prisma, calls } = fakePrisma({ existingLabels: ALL_LABELS });

    await run(prisma);

    expect(
      calls.filter((call) => call.table === 'class' && call.op === 'create')
    ).toHaveLength(0);
  });
});
