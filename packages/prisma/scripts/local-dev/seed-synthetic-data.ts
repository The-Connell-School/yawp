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
  composeExitTicketPrompt,
  type ExitTicketConfig,
} from '../../../../services/web-app/app/domain/assignment-types/exit-ticket.ts';

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
    const dailyAssignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: dailyPagesAssignmentTypeId,
        title: 'Daily Pages - week 2',
        prompt:
          'Write freely for ten minutes about something that surprised you this week.',
      },
    });
    await prisma.classAssignment.create({
      data: {
        assignmentId: dailyAssignment.id,
        classId: primaryClass.id,
      },
    });
  }

  if (exitTicketAssignmentTypeId) {
    // A worked set of exit tickets, graded, so the whole rotation is visible
    // without waiting on a live grading run: both shapes, several focuses,
    // graded-for-points beside feedback-only, and a response in each band.
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

    type DemoResponse = {
      membershipId: string;
      title: string;
      text: string;
      /** The band this response is meant to land in, scored on 0-100. */
      score: number;
      letterGrade: string;
      overallComment: string;
    };

    async function seedExitTicket({
      title,
      config,
      submitForGrade,
      pointValue,
      responses,
    }: {
      title: string;
      config: ExitTicketConfig;
      submitForGrade: boolean;
      pointValue: number | null;
      responses: DemoResponse[];
    }) {
      const assignment = await prisma.assignment.create({
        data: {
          assignmentTypeId: exitTicketAssignmentTypeId!,
          title,
          prompt: composeExitTicketPrompt(config),
          exitTicketConfigJson: config as unknown as Prisma.InputJsonValue,
          submitForGrade,
          pointValue,
          // An exit ticket checks what a student understands unaided.
          tutorEnabled: false,
        },
      });
      const classAssignment = await prisma.classAssignment.create({
        data: { assignmentId: assignment.id, classId: primaryClass.id },
      });

      for (const response of responses) {
        const html = `<p>${response.text}</p>`;
        const document = await prisma.document.create({
          data: {
            title: response.title,
            text: response.text,
            html,
            revision: 2,
            membershipId: response.membershipId,
            assignmentTypeId: exitTicketAssignmentTypeId!,
            assignmentId: assignment.id,
            classAssignmentId: classAssignment.id,
            assignmentModuleSessions: {
              create: buildModuleSessionsCreateData(exitTicketModules),
            },
          },
        });
        await prisma.submission.create({
          data: {
            documentId: document.id,
            html,
            text: response.text,
            title: response.title,
            submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
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

    // Specific, graded for points, with notes: the fully-specified case.
    await seedExitTicket({
      title: 'Exit ticket: the water cycle',
      config: {
        schemaVersion: 1,
        mode: 'specific',
        focus: 'explain-concept',
        topic: 'how energy moves through the water cycle',
        lessonNotes: {
          mainPoints:
            'Energy enters as sunlight, is carried as latent heat in water vapour, and is released again when the vapour condenses.',
          mustMention:
            'That the energy is released when water vapour condenses, not when it evaporates.',
          watchFor:
            'Describing where the water goes without ever mentioning energy.',
        },
      },
      submitForGrade: true,
      pointValue: 10,
      responses: [
        {
          membershipId: personaRecords['student-graded'].membershipId,
          title: 'Exit ticket: the water cycle',
          text: 'The sun puts energy into the water when it evaporates, and the water carries that energy with it as vapour. The part I did not get until today is that the energy does not disappear up there. It gets let go again when the vapour cools down and condenses into cloud, which is why storms have so much energy in them. So the water cycle is really moving energy around, not just moving water around.',
          score: 92,
          letterGrade: 'A',
          overallComment:
            'Rosa, you have got the thing this was checking for: you explained that the energy is released at condensation, not at evaporation, and you did it in your own words. The line about storms shows you following the idea somewhere of your own. Next step is saying where that energy came from in the first place.',
        },
        {
          membershipId: personaRecords['student-submitted'].membershipId,
          title: 'Exit ticket: the water cycle',
          text: 'The water cycle is evaporation, condensation, precipitation and collection. The water goes up into the clouds and then comes back down as rain and then it goes into rivers and back to the ocean and starts again.',
          score: 68,
          letterGrade: 'D',
          overallComment:
            'Marcus, this is an accurate list of the stages, but it is the list you were given rather than an explanation of it. The question was about energy, and energy is not mentioned anywhere here. Have another go at just one step: what happens to the sun energy when the vapour turns back into water?',
        },
      ],
    });

    // Specific, feedback only: the honest-confusion case the rubric protects.
    await seedExitTicket({
      title: 'Exit ticket: balancing equations',
      config: {
        schemaVersion: 1,
        mode: 'specific',
        focus: 'clear-up-confusion',
        topic: 'how to balance a chemical equation',
        lessonNotes: {
          mainPoints:
            'Atoms are conserved, so coefficients change but subscripts never do.',
          mustMention: 'That you may only change coefficients, not subscripts.',
          watchFor:
            'Changing a subscript to make the counts match, which changes the substance.',
        },
      },
      submitForGrade: false,
      pointValue: null,
      responses: [
        {
          membershipId: personaRecords.student.membershipId,
          title: 'Exit ticket: balancing equations',
          text: 'I understand why we balance them. The number of atoms has to be the same on both sides because atoms do not just appear. What I keep getting stuck on is which number I am allowed to change. I know I am supposed to change the big number in front, but when I am halfway through and the oxygens still do not match, I end up changing the little number instead because it works. I think that is wrong because it makes it a different chemical, but I am not sure why that matters more than getting the counts even.',
          score: 82,
          letterGrade: 'B',
          overallComment:
            'Ana, this is exactly the kind of answer that helps me teach. You have the principle right, and you have found the precise place you come unstuck rather than saying you do not get it. You are also right about why changing the subscript is a problem: it makes it a different substance. Hold on to that instinct, and tomorrow we will work on what to do when the oxygens will not come out even.',
        },
      ],
    });

    // Specific, self-assessment: the miscalibrated confident answer.
    await seedExitTicket({
      title: 'Exit ticket: how well do you have cell division?',
      config: {
        schemaVersion: 1,
        mode: 'specific',
        focus: 'judge-understanding',
        topic: 'today’s lesson on mitosis and meiosis',
        lessonNotes: {
          mainPoints:
            'Mitosis makes two identical cells; meiosis makes four cells with half the chromosomes.',
          mustMention: 'That meiosis halves the chromosome number.',
          watchFor: 'Saying both processes make identical cells.',
        },
      },
      submitForGrade: false,
      pointValue: null,
      responses: [
        {
          membershipId: personaRecords['student-unreleased'].membershipId,
          title: 'Exit ticket: how well do you have cell division?',
          text: 'I understand this really well. I paid attention the whole lesson and the diagrams made sense to me. I could definitely explain mitosis and meiosis to someone else, they are both ways that cells divide to make new cells. I would say I am at a 9 out of 10 on this one.',
          score: 65,
          letterGrade: 'D',
          overallComment:
            'Jamal, you sound confident, and that is worth something. But the only thing you actually said about the two processes is that both divide cells, which is the part they share. This ticket was asking you to test yourself: try naming one way meiosis differs from mitosis. If that is harder than it felt in the lesson, that is useful to know now rather than on Friday.',
        },
      ],
    });

    // Basic, no notes: the open-ended case, and the hardest one to read.
    await seedExitTicket({
      title: 'Exit ticket: Thursday',
      config: { schemaVersion: 1, mode: 'basic' },
      submitForGrade: false,
      pointValue: null,
      responses: [
        {
          membershipId: personaRecords['student-graded'].membershipId,
          title: 'Exit ticket: Thursday',
          text: 'What I actually got today was that the reason we do the reading before the discussion is not to check we did it. It is because the discussion is where you find out what you missed. I always thought the reading was the work and the talking was the easy bit, but I said something today that I only worked out while I was saying it. So maybe the talking is also the work.',
          score: 78,
          letterGrade: 'C',
          overallComment:
            'Rosa, this is a real observation about how you learn, and it is the kind of thing this ticket is good at catching. You noticed something true about yourself. It sits a little away from the content of the lesson, so I cannot tell from this what you took from the reading itself, but I am glad you wrote it.',
        },
      ],
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
