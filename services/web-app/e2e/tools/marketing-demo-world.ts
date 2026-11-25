/**
 * The demo class for the marketing recordings (record-marketing-demos.ts):
 * English 10, Period 3, taught by Ms. Rivera, with eighteen students and a
 * Gatsby essay at every stage, so class pages, grading tabs and summaries look
 * like a real classroom instead of an e2e fixture.
 *
 * Every quotation from The Great Gatsby in these essays is real. The students,
 * their writing and their grades are invented.
 */
import { createE2EPrismaClient } from '../prisma-client';
import { createDeployedAssignment } from '../db-helpers';
import type { E2EContext } from '../seed-e2e';

export const WORLD_ESSAY_TITLE = 'Is Gatsby Great?';
export const WORLD_ESSAY_PROMPT =
  'Is Jay Gatsby “great”? Take a position and defend it with evidence from the novel.';

type Stage = 'in_progress' | 'needs_grading' | 'graded' | 'released';

type Essay = { paragraphs: string[] };

/** Maya's essay lives in the recorder; these are her classmates'. */
const ESSAYS: Record<string, Essay> = {
  hope: {
    paragraphs: [
      'Jay Gatsby is great because he never gives up on his dream. He works his whole life to become rich so he can win Daisy back.',
      'Gatsby throws huge parties every weekend hoping Daisy will walk in. Nick says Gatsby has “an extraordinary gift for hope.” Not many people would do that much for love.',
      'In conclusion, Gatsby is great because he believes in his dream more than anyone else in the book.',
    ],
  },
  performance: {
    paragraphs: [
      'Fitzgerald’s title is ironic. Gatsby is impressive, but impressive is not the same as great.',
      'Gatsby builds his whole identity on a story. He was born James Gatz and invented Jay Gatsby out of “his Platonic conception of himself.” He tells Nick he went to Oxford and that his family is wealthy and dead, and almost none of it holds up.',
      'A great person would be honest about who they are. Gatsby is a performance, and when the performance ends, there is nothing left.',
    ],
  },
  careless: {
    paragraphs: [
      'Gatsby is a great character but not a great man. He loves Daisy so much that he forgets everyone else, he even lets Daisy drive his car after the hotel. When Myrtle is killed he only cares about protecting Daisy.',
      'Tom and Daisy are the real villans of the story. Nick says they “smashed up things and creatures and then retreated back into their money.” Compared to them Gatsby seems better, but he still broke the law to get rich.',
      'So Gatsby is great compared to the people around him, but not great on his own.',
    ],
  },
  greenLight: {
    paragraphs: [
      'Gatsby’s greatness is his hope. In a book full of people who believe in nothing, Gatsby believes in something completely.',
      'The green light at the end of Daisy’s dock stands for that hope. Night after night he reaches toward it from across the bay. At the end of the novel Nick says simply that “Gatsby believed in the green light.” That belief is what separates him from Tom, Daisy, and Jordan.',
      'His dream fails, but the dream itself is what makes him great.',
    ],
  },
  crime: {
    paragraphs: [
      'Gatsby is not great, because everything he has comes from crime. Tom finds out that Gatsby and Meyer Wolfshiem bought drug stores and “sold grain alcohol over the counter.”',
      'Gatsby uses that money to impress Daisy. He shows her his house and his shirts, but he never tells her the truth about where any of it came from.',
      'A great man would not need to hide his past.',
    ],
  },
  illusion: {
    paragraphs: [
      'In The Great Gatsby, the word “great” is a question, not an answer. Gatsby is great the way a magician is great: everything is an illusion.',
      'His parties are full of strangers who never meet him. Even his library is a set. The books are real, but the man known as Owl Eyes notices that the pages have never been cut.',
      'By the end the illusion is gone. Almost no one comes to his funeral, and Gatsby turns out to be the loneliest man in the book.',
    ],
  },
};

