/* eslint-disable no-console */
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../generated/prisma';
import { createPassword } from '../utils';
import { getClassArtByIndex } from '../../../../services/web-app/app/utils/class-art.ts';
import { seedDailyPagesSampleEntries } from './seed-daily-pages-samples';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_PERSONAS,
  type LocalDevPersona,
} from './dev-personas';
import { composeExitTicketPrompt } from '../../../../services/web-app/app/domain/assignment-types/exit-ticket.ts';
import { EXIT_TICKET_DEMO_TICKETS } from './exit-ticket-demo-data.ts';

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
      isSuperAdmin: persona.isSuperAdmin ?? false,
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
  rows: Array<{
    id: string;
    title: string;
    kind: string | null;
    systemKey: string | null;
  }>,
  matcher: (row: (typeof rows)[number]) => boolean
) {
  return rows.find(matcher)?.id ?? null;
}

export async function seedSyntheticLocalDevData(
  prisma: SyntheticSeedClient,
  options: SyntheticSeedOptions = {}
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
    ['North Ridge High', 'Riverview Academy', 'Summit Prep'].map(
      async (name, index) =>
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
  // If Daily Pages exists, snapshot its engagement rubric config BEFORE any seed
  // step mutates it (the short-form preview seeding clears rubricJson).
  let engagementAssignmentTypeSnapshot:
    | { rubricJson: Prisma.InputJsonValue | null; scoringScaleJson: Prisma.InputJsonValue | null }
    | null = null;
  if (dailyPagesAssignmentTypeId) {
    const original = await prisma.assignmentType.findUnique({
      where: { id: dailyPagesAssignmentTypeId },
      select: { rubricJson: true, scoringScaleJson: true },
    });
    if (original) {
      engagementAssignmentTypeSnapshot = {
        rubricJson: original.rubricJson as Prisma.InputJsonValue | null,
        scoringScaleJson: original.scoringScaleJson as Prisma.InputJsonValue | null,
      };
    }
  }
  const classStarterAssignmentTypeId = pickAssignmentTypeId(
    assignmentTypes,
    (row) => row.kind === 'class_starter' || row.title === 'Class Starter'
  );
  const actWritingAssignmentTypeId = pickAssignmentTypeId(
    assignmentTypes,
    (row) => row.title === 'ACT Writing Section'
  );
  const exitTicketAssignmentTypeId = pickAssignmentTypeId(
    assignmentTypes,
    (row) => row.kind === 'exit_ticket'
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
  function buildModuleSessionsCreateData(modules: typeof thesisModules) {
    return modules.map((assignmentModule) => {
      const firstInstruction = assignmentModule.instructions[0];
      return {
        instructionsCompleted: 0,
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
    // A graded class set rather than an empty assignment: the split is only
    // legible once you can open four entries on one prompt and see where the
    // assistant put them. Also points the seeded type at the short-form
    // rubric — see seed-daily-pages-samples.ts.
    await seedDailyPagesSampleEntries(prisma, {
      assignmentTypeId: dailyPagesAssignmentTypeId,
      classId: primaryClass.id,
      teacherMembershipId: primaryTeacher.membershipId,
      studentMembershipIds: {
        student: personaRecords.student.membershipId,
        'student-submitted': personaRecords['student-submitted'].membershipId,
        'student-graded': personaRecords['student-graded'].membershipId,
        'student-unreleased':
          personaRecords['student-unreleased'].membershipId,
      },
    });
  }

  // Add a ready-to-use Engagement preview assignment under the existing Daily Pages
  // type by pinning it to the engagement rubric's current revision. This avoids
  // creating a second AssignmentType with a duplicate `kind`.
  if (engagementAssignmentTypeSnapshot?.rubricJson && dailyPagesAssignmentTypeId) {
    // Ensure the engagement rubric exists with a current revision.
    // Import the portable library schema from the web-app domain.
    const dailyPagesEngagementSchema = (await import('../../../../services/web-app/app/domain/rubrics/library/daily-pages-engagement.json', { with: { type: 'json' } }) as any)
      .default as Prisma.InputJsonValue;
    const rubricName = (dailyPagesEngagementSchema as any)?.name ?? 'daily-pages-engagement';
    const rubricTitle = (dailyPagesEngagementSchema as any)?.title ?? 'Daily Pages engagement';

    let rubric = await prisma.rubric.findUnique({
      where: { name: String(rubricName) },
      include: { currentRevision: true },
    });
    if (!rubric) {
      rubric = await prisma.rubric.create({
        data: {
          name: String(rubricName),
          title: String(rubricTitle),
          schemaJson: dailyPagesEngagementSchema,
        },
        include: { currentRevision: true },
      });
    }
    if (!rubric.currentRevision) {
      const latest = await prisma.rubricRevision.findFirst({
        where: { rubricName: String(rubricName) },
        orderBy: { version: 'desc' },
      });
      const revision = await prisma.rubricRevision.create({
        data: {
          id: randomUUID(),
          rubricName: String(rubricName),
          version: (latest?.version ?? 0) + 1,
          schemaJson: dailyPagesEngagementSchema,
          fingerprint: `seed-${rubricName}`,
          requestId: randomUUID(),
          requestHash: `seed-${rubricName}-${Date.now()}`,
          createdBy: 'seed-local-dev',
          reason: 'Preview engagement rubric for Daily Pages',
        } as any,
      });
      await prisma.rubric.update({
        where: { id: rubric.id },
        data: { currentRevisionId: revision.id },
      });
      // Refresh to load the relation for creation below.
      rubric = await prisma.rubric.findUnique({
        where: { id: rubric.id },
        include: { currentRevision: true },
      });
    }

    // Point the seeded Daily Pages type at the engagement library rubric so pins match.
    if (rubric) {
      await prisma.assignmentType.update({
        where: { id: dailyPagesAssignmentTypeId },
        data: { rubricId: rubric.id },
      });
    }

    // Create the preview assignment pinned to the engagement rubric.
    const engagementRevisionId = rubric?.currentRevision?.id;
    if (!engagementRevisionId) {
      // Skip creation when the library rubric is not fully published.
      // Preview seat top-up repairs this on host.
      // Continue seeding the rest of the data.
    } else {
    const engagementAssignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: dailyPagesAssignmentTypeId,
        title: 'Engagement Check (Preview)',
        prompt: 'Write freely for ten minutes about something you noticed today.',
        submitForGrade: true,
        pointValue: 30,
        rubricRevisionId: engagementRevisionId,
      },
      select: { id: true },
    });
    await prisma.classAssignment.create({
      data: { assignmentId: engagementAssignment.id, classId: primaryClass.id },
    });
    }
  }

  if (classStarterAssignmentTypeId) {
    const classStarterAssignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: classStarterAssignmentTypeId,
        title: 'Class Starter - Monday',
        prompt:
          'Write freely for ten minutes about something that surprised you this week.',
      },
    });
    await prisma.classAssignment.create({
      data: {
        assignmentId: classStarterAssignment.id,
        classId: primaryClass.id,
      },
    });
  }

  if (exitTicketAssignmentTypeId) {
    // A worked set of exit tickets, so the whole rotation is visible without
    // waiting on a live grading run. What each one is there to show — and the
    // guarantee that between them they cover every configuration — lives in
    // exit-ticket-demo-data.ts alongside its coverage test.
    //
    // Prompts are composed by the same function the product uses rather than
    // pasted, so the demo cannot drift from what a teacher would really get.
    const exitTicketModules = await prisma.assignmentModule.findMany({
      where: { assignmentTypeId: exitTicketAssignmentTypeId, deletedAt: null },
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

    for (const ticket of EXIT_TICKET_DEMO_TICKETS) {
      const assignment = await prisma.assignment.create({
        data: {
          assignmentTypeId: exitTicketAssignmentTypeId,
          title: ticket.title,
          prompt: composeExitTicketPrompt(ticket.config),
          exitTicketConfigJson:
            ticket.config as unknown as Prisma.InputJsonValue,
          submitForGrade: ticket.submitForGrade,
          pointValue: ticket.pointValue,
          tutorEnabled: ticket.tutorEnabled,
        },
      });
      const classAssignment = await prisma.classAssignment.create({
        data: { assignmentId: assignment.id, classId: primaryClass.id },
      });

      for (const response of ticket.responses) {
        const html = `<p>${response.text}</p>`;
        const document = await prisma.document.create({
          data: {
            title: ticket.title,
            text: response.text,
            html,
            revision: 2,
            membershipId: personaRecords[response.personaKey].membershipId,
            assignmentTypeId: exitTicketAssignmentTypeId,
            assignmentId: assignment.id,
            classAssignmentId: classAssignment.id,
            assignmentModuleSessions: {
              create: buildModuleSessionsCreateData(exitTicketModules),
            },
          },
        });

        // A draft was started and never handed in, so there is nothing to
        // grade and no submission row to make.
        if (response.state === 'draft') continue;

        const submitted = {
          documentId: document.id,
          html,
          text: response.text,
          title: ticket.title,
          submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        };

        if (response.state === 'submitted') {
          await prisma.submission.create({ data: submitted });
          continue;
        }

        await prisma.submission.create({
          data: {
            ...submitted,
            gradedByMembershipId: primaryTeacher.membershipId,
            gradedAt: new Date(),
            // A band-scored rubric records the percentage it was scored at,
            // which is what lets a graded ticket show "9 / 10" against the
            // point value the teacher chose.
            numericPercentage: response.score,
            overallScore: response.score,
            letterGrade: response.letterGrade,
            score: `${response.score}% (${response.letterGrade})`,
            overallComment: response.overallComment,
            rubricScores: {
              understanding: {
                score: response.score,
                comment: '',
                isAi: true,
              },
            },
            releasedAt: new Date(),
          },
        });
      }
    }
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

  const gradedText =
    'Education is the foundation of society. Through learning, students develop critical thinking skills.';
  const gradedHtml = `<p>${gradedText}</p>`;
  const gradedDocument = await prisma.document.create({
    data: {
      title: 'Graded civic essay',
      text: gradedText,
      html: gradedHtml,
      revision: 4,
      membershipId: studentGraded.membershipId,
      assignmentTypeId: thesisAssignmentTypeId,
      assignmentId: thesisAssignment.id,
      classAssignmentId: thesisClassAssignment.id,
      assignmentModuleSessions: {
        create: buildModuleSessionsCreateData(thesisModules),
      },
    },
  });
  const gradedSubmission = await prisma.submission.create({
    data: {
      documentId: gradedDocument.id,
      html: gradedHtml,
      text: gradedText,
      title: 'Graded civic essay',
      submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      gradedByMembershipId: primaryTeacher.membershipId,
      gradedAt: new Date(),
      numericPercentage: 82,
      letterGrade: 'B',
      overallScore: 4,
      overallComment: 'Strong thesis with room to deepen evidence.',
      rubricScores: {
        thesis_and_content: 4,
        organization_and_structure: 4,
        evidence_and_support: 3,
        voice_and_style: 4,
        grammar_and_mechanics: 3,
      },
      releasedAt: new Date(),
    },
  });
  await prisma.submissionComment.create({
    data: {
      submissionId: gradedSubmission.id,
      membershipId: primaryTeacher.membershipId,
      content: 'Strong thesis statement in the opening sentence.',
      excerpt: 'Education is the foundation of society.',
      occurrence: 1,
    },
  });

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
      content: 'Your opening sentence gives the reader a clear entry point.',
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
