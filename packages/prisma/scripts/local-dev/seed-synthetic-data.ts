/* eslint-disable no-console */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { PrismaClient } from '../../generated/prisma';
import { createPassword } from '../utils';
import { getClassArtByIndex } from '../../../../services/web-app/app/utils/class-art.ts';
import { AP_ENGLISH_LIT_LIBRARY_ENTRIES } from '../ap-english-lit-library-data';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  LOCAL_DEV_PERSONAS,
  type LocalDevPersona,
} from './dev-personas';

// Keep in sync with AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY in the web app domain.
// AP Literature is not part of the prod-fidelity fixtures, so it is seeded
// explicitly here to make the course browsable in local dev and previews.
const AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY = 'ap_english_lit_essay';

// Committed course tile image, loaded from the repo so it persists across
// reseeds (the admin-uploaded blob is wiped on every reseed). Drop a file named
// ap-english-literature.{jpg,jpeg,png,webp} in the directory below to set it.
const COURSE_IMAGE_DIR = join(
  import.meta.dir,
  '../../../../services/web-app/public/img/course-images'
);
const IMAGE_CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// Prefer the canonical name, but fall back to any committed image file in the
// folder so a differently-named upload still works.
function loadApEnglishLitCourseImage():
  | { contentType: string; blob: Buffer }
  | null {
  if (!existsSync(COURSE_IMAGE_DIR)) return null;

  const files = readdirSync(COURSE_IMAGE_DIR);
  const imageFiles = files.filter((file) =>
    Object.keys(IMAGE_CONTENT_TYPE_BY_EXT).includes(extname(file).toLowerCase())
  );
  if (imageFiles.length === 0) return null;

  const preferred =
    imageFiles.find((file) =>
      file.toLowerCase().startsWith('ap-english-literature.')
    ) ?? imageFiles.sort()[0];

  return {
    contentType: IMAGE_CONTENT_TYPE_BY_EXT[extname(preferred).toLowerCase()],
    blob: readFileSync(join(COURSE_IMAGE_DIR, preferred)),
  };
}

async function seedApEnglishLitCourseImage(
  prisma: PrismaClient,
  assignmentTypeId: string
): Promise<void> {
  const image = loadApEnglishLitCourseImage();
  await prisma.assignmentTypeImage.deleteMany({ where: { assignmentTypeId } });
  if (!image) return;
  await prisma.assignmentTypeImage.create({
    data: {
      assignmentTypeId,
      contentType: image.contentType,
      blob: image.blob,
    },
  });
}

async function seedApEnglishLitCourse(
  prisma: PrismaClient,
  organizationId: string
): Promise<void> {
  const assignmentType = await prisma.assignmentType.upsert({
    where: { systemKey: AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY },
    update: { archivedAt: null },
    create: {
      title: 'AP English Literature Essay',
      description:
        'Curated AP Lit poetry, prose, and literary-argument practice with 6-point rubric coaching.',
      position: 51,
      systemKey: AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY,
      ownerOrgId: organizationId,
      organizationAssignments: { create: { organizationId } },
      assignmentModules: {
        create: {
          title: 'AP English Literature Essay',
          position: 1,
          description:
            'Write an AP Lit free-response essay with rubric-anchored coaching.',
          instructions: {
            create: {
              title: 'Write',
              prompt:
                'Use the prompt and AP Literature coach to draft your response.',
              position: 1,
              showChatButton: true,
            },
          },
        },
      },
    },
    select: { id: true },
  });

  await prisma.organizationAssignmentType.upsert({
    where: {
      organizationId_assignmentTypeId: {
        organizationId,
        assignmentTypeId: assignmentType.id,
      },
    },
    create: { organizationId, assignmentTypeId: assignmentType.id },
    update: {},
  });

  await seedApEnglishLitCourseImage(prisma, assignmentType.id);

  for (const entry of AP_ENGLISH_LIT_LIBRARY_ENTRIES) {
    const libraryEntry = await prisma.apEnglishLitPromptLibraryEntry.upsert({
      where: { externalKey: entry.externalKey },
      update: {
        assignmentTypeId: assignmentType.id,
        frqType: entry.frqType,
        title: entry.title,
        prompt: entry.prompt,
        focusSkill: entry.focusSkill,
        difficulty: entry.difficulty,
        skillEmphasis: entry.skillEmphasis,
        defaultTimeMode: entry.defaultTimeMode,
        defaultDurationMinutes: entry.defaultDurationMinutes,
        suggestedWorks: entry.suggestedWorks,
        provenanceUrl: entry.provenanceUrl,
        archivedAt: null,
      },
      create: {
        externalKey: entry.externalKey,
        assignmentTypeId: assignmentType.id,
        frqType: entry.frqType,
        title: entry.title,
        prompt: entry.prompt,
        focusSkill: entry.focusSkill,
        difficulty: entry.difficulty,
        skillEmphasis: entry.skillEmphasis,
        defaultTimeMode: entry.defaultTimeMode,
        defaultDurationMinutes: entry.defaultDurationMinutes,
        suggestedWorks: entry.suggestedWorks,
        provenanceUrl: entry.provenanceUrl,
      },
      select: { id: true },
    });

    for (const source of entry.sources) {
      await prisma.apEnglishLitPromptLibrarySource.upsert({
        where: { externalKey: source.externalKey },
        update: {
          promptLibraryEntryId: libraryEntry.id,
          position: source.position,
          title: source.title,
          attribution: source.attribution,
          body: source.body,
          caption: source.caption,
          mediaType: source.mediaType,
          imageUrl: source.imageUrl,
          imageAlt: source.imageAlt,
          provenanceUrl: source.provenanceUrl,
        },
        create: {
          externalKey: source.externalKey,
          promptLibraryEntryId: libraryEntry.id,
          position: source.position,
          title: source.title,
          attribution: source.attribution,
          body: source.body,
          caption: source.caption,
          mediaType: source.mediaType,
          imageUrl: source.imageUrl,
          imageAlt: source.imageAlt,
          provenanceUrl: source.provenanceUrl,
        },
      });
    }
  }
}

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

  await seedApEnglishLitCourse(prisma, LOCAL_DEV_ORG_ID);

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