type Student = {
  name: string;
  essay?: keyof typeof ESSAYS;
  stage: Stage;
  percentage?: number;
  comment?: string;
};

/** The class, in roll order. Maya Torres is the e2e student; the rest are made here. */
export const CLASSMATES: Student[] = [
  { name: 'Jordan Ellis', essay: 'hope', stage: 'needs_grading' },
  {
    name: 'Priya Shah',
    essay: 'performance',
    stage: 'released',
    percentage: 94,
    comment:
      'Priya, “impressive is not the same as great” is a thesis worth an essay. Your Oxford evidence is exactly right.',
  },
  { name: 'Marcus Webb', essay: 'careless', stage: 'needs_grading' },
  {
    name: 'Ava Nguyen',
    essay: 'greenLight',
    stage: 'released',
    percentage: 91,
    comment:
      'Ava, a confident argument with a well-placed final quotation. Push the analysis of the light a step further.',
  },
  {
    name: 'Elijah Brooks',
    essay: 'crime',
    stage: 'graded',
    percentage: 82,
    comment:
      'Elijah, strong evidence from Tom. Now explain why hiding the past keeps Gatsby from greatness.',
  },
  {
    name: 'Sofia Ramirez',
    essay: 'illusion',
    stage: 'released',
    percentage: 96,
    comment:
      'Sofia, the magician image carries the whole essay. The library detail is a perfect choice.',
  },
  {
    name: 'Liam Carter',
    essay: 'hope',
    stage: 'graded',
    percentage: 78,
    comment:
      'Liam, you take a clear side. Add a second piece of evidence to each paragraph.',
  },
  {
    name: 'Zoe Kim',
    essay: 'greenLight',
    stage: 'graded',
    percentage: 88,
    comment:
      'Zoe, a clear position and a well-chosen symbol. Explain the quotation in your own words.',
  },
  {
    name: 'Noah Patel',
    essay: 'crime',
    stage: 'released',
    percentage: 84,
    comment:
      'Noah, good use of Tom’s accusation. Your conclusion needs one more sentence of reasoning.',
  },
  { name: 'Isabella Reyes', essay: 'crime', stage: 'needs_grading' },
  { name: 'Ethan Johnson', essay: 'illusion', stage: 'needs_grading' },
  { name: 'Chloe Martin', essay: 'performance', stage: 'needs_grading' },
  {
    name: 'Daniel Okafor',
    essay: 'performance',
    stage: 'released',
    percentage: 90,
    comment:
      'Daniel, sharp reading of Gatsby’s invented past. Watch your comma splices.',
  },
  {
    name: 'Grace Liu',
    essay: 'greenLight',
    stage: 'released',
    percentage: 87,
    comment:
      'Grace, the green light is a strong choice. Tie each paragraph back to your thesis.',
  },
  { name: 'Mateo Garcia', essay: 'hope', stage: 'in_progress' },
  { name: 'Hannah Cohen', essay: 'illusion', stage: 'in_progress' },
  { name: 'Caleb Wright', essay: 'careless', stage: 'in_progress' },
];

const letter = (p: number) =>
  p >= 93
    ? 'A'
    : p >= 90
      ? 'A-'
      : p >= 87
        ? 'B+'
        : p >= 83
          ? 'B'
          : p >= 80
            ? 'B-'
            : p >= 77
              ? 'C+'
              : 'C';
const scores = (p: number) => {
  const s = (shift: number) =>
    Math.max(2, Math.min(5, Math.round((p / 100) * 5 + shift)));
  return {
    thesis_and_content: s(0.3),
    organization_and_structure: s(0),
    evidence_and_support: s(-1.3),
    voice_and_style: s(0.1),
    grammar_and_mechanics: s(-0.2),
  };
};
const html = (paragraphs: string[]) =>
  paragraphs.map((p) => `<p>${p}</p>`).join('');
const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '.');

