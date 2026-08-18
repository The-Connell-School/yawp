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
 * Skipped, loudly, when GBA 300 is not in the database. It is the only assignment
 * type with `collaborationSupported`, so without it every road into a room is
 * closed and there is nothing to seed.
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

const GBA300_TITLE = 'GBA 300';
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
    where: { title: GBA300_TITLE, collaborationSupported: true },
    select: { id: true },
  });

  if (!assignmentType) {
    console.warn(
      `⚠️  Skipping the collaboration demo: no "${GBA300_TITLE}" assignment type with collaborationSupported.`
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

  // Idempotent, and this is the check that makes it so. A preview whose database
  // already exists is never reseeded, so the demo has to be able to arrive on a
  // later deploy — which means running again on an organization that may already
  // have it, and doing nothing when it does.
  const alreadySeeded = await prisma.class.findFirst({
    where: { schoolId: school.id, code: GBA300_CLASS_CODE },
    select: { id: true },
  });
  if (alreadySeeded) {
    console.log(
      `Collaboration demo already present in ${options.organizationId}; nothing to do.`
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

  await seedStudentShare(prisma, {
    assignmentTypeId: assignmentType.id,
    modules,
    ownerMembershipId: memberId('student'),
    partnerMembershipId: memberId('student-graded'),
  });

  return {
    classId: gbaClass.id,
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
  // Single-valued by database necessity, so it names the first member. Everyone
  // else reaches the draft through their group membership, which is the whole
  // reason `documentAuthorWhere` exists.
  const ownerMembershipId = memberId(plan.members[0]!);

  const document = await prisma.document.create({
    data: {
      title: 'International expansion brief',
      html: room.html,
      text: room.text,
      revision: room.updates.length,
      membershipId: ownerMembershipId,
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

  const group = await prisma.documentGroup.create({
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
            releasedAt: daysAgo(1),
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
        releasedAt: daysAgo(1),
      };
    }),
  });

  return group.id;
}

/**
 * The other road into a room: a student sharing their own draft, with no
 * assignment behind it at all.
 *
 * Worth seeding separately because it is the case with no class assignment, no
 * teacher-arranged group and no ordinal to speak of — the shape most likely to
 * break a query written with only teacher-arranged group work in mind.
 */
async function seedStudentShare(
  prisma: SeedClient,
  {
    assignmentTypeId,
    modules,
    ownerMembershipId,
    partnerMembershipId,
  }: {
    assignmentTypeId: string;
    modules: { id: string; instructions: { id: string; prompt: string }[] }[];
    ownerMembershipId: string;
    partnerMembershipId: string;
  }
) {
  const room = buildCollabRoom([
    {
      author: 'owner',
      paragraphs: [
        'Shared draft: we are writing the reflection together because we did the fieldwork together.',
        'The interview notes are in the appendix, and the quotations below are all from the second visit.',
      ],
    },
    {
      author: 'partner',
      paragraphs: [
        'Adding my half: the second interview contradicted the first on the question of who actually decides, and I think that is the finding.',
      ],
    },
  ]);

  const membershipFor = (author: string) =>
    author === 'owner' ? ownerMembershipId : partnerMembershipId;

  const document = await prisma.document.create({
    data: {
      title: 'Fieldwork reflection',
      html: room.html,
      text: room.text,
      revision: room.updates.length,
      membershipId: ownerMembershipId,
      assignmentTypeId,
      assignmentModuleSessions: {
        create: [ownerMembershipId, partnerMembershipId].flatMap(
          (membershipId) => moduleSessionRows(modules, membershipId)
        ),
      },
    },
  });

  await prisma.documentGroup.create({
    data: {
      kind: 'student-share',
      // No class assignment: this draft belongs to no assignment at all. The
      // unique index on (classAssignmentId, ordinal) tolerates it because
      // Postgres treats NULLs as distinct.
      classAssignmentId: null,
      label: 'Shared draft',
      ordinal: 0,
      openedAt: daysAgo(4),
      seededAt: daysAgo(4),
      documentId: document.id,
      members: {
        create: [
          { membershipId: ownerMembershipId },
          { membershipId: partnerMembershipId },
        ],
      },
    },
  });

  for (const row of room.updates) {
    await prisma.documentCollabUpdate.create({
      data: {
        documentId: document.id,
        update: Buffer.from(row.update),
        membershipId: membershipFor(row.author),
      },
    });
  }

  await prisma.documentCollabAuthor.createMany({
    data: room.authors.map((author) => ({
      documentId: document.id,
      clientId: author.clientId,
      membershipId: membershipFor(author.author),
      firstSeenAt: daysAgo(4),
      lastSeenAt: daysAgo(2),
      updateCount: author.updateCount,
      charsInserted: author.charsInserted,
      charsDeleted: author.charsDeleted,
    })),
  });
}
