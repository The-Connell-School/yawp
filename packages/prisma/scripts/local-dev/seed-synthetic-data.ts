/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { createPassword } from '../utils';
import { getClassArtByIndex } from '../../../../services/web-app/app/utils/class-art.ts';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  LOCAL_DEV_PERSONAS,
  type LocalDevPersona,
} from './dev-personas';

type PersonaRecord = {
  persona: LocalDevPersona;
  userId: string;
  membershipId: string;
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
  prisma: PrismaClient,
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
  prisma: PrismaClient
): Promise<LocalDevSeedContext> {
  const personaRecords = Object.fromEntries(
    (
      await Promise.all(
        LOCAL_DEV_PERSONAS.map((persona) =>
          upsertPersona(prisma, persona, LOCAL_DEV_ORG_ID)
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
          code: `DEV-SCH-${index + 1}`,
          organizationId: LOCAL_DEV_ORG_ID,
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
    select: { id: true, position: true },
  });

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
            ],
          }
        : undefined,
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

  // A graded cohort on the thesis assignment so the class-wide performance
  // summary has enough real papers to aggregate. The four personas above only
  // yield a single graded submission with rubric scores, which makes the
  // insight look empty. These students do not log in — they exist to fill the
  // roster and give the assignment-level insight a believable spread of
  // strengths (thesis, organization) and gaps (evidence, grammar).
  const gradedCohort: Array<{
    name: string;
    percentage: number;
    letterGrade: string;
    overallComment: string;
    excerpt: string;
    body: string;
    rubricScores: {
      thesis_and_content: number;
      organization_and_structure: number;
      evidence_and_support: number;
      voice_and_style: number;
      grammar_and_mechanics: number;
    };
  }> = [
    {
      name: 'Ava Thompson',
      percentage: 90,
      letterGrade: 'A-',
      overallComment:
        'Sharp, arguable thesis and clean structure. Push for one more concrete example per body paragraph.',
      excerpt: 'Schools shape citizens as much as scholars.',
      body: 'Schools shape citizens as much as scholars. A civics-minded classroom teaches students to weigh evidence and argue in good faith before they ever cast a vote.',
      rubricScores: {
        thesis_and_content: 5,
        organization_and_structure: 5,
        evidence_and_support: 3,
        voice_and_style: 4,
        grammar_and_mechanics: 4,
      },
    },
    {
      name: 'Marcus Lee',
      percentage: 84,
      letterGrade: 'B',
      overallComment:
        'Confident thesis; your evidence is thin and a few run-on sentences muddy the argument.',
      excerpt: 'A democracy is only as strong as its youngest voters.',
      body: 'A democracy is only as strong as its youngest voters. If schools want responsible citizens they must model debate, disagreement, and compromise every single day.',
      rubricScores: {
        thesis_and_content: 4,
        organization_and_structure: 4,
        evidence_and_support: 2,
        voice_and_style: 4,
        grammar_and_mechanics: 2,
      },
    },
    {
      name: 'Priya Nair',
      percentage: 78,
      letterGrade: 'C+',
      overallComment:
        'Good ideas, but the essay jumps between points. Outline first, and support each claim with a source.',
      excerpt: 'Civic responsibility starts long before the ballot box.',
      body: 'Civic responsibility starts long before the ballot box. Group projects, student government, and honest classroom debate all teach the habits a healthy democracy needs.',
      rubricScores: {
        thesis_and_content: 4,
        organization_and_structure: 3,
        evidence_and_support: 2,
        voice_and_style: 3,
        grammar_and_mechanics: 3,
      },
    },
    {
      name: 'Diego Ramirez',
      percentage: 88,
      letterGrade: 'B+',
      overallComment:
        'Strong voice and organization. Cite the historical examples you allude to so the argument lands harder.',
      excerpt: 'The classroom is a rehearsal for the republic.',
      body: 'The classroom is a rehearsal for the republic. When students practice listening to opposing views, they build the patience that self-government demands.',
      rubricScores: {
        thesis_and_content: 4,
        organization_and_structure: 5,
        evidence_and_support: 3,
        voice_and_style: 5,
        grammar_and_mechanics: 4,
      },
    },
    {
      name: 'Sofia Rossi',
      percentage: 72,
      letterGrade: 'C',
      overallComment:
        'Thesis is present but general. Focus one paragraph on a single example and fix the comma splices.',
      excerpt: 'Schools teach more than facts.',
      body: 'Schools teach more than facts, they teach how to be part of something bigger, and that is what prepares students for civic life.',
      rubricScores: {
        thesis_and_content: 3,
        organization_and_structure: 3,
        evidence_and_support: 2,
        voice_and_style: 3,
        grammar_and_mechanics: 2,
      },
    },
    {
      name: 'Jamal Carter',
      percentage: 86,
      letterGrade: 'B',
      overallComment:
        'Well organized with a clear throughline. Deepen the analysis of your evidence instead of just naming it.',
      excerpt: 'Citizenship is a skill, not a birthday.',
      body: 'Citizenship is a skill, not a birthday. Schools that treat students as participants rather than spectators graduate adults ready to govern themselves.',
      rubricScores: {
        thesis_and_content: 4,
        organization_and_structure: 4,
        evidence_and_support: 3,
        voice_and_style: 4,
        grammar_and_mechanics: 4,
      },
    },
    {
      name: 'Hannah Kim',
      percentage: 94,
      letterGrade: 'A',
      overallComment:
        'Excellent — arguable thesis, layered evidence, and controlled prose. A model essay for the class.',
      excerpt: 'Preparation for citizenship is the quiet work of every school day.',
      body: 'Preparation for citizenship is the quiet work of every school day. In discussion, in disagreement, and in revision, students learn the give-and-take democracy runs on.',
      rubricScores: {
        thesis_and_content: 5,
        organization_and_structure: 5,
        evidence_and_support: 4,
        voice_and_style: 5,
        grammar_and_mechanics: 5,
      },
    },
    {
      name: 'Owen Walsh',
      percentage: 68,
      letterGrade: 'D+',
      overallComment:
        'Hard to follow the argument. Start with a single clear thesis sentence and build one point at a time.',
      excerpt: 'Being a citizen is important for everyone in the world today.',
      body: 'Being a citizen is important for everyone in the world today and schools should help with that because it matters a lot for the future of the country.',
      rubricScores: {
        thesis_and_content: 2,
        organization_and_structure: 2,
        evidence_and_support: 2,
        voice_and_style: 2,
        grammar_and_mechanics: 3,
      },
    },
    {
      name: 'Lucia Fernandez',
      percentage: 82,
      letterGrade: 'B-',
      overallComment:
        'Nice momentum and a clear stance. Tighten your topic sentences and add one primary source.',
      excerpt: 'Democracy is a habit before it is a right.',
      body: 'Democracy is a habit before it is a right. The students who learn to question, to listen, and to revise become the neighbors a community can count on.',
      rubricScores: {
        thesis_and_content: 4,
        organization_and_structure: 3,
        evidence_and_support: 3,
        voice_and_style: 4,
        grammar_and_mechanics: 3,
      },
    },
  ];

  for (const [index, essay] of gradedCohort.entries()) {
    const cohortUser = await prisma.user.create({
      data: {
        email: `dev.cohort.${index + 1}@yawp.local`,
        name: essay.name,
        password: { create: createPassword('cohort-password') },
        memberships: {
          create: {
            organizationId: LOCAL_DEV_ORG_ID,
            role: 'STUDENT',
          },
        },
      },
      include: { memberships: true },
    });
    const cohortMembershipId = cohortUser.memberships[0]?.id;
    if (!cohortMembershipId) {
      throw new Error(`Membership not created for ${essay.name}`);
    }

    await prisma.orgMembership.update({
      where: { id: cohortMembershipId },
      data: {
        school: schools[0].name,
        grade: '10',
        period: '3',
        schoolTeacher: primaryTeacher.persona.name,
      },
    });
    await prisma.class.update({
      where: { id: primaryClass.id },
      data: { students: { connect: { id: cohortMembershipId } } },
    });

    const cohortHtml = `<p>${essay.body}</p>`;
    const cohortDocument = await prisma.document.create({
      data: {
        title: `Civic essay — ${essay.name}`,
        text: essay.body,
        html: cohortHtml,
        revision: 3,
        membershipId: cohortMembershipId,
        assignmentTypeId: thesisAssignmentTypeId,
        assignmentId: thesisAssignment.id,
        classAssignmentId: thesisClassAssignment.id,
      },
    });
    const scoreValues = Object.values(essay.rubricScores);
    const overallScore = Math.round(
      scoreValues.reduce((total, score) => total + score, 0) /
        scoreValues.length
    );
    const cohortSubmission = await prisma.submission.create({
      data: {
        documentId: cohortDocument.id,
        html: cohortHtml,
        text: essay.body,
        title: `Civic essay — ${essay.name}`,
        submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
        gradedByMembershipId: primaryTeacher.membershipId,
        gradedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        numericPercentage: essay.percentage,
        letterGrade: essay.letterGrade,
        overallScore,
        overallComment: essay.overallComment,
        rubricScores: essay.rubricScores,
        releasedAt: new Date(),
      },
    });
    await prisma.submissionComment.create({
      data: {
        submissionId: cohortSubmission.id,
        membershipId: primaryTeacher.membershipId,
        content: essay.overallComment,
        excerpt: essay.excerpt,
        occurrence: 1,
      },
    });
  }

  return {
    organizationId: LOCAL_DEV_ORG_ID,
    schoolIds: schools.map((school) => school.id),
    primaryClassId: primaryClass.id,
    secondaryClassId: secondaryClass.id,
    thesisAssignmentTypeId,
    dailyPagesAssignmentTypeId,
    actWritingAssignmentTypeId,
    personas: personaRecords,
  };
}
