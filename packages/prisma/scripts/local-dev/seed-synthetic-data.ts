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
import { seedReporterDemoData } from './seed-reporter-demo';

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

/** Wrap a plain-text essay (paragraphs separated by blank lines) in <p> tags. */
function paragraphsToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((paragraph) => `<p>${paragraph.trim()}</p>`)
    .filter((paragraph) => paragraph !== '<p></p>')
    .join('');
}

/** The first sentence of an essay, used as the highlighted grader excerpt. */
function firstSentence(text: string): string {
  return (text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text).trim();
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
    ['North Ridge High', 'Riverview Academy', 'Summit Prep'].map(
      async (name, index) =>
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

  const gradedText = [
    'Education is the foundation of society. Through learning, students develop the critical thinking skills that let them question claims, weigh evidence, and reach their own conclusions instead of simply accepting what they are told.',
    'A school that takes civic responsibility seriously does more than deliver facts. It gives students real chances to practice democracy in miniature: debating classroom rules, working through disagreements on group projects, and defending an argument when a classmate pushes back. These everyday habits are exactly the ones a healthy democracy depends on.',
    'If we want graduates who actually participate in public life, we should treat every discussion as a rehearsal for citizenship. When young people are trusted with real responsibility in student government and service projects, they tend to rise to meet it.',
  ].join('\n\n');
  const gradedHtml = paragraphsToHtml(gradedText);
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

  // Writing practice: add a sample teacher-assigned practice (with one student
  // attempt) so every surface — student "Assigned to you", teacher "Assigned
  // by you", and the results view — is populated out of the box in
  // seeded/preview environments.
  const writingPracticeAssignment =
    await prisma.writingPracticeAssignment.create({
      data: {
        organizationId: LOCAL_DEV_ORG_ID,
        title: 'Comma splices warm-up',
        lessonSlugs: ['fixing-comma-splices'],
        problemCount: 4,
        instructions:
          'Fix each comma splice, then check your work with the tutor.',
        createdByMembershipId: primaryTeacher.membershipId,
        classAssignments: { create: [{ classId: primaryClass.id }] },
      },
      include: { classAssignments: true },
    });

  const writingPracticeClassAssignment =
    writingPracticeAssignment.classAssignments[0];
  if (writingPracticeClassAssignment) {
    // Two ACT multiple-choice attempts (one correct, one not) so the teacher
    // results view shows real per-student progress out of the box. The full ACT
    // record lives in `feedbackJson` — see `ActAttemptRecord`.
    const practiceAttempts = [
      {
        promptId: 'fixing-comma-splices-1',
        status: 'strong',
        record: {
          kind: 'act',
          sentence:
            'The new phone costs over a thousand dollars, most students can’t afford it.',
          underline: 'dollars, most',
          choices: [
            'dollars, most',
            'dollars; most',
            'dollars. Most',
            'dollars, so most',
          ],
          selectedChoiceIndex: 1,
          correctChoiceIndex: 1,
          correct: true,
          explanation:
            'Two independent clauses joined by only a comma form a comma splice; a semicolon correctly links them.',
        },
      },
      {
        promptId: 'fixing-comma-splices-2',
        status: 'needs_revision',
        record: {
          kind: 'act',
          sentence: 'She studied all night, she still felt unprepared.',
          underline: 'night, she',
          choices: ['night, she', 'night; she', 'night. She', 'night she'],
          selectedChoiceIndex: 0,
          correctChoiceIndex: 1,
          correct: false,
          explanation:
            'A comma alone cannot join two independent clauses. A semicolon fixes the splice while keeping the clauses linked.',
        },
      },
    ] as const;

    for (const [index, attempt] of practiceAttempts.entries()) {
      await prisma.writingPracticeAttempt.create({
        data: {
          classAssignmentId: writingPracticeClassAssignment.id,
          membershipId: personaRecords['student-graded'].membershipId,
          position: index + 1,
          lessonSlug: 'fixing-comma-splices',
          promptId: attempt.promptId,
          exercise: attempt.record.sentence,
          instruction: attempt.record.underline,
          response:
            attempt.record.choices[attempt.record.selectedChoiceIndex] ?? '',
          status: attempt.status,
          feedbackJson: attempt.record,
        },
      });
    }
  }

  // Rich, deterministic reporting dataset: many students × papers × released
  // grades with per-student trajectories so the Yawp Reporter has real trends
  // to surface across students and across papers.
  await seedReporterDemoData(prisma, {
    organizationId: LOCAL_DEV_ORG_ID,
    assignmentTypeId: thesisAssignmentTypeId,
    teacherMembershipId: primaryTeacher.membershipId,
    primaryClassId: primaryClass.id,
    secondaryClassId: secondaryClass.id,
    now: Date.now(),
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
      body: [
        'Schools shape citizens as much as scholars. Long before a student casts a first vote, the classroom is where they learn to weigh evidence, listen to an opponent, and change their mind when the argument demands it.',
        'Consider how a simple graded debate works. Students must research a position they may not personally hold, anticipate the strongest counterargument, and respond without resorting to insults. That is civic life in miniature, and it is far more durable than a memorized list of amendments.',
        'A school serious about citizenship should build these rehearsals into every subject rather than quarantine them in a single government unit. The habits of a good neighbor are practiced, not announced.',
      ].join('\n\n'),
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
      body: [
        'A democracy is only as strong as its youngest voters, and that means schools carry a responsibility most people never stop to think about.',
        'If schools want responsible citizens they must model debate and disagreement every single day, they cannot just talk about it once a year, because students learn from what adults actually do and not from what a poster on the wall says. This is why the way a teacher handles a classroom conflict matters so much and teaches more than the assigned lesson does.',
        'Schools should give students real decisions to make so they can practice being wrong and trying again.',
      ].join('\n\n'),
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
      body: [
        'Civic responsibility starts long before the ballot box. Group projects, student government, and honest classroom debate all teach the habits a healthy democracy needs.',
        'Voting is important too, and so is knowing history, and students should also learn how local government works because a lot of decisions happen there. Sometimes the most important things are the small ones, like showing up and listening to people you disagree with.',
        'If schools focused on these skills, students would be more ready for the responsibilities of adult life.',
      ].join('\n\n'),
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
      body: [
        'The classroom is a rehearsal for the republic. Every seminar, every disagreement handled with grace, is a small audition for the harder work of self-government.',
        'When students practice listening to opposing views, they build the patience that democracy quietly demands. I once watched a heated argument about a class rule turn into a genuine compromise, and it looked a great deal like the messy, necessary work of a town meeting.',
        'That is the promise of a civic education: not that students will always agree, but that they will know how to disagree and still build something together.',
      ].join('\n\n'),
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
      body: [
        'Schools teach more than facts, they teach how to be part of something bigger, and that is what prepares students for civic life.',
        'Students learn to work together on projects, they learn to share their ideas, they learn to listen even when they disagree. These things matter a lot for being a good citizen later on.',
        'A school that cares about this will give students more chances to practice, and that will help them in the future.',
      ].join('\n\n'),
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
      body: [
        'Citizenship is a skill, not a birthday. Schools that treat students as participants rather than spectators graduate adults ready to govern themselves.',
        'Student government is a good example. So are service projects and classroom debates. These experiences give students practice with responsibility, and studies show that engaged students tend to stay engaged as adults.',
        'For that reason, schools should make participation a habit rather than an extracurricular, so that every student leaves prepared for public life.',
      ].join('\n\n'),
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
      body: [
        'Preparation for citizenship is the quiet work of every school day. It happens not in grand civics lectures but in the ordinary friction of discussion, disagreement, and revision.',
        'Take a single graded seminar. A student advances a claim, a classmate produces a counterexample, and the first student must decide whether to defend the point or revise it. That decision — made honestly, in public, with evidence on the table — is the exact muscle a citizen uses when a cherished belief meets an inconvenient fact.',
        'Democracy runs on that give-and-take, and it cannot be assigned as homework. The most civic thing a school can do is make the practice constant: to treat every classroom as a place where reasons matter more than volume, and where changing your mind is a sign of strength rather than defeat.',
      ].join('\n\n'),
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
      body: [
        'Being a citizen is important for everyone in the world today and schools should help with that because it matters a lot for the future of the country and also for the students themselves. There are many reasons for this and schools already do a lot of things but they could probably do more things too. In conclusion being a good citizen is important and school helps with it.',
      ].join('\n\n'),
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
      body: [
        'Democracy is a habit before it is a right. The students who learn to question, to listen, and to revise become the neighbors a community can count on.',
        'This shows up in small ways. A group project forces compromise; a class debate rewards preparation over volume; a peer-review session teaches students to take criticism without taking offense. Each is a rehearsal for the kind of citizen who can disagree without contempt.',
        'Schools should protect these moments rather than crowd them out, because the habits formed in a tenth-grade classroom tend to outlast the facts.',
      ].join('\n\n'),
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

    const cohortHtml = paragraphsToHtml(essay.body);
    const cohortExcerpt = firstSentence(essay.body);
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
        excerpt: cohortExcerpt,
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
