/* eslint-disable no-console */
import type { Prisma, PrismaClient } from '../../generated/prisma';
import { createPassword } from '../utils';
import { getClassArtByIndex } from '../../../../services/web-app/app/utils/class-art.ts';
import type { LocalDevPersona } from './dev-personas';
import {
  buildCollabRoom,
  cohortEmail,
  GBA300_COHORT,
  GBA300_GROUP_PLANS,
  type DemoGroupPlan,
} from './collab-demo-plan';

/**
 * The GBA 300 collaborative demo: a class of twelve, four groups, and one of each
 * thing a teacher would want to look at.
 *
 * The point is to make the group surfaces assessable without anyone having to
 * arrange groups, write four drafts in four browsers and grade them by hand. So
 * the data is not uniform: one group is mid-draft with a visibly uneven split and
 * a teacher asking about it, one is graded with a single student's grade pulled
 * off the group's, one is waiting to be graded, and one has barely started.
 *
 * It runs after the synthetic seed and adds to it — the four existing student
 * personas are spread across the groups so the demo is reachable by logging in as
 * someone already in the picker.
 *
 * Skipped, loudly, when the GBA 300 fixture is not in the database.
 */

type SeedClient = PrismaClient | Prisma.TransactionClient;

export type CollaborationSeedOptions = {
  organizationId: string;
  /** The school the class belongs to, by code — the seat's first one. */
  schoolCode: string;
  /**
   * The personas this organization was seeded with. Everything else is resolved
   * from them by email, so this works the same on an organization seeded minutes
   * ago and on one that has been up for a week — which is what lets a preview
   * that already has a database gain the demo without being wiped.
   */
  personas: LocalDevPersona[];
  /**
   * Qualifier for the cohort's email addresses, so a second preview seat can
   * seed the same cohort without colliding on the unique email index. Empty for
   * the first seat and for a plain local run.
   */
  emailSuffix?: string;
};

export type CollaborationSeedResult = {
  classId: string;
  classAssignmentId: string;
  groupIds: string[];
  cohort: { name: string; email: string }[];
} | null;

/** Stable id from the prod-fidelity fixture; its title has changed before. */
const GBA300_ASSIGNMENT_TYPE_ID = 'cmnt1bliz0l610qk0r09ug5u6';
const GBA300_TITLE = "GBA 300: Int'l Expansion Plan";
/** Also the marker that says this organization already has the demo. */
const GBA300_CLASS_CODE = 'DEV-CLASS-GBA300';

