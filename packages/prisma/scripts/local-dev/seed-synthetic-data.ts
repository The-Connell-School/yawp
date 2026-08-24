/* eslint-disable no-console */
import type { Prisma, PrismaClient } from '../../generated/prisma';
import { createPassword } from '../utils';
import { getClassArtByIndex } from '../../../../services/web-app/app/utils/class-art.ts';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_PERSONAS,
  type LocalDevPersona,
} from './dev-personas';
import {
  GRADED_ESSAY_FIXTURES,
  buildEarlyDraftHtml,
  buildEssayHtml,
  buildGrammarIssuesPayload,
  buildRevisionDraftComments,
  essayText,
} from './revision-fixture';

type PersonaRecord = {
  persona: LocalDevPersona;
  userId: string;
  membershipId: string;
};

type SyntheticSeedClient = PrismaClient | Prisma.TransactionClient;

type SyntheticSeedOptions = {
  organizationId?: string;
  personas?: LocalDevPersona[];
  schoolCodes?: [string, string, string];
  assignmentTypeIds?: string[];
  teacherTrainingIds?: string[];
};

export type LocalDevSeedContext = {
  organizationId: string;
  schoolIds: string[];
  primaryClassId: string;
  secondaryClassId: string;
  thesisAssignmentTypeId: string;
  dailyPagesAssignmentTypeId: string | null;
  actWritingAssignmentTypeId: string | null;
  personas: Record<LocalDevPersona['key'], PersonaRecord>;
};

async function upsertPersona(
  prisma: SyntheticSeedClient,
  persona: LocalDevPersona,
  organizationId: string
): Promise<PersonaRecord> {
  const user = await prisma.user.create({
    data: {
      email: persona.email,
      name: persona.name,
      isAdmin: persona.isAdmin ?? false,
      password: { create: createPassword(persona.password) },
      memberships: {
        create: {
          organizationId,
          isOrgOwner: persona.isOrgOwner ?? false,
          role: persona.role,
        },
      },
    },
    include: { memberships: true },
  });

  const membership = user.memberships[0];
  if (!membership) {
    throw new Error(`Membership not created for ${persona.email}`);
  }

  return {
    persona,
    userId: user.id,
    membershipId: membership.id,
  };
}

function pickAssignmentTypeId(
  rows: Array<{ id: string; title: string; kind: string | null; systemKey: string | null }>,
  matcher: (row: (typeof rows)[number]) => boolean
) {
  return rows.find(matcher)?.id ?? null;
}

