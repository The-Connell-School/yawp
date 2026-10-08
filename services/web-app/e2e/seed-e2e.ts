import { truncateAllPublicTables } from '../../../packages/prisma/scripts/local-dev/truncate-all';
/* eslint-disable no-console */
import { createE2EPrismaClient, type E2EPrismaClient } from './prisma-client';
import { currentSchoolYear } from '../app/utils/school-year';
import { createDeployedAssignment } from './db-helpers';
import { AP_HISTORY_LIBRARY_ENTRIES } from '../../../packages/prisma/scripts/ap-history-library-data';
import { AP_HISTORY_SEED_MODULES } from '../../../packages/prisma/scripts/ap-history-module-data';
import { UNIVERSAL_TUTOR_BLOCK } from '../../../packages/prisma/scripts/universal-tutor-block';
import bcrypt from 'bcryptjs';
import { E2E_UA_ORGANIZATION_ID } from './constants';
import cristoReyHornbuckleRubric from '../app/domain/rubrics/library/cristo-rey-hornbuckle-five-paragraph-essay.json' with { type: 'json' };

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

export async function cleanupDb(prismaClient: Pick<E2EPrismaClient, '$queryRaw' | '$executeRawUnsafe'>) {
  await truncateAllPublicTables(prismaClient);
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
  superAdminUserId: string;
  superAdminEmail: string;
  membershipId: string;
  teacherUserId: string;
  teacherMembershipId: string;
  teacherName: string;
  teacherEmail: string;
  assignmentTypeId: string;
  dailyPagesAssignmentTypeId: string;
  classStarterAssignmentTypeId: string;
  exitTicketAssignmentTypeId: string;
  thesisEssayAssignmentTypeId: string;
  /** Cristo Rey Hornbuckle holistic tier rubric (6 categories, 1–4 bands). */
  holisticEssayAssignmentTypeId: string;
  apHistoryAssignmentTypeId: string;
  /** Assignment type with allowsImageUploads on (the GBA 300 expansion rollout). */
  imageUploadAssignmentTypeId: string;
  /** Student-owned document on that assignment type. */
  imageUploadDocumentId: string;
  apHistoryDbqEntryKey: string;
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
  /** Isolated fixture for grade-privacy smoke (safe to release in that spec only) */
  gradePrivacy: {
    assignmentTypeId: string;
    documentId: string;
    /** Never released; used for unreleased loader privacy assertions */
    submissionId: string;
    /** Released only by grade-privacy E2E; separate from submissionId so retries stay isolated */
    releaseSubmissionId: string;
    unreleasedOverallScore: number;
    unreleasedNumericPercentage: number;
    probeComment: string;
    releaseComment: string;
    dailyPagesAssignmentTypeId: string;
    dailyPagesDocumentId: string;
    dailyPagesUnreleasedOverallScore: number;
  };
  ua: {
    organizationId: string;
    schoolId: string;
    singleClassId: string;
    singleClassCode: string;
    ambiguousClassIds: string[];
    ambiguousClassCode: string;
    paidClassless: {
      userId: string;
      membershipId: string;
      email: string;
      password: string;
    };
    unpaid: {
      userId: string;
      membershipId: string;
      email: string;
      password: string;
    };
    teacher: {
      userId: string;
      membershipId: string;
      email: string;
      password: string;
    };
  };
  /** Kind of writing inside the collaboration pilot. */
  collabAssignmentTypeId: string;
  /** The group's shared draft, already opened, with two writers in it. */
  collabDocumentId: string;
  collabGroupId: string;
  collabClassAssignmentId: string;
  /** The second writer in that group, so two browsers can meet in one draft. */
  secondStudentEmail: string;
  secondStudentPassword: string;
  secondStudentName: string;
  secondStudentMembershipId: string;
};

