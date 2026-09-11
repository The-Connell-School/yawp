/* eslint-disable no-console */
import { createE2EPrismaClient, type E2EPrismaClient } from './prisma-client';
import { currentSchoolYear } from '../app/utils/school-year';
import { createDeployedAssignment } from './db-helpers';
import { AP_HISTORY_LIBRARY_ENTRIES } from '../../../packages/prisma/scripts/ap-history-library-data';
import bcrypt from 'bcryptjs';

let prisma: E2EPrismaClient | null = null;

function createPassword(password: string) {
  return {
    hash: bcrypt.hashSync(password, 10),
  };
}

const E2E_THESIS_SCORING_SCALE = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
};

const E2E_THESIS_RUBRIC = {
  categories: [
    {
      key: 'thesis_and_content',
      label: 'Thesis/Content',
      description: 'Original, defensible thesis with critical thinking.',
      weight: 0.25,
    },
    {
      key: 'organization_and_structure',
      label: 'Organization/Structure',
      description: 'Purposeful structure and clear progression.',
      weight: 0.25,
    },
    {
      key: 'evidence_and_support',
      label: 'Evidence/Support',
      description: 'Evidence that supports analysis.',
      weight: 0.2,
    },
    {
      key: 'voice_and_style',
      label: 'Voice/Style',
      description: 'Clear, authentic, and precise voice.',
      weight: 0.2,
    },
    {
      key: 'grammar_and_mechanics',
      label: 'Grammar/Syntax/Formatting',
      description: 'Conventions that support clarity.',
      weight: 0.1,
    },
  ],
};

const E2E_GRADING_OUTPUT_SCHEMA = {
  schemaVersion: 1,
  responseShape: 'categories_overall_comment',
};