/** Mirrors `createDocumentForAssignmentType`: every module needs a session. */
function moduleSessionRows(
  modules: {
    id: string;
    instructions: { id: string; prompt: string }[];
  }[],
  membershipId: string
) {
  return modules.map((assignmentModule) => {
    const firstInstruction = assignmentModule.instructions[0];
    return {
      instructionsCompleted: 0,
      assignmentModuleId: assignmentModule.id,
      // Whose conversation this is. Null would mean "the document's owner",
      // which on a shared draft names one member and silently hides the tutor
      // from everyone else in the group.
      membershipId,
      ...(firstInstruction
        ? {
            messages: {
              create: [
                {
                  content: firstInstruction.prompt,
                  agent: 'assistant',
                  instructionId: firstInstruction.id,
                },
              ],
            },
          }
        : {}),
    };
  });
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function seedCollaborationDemoData(
  prisma: SeedClient,
  options: CollaborationSeedOptions
): Promise<CollaborationSeedResult> {
  const assignmentType = await prisma.assignmentType.findFirst({
    where: { id: GBA300_ASSIGNMENT_TYPE_ID, archivedAt: null },
    select: { id: true, title: true },
  });

  if (!assignmentType) {
    console.warn(
      `⚠️  Skipping the collaboration demo: ${GBA300_TITLE} (${GBA300_ASSIGNMENT_TYPE_ID}) is missing.`
    );
    return null;
  }

  const school = await prisma.school.findFirst({
    where: { organizationId: options.organizationId, code: options.schoolCode },
    select: { id: true, name: true },
  });

  if (!school) {
    console.warn(
      `⚠️  Skipping the collaboration demo: no school ${options.schoolCode} in ${options.organizationId}.`
    );
    return null;
  }

  // Everything else comes from the personas, by email. Resolving rather than
  // being handed ids is what lets this run against an organization it did not
  // just create.
  const personaMemberships = new Map<string, string>();
  for (const persona of options.personas) {
    const membership = await prisma.orgMembership.findFirst({
      where: {
        organizationId: options.organizationId,
        user: { is: { email: persona.email } },
      },
      select: { id: true },
    });
    if (membership) personaMemberships.set(persona.key, membership.id);
  }

  const teacherMembershipIds = options.personas
    .filter((persona) => persona.role === 'TEACHER')
    .map((persona) => personaMemberships.get(persona.key))
    .filter((id): id is string => Boolean(id));

  const primaryTeacherPersona =
    options.personas.find((persona) => persona.key === 'teacher') ??
    options.personas.find((persona) => persona.role === 'TEACHER');
  const primaryTeacherMembershipId = primaryTeacherPersona
    ? personaMemberships.get(primaryTeacherPersona.key)
    : undefined;

  if (!primaryTeacherMembershipId || teacherMembershipIds.length === 0) {
    console.warn(
      `⚠️  Skipping the collaboration demo: no teacher persona in ${options.organizationId}.`
    );
    return null;
  }

  const schoolName = school.name;
  const primaryTeacherName = primaryTeacherPersona?.name ?? '';
  const password = primaryTeacherPersona?.password ?? '';

  const modules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId: assignmentType.id, deletedAt: null },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      instructions: {
        orderBy: { position: 'asc' },
        select: { id: true, prompt: true },
      },
    },
  });

  // Author key -> membership id: the student personas the synthetic seed already
  // made, then the cohort as they are created.
  const membershipByKey = new Map<string, string>(
    options.personas
      .filter((persona) => persona.role === 'STUDENT')
      .flatMap((persona) => {
        const id = personaMemberships.get(persona.key);
        return id ? [[persona.key, id] as [string, string]] : [];
      })
  );

  const cohort: { name: string; email: string }[] = [];
  for (const student of GBA300_COHORT) {
    const email = cohortEmail(student.key, options.emailSuffix ?? '');
    // Adopted rather than created outright when the address is already taken.
    // The class above is the guard that stops this running twice, but a seed
    // that died part-way through leaves users behind it, and `User.email` is
    // unique across the whole database — so creating blind would turn one
    // interrupted run into a permanently failing deploy.
    const existing = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        memberships: {
          where: { organizationId: options.organizationId },
          select: { id: true },
          take: 1,
        },
      },
    });

    let membershipId = existing?.memberships[0]?.id;
    if (!membershipId) {
      const roster = {
        organization: { connect: { id: options.organizationId } },
        role: 'STUDENT' as const,
        school: schoolName,
        grade: '11',
        period: '2',
        schoolTeacher: primaryTeacherName,
      };
      const membership = await prisma.orgMembership.create({
        data: existing
          ? { ...roster, user: { connect: { id: existing.id } } }
          : {
              ...roster,
              user: {
                create: {
                  email,
                  name: student.name,
                  password: { create: createPassword(password) },
                },
              },
            },
        select: { id: true },
      });
      membershipId = membership.id;
    }

    membershipByKey.set(student.key, membershipId);
    cohort.push({ name: student.name, email });
  }

  const memberId = (key: string) => {
    const id = membershipByKey.get(key);
    if (!id) throw new Error(`No membership seeded for author key "${key}"`);
    return id;
  };

  // Idempotent, and this is the check that makes it so. A preview's database
  // outlives its deploys, so this runs again on an organization that may already
  // have the demo. It used to stop here — which meant every later addition to
  // the demo was invisible until somebody recreated the database by hand, and
  // recreating a preview database is not a thing a reviewer should have to do to
  // see the work. It reconciles instead.
  const existingClass = await prisma.class.findFirst({
    where: { schoolId: school.id, code: GBA300_CLASS_CODE },
    select: { id: true },
  });
  if (existingClass) {
    return upgradeCollaborationDemo(prisma, {
      organizationId: options.organizationId,
      classId: existingClass.id,
      assignmentTypeId: assignmentType.id,
      studentMembershipIds: [...membershipByKey.values()],
      modules,
      memberId,
      primaryTeacherMembershipId,
      cohort,
    });
  }

  const gbaClass = await prisma.class.create({
    data: {
      code: GBA300_CLASS_CODE,
      schoolYear: '2025-2026',
      period: '2',
      grade: '11',
      title: 'GBA 300 - Period 2',
      classArtKey: getClassArtByIndex(7).key,
      schoolId: school.id,
      teachers: {
        connect: teacherMembershipIds.map((id) => ({ id })),
      },
      students: {
        connect: [...membershipByKey.values()].map((id) => ({ id })),
      },
    },
  });

  const assignment = await prisma.assignment.create({
    data: {
      assignmentTypeId: assignmentType.id,
      title: 'International expansion brief',
      prompt:
        'In your group, choose a domestic company and build the case for one international market: who the customer is there, how you would reach them, what it costs, and what you recommend. One brief per group.',
      submitForGrade: true,
      pointValue: 100,
      collaborationEnabled: true,
      collaborationGroupMode: 'teacher',
      collaborationGroupSize: 3,
    },
  });

  const classAssignment = await prisma.classAssignment.create({
    data: { assignmentId: assignment.id, classId: gbaClass.id },
  });

  const groupIds: string[] = [];
  for (const plan of GBA300_GROUP_PLANS) {
    groupIds.push(
      await seedGroup(prisma, {
        plan,
        assignmentTypeId: assignmentType.id,
        assignmentId: assignment.id,
        classAssignmentId: classAssignment.id,
        modules,
        memberId,
        primaryTeacherMembershipId,
      })
    );
  }

  return {
    classId: gbaClass.id,
    classAssignmentId: classAssignment.id,
    groupIds,
    cohort,
  };
}