/** The group's second writer, so two browsers can meet in one draft. */
const SECOND_STUDENT_EMAIL = 'riley.e2e@yawp.test';
const SECOND_STUDENT_PASSWORD = 'riley-e2e-password';
const SECOND_STUDENT_NAME = 'Riley Park';

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
      submissionActivityEnabled: true,
      revisionFlowEnabled: true,
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

  // Deterministic University of Alabama fixtures are deliberately separate from
  // the default organization so enabling the billing gate in E2E cannot change
  // any pre-existing student or teacher journey.
  const uaOrganization = await prisma.organization.create({
    data: {
      id: E2E_UA_ORGANIZATION_ID,
      name: 'University of Alabama',
    },
  });
  const uaSchool = await prisma.school.create({
    data: {
      id: 'ua-e2e-school',
      name: 'UA E2E School',
      code: 'UA-E2E-SCHOOL',
      organizationId: uaOrganization.id,
    },
  });
  const uaSecondSchool = await prisma.school.create({
    data: {
      id: 'ua-e2e-school-two',
      name: 'UA E2E School Two',
      code: 'UA-E2E-SCHOOL-TWO',
      organizationId: uaOrganization.id,
    },
  });
  const uaSingleClassCode = 'UA-SINGLE';
  const uaAmbiguousClassCode = 'UA-MULTI';
  const uaSingleClass = await prisma.class.create({
    data: {
      id: 'ua-e2e-single-class',
      code: uaSingleClassCode,
      schoolYear: currentSchoolYear(),
      period: '1st',
      grade: 'Freshman',
      schoolId: uaSchool.id,
    },
  });
  // Same code in another organization proves the browser flow remains tenant scoped.
  await prisma.class.create({
    data: {
      id: 'non-ua-e2e-colliding-class',
      code: uaSingleClassCode,
      schoolYear: currentSchoolYear(),
      period: '4th',
      grade: '9th',
      schoolId: school.id,
    },
  });
  const uaAmbiguousClasses = await Promise.all([
    prisma.class.create({
      data: {
        id: 'ua-e2e-ambiguous-class-one',
        code: uaAmbiguousClassCode,
        schoolYear: currentSchoolYear(),
        period: '2nd',
        grade: 'Freshman',
        schoolId: uaSchool.id,
      },
    }),
    prisma.class.create({
      data: {
        id: 'ua-e2e-ambiguous-class-two',
        code: uaAmbiguousClassCode,
        schoolYear: currentSchoolYear(),
        period: '3rd',
        grade: 'Freshman',
        schoolId: uaSecondSchool.id,
      },
    }),
  ]);

  const uaPassword = 'ua-e2e-password';
  const prismaClient = prisma;
  const createUaUser = async ({
    id,
    email,
    role,
  }: {
    id: string;
    email: string;
    role: 'STUDENT' | 'TEACHER';
  }) => {
    const user = await prismaClient.user.create({
      data: {
        id,
        email,
        name: email.split('@')[0],
        password: { create: createPassword(uaPassword) },
        memberships: {
          create: {
            id: `${id}-membership`,
            organizationId: uaOrganization.id,
            role,
          },
        },
      },
      include: { memberships: true },
    });
    return {
      userId: user.id,
      membershipId: user.memberships[0]!.id,
      email,
      password: uaPassword,
    };
  };

  const uaPaidClassless = await createUaUser({
    id: 'ua-e2e-paid-classless',
    email: 'ua.paid.classless@yawp.test',
    role: 'STUDENT',
  });
  const uaUnpaid = await createUaUser({
    id: 'ua-e2e-unpaid',
    email: 'ua.unpaid@yawp.test',
    role: 'STUDENT',
  });
  const uaTeacher = await createUaUser({
    id: 'ua-e2e-teacher',
    email: 'ua.teacher@yawp.test',
    role: 'TEACHER',
  });

  await prisma.studentLicense.create({
    data: {
      id: 'ua-e2e-paid-classless-license',
      membershipId: uaPaidClassless.membershipId,
      organizationId: uaOrganization.id,
      cohort: 'ua-2026',
      status: 'ACTIVE',
      source: 'EXISTING_SUBSCRIPTION',
      validUntil: new Date('2027-01-01T06:00:00.000Z'),
      stripeSubscriptionId: 'sub_ua_e2e_existing',
      amountPaid: 5_000,
      currency: 'usd',
    },
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
    {
      email: 'superadmin.e2e@yawp.test',
      name: 'Superadmin E2E',
      isAdmin: true,
      isSuperAdmin: true,
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
  const superAdminUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'superadmin.e2e@yawp.test' },
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

  const classStarterAssignmentType = await prisma.assignmentType.create({
    data: {
      title: 'Class Starter',
      // The soft, effort-based half of the Daily Pages split. Selects the
      // Class Starter engagement rubric for a type that saved none of its own.
      kind: 'class_starter',
      description:
        'Open-ended writing to begin class. Graded on engagement: did the student write, and did they reflect.',
      position: 3,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: [
          {
            title: 'Class Starter',
            position: 1,
            description: 'Short writing to start the period.',
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

  const holisticEssayAssignmentType = await prisma.assignmentType.create({
    data: {
      title: 'In-class Essay/Analysis (Cristo Rey)',
      description:
        'Holy Family Cristo Rey five-paragraph essay with holistic tier scoring.',
      position: 5,
      ownerOrgId: org.id,
      scoringScaleJson: cristoReyHornbuckleRubric.scoringScale,
      rubricJson: cristoReyHornbuckleRubric.rubric,
      gradingPromptConfigJson: cristoReyHornbuckleRubric.promptConfig,
      gradingOutputSchemaJson: {
        ...cristoReyHornbuckleRubric.outputSchema,
        scoringMode: 'holistic_tier',
        teacherNotesEnabled: true,
      },
      gradingCalibrationNotes: cristoReyHornbuckleRubric.calibrationNotes,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: [
          {
            title: 'In-class Essay/Analysis',
            position: 1,
            description: 'Five-paragraph essay or literary analysis.',
            instructions: {
              create: [
                {
                  title: 'Draft',
                  prompt:
                    'Write a five-paragraph essay that answers the prompt with a clear thesis and evidence.',
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

  if (!apHistoryDbqEntry) {
    throw new Error('E2E AP History seed requires a DBQ entry.');
  }

  const apHistoryAssignmentType = await prisma.assignmentType.create({
    data: {
      title: 'AP History Essay',
      systemKey: 'ap_history_essay',
      description: 'Curated APUSH DBQ and LEQ practice.',
      position: 3,
      tutorInstructions: UNIVERSAL_TUTOR_BLOCK,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: AP_HISTORY_SEED_MODULES.map((moduleData) => ({
          title: moduleData.title,
          position: moduleData.position,
          description: moduleData.description,
          tutorInstructions: moduleData.tutorInstructions,
          tutorInstructionsVariantsJson:
            moduleData.tutorInstructionsVariantsJson,
          instructions: {
            create: moduleData.instructions,
          },
        })),
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
  // Assignment type carrying the student-image-upload opt-in, mirroring the
  // GBA 300 expansion report the feature was built for.
  const imageUploadAssignmentType = await prisma.assignmentType.create({
    data: {
      title: 'E2E Expansion Report',
      description: 'Report-style assignment whose students may upload figures.',
      position: 5,
      ownerOrgId: org.id,
      allowsImageUploads: true,
      organizationAssignments: { create: { organizationId: org.id } },
      // A module is not optional decoration: the document route redirects a
      // document whose assignment type has no active modules straight back to
      // /app, so a type seeded without one can never open its editor.
      assignmentModules: {
        create: [
          {
            title: 'Industry Analysis',
            position: 1,
            description: 'Analyze the industry and support it with graphics.',
            instructions: {
              create: [
                {
                  title: 'Draft the section',
                  prompt: 'Write the industry analysis and add your graphics.',
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

  const imageUploadDoc = await prisma.document.create({
    data: {
      title: 'E2E Expansion Report Draft',
      text: 'Industry analysis.',
      html: '<p>Industry analysis.</p>',
      membershipId: membership.id,
      assignmentTypeId: imageUploadAssignmentType.id,
    },
    select: { id: true },
  });

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
      content: 'Your opening sentence gives the reader a clear entry point.',
      excerpt: 'The first sentence matters',
      occurrence: 1,
    },
  });

  const gradePrivacyProbeComment =
    'GRADE_PRIVACY_PROBE_COMMENT must stay hidden until release.';
  const gradePrivacyReleaseComment =
    'GRADE_PRIVACY_RELEASE_COMMENT visible only after release.';
  const { assignment: gradePrivacyAssignment } = await createDeployedAssignment({
    prisma,
    classId: seededClass.id,
    assignmentTypeId: assignmentType.id,
    title: 'E2E grade privacy release',
    prompt: 'Write for the isolated grade-privacy smoke test.',
    pointValue: 100,
  });
  const gradePrivacyDocText =
    'GRADE_PRIVACY_MARKER body for isolated release test.';
  const gradePrivacyDocHtml = `<p>${gradePrivacyDocText}</p>`;
  const gradePrivacyDoc = await prisma.document.create({
    data: {
      title: 'Grade privacy release doc',
      text: gradePrivacyDocText,
      html: gradePrivacyDocHtml,
      revision: 1,
      membershipId: membership.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: gradePrivacyAssignment.id,
      classAssignmentId: seededClassAssignment.id,
    },
    select: { id: true },
  });
  const gradePrivacyUnreleasedOverallScore = 80;
  const gradePrivacyUnreleasedNumericPercentage = 80;
  const gradePrivacySubmission = await prisma.submission.create({
    data: {
      documentId: gradePrivacyDoc.id,
      html: gradePrivacyDocHtml,
      text: gradePrivacyDocText,
      title: 'Grade privacy release submission',
      submittedAt: new Date(),
      gradedByMembershipId: seededTeacherMembership.id,
      gradedAt: new Date(),
      overallScore: gradePrivacyUnreleasedOverallScore,
      numericPercentage: gradePrivacyUnreleasedNumericPercentage,
      score: '80/100',
      releasedAt: null,
    },
    select: { id: true },
  });
  await prisma.submissionComment.create({
    data: {
      submissionId: gradePrivacySubmission.id,
      membershipId: seededTeacherMembership.id,
      content: gradePrivacyProbeComment,
      excerpt: 'GRADE_PRIVACY_PROBE',
      occurrence: 1,
    },
  });
  const gradePrivacyReleaseDocText =
    'GRADE_PRIVACY_RELEASE_MARKER body for release-only smoke test.';
  const gradePrivacyReleaseDocHtml = `<p>${gradePrivacyReleaseDocText}</p>`;
  const gradePrivacyReleaseDoc = await prisma.document.create({
    data: {
      title: 'Grade privacy release-only doc',
      text: gradePrivacyReleaseDocText,
      html: gradePrivacyReleaseDocHtml,
      revision: 1,
      membershipId: membership.id,
      assignmentTypeId: assignmentType.id,
      assignmentId: gradePrivacyAssignment.id,
      classAssignmentId: seededClassAssignment.id,
    },
    select: { id: true },
  });
  const gradePrivacyReleaseSubmission = await prisma.submission.create({
    data: {
      documentId: gradePrivacyReleaseDoc.id,
      html: gradePrivacyReleaseDocHtml,
      text: gradePrivacyReleaseDocText,
      title: 'Grade privacy release-only submission',
      submittedAt: new Date(),
      gradedByMembershipId: seededTeacherMembership.id,
      gradedAt: new Date(),
      overallScore: 80,
      numericPercentage: 80,
      score: '80/100',
      releasedAt: null,
    },
    select: { id: true },
  });
  await prisma.submissionComment.create({
    data: {
      submissionId: gradePrivacyReleaseSubmission.id,
      membershipId: seededTeacherMembership.id,
      content: gradePrivacyReleaseComment,
      excerpt: 'GRADE_PRIVACY_RELEASE_MARKER',
      occurrence: 1,
    },
  });
  await prisma.assignmentModuleSession.create({
    data: {
      assignmentModuleId: modulesByPosition[0].id,
      documentId: gradePrivacyDoc.id,
      title: 'E2E Grade Privacy Session',
      instructionsCompleted: 0,
    },
  });
  await prisma.assignmentModuleSession.create({
    data: {
      assignmentModuleId: modulesByPosition[0].id,
      documentId: gradePrivacyReleaseDoc.id,
      title: 'E2E Grade Privacy Release Session',
      instructionsCompleted: 0,
    },
  });

  const dailyPagesModule = await prisma.assignmentModule.findFirst({
    where: { assignmentTypeId: dailyPagesAssignmentType.id },
    select: { id: true },
  });
  const { assignment: dailyPagesPrivacyAssignment } =
    await createDeployedAssignment({
      prisma,
      classId: seededClass.id,
      assignmentTypeId: dailyPagesAssignmentType.id,
      title: 'E2E Daily Pages grade privacy',
      prompt: 'Daily Pages row for overallScore leak checks.',
    });
  const dailyPagesPrivacyText = 'Daily Pages grade privacy marker paragraph.';
  const dailyPagesPrivacyHtml = `<p>${dailyPagesPrivacyText}</p>`;
  const dailyPagesPrivacyDoc = await prisma.document.create({
    data: {
      title: 'Daily Pages grade privacy doc',
      text: dailyPagesPrivacyText,
      html: dailyPagesPrivacyHtml,
      revision: 1,
      membershipId: membership.id,
      assignmentTypeId: dailyPagesAssignmentType.id,
      assignmentId: dailyPagesPrivacyAssignment.id,
      classAssignmentId: seededClassAssignment.id,
    },
    select: { id: true },
  });
  const dailyPagesPrivacyOverallScore = 44;
  await prisma.submission.create({
    data: {
      documentId: dailyPagesPrivacyDoc.id,
      html: dailyPagesPrivacyHtml,
      text: dailyPagesPrivacyText,
      title: 'Daily Pages grade privacy submission',
      submittedAt: new Date(),
      gradedByMembershipId: seededTeacherMembership.id,
      gradedAt: new Date(),
      overallScore: dailyPagesPrivacyOverallScore,
      releasedAt: null,
    },
  });
  if (dailyPagesModule) {
    await prisma.assignmentModuleSession.create({
      data: {
        assignmentModuleId: dailyPagesModule.id,
        documentId: dailyPagesPrivacyDoc.id,
        title: 'E2E Daily Pages Privacy Session',
        instructionsCompleted: 0,
      },
    });
  }

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

  // 7. A shared draft with two writers in it.
  //
  // Both roads to a collaborative room converge on a DocumentGroup, and this is
  // the teacher's one: an assignment with collaboration on, a group with its
  // members, and `openedAt` set, which is what makes the document a live room
  // rather than an ordinary draft. Built directly rather than through the
  // arrange/open endpoints so the fixture states the shape it needs instead of
  // depending on the UI that produces it.
  const collabAssignmentType = await prisma.assignmentType.create({
    data: {
      title: 'E2E Group Writing',
      position: 5,
      ownerOrgId: org.id,
      collaborationSupported: true,
      // Owning the type is not the same as offering it. Without this row the
      // type is invisible to the students enrolled in the org, their course page
      // 404s, and a test that only asserts a link is absent passes for the wrong
      // reason — which is exactly what happened.
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: [{ title: 'E2E Group Module', position: 1 }],
      },
    },
    select: { id: true },
  });

  const {
    assignment: collabAssignment,
    classAssignment: collabClassAssignment,
  } = await createDeployedAssignment({
    prisma,
    classId: seededClass.id,
    assignmentTypeId: collabAssignmentType.id,
    title: 'E2E Group Assignment',
    prompt: 'Write this one together.',
  });
  await prisma.assignment.update({
    where: { id: collabAssignment.id },
    data: { collaborationEnabled: true, collaborationGroupMode: 'teacher' },
  });

  const secondStudent = await prisma.user.create({
    data: {
      email: SECOND_STUDENT_EMAIL,
      name: SECOND_STUDENT_NAME,
      password: { create: createPassword(SECOND_STUDENT_PASSWORD) },
      memberships: {
        create: [
          {
            organizationId: org.id,
            isOrgOwner: false,
            role: 'STUDENT' as const,
            classesAsStudent: { connect: { id: seededClass.id } },
          },
        ],
      },
    },
    include: { memberships: true },
  });
  const secondStudentMembership = secondStudent.memberships[0];

  // The ownership graph is enforced by deferred database triggers: neither the
  // document nor the group is valid on its own, but the pair is valid at commit.
  // Keep fixture creation inside the same transaction as production finalization.
  const { collabDoc, collabGroup } = await prisma.$transaction(async (tx) => {
    const collabDoc = await tx.document.create({
      data: {
        title: 'E2E Shared Draft',
        text: '',
        html: '<p></p>',
        artifactKind: 'ASSIGNMENT_GROUP',
        membershipId: null,
        assignmentTypeId: collabAssignmentType.id,
        assignmentId: collabAssignment.id,
        classAssignmentId: collabClassAssignment.id,
      },
      select: { id: true },
    });

    const collabGroup = await tx.documentGroup.create({
      data: {
        kind: 'assignment',
        classAssignmentId: collabClassAssignment.id,
        label: 'Group 1',
        ordinal: 0,
        // Opened and already seeded: an empty room needs no seeding, and stamping
        // it keeps the server from copying an empty document into itself.
        openedAt: new Date(),
        seededAt: new Date(),
        documentId: collabDoc.id,
        members: {
          create: [
            { membershipId: membership.id },
            { membershipId: secondStudentMembership.id },
          ],
        },
      },
      select: { id: true },
    });

    return { collabDoc, collabGroup };
  });

  await seedFreeClassroomForE2E(prisma);

  await prisma.setting.upsert({
    where: { name: 'feature_flag.lesson_planner' },
    create: {
      name: 'feature_flag.lesson_planner',
      value: 'true',
      valueType: 'boolean',
      description: 'Enabled for E2E',
    },
    update: { value: 'true', updatedAt: new Date() },
  });

  return {
    organizationId: org.id,
    schoolId: school.id,
    classId: seededClass.id,
    classCode,
    userId: user.id,
    userEmail: user.email!,
    adminUserId: adminUser.id,
    adminEmail: adminUser.email!,
    superAdminUserId: superAdminUser.id,
    superAdminEmail: superAdminUser.email,
    membershipId: membership.id,
    teacherUserId: seededTeacher.id,
    teacherMembershipId: seededTeacherMembershipId,
    teacherName: seededTeacherName,
    teacherEmail: seededTeacherEmail,
    assignmentTypeId: assignmentType.id,
    dailyPagesAssignmentTypeId: dailyPagesAssignmentType.id,
    classStarterAssignmentTypeId: classStarterAssignmentType.id,
    exitTicketAssignmentTypeId: exitTicketAssignmentType.id,
    thesisEssayAssignmentTypeId: thesisEssayAssignmentType.id,
    holisticEssayAssignmentTypeId: holisticEssayAssignmentType.id,
    apHistoryAssignmentTypeId: apHistoryAssignmentType.id,
    imageUploadAssignmentTypeId: imageUploadAssignmentType.id,
    imageUploadDocumentId: imageUploadDoc.id,
    apHistoryDbqEntryKey: apHistoryDbqEntry.externalKey,
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
    gradePrivacy: {
      assignmentTypeId: assignmentType.id,
      documentId: gradePrivacyDoc.id,
      submissionId: gradePrivacySubmission.id,
      releaseSubmissionId: gradePrivacyReleaseSubmission.id,
      unreleasedOverallScore: gradePrivacyUnreleasedOverallScore,
      unreleasedNumericPercentage: gradePrivacyUnreleasedNumericPercentage,
      probeComment: gradePrivacyProbeComment,
      releaseComment: gradePrivacyReleaseComment,
      dailyPagesAssignmentTypeId: dailyPagesAssignmentType.id,
      dailyPagesDocumentId: dailyPagesPrivacyDoc.id,
      dailyPagesUnreleasedOverallScore: dailyPagesPrivacyOverallScore,
    },
    ua: {
      organizationId: uaOrganization.id,
      schoolId: uaSchool.id,
      singleClassId: uaSingleClass.id,
      singleClassCode: uaSingleClassCode,
      ambiguousClassIds: uaAmbiguousClasses.map((klass) => klass.id),
      ambiguousClassCode: uaAmbiguousClassCode,
      paidClassless: uaPaidClassless,
      unpaid: uaUnpaid,
      teacher: uaTeacher,
    },
    collabAssignmentTypeId: collabAssignmentType.id,
    collabDocumentId: collabDoc.id,
    collabGroupId: collabGroup.id,
    collabClassAssignmentId: collabClassAssignment.id,
    secondStudentEmail: SECOND_STUDENT_EMAIL,
    secondStudentPassword: SECOND_STUDENT_PASSWORD,
    secondStudentName: SECOND_STUDENT_NAME,
    secondStudentMembershipId: secondStudentMembership.id,
  };
}

async function seedFreeClassroomForE2E(client: E2EPrismaClient) {
  const { seedFreeTierBundleAssignmentTypes } = await import(
    '../../../packages/prisma/scripts/seed-free-tier-bundle-assignment-types'
  );
  const { ensurePreviewFreeClassroomFixture } = await import(
    '../../../packages/prisma/scripts/local-dev/seed-preview-free-classroom'
  );
  await seedFreeTierBundleAssignmentTypes(client);
  await ensurePreviewFreeClassroomFixture(client);
  process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL =
    'dev.teacher.free@yawp.local';
}

// Note: this module is imported by the E2E prepare script, not run directly.