export async function seedSyntheticLocalDevData(
  prisma: SyntheticSeedClient,
  options: SyntheticSeedOptions = {},
): Promise<LocalDevSeedContext> {
  const organizationId = options.organizationId ?? LOCAL_DEV_ORG_ID;
  const personas = options.personas ?? LOCAL_DEV_PERSONAS;
  const schoolCodes = options.schoolCodes ?? [
    'DEV-SCH-1',
    'DEV-SCH-2',
    'DEV-SCH-3',
  ];
  const personaRecords = Object.fromEntries(
    (
      await Promise.all(
        personas.map((persona) =>
          upsertPersona(prisma, persona, organizationId)
        )
      )
    ).map((record) => [record.persona.key, record])
  ) as Record<LocalDevPersona['key'], PersonaRecord>;

  const primaryTeacher = personaRecords.teacher;
  const multiTeacher = personaRecords['teacher-multi'];
  const ownerTeacher = personaRecords.owner;
  const adminTeacher = personaRecords.admin;

  const teacherMembershipIds = [
    primaryTeacher.membershipId,
    ownerTeacher.membershipId,
    adminTeacher.membershipId,
    multiTeacher.membershipId,
  ];

  const schools = await Promise.all(
    ['North Ridge High', 'Riverview Academy', 'Summit Prep'].map(async (name, index) =>
      prisma.school.create({
        data: {
          name,
          code: schoolCodes[index]!,
          organizationId,
        },
      })
    )
  );

  for (const school of schools) {
    for (const teacherMembershipId of teacherMembershipIds) {
      await prisma.$executeRaw`
        INSERT INTO "_SchoolTeachers" ("A", "B")
        VALUES (${teacherMembershipId}, ${school.id})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  const studentMembershipIds = [
    personaRecords.student.membershipId,
    personaRecords['student-submitted'].membershipId,
    personaRecords['student-graded'].membershipId,
    personaRecords['student-unreleased'].membershipId,
  ];

  const primaryClass = await prisma.class.create({
    data: {
      code: 'DEV-CLASS-101',
      schoolYear: '2025-2026',
      period: '3',
      grade: '10',
      title: 'English 10 - Period 3',
      classArtKey: getClassArtByIndex(2).key,
      schoolId: schools[0].id,
      teachers: {
        connect: [
          { id: primaryTeacher.membershipId },
          { id: ownerTeacher.membershipId },
          { id: adminTeacher.membershipId },
          { id: multiTeacher.membershipId },
        ],
      },
      students: {
        connect: studentMembershipIds.map((id) => ({ id })),
      },
    },
  });

  const secondaryClass = await prisma.class.create({
    data: {
      code: 'DEV-CLASS-202',
      schoolYear: '2025-2026',
      period: '5',
      grade: '11',
      title: 'English 11 - Period 5',
      classArtKey: getClassArtByIndex(5).key,
      schoolId: schools[1].id,
      teachers: {
        connect: [
          { id: primaryTeacher.membershipId },
          { id: ownerTeacher.membershipId },
          { id: adminTeacher.membershipId },
          { id: multiTeacher.membershipId },
        ],
      },
      students: {
        connect: [{ id: personaRecords.student.membershipId }],
      },
    },
  });

  for (const [studentKey, classId, schoolName, grade, period] of [
    ['student', primaryClass.id, schools[0].name, '10', '3'],
    ['student-submitted', primaryClass.id, schools[0].name, '10', '3'],
    ['student-graded', primaryClass.id, schools[0].name, '10', '3'],
    ['student-unreleased', primaryClass.id, schools[0].name, '10', '3'],
    ['student', secondaryClass.id, schools[1].name, '11', '5'],
  ] as const) {
    const record = personaRecords[studentKey];
    await prisma.orgMembership.update({
      where: { id: record.membershipId },
      data: {
        school: schoolName,
        grade,
        period,
        schoolTeacher: primaryTeacher.persona.name,
      },
    });
  }

  const assignmentTypes = await prisma.assignmentType.findMany({
    where: options.assignmentTypeIds
      ? { id: { in: options.assignmentTypeIds } }
      : undefined,
    select: { id: true, title: true, kind: true, systemKey: true },
    orderBy: { position: 'asc' },
  });

  const thesisAssignmentTypeId =
    pickAssignmentTypeId(
      assignmentTypes,
      (row) => row.title === 'The Thesis-Driven Essay'
    ) ?? assignmentTypes[0]?.id;

  if (!thesisAssignmentTypeId) {
    throw new Error('Expected at least one imported assignment type.');
  }

  const dailyPagesAssignmentTypeId = pickAssignmentTypeId(
    assignmentTypes,
    (row) => row.kind === 'daily_pages' || row.title === 'Daily Pages'
  );
  const actWritingAssignmentTypeId = pickAssignmentTypeId(
    assignmentTypes,
    (row) => row.title === 'ACT Writing Section'
  );

  const thesisModules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId: thesisAssignmentTypeId, deletedAt: null },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      instructions: {
        orderBy: { position: 'asc' },
        select: { id: true, prompt: true },
      },
    },
  });

  // Mirrors createDocumentForAssignmentType (services/web-app/app/domain/documents.server.ts):
  // every document needs one AssignmentModuleSession per module in its
  // AssignmentType, or opening it hits "No assignment module session found."
  // Kept in sync by hand because this script runs outside the web-app's `~/`
  // alias resolution and can't import that helper directly.
  function buildModuleSessionsCreateData(
    modules: typeof thesisModules,
    options: {
      /**
       * A worked pre-writing conversation to append to the first module's
       * session, after its opening instruction. Without one, every seeded
       * document's tutor column shows a single canned prompt and nothing else.
       */
      firstModuleExchange?: Array<{ agent: 'user' | 'assistant'; content: string }>;
    } = {}
  ) {
    return modules.map((assignmentModule, moduleIndex) => {
      const firstInstruction = assignmentModule.instructions[0];
      const exchange =
        moduleIndex === 0 ? (options.firstModuleExchange ?? []) : [];
      return {
        instructionsCompleted: exchange.length > 0 ? 1 : 0,
        assignmentModuleId: assignmentModule.id,
        ...(firstInstruction
          ? {
              messages: {
                create: [
                  {
                    content: firstInstruction.prompt,
                    agent: 'assistant',
                    instructionId: firstInstruction.id,
                  },
                  ...exchange.map((message) => ({
                    content: message.content,
                    agent: message.agent,
                    instructionId: firstInstruction.id,
                  })),
                ],
              },
            }
          : {}),
      };
    });
  }

  const thesisAssignment = await prisma.assignment.create({
    data: {
      assignmentTypeId: thesisAssignmentTypeId,
      title: 'Thesis essay: civic responsibility',
      prompt:
        'Write a thesis-driven essay about how schools can prepare students for civic responsibility.',
      submitForGrade: true,
      pointValue: 100,
    },
  });
  const thesisClassAssignment = await prisma.classAssignment.create({
    data: {
      assignmentId: thesisAssignment.id,
      classId: primaryClass.id,
    },
  });

  if (dailyPagesAssignmentTypeId) {
    const dailyAssignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: dailyPagesAssignmentTypeId,
        title: 'Daily Pages - week 2',
        prompt: 'Write freely for ten minutes about something that surprised you this week.',
      },
    });
    await prisma.classAssignment.create({
      data: {
        assignmentId: dailyAssignment.id,
        classId: primaryClass.id,
      },
    });
  }

  const teacherTrainings = await prisma.teacherTraining.findMany({
    where: options.teacherTrainingIds
      ? { id: { in: options.teacherTrainingIds } }
      : undefined,
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  for (const [index, teacherMembershipId] of teacherMembershipIds.entries()) {
    const training = teacherTrainings[index % teacherTrainings.length];
    if (!training) break;
    await prisma.$executeRaw`
      INSERT INTO "_TeacherTrainingAssignments" ("A", "B")
      VALUES (${teacherMembershipId}, ${training.id})
      ON CONFLICT DO NOTHING
    `;
  }

  const studentDraft = personaRecords.student;
  const studentSubmitted = personaRecords['student-submitted'];
  const studentGraded = personaRecords['student-graded'];
  const studentUnreleased = personaRecords['student-unreleased'];

  await prisma.document.create({
    data: {
      title: 'Untitled draft',
      text: '',
      html: '<p></p>',
      membershipId: studentDraft.membershipId,
      assignmentTypeId: thesisAssignmentTypeId,
      assignmentId: thesisAssignment.id,
      classAssignmentId: thesisClassAssignment.id,
      assignmentModuleSessions: {
        create: buildModuleSessionsCreateData(thesisModules),
      },
    },
  });

  const editedText =
    'This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread.';
  const editedHtml = `<p>${editedText}</p>`;
  const editedDocument = await prisma.document.create({
    data: {
      title: 'Practice essay draft',
      text: editedText,
      html: editedHtml,
      revision: 2,
      membershipId: studentDraft.membershipId,
      assignmentTypeId: thesisAssignmentTypeId,
      assignmentId: thesisAssignment.id,
      classAssignmentId: thesisClassAssignment.id,
      assignmentModuleSessions: thesisModules[0]
        ? {
            create: [
              {
                assignmentModuleId: thesisModules[0].id,
                title: 'Practice essay draft session',
                instructionsCompleted: 1,
              },
              ...buildModuleSessionsCreateData(thesisModules.slice(1)),
            ],
          }
        : { create: buildModuleSessionsCreateData(thesisModules) },
    },
  });
  await prisma.documentRevision.createMany({
    data: [
      {
        documentId: editedDocument.id,
        text: '',
        html: '<p></p>',
        trigger: 'session-start',
      },
      {
        documentId: editedDocument.id,
        text: editedText,
        html: editedHtml,
        trigger: 'auto',
      },
    ],
  });

  const submittedText =
    'The importance of reading cannot be overstated. Reading expands vocabulary and improves comprehension.';
  const submittedHtml = `<p>${submittedText}</p>`;
  const submittedDocument = await prisma.document.create({
    data: {
      title: 'Submitted civic essay',
      text: submittedText,
      html: submittedHtml,
      revision: 3,
      membershipId: studentSubmitted.membershipId,
      assignmentTypeId: thesisAssignmentTypeId,
      assignmentId: thesisAssignment.id,
      classAssignmentId: thesisClassAssignment.id,
      assignmentModuleSessions: {
        create: buildModuleSessionsCreateData(thesisModules),
      },
    },
  });
  await prisma.submission.create({
    data: {
      documentId: submittedDocument.id,
      html: submittedHtml,
      text: submittedText,
      title: 'Submitted civic essay',
      submittedAt: new Date(),
    },
  });

  // Full-length graded essays. One is not enough: the split screen only shows
  // its problems across a range of feedback loads, so the fixtures run from a
  // heavily annotated low-scoring paper to a near-clean high-scoring one.
  // See ./revision-fixture.ts.
  for (const fixture of GRADED_ESSAY_FIXTURES) {
    const fixtureText = essayText(fixture);
    // Ids are scoped to this organization: the preview-seat script runs this
    // seed once per seat into one shared database, and DocumentComment.id is
    // global.
    const draftComments = buildRevisionDraftComments(fixture, organizationId);
    const fixtureHtml = buildEssayHtml(fixture, draftComments);
    const submittedAt = new Date(
      Date.now() - 1000 * 60 * 60 * 24 * fixture.submittedDaysAgo
    );

    const gradedDocument = await prisma.document.create({
      data: {
        title: fixture.title,
        text: fixtureText,
        html: fixtureHtml,
        revision: 12,
        membershipId: studentGraded.membershipId,
        assignmentTypeId: thesisAssignmentTypeId,
        assignmentId: thesisAssignment.id,
        classAssignmentId: thesisClassAssignment.id,
        assignmentModuleSessions: {
          create: buildModuleSessionsCreateData(thesisModules, {
            firstModuleExchange: fixture.tutorExchange,
          }),
        },
      },
    });

    const earlyDraftHtml = buildEarlyDraftHtml(fixture);
    await prisma.documentRevision.createMany({
      data: [
        ...(earlyDraftHtml && fixture.earlyDraftText
          ? [
              {
                documentId: gradedDocument.id,
                text: fixture.earlyDraftText,
                html: earlyDraftHtml,
                trigger: 'auto',
              },
            ]
          : []),
        {
          documentId: gradedDocument.id,
          text: fixtureText,
          html: fixtureHtml,
          trigger: 'submit',
        },
      ],
    });

    for (const draftComment of draftComments) {
      await prisma.documentComment.create({
        data: {
          id: draftComment.id,
          documentId: gradedDocument.id,
          membershipId: primaryTeacher.membershipId,
          content: draftComment.content,
          highlightId: draftComment.id,
          responses: draftComment.responses
            ? {
                create: draftComment.responses.map((content) => ({
                  content,
                  membershipId: studentGraded.membershipId,
                })),
              }
            : undefined,
        },
      });
    }

    const gradedSubmission = await prisma.submission.create({
      data: {
        documentId: gradedDocument.id,
        html: fixtureHtml,
        text: fixtureText,
        title: fixture.title,
        submittedAt,
        gradedByMembershipId: primaryTeacher.membershipId,
        gradedAt: new Date(submittedAt.getTime() + 1000 * 60 * 60 * 24),
        numericPercentage: fixture.numericPercentage,
        letterGrade: fixture.letterGrade,
        overallScore: fixture.overallScore,
        overallComment: fixture.overallComment,
        rubricScores: fixture.rubricScores,
        grammarIssues: buildGrammarIssuesPayload(fixture),
        releasedAt: new Date(submittedAt.getTime() + 1000 * 60 * 60 * 25),
      },
    });

    for (const comment of fixture.teacherComments) {
      await prisma.submissionComment.create({
        data: {
          submissionId: gradedSubmission.id,
          membershipId: primaryTeacher.membershipId,
          content: comment.content,
          excerpt: comment.excerpt,
          occurrence: comment.occurrence,
        },
      });
    }
  }

  const unreleasedText =
    'Pending release essay body. The first sentence matters for the excerpt.';
  const unreleasedHtml = `<p>${unreleasedText}</p>`;
  const unreleasedDocument = await prisma.document.create({
    data: {
      title: 'Unreleased graded essay',
      text: unreleasedText,
      html: unreleasedHtml,
      membershipId: studentUnreleased.membershipId,
      assignmentTypeId: thesisAssignmentTypeId,
      assignmentId: thesisAssignment.id,
      classAssignmentId: thesisClassAssignment.id,
      assignmentModuleSessions: {
        create: buildModuleSessionsCreateData(thesisModules),
      },
    },
  });
  const unreleasedSubmission = await prisma.submission.create({
    data: {
      documentId: unreleasedDocument.id,
      html: unreleasedHtml,
      text: unreleasedText,
      title: 'Unreleased graded essay',
      submittedAt: new Date(),
      gradedByMembershipId: primaryTeacher.membershipId,
      gradedAt: new Date(),
      numericPercentage: 76,
      letterGrade: 'C',
      releasedAt: null,
    },
  });
  await prisma.submissionComment.create({
    data: {
      submissionId: unreleasedSubmission.id,
      membershipId: primaryTeacher.membershipId,
      content: 'Secret teacher note before release.',
      excerpt: 'The first sentence matters',
      occurrence: 1,
    },
  });

  return {
    organizationId,
    schoolIds: schools.map((school) => school.id),
    primaryClassId: primaryClass.id,
    secondaryClassId: secondaryClass.id,
    thesisAssignmentTypeId,
    dailyPagesAssignmentTypeId,
    actWritingAssignmentTypeId,
    personas: personaRecords,
  };
}