/**
 * Bring an existing demo up to the current plan, without disturbing what is
 * already there.
 *
 * Strictly additive, because a preview is somewhere people click: a group that
 * exists may have been edited, graded or commented on since it was seeded, and
 * a "refresh" that rewrote it would throw that away. So this adds the groups the
 * plan has gained and fills in the columns that were left empty when a group was
 * first written, and touches nothing else.
 */
async function upgradeCollaborationDemo(
  prisma: SeedClient,
  {
    organizationId,
    classId,
    assignmentTypeId,
    studentMembershipIds,
    modules,
    memberId,
    primaryTeacherMembershipId,
    cohort,
  }: {
    organizationId: string;
    classId: string;
    assignmentTypeId: string;
    studentMembershipIds: string[];
    modules: { id: string; instructions: { id: string; prompt: string }[] }[];
    memberId: (key: string) => string;
    primaryTeacherMembershipId: string;
    cohort: { name: string; email: string }[];
  }
): Promise<CollaborationSeedResult> {
  const classAssignment = await prisma.classAssignment.findFirst({
    where: {
      classId,
      assignment: { is: { assignmentTypeId, collaborationEnabled: true } },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, assignmentId: true },
  });

  if (!classAssignment) {
    console.warn(
      `⚠️  Collaboration demo class exists in ${organizationId} but its assignment does not; leaving it alone.`
    );
    return null;
  }

  // A cohort student added since the first seed is on nobody's roster, so
  // nothing they write is visible to the teacher. Connect is idempotent.
  await prisma.class.update({
    where: { id: classId },
    data: {
      students: { connect: studentMembershipIds.map((id) => ({ id })) },
    },
  });

  const existingGroups = await prisma.documentGroup.findMany({
    where: { classAssignmentId: classAssignment.id },
    select: { id: true, label: true, documentId: true },
  });
  const existingByLabel = new Map(
    existingGroups.map((group) => [group.label, group])
  );

  const groupIds = existingGroups.map((group) => group.id);
  let addedGroups = 0;
  for (const plan of GBA300_GROUP_PLANS) {
    if (existingByLabel.has(plan.label)) continue;
    groupIds.push(
      await seedGroup(prisma, {
        plan,
        assignmentTypeId,
        assignmentId: classAssignment.assignmentId,
        classAssignmentId: classAssignment.id,
        modules,
        memberId,
        primaryTeacherMembershipId,
      })
    );
    addedGroups += 1;
  }

  // Per-category scores landed after the first briefs were seeded. Without them
  // a graded brief is graded to the needs-grading queue and invisible to every
  // class-level view, so backfilling is the difference between those pages
  // having data and looking broken. Only ever filled in when empty: a score a
  // teacher entered in the preview is theirs, not the seed's.
  let backfilledGrades = 0;
  for (const plan of GBA300_GROUP_PLANS) {
    const group = plan.grade ? existingByLabel.get(plan.label) : undefined;
    if (!group?.documentId) continue;

    const submissions = await prisma.submission.findMany({
      where: {
        documentId: group.documentId,
        unsubmittedAt: null,
        gradedAt: { not: null },
      },
      select: { id: true, rubricScores: true },
    });

    for (const submission of submissions) {
      if (submission.rubricScores) continue;
      await prisma.submission.update({
        where: { id: submission.id },
        data: { rubricScores: plan.grade!.categoryScores },
      });
      backfilledGrades += 1;
    }
  }

  console.log(
    `Collaboration demo already present in ${organizationId}; added ${addedGroups} group(s), backfilled ${backfilledGrades} rubric score set(s).`
  );

  return {
    classId,
    classAssignmentId: classAssignment.id,
    groupIds,
    cohort,
  };
}