export type DemoWorld = {
  essayAssignmentId: string;
  essayClassAssignmentId: string;
  /** Submission ids by student name, for students who have submitted. */
  submissions: Record<string, string>;
};

/**
 * Builds the class once per database: students, their memberships, and the
 * Gatsby essay with every student's document at their stage. Safe to call on
 * every run; it finds what an earlier run made.
 */
export async function buildDemoWorld(
  ctx: E2EContext,
  mayaEssay: string[]
): Promise<DemoWorld> {
  const prisma = createE2EPrismaClient();
  try {
    const existing = await prisma.classAssignment.findFirst({
      where: {
        classId: ctx.classId,
        assignment: {
          title: WORLD_ESSAY_TITLE,
          prompt: WORLD_ESSAY_PROMPT,
          pointValue: 100,
        },
      },
      select: { id: true, assignmentId: true },
    });
    // The e2e fixtures' own submissions would sit in the grading queue between
    // the demo class's essays; archive the ungraded ones.
    await prisma.submission.updateMany({
      where: {
        archivedAt: null,
        gradedAt: null,
        document: {
          membershipId: ctx.membershipId,
          NOT: { assignment: { title: WORLD_ESSAY_TITLE } },
        },
      },
      data: { archivedAt: new Date() },
    });
    if (existing) {
      const subs = await prisma.submission.findMany({
        where: { document: { classAssignmentId: existing.id } },
        select: {
          id: true,
          document: {
            select: {
              membership: { select: { user: { select: { name: true } } } },
            },
          },
        },
      });
      return {
        essayAssignmentId: existing.assignmentId,
        essayClassAssignmentId: existing.id,
        submissions: Object.fromEntries(
          subs.map((s) => [s.document.membership?.user.name ?? '', s.id])
        ),
      };
    }

    // The e2e class has one more seeded student (Riley Park); keep them, they have no essay.
    const { assignment, classAssignment } = await createDeployedAssignment({
      prisma,
      classId: ctx.classId,
      assignmentTypeId: ctx.thesisEssayAssignmentTypeId,
      title: WORLD_ESSAY_TITLE,
      prompt: WORLD_ESSAY_PROMPT,
      pointValue: 100,
    });
    const submissions: Record<string, string> = {};
    const base = Date.now() - 3 * 86_400_000;

    const roster: (Student & { membershipId: string; paragraphs: string[] })[] =
      [];
    roster.push({
      name: 'Maya Torres',
      stage: 'needs_grading',
      membershipId: ctx.membershipId,
      paragraphs: mayaEssay,
    });
    for (const student of CLASSMATES) {
      const user = await prisma.user.create({
        data: {
          email: `${slug(student.name)}@demo.yawp.test`,
          name: student.name,
          memberships: {
            create: [
              {
                organizationId: ctx.organizationId,
                role: 'STUDENT',
                isOrgOwner: false,
              },
            ],
          },
        },
        select: { memberships: { select: { id: true } } },
      });
      const membershipId = user.memberships[0]!.id;
      await prisma.class.update({
        where: { id: ctx.classId },
        data: { students: { connect: { id: membershipId } } },
      });
      roster.push({
        ...student,
        membershipId,
        paragraphs: ESSAYS[student.essay!]!.paragraphs,
      });
    }

    for (const [i, student] of roster.entries()) {
      const paragraphs =
        student.stage === 'in_progress'
          ? student.paragraphs.slice(0, 1)
          : student.paragraphs;
      const text = paragraphs.join('\n\n');
      const document = await prisma.document.create({
        data: {
          title: WORLD_ESSAY_TITLE,
          text,
          html: html(paragraphs),
          membershipId: student.membershipId,
          assignmentTypeId: ctx.thesisEssayAssignmentTypeId,
          assignmentId: assignment.id,
          classAssignmentId: classAssignment.id,
        },
        select: { id: true },
      });
      if (student.stage === 'in_progress') continue;
      const submittedAt = new Date(base + i * 37 * 60_000);
      const graded = student.stage === 'graded' || student.stage === 'released';
      const p = student.percentage ?? 0;
      const submission = await prisma.submission.create({
        data: {
          documentId: document.id,
          title: WORLD_ESSAY_TITLE,
          text,
          html: html(paragraphs),
          submittedAt,
          ...(graded
            ? {
                gradedByMembershipId: ctx.teacherMembershipId,
                gradedAt: new Date(submittedAt.getTime() + 86_400_000),
                numericPercentage: p,
                letterGrade: letter(p),
                score: `${p}% (${letter(p)})`,
                overallScore: Math.round(p / 20),
                overallComment: student.comment,
                rubricScores: scores(p),
                releasedAt:
                  student.stage === 'released'
                    ? new Date(submittedAt.getTime() + 2 * 86_400_000)
                    : null,
              }
            : {}),
        },
        select: { id: true },
      });
      submissions[student.name] = submission.id;
    }
    return {
      essayAssignmentId: assignment.id,
      essayClassAssignmentId: classAssignment.id,
      submissions,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Deletes rows and everything that points at them, following the schema's
 * foreign keys. Only for this disposable e2e database: the recordings make
 * throwaway assignments, and this keeps them out of the class pages.
 */
async function deleteDeep(
  prisma: ReturnType<typeof createE2EPrismaClient>,
  table: string,
  ids: string[],
  seen = new Set<string>()
) {
  if (ids.length === 0) return;
  const refs = await prisma.$queryRawUnsafe<
    { child: string; col: string; nullable: string }[]
  >(
    `SELECT tc.table_name AS child, kcu.column_name AS col, c.is_nullable AS nullable
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       JOIN information_schema.columns c ON c.table_name = tc.table_name AND c.column_name = kcu.column_name AND c.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = $1 AND ccu.column_name = 'id' AND tc.table_schema = 'public'`,
    table
  );
  for (const ref of refs) {
    const key = `${ref.child}.${ref.col}`;
    if (seen.has(key) && ref.child === table) continue;
    if (
      ref.nullable === 'YES' &&
      ![
        'documentId',
        'submissionId',
        'assignmentId',
        'classAssignmentId',
      ].includes(ref.col)
    ) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${ref.child}" SET "${ref.col}" = NULL WHERE "${ref.col}" = ANY($1)`,
        ids
      );
      continue;
    }
    const children = await prisma
      .$queryRawUnsafe<
        { id: string }[]
      >(`SELECT id::text AS id FROM "${ref.child}" WHERE "${ref.col}" = ANY($1)`, ids)
      .catch(() => null);
    if (children === null) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "${ref.child}" WHERE "${ref.col}" = ANY($1)`,
        ids
      );
      continue;
    }
    await deleteDeep(
      prisma,
      ref.child,
      children.map((c) => c.id),
      new Set([...seen, key])
    );
  }
  await prisma.$executeRawUnsafe(
    `DELETE FROM "${table}" WHERE id = ANY($1)`,
    ids
  );
}

/** Removes the assignments the recordings made for one take (everything but the demo class's own). */
export async function discardTakeAssignments(
  ctx: E2EContext,
  keepAssignmentIds: string[]
) {
  const prisma = createE2EPrismaClient();
  try {
    // Everything made after the demo class's own essay was made by a take.
    const world = await prisma.assignment.findMany({
      where: { id: { in: keepAssignmentIds } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const since = world[0]?.createdAt ?? new Date();
    const takes = await prisma.assignment.findMany({
      where: {
        id: { notIn: [ctx.assignmentId, ...keepAssignmentIds] },
        createdAt: { gt: since },
      },
      select: { id: true },
    });
    await deleteDeep(
      prisma,
      'Assignment',
      takes.map((a) => a.id)
    );
  } finally {
    await prisma.$disconnect();
  }
}