async function cleanupDb(prismaClient: E2EPrismaClient) {
  const tables = await prismaClient.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const quotedTables = tables
    .map(({ tablename }) => `"public"."${tablename.replace(/"/g, '""')}"`)
    .join(', ');

  await prismaClient.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE;`
  );
}

export type E2EContext = {
  organizationId: string;
  schoolId: string;
  classId: string;
  classCode: string;
  userId: string;
  userEmail: string;
  adminUserId: string;
  adminEmail: string;
  membershipId: string;
  teacherUserId: string;
  teacherMembershipId: string;
  teacherName: string;
  teacherEmail: string;
  assignmentTypeId: string;
  dailyPagesAssignmentTypeId: string;
  exitTicketAssignmentTypeId: string;
  thesisEssayAssignmentTypeId: string;
  apHistoryAssignmentTypeId: string;
  apHistoryDbqEntryKey: string;
  apHistoryLeqEntryKey: string;
  assignmentId: string;
  classAssignmentId: string;
  teacherTrainingId: string;
  freshDocumentId: string;
  editedDocumentId: string;
  submittedDocumentId: string;
  /** Submission ID for the submitted document (use for grading flow tests) */
  submittedSubmissionId: string;
  gradedDocumentId: string;
  /** Submission ID for the graded document (alias: gradeId) */
  snapshotId: string;
  gradeId: string;
  /** Graded but not released; has inline comment (student must not see highlights until release) */
  unreleasedGradedSubmissionId: string;
};

export async function seedE2E(): Promise<E2EContext> {
  if (!prisma) {
    prisma = createE2EPrismaClient();
  }
  console.log('🌱 Seeding E2E DB...');
  await cleanupDb(prisma);

  // Minimal org
  const org = await prisma.organization.create({
    data: {
      id: 'the-connell-school',
      name: 'The Connell School',
      classInsightsEnabled: true,
    },
  });

  // Seed a school and class for student signup flow
  const classCode = 'E2E-CLASS';
  const school = await prisma.school.create({
    data: { name: 'E2E High', code: 'E2E-SCHOOL', organizationId: org.id },
  });

  // Seed a teacher assigned to that school
  const seededTeacherEmail = 'teacher.e2e@yawp.test';
  const seededTeacherName = 'Mrs Test Teacher';
  const seededTeacher = await prisma.user.create({
    data: {
      email: seededTeacherEmail,
      name: seededTeacherName,
      password: { create: createPassword('teacher-e2e-password') },
      memberships: {
        create: {
          organizationId: org.id,
          isOrgOwner: true,
          role: 'TEACHER',
        },
      },
    },
    include: { memberships: true },
  });
  const seededTeacherMembership = seededTeacher.memberships[0];
  const seededTeacherMembershipId = seededTeacherMembership.id;
  await prisma.$executeRaw`
    INSERT INTO "_SchoolTeachers" ("A", "B")
    VALUES (${seededTeacherMembershipId}, ${school.id})
    ON CONFLICT DO NOTHING
  `;
  const seededClass = await prisma.class.create({
    data: {
      code: classCode,
      schoolYear: currentSchoolYear(),
      period: '1st',
      grade: '9th',
      schoolId: school.id,
      teachers: { connect: { id: seededTeacherMembershipId } },
    },
    select: { id: true },
  });

  // Test users
  const users = [
    {
      email: 'jdoe@brock.software',
      name: 'John Doe',
      password: { create: createPassword('johndoe') },
      memberships: {
        create: [
          {
            organizationId: org.id,
            isOrgOwner: false,
            role: 'STUDENT' as const,
          },
        ],
      },
    },
    {
      email: 'admin.e2e@yawp.test',
      name: 'Admin E2E',
      isAdmin: true,
      password: { create: createPassword('admin-e2e-password') },
      memberships: {
        create: [
          {
            organizationId: org.id,
            isOrgOwner: true,
            role: 'TEACHER' as const,
          },
        ],
      },
    },
  ];

  for (const u of users) {
    await prisma.user.create({ data: u });
  }

  // Minimal content needed by app index and editor navigation
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'jdoe@brock.software' },
  });
  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin.e2e@yawp.test' },
  });
  const membership = await prisma.orgMembership.findFirstOrThrow({
    where: { userId: user.id },
  });
  await prisma.orgMembership.update({
    where: { id: membership.id },
    data: { classesAsStudent: { connect: { id: seededClass.id } } },
  });
  const assignmentType = await prisma.assignmentType.create({
    data: {
      title: 'E2E Course',
      position: 1,
      ownerOrgId: org.id,
      scoringScaleJson: E2E_THESIS_SCORING_SCALE,
      rubricJson: E2E_THESIS_RUBRIC,
      gradingPromptConfigJson: {
        instructionsPreset: 'legacy_thesis_driven_essay',
      },
      gradingOutputSchemaJson: E2E_GRADING_OUTPUT_SCHEMA,
      gradingCalibrationNotes: 'E2E thesis-driven essay rubric.',
      gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: 'gait_thesis_current_v1',
      gradingAssistantSourceTemplateSlug: 'thesis-driven-essay-current',
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: [1, 2, 3].map((moduleIndex) => ({
          title: `E2E Module ${moduleIndex}`,
          position: moduleIndex,
          instructions: {
            create: [1, 2, 3].map((instructionIndex) => ({
              title: `Instruction ${moduleIndex}.${instructionIndex}`,
              prompt: `Prompt for instruction ${moduleIndex}.${instructionIndex}`,
              position: instructionIndex,
              showChatButton: true,
            })),
          },
        })),
      },
    },
    select: {
      id: true,
      assignmentModules: { select: { id: true, position: true } },
    },
  });

  const dailyPagesAssignmentType = await prisma.assignmentType.create({
    data: {
      title: 'Daily Pages',
      // Matches production, and is what selects the Daily Pages engagement
      // rubric for a type that has saved no rubric of its own.
      kind: 'daily_pages',
      description:
        'Low-stakes daily writing assignments that help students build fluency.',
      position: 2,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: [
          {
            title: 'Daily Pages',
            position: 1,
            description: 'Short daily writing practice.',
            instructions: {
              create: [
                {
                  title: 'Write',
                  prompt: 'Write freely for ten minutes.',
                  position: 1,
                  showChatButton: true,
                },
              ],
            },
          },
        ],
      },
    },
    select: { id: true },
  });

  const exitTicketAssignmentType = await prisma.assignmentType.create({
    data: {
      title: 'Exit Ticket',
      // The web app keys every exit ticket behaviour off this, not the title.
      kind: 'exit_ticket',
      description:
        'A short piece of writing at the end of a lesson that shows whether it landed.',
      position: 4,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: [
          {
            title: 'Exit Ticket',
            position: 1,
            description: 'Answer the exit ticket in your own words.',
            instructions: {
              create: [
                {
                  title: 'Write',
                  prompt:
                    'Answer the prompt in your own words, and explain your thinking.',
                  position: 1,
                  showChatButton: false,
                },
              ],
            },
          },
        ],
      },
    },
    select: { id: true },
  });

  const thesisEssayAssignmentType = await prisma.assignmentType.create({
    data: {
      title: 'The Thesis-Driven Essay',
      description:
        'Formal, thesis-driven essays. Teachers build assignments from the prompt library.',
      position: 3,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: [
          {
            title: 'The Thesis-Driven Essay',
            position: 1,
            description: 'Write a formal, thesis-driven essay.',
            instructions: {
              create: [
                {
                  title: 'Draft',
                  prompt: 'Draft your thesis-driven essay.',
                  position: 1,
                  showChatButton: true,
                },
              ],
            },
          },
        ],
      },
    },
    select: { id: true },
  });

  const apHistoryDbqEntry = AP_HISTORY_LIBRARY_ENTRIES.find(
    (entry) => entry.essayType === 'dbq'
  );
  const apHistoryLeqEntry = AP_HISTORY_LIBRARY_ENTRIES.find(
    (entry) => entry.essayType === 'leq'
  );

  if (!apHistoryDbqEntry || !apHistoryLeqEntry) {
    throw new Error('E2E AP History seed requires both DBQ and LEQ entries.');
  }

  const apHistoryAssignmentType = await prisma.assignmentType.create({
    data: {
      title: 'AP History Essay',
      systemKey: 'ap_history_essay',
      description: 'Curated APUSH DBQ and LEQ practice.',
      position: 3,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: [
          {
            title: 'AP History Essay',
            position: 1,
            description: 'Write an APUSH DBQ or LEQ with AP-specific coaching.',
            instructions: {
              create: [
                {
                  title: 'Write',
                  prompt:
                    'Use the selected APUSH prompt and source panel to draft your response.',
                  position: 1,
                  showChatButton: true,
                },
              ],
            },
          },
        ],
      },
      apHistoryLibraryEntries: {
        create: AP_HISTORY_LIBRARY_ENTRIES.map((entry) => ({
          externalKey: entry.externalKey,
          course: entry.course,
          essayType: entry.essayType,
          title: entry.title,
          prompt: entry.prompt,
          period: entry.period,
          periodNumber: entry.periodNumber,
          reasoningSkill: entry.reasoningSkill,
          difficulty: entry.difficulty,
          skillEmphasis: entry.skillEmphasis,
          defaultTimeMode: entry.defaultTimeMode,
          defaultDurationMinutes: entry.defaultDurationMinutes,
          provenanceUrl: entry.provenanceUrl,
          sources: {
            create: entry.sources.map((source) => ({
              externalKey: source.externalKey,
              position: source.position,
              title: source.title,
              attribution: source.attribution,
              body: source.body,
              caption: source.caption,
              mediaType: source.mediaType,
              imageUrl: source.imageUrl,
              imageAlt: source.imageAlt,
              provenanceUrl: source.provenanceUrl,
            })),
          },
        })),
      },
    },
    select: { id: true },
  });

  const {
    assignment: seededAssignment,
    classAssignment: seededClassAssignment,
  } = await createDeployedAssignment({
    prisma,
    classId: seededClass.id,
    assignmentTypeId: assignmentType.id,
    title: 'E2E Class Assignment',
    prompt: 'E2E prompt for class assignment.',
  });

  const teacherTraining = await prisma.teacherTraining.create({
    data: {
      title: 'E2E Teacher Lounge',
      description: 'Teacher training content for the E2E dashboard.',
      position: 1,
      teacherTrainingModules: {
        create: [
          {
            title: 'E2E Lounge Module',
            position: 1,
            description: 'Start here.',
          },
        ],
      },
    },
    select: { id: true },
  });

  // 1. Fresh document — minimal content, no revisions
  const freshDoc = await prisma.document.create({
    data: {
      title: 'Fresh Document',
      text: '',
      html: '<p></p>',
      membershipId: membership.id,
      assignmentTypeId: assignmentType.id,
    },
    select: { id: true },
  });

  // 2. Edited document — with 2 revisions
  const editedDocText =
    'This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread. The students was excited for writing.';
  const editedDocHtml = `<p>${editedDocText}</p>`;
  const editedDoc = await prisma.document.create({
    data: {
      title: 'Edited Document',
      text: editedDocText,
      html: editedDocHtml,
      revision: 2,
      membershipId: membership.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: seededAssignment.id,
      classAssignmentId: seededClassAssignment.id,
    },
    select: { id: true },
  });
  await prisma.documentRevision.create({
    data: {
      documentId: editedDoc.id,
      html: '<p></p>',
      text: '',
      trigger: 'session-start',
    },
  });
  await prisma.documentRevision.create({
    data: {
      documentId: editedDoc.id,
      html: editedDocHtml,
      text: editedDocText,
      trigger: 'auto',
    },
  });

  // 3. Submitted document — with submission
  const submittedDocText =
    'The importance of reading cannot be overstated. Reading expands our vocabulary and improves comprehension skills.';
  const submittedDocHtml = `<p>${submittedDocText}</p>`;
  const submittedDocTitle = 'E2E Document workspace title';
  const submittedSubmissionTitle = 'E2E Essay submission title';
  const submittedAt = new Date();
  const submittedDoc = await prisma.document.create({
    data: {
      title: submittedDocTitle,
      text: submittedDocText,
      html: submittedDocHtml,
      revision: 3,
      membershipId: membership.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: seededAssignment.id,
      classAssignmentId: seededClassAssignment.id,
    },
    select: { id: true },
  });
  const submittedSubmission = await prisma.submission.create({
    data: {
      documentId: submittedDoc.id,
      html: submittedDocHtml,
      text: submittedDocText,
      title: submittedSubmissionTitle,
      submittedAt,
    },
    select: { id: true },
  });
  const modulesByPosition = assignmentType.assignmentModules.sort(
    (a, b) => a.position - b.position
  );
  await prisma.assignmentModuleSession.create({
    data: {
      assignmentModuleId: modulesByPosition[1].id,
      documentId: submittedDoc.id,
      title: 'E2E Submitted Doc Session',
      instructionsCompleted: 0,
    },
  });

  // 4. Graded document — with submission (graded + released) and comments
  const gradedDocText =
    'Education is the foundation of society. Through learning, students develop critical thinking skills that serve them throughout life.';
  const gradedDocHtml = `<p>${gradedDocText}</p>`;
  const gradedDocTitle = 'Graded Document';
  const gradedSubmittedAt = new Date();
  const gradedDoc = await prisma.document.create({
    data: {
      title: gradedDocTitle,
      text: gradedDocText,
      html: gradedDocHtml,
      revision: 4,
      membershipId: membership.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: seededAssignment.id,
      classAssignmentId: seededClassAssignment.id,
    },
    select: { id: true },
  });
  const gradedSubmission = await prisma.submission.create({
    data: {
      documentId: gradedDoc.id,
      html: gradedDocHtml,
      text: gradedDocText,
      title: gradedDocTitle,
      submittedAt: gradedSubmittedAt,
      gradedByMembershipId: seededTeacherMembership.id,
      gradedAt: new Date(),
      numericPercentage: 77,
      letterGrade: 'C+',
      overallScore: 4,
      overallComment: 'Good effort with room for improvement.',
      rubricScores: {
        thesis_and_content: 5,
        organization_and_structure: 1,
        evidence_and_support: 5,
        voice_and_style: 1,
        grammar_and_mechanics: 1,
      },
      releasedAt: new Date(),
      grammarIssues: {
        issues: [
          {
            id: 'e2e-graded-grammar-1',
            excerpt: 'Through learning',
            kind: 'style',
            message: 'E2E grammar highlight for student toggle.',
          },
        ],
      },
    },
    select: { id: true },
  });
  await prisma.submissionComment.create({
    data: {
      submissionId: gradedSubmission.id,
      membershipId: seededTeacherMembership.id,
      content: 'Strong thesis statement in the opening sentence.',
      excerpt: 'Education is the foundation of society.',
      occurrence: 1,
    },
  });
  await prisma.submissionComment.create({
    data: {
      submissionId: gradedSubmission.id,
      membershipId: seededTeacherMembership.id,
      content: 'Consider adding more specific examples to support your claims.',
      excerpt: 'students develop critical thinking skills',
      occurrence: 1,
    },
  });

  const unreleasedDocText =
    'Pending release essay body. The first sentence matters for the excerpt.';
  const unreleasedDocHtml = `<p>${unreleasedDocText}</p>`;
  const unreleasedDocTitle = 'Unreleased graded';
  const unreleasedDoc = await prisma.document.create({
    data: {
      title: unreleasedDocTitle,
      text: unreleasedDocText,
      html: unreleasedDocHtml,
      revision: 1,
      membershipId: membership.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: seededAssignment.id,
      classAssignmentId: seededClassAssignment.id,
    },
    select: { id: true },
  });
  const unreleasedGradedSubmission = await prisma.submission.create({
    data: {
      documentId: unreleasedDoc.id,
      html: unreleasedDocHtml,
      text: unreleasedDocText,
      title: unreleasedDocTitle,
      submittedAt: new Date(),
      gradedByMembershipId: seededTeacherMembership.id,
      gradedAt: new Date(),
      numericPercentage: 80,
      letterGrade: 'B',
      releasedAt: null,
    },
    select: { id: true },
  });
  await prisma.submissionComment.create({
    data: {
      submissionId: unreleasedGradedSubmission.id,
      membershipId: seededTeacherMembership.id,
      content: 'Secret teacher note before release.',
      excerpt: 'The first sentence matters',
      occurrence: 1,
    },
  });

  // 5. E2E context metadata
  // 6. Link the edited doc to module session (module 1; submitted doc uses module 2)
  await prisma.assignmentModuleSession.create({
    data: {
      assignmentModuleId: modulesByPosition[0].id,
      documentId: editedDoc.id,
      title: 'E2E Doc Session',
      instructionsCompleted: 0,
    },
  });

  return {
    organizationId: org.id,
    schoolId: school.id,
    classId: seededClass.id,
    classCode,
    userId: user.id,
    userEmail: user.email,
    adminUserId: adminUser.id,
    adminEmail: adminUser.email,
    membershipId: membership.id,
    teacherUserId: seededTeacher.id,
    teacherMembershipId: seededTeacherMembershipId,
    teacherName: seededTeacherName,
    teacherEmail: seededTeacherEmail,
    assignmentTypeId: assignmentType.id,
    dailyPagesAssignmentTypeId: dailyPagesAssignmentType.id,
    exitTicketAssignmentTypeId: exitTicketAssignmentType.id,
    thesisEssayAssignmentTypeId: thesisEssayAssignmentType.id,
    apHistoryAssignmentTypeId: apHistoryAssignmentType.id,
    apHistoryDbqEntryKey: apHistoryDbqEntry.externalKey,
    apHistoryLeqEntryKey: apHistoryLeqEntry.externalKey,
    assignmentId: seededAssignment.id,
    classAssignmentId: seededClassAssignment.id,
    teacherTrainingId: teacherTraining.id,
    freshDocumentId: freshDoc.id,
    editedDocumentId: editedDoc.id,
    submittedDocumentId: submittedDoc.id,
    submittedSubmissionId: submittedSubmission.id,
    gradedDocumentId: gradedDoc.id,
    snapshotId: gradedSubmission.id,
    gradeId: gradedSubmission.id,
    unreleasedGradedSubmissionId: unreleasedGradedSubmission.id,
  };
}

// Note: this module is imported by the E2E prepare script, not run directly.