async function seedGroup(
  prisma: SeedClient,
  {
    plan,
    assignmentTypeId,
    assignmentId,
    classAssignmentId,
    modules,
    memberId,
    primaryTeacherMembershipId,
  }: {
    plan: DemoGroupPlan;
    assignmentTypeId: string;
    assignmentId: string;
    classAssignmentId: string;
    modules: { id: string; instructions: { id: string; prompt: string }[] }[];
    memberId: (key: string) => string;
    primaryTeacherMembershipId: string;
  }
): Promise<string> {
  const room = buildCollabRoom(plan.contributions);
  const createOwnedArtifact = async (tx: SeedClient) => {
    const document = await tx.document.create({
      data: {
        title: 'International expansion brief',
        html: room.html,
        text: room.text,
        revision: room.updates.length,
        artifactKind: 'ASSIGNMENT_GROUP',
        membershipId: null,
        assignmentTypeId,
        assignmentId,
        classAssignmentId,
        assignmentModuleSessions: {
          create: plan.members.flatMap((key) =>
            moduleSessionRows(modules, memberId(key))
          ),
        },
      },
    });

    const group = await tx.documentGroup.create({
      data: {
        kind: 'assignment',
        classAssignmentId,
        label: plan.label,
        ordinal: plan.ordinal,
        openedAt: daysAgo(6),
        // The room below is written here rather than by the app, so it is already
        // seeded. Leaving this null would invite a second seed from the same HTML
        // and duplicate every paragraph.
        seededAt: daysAgo(6),
        documentId: document.id,
        members: {
          create: [
            ...plan.members.map((key) => ({ membershipId: memberId(key) })),
            // Wrote in the draft, then left the group. `removedAt` is what keeps
            // them off the roster the contribution table and grade cards read,
            // while their surviving text still shows up in the draft itself.
            ...(plan.removedMember
              ? [
                  {
                    membershipId: memberId(plan.removedMember),
                    removedAt: daysAgo(4),
                  },
                ]
              : []),
          ],
        },
      },
    });
    return { document, group };
  };

  const { document, group } =
    '$transaction' in prisma
      ? await prisma.$transaction((tx) => createOwnedArtifact(tx))
      : await createOwnedArtifact(prisma);

  // One row at a time: `seq` is the log's order and an autoincrement column
  // makes no promise about the order of a batch insert.
  for (const row of room.updates) {
    await prisma.documentCollabUpdate.create({
      data: {
        documentId: document.id,
        update: Buffer.from(row.update),
        membershipId: memberId(row.author),
      },
    });
  }

  // What survives compaction, and what the contribution breakdown reads.
  await prisma.documentCollabAuthor.createMany({
    data: room.authors.map((author, index) => ({
      documentId: document.id,
      clientId: author.clientId,
      membershipId: memberId(author.author),
      firstSeenAt: daysAgo(5 - index * 0.5),
      lastSeenAt: daysAgo(1),
      updateCount: author.updateCount,
      charsInserted: author.charsInserted,
      charsDeleted: author.charsDeleted,
    })),
  });

  if (plan.comment) {
    const comment = await prisma.documentComment.create({
      data: {
        documentId: document.id,
        membershipId: primaryTeacherMembershipId,
        content: plan.comment.teacher,
        // No mark to anchor to: the collaborative schema carries no comment mark.
        highlightId: null,
        createdAt: daysAgo(2),
      },
    });
    if (plan.comment.reply) {
      await prisma.documentCommentResponse.create({
        data: {
          commentId: comment.id,
          membershipId: memberId(plan.comment.reply.author),
          content: plan.comment.reply.content,
          createdAt: daysAgo(1),
        },
      });
    }
  }

  if (plan.stage === 'drafting') return group.id;

  // A submission the teacher sent back, kept beside the current one. Every
  // query for "the group's work" filters on `unsubmittedAt` being null, so the
  // filter is only worth anything if a withdrawn row actually exists.
  if (plan.priorSubmission) {
    await prisma.submission.create({
      data: {
        documentId: document.id,
        html: room.html,
        text: room.text,
        title: 'International expansion brief',
        submittedAt: daysAgo(plan.priorSubmission.withdrawnAfterDays + 2),
        unsubmittedAt: daysAgo(plan.priorSubmission.withdrawnAfterDays),
      },
    });
  }

  const released = plan.stage === 'graded';

  await prisma.submission.create({
    data: {
      documentId: document.id,
      html: room.html,
      text: room.text,
      title: 'International expansion brief',
      submittedAt: daysAgo(3),
      ...(plan.grade
        ? {
            // `score` and `feedback` are the group grade proper: free text on
            // the submission, which is what every member inherits unless the
            // teacher overrode them. The numeric and letter columns beside them
            // are the same judgement in the shape the solo surfaces read.
            score: plan.grade.score,
            feedback: plan.grade.overallComment,
            gradedByMembershipId: primaryTeacherMembershipId,
            gradedAt: daysAgo(1),
            numericPercentage: plan.grade.numericPercentage,
            letterGrade: plan.grade.letterGrade,
            overallComment: plan.grade.overallComment,
            // Every class-level view — the performance summary, the
            // differentiation groupings, the per-category examples — reads
            // this column and nothing else. A submission with a grade but no
            // rubric scores is graded to the queue and invisible to all of them.
            rubricScores: plan.grade.categoryScores,
            releasedAt: released ? daysAgo(1) : null,
          }
        : {}),
    },
  });

  if (!plan.grade) return group.id;

  // Individual grades are stored as "follows the group" rather than as a copy of
  // it, so re-grading the group reaches everyone who has not been overridden.
  await prisma.documentGroupMemberGrade.createMany({
    data: plan.members.map((key) => {
      const override =
        plan.grade!.override?.author === key ? plan.grade!.override : null;
      return {
        groupId: group.id,
        membershipId: memberId(key),
        followsGroupGrade: !override,
        score: override?.score ?? null,
        feedback: override?.feedback ?? null,
        gradedByMembershipId: primaryTeacherMembershipId,
        // Held back with the group grade: a member grade released while the
        // group's own is not would show a student a mark for work the teacher
        // has not finished judging.
        releasedAt: released ? daysAgo(1) : null,
      };
    }),
  });

  return group.id;
}
