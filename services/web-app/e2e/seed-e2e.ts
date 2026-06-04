/* eslint-disable no-console */
import {
  createE2EPrismaClient,
  type E2EPrismaClient,
} from './prisma-client';
import bcrypt from 'bcryptjs';

let prisma: E2EPrismaClient | null = null;

function createPassword(password: string) {
  return {
    hash: bcrypt.hashSync(password, 10),
  };
}

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
  profileId: string;
  teacherUserId: string;
  teacherProfileId: string;
  teacherName: string;
  teacherEmail: string;
  assignmentTypeId: string;
  dailyPagesAssignmentTypeId: string;
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
    data: { id: 'the-connell-school', name: 'The Connell School' },
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
      profiles: {
        create: {
          organizationId: org.id,
          isOwner: true,
          teacherProfile: { create: {} },
        },
      },
    },
    include: { profiles: { include: { teacherProfile: true } } },
  });
  const seededTeacherProfileId = seededTeacher.profiles[0].teacherProfile
    ?.id as string;
  const seededTeacherProfile = seededTeacher.profiles[0];
  await prisma.teacherProfile.update({
    where: { id: seededTeacherProfileId },
    data: { schools: { connect: { id: school.id } } },
  });
  const seededClass = await prisma.class.create({
    data: {
      code: classCode,
      schoolYear: '2024-2025',
      period: '1st',
      grade: '9th',
      schoolId: school.id,
      teachers: { connect: { id: seededTeacherProfileId } },
    },
    select: { id: true },
  });

  // Test users
  const users = [
    {
      email: 'jdoe@brock.software',
      name: 'John Doe',
      password: { create: createPassword('johndoe') },
      profiles: { create: [{ organizationId: org.id, isOwner: false }] },
    },
    {
      email: 'admin.e2e@yawp.test',
      name: 'Admin E2E',
      isAdmin: true,
      password: { create: createPassword('admin-e2e-password') },
      profiles: { create: [{ organizationId: org.id, isOwner: true }] },
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
  const profile = await prisma.profile.findFirstOrThrow({
    where: { userId: user.id },
  });
  // Create a StudentProfile to satisfy FK on AssignmentModuleSession
  const studentProfile = await prisma.studentProfile.create({
    data: {
      profileId: profile.id,
      classes: { connect: { id: seededClass.id } },
    },
  });
  const assignmentType = await prisma.assignmentType.create({
    data: {
      title: 'E2E Course',
      position: 1,
      ownerOrgId: org.id,
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

  await prisma.gradingAssistantTemplate.createMany({
    data: [
      {
        id: 'gait_thesis_current_v1',
        name: 'Thesis-driven essay grading assistant',
        slug: 'thesis-driven-essay-current',
        status: 'active',
        version: 1,
        assignmentTypeKind: 'thesis_driven_essay',
        scoringScale: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
        rubricJson: {
          categories: [
            {
              key: 'thesis_and_content',
              label: 'Thesis/Content',
              description:
                'Original, defensible thesis with sustained critical thinking.',
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
              description: 'Evidence that supports and deepens analysis.',
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
        },
        promptConfigJson: {
          instructionsPreset: 'legacy_thesis_driven_essay',
        },
        outputSchemaJson: {
          schemaVersion: 1,
          responseShape: 'categories_overall_comment',
        },
        calibrationNotes: 'E2E thesis-driven essay template.',
      },
      {
        id: 'gait_act_writing_v1',
        name: 'ACT Writing four-domain grading assistant',
        slug: 'act-writing-four-domain',
        status: 'active',
        version: 1,
        assignmentTypeKind: 'act_writing',
        scoringScale: {
          type: 'act_writing_2_12',
          minScore: 1,
          maxScore: 6,
          compositeMin: 2,
          compositeMax: 12,
        },
        rubricJson: {
          categories: [
            {
              key: 'ideas_and_analysis',
              label: 'Ideas and Analysis',
              description: 'Perspective clarity and relationship analysis.',
              weight: 0.25,
            },
            {
              key: 'development_and_support',
              label: 'Development and Support',
              description: 'Reasoning, examples, and implications.',
              weight: 0.25,
            },
            {
              key: 'organization',
              label: 'Organization',
              description: 'Sequencing, paragraphing, and transitions.',
              weight: 0.25,
            },
            {
              key: 'language_use_and_conventions',
              label: 'Language Use and Conventions',
              description: 'Language and conventions as they affect clarity.',
              weight: 0.25,
            },
          ],
        },
        promptConfigJson: {
          systemInstructions:
            'Grade this as ACT Writing with four rubric domains.',
          scoreInstructions:
            'Scores must be integers 1-6 for each ACT domain.',
        },
        outputSchemaJson: {
          schemaVersion: 1,
          responseShape: 'categories_overall_comment',
        },
        calibrationNotes: 'E2E ACT template.',
      },
    ],
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
      profileId: profile.id,
      studentProfileId: studentProfile.id,
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
      profileId: profile.id,
      studentProfileId: studentProfile.id,
      assignmentTypeId: assignmentType.id,
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
  // Create an assignment so the document appears in the teacher's class view
  const seededAssignment = await prisma.assignment.create({
    data: {
      classId: seededClass.id,
      assignmentTypeId: assignmentType.id,
      title: 'E2E Class Assignment',
      prompt: 'E2E prompt for class assignment.',
    },
    select: { id: true },
  });
  const submittedDoc = await prisma.document.create({
    data: {
      title: submittedDocTitle,
      text: submittedDocText,
      html: submittedDocHtml,
      revision: 3,
      profileId: profile.id,
      studentProfileId: studentProfile.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: seededAssignment.id,
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
      profileId: profile.id,
      studentProfileId: studentProfile.id,
      assignmentTypeId: assignmentType.id,
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
      gradedById: seededTeacherProfile.id,
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
      profileId: seededTeacherProfile.id,
      content: 'Strong thesis statement in the opening sentence.',
      excerpt: 'Education is the foundation of society.',
      occurrence: 1,
    },
  });
  await prisma.submissionComment.create({
    data: {
      submissionId: gradedSubmission.id,
      profileId: seededTeacherProfile.id,
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
      profileId: profile.id,
      studentProfileId: studentProfile.id,
      assignmentTypeId: assignmentType.id,
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
      gradedById: seededTeacherProfile.id,
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
      profileId: seededTeacherProfile.id,
      content: 'Secret teacher note before release.',
      excerpt: 'The first sentence matters',
      occurrence: 1,
    },
  });

  // 5. Feature flag settings
  await prisma.setting.create({
    data: {
      name: 'document_submission_enabled',
      value: 'true',
      valueType: 'boolean',
    },
  });
  await prisma.setting.create({
    data: {
      name: 'document_submission_enabled_school_ids',
      value: school.id,
      valueType: 'string',
    },
  });
  await prisma.setting.create({
    data: {
      name: 'assignments_enabled_org_ids',
      value: org.id,
      valueType: 'string',
    },
  });

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
    profileId: profile.id,
    teacherUserId: seededTeacher.id,
    teacherProfileId: seededTeacherProfileId,
    teacherName: seededTeacherName,
    teacherEmail: seededTeacherEmail,
    assignmentTypeId: assignmentType.id,
    dailyPagesAssignmentTypeId: dailyPagesAssignmentType.id,
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
