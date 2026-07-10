/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { createPassword } from '../utils';

/**
 * Seeds a rich, deterministic dataset for exercising the Yawp Reporter in
 * local dev and preview: a cohort of students across two classes, several
 * graded papers per class, and a released submission per student per paper.
 *
 * Scores follow fixed per-student trajectories (improvers, decliners, steady,
 * volatile) so growth reports and cross-student/cross-paper trends are visible
 * without any randomness — the same seed always produces the same numbers.
 */

const WEEK = 7 * 24 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

type Trajectory = {
  key: string;
  base: number;
  slope: number;
};

// Cycled across students so each cohort has a spread of stories to read.
const TRAJECTORIES: Trajectory[] = [
  { key: 'steady-high', base: 91, slope: 0 },
  { key: 'strong-improver', base: 66, slope: 5 },
  { key: 'gradual-decliner', base: 88, slope: -5 },
  { key: 'slow-starter', base: 58, slope: 6 },
  { key: 'steady-middle', base: 79, slope: 0 },
  { key: 'volatile', base: 75, slope: 1 },
  { key: 'struggling-improver', base: 52, slope: 4 },
  { key: 'high-then-slipping', base: 95, slope: -3 },
];

const PRIMARY_STUDENT_NAMES = [
  'Ava Mitchell',
  'Liam Torres',
  'Sophia Nguyen',
  'Noah Patel',
  'Isabella Rossi',
  'Mason Clark',
  'Mia Johnson',
  'Ethan Wright',
  'Charlotte Kim',
  'Lucas Silva',
  'Amelia Brooks',
  'Benjamin Hayes',
];

const SECONDARY_STUDENT_NAMES = [
  'Harper Lee',
  'Elijah Ford',
  'Layla Ahmed',
  'James Carter',
  'Zoe Bennett',
  'Daniel Ortiz',
  'Chloe Walker',
  'Henry Adams',
];

const PRIMARY_PAPERS = [
  'Personal Narrative: A Turning Point',
  'Argument: Should Phones Be Allowed in School?',
  "Literary Analysis: Symbolism in 'The Scarlet Ibis'",
  'Informative: How a System Works',
  'Research Essay: A Local Issue',
];

const SECONDARY_PAPERS = [
  'Rhetorical Analysis: A Famous Speech',
  'Synthesis: Technology & Society',
  'Literary Analysis: The American Dream in Gatsby',
  'Argument: The Limits of Civil Disobedience',
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Deterministic score for a student on a paper: trajectory + small wiggle. */
function scoreFor(
  studentIndex: number,
  paperIndex: number,
  trajectory: Trajectory
) {
  const wiggle = ((studentIndex * 31 + paperIndex * 17) % 7) - 3; // -3..+3
  const amplitude = trajectory.key === 'volatile' ? 3 : 1;
  return clamp(
    Math.round(
      trajectory.base + trajectory.slope * paperIndex + wiggle * amplitude
    ),
    45,
    100
  );
}

/**
 * Per-rubric-category shaping. Each category starts from the overall score but
 * drifts on its own arc across the unit, so the writing story diverges from the
 * headline grade: analysis gets harder as papers get more demanding, while
 * mechanics tend to firm up. This gives the reporter real "what's going
 * right/wrong with the writing" signal to talk about.
 */
const RUBRIC_PLAN: Array<{
  key: string;
  offset: number;
  driftPerPaper: number;
}> = [
  { key: 'thesis_and_content', offset: 4, driftPerPaper: 0 },
  { key: 'organization_and_structure', offset: 2, driftPerPaper: 0 },
  { key: 'evidence_and_support', offset: -4, driftPerPaper: -4 },
  { key: 'voice_and_style', offset: 5, driftPerPaper: 1 },
  { key: 'grammar_and_mechanics', offset: -1, driftPerPaper: 3 },
];

function to5(pct: number) {
  return clamp(Math.round(pct / 20), 1, 5);
}

function rubricScoresFor(overallPct: number, paperIndex: number) {
  const scores: Record<string, number> = {};
  for (const category of RUBRIC_PLAN) {
    const effective =
      overallPct + category.offset + category.driftPerPaper * paperIndex;
    scores[category.key] = to5(effective);
  }
  return scores;
}

function commentFor(scores: Record<string, number>) {
  const entries = Object.entries(scores);
  const strongest = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const weakest = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  const label = (key: string) =>
    key
      .replace(/_and_/g, ' & ')
      .replace(/_/g, ' ')
      .replace('evidence & support', 'evidence & analysis');
  if (strongest[0] === weakest[0]) {
    return 'Even work across the rubric this time.';
  }
  return `Strongest on ${label(strongest[0])}; ${label(weakest[0])} needs the most attention.`;
}

/**
 * A short, fixed essay whose sentences are labeled by the rubric skill each one
 * exercises, so seeded inline comments and grammar issues can anchor to real
 * substrings the get_submission_detail tool will return. The mechanics sentence
 * carries deliberate errors so there is a genuine grammar issue to surface.
 */
const ESSAY_SENTENCES: Record<string, string> = {
  thesis_and_content:
    'This essay argues that one ordinary afternoon reshaped everything that came after it.',
  organization_and_structure:
    'First the calm, then the break, and finally the long quiet of the aftermath.',
  evidence_and_support:
    'The narrator lingers on the storm, describing the bruised sky and the smell of rain.',
  voice_and_style:
    'The wind screamed through the pines and the whole street held its breath.',
  grammar_and_mechanics:
    'Its clear the writer cared about this piece, they revised it many times.',
};

function essayTextFor(studentName: string): string {
  const opening = `${studentName} — draft submitted for grading.`;
  return [
    opening,
    ESSAY_SENTENCES.thesis_and_content,
    ESSAY_SENTENCES.organization_and_structure,
    ESSAY_SENTENCES.evidence_and_support,
    ESSAY_SENTENCES.voice_and_style,
    ESSAY_SENTENCES.grammar_and_mechanics,
  ].join(' ');
}

const PRAISE_BY_CATEGORY: Record<string, string> = {
  thesis_and_content: 'Clear, arguable thesis — you commit to a real claim here.',
  organization_and_structure:
    'Nice structural signposting; the reader always knows where they are.',
  evidence_and_support:
    'Strong, concrete detail — this is doing real evidentiary work.',
  voice_and_style: 'Lovely image. Your voice is most alive in moments like this.',
  grammar_and_mechanics: 'Clean, controlled sentences throughout.',
};

const PUSH_BY_CATEGORY: Record<string, string> = {
  thesis_and_content:
    'The claim drifts here — what exactly are you arguing? Sharpen it.',
  organization_and_structure:
    'This transition is abrupt. Show the reader how these parts connect.',
  evidence_and_support:
    'You describe the moment but stop short of analyzing it — so what does it mean?',
  voice_and_style: 'This phrasing goes flat. Read it aloud and hear the rhythm.',
  grammar_and_mechanics:
    "“Its” should be “It's,” and this is a comma splice — two sentences fused by a comma.",
};

/**
 * Deterministic teacher margin comments + grammar issues for one submission,
 * anchored to sentences in the seeded essay. Comments target the weakest and
 * strongest rubric skills so the written feedback lines up with the scores.
 */
function writingEvidenceFor(scores: Record<string, number>) {
  const entries = Object.entries(scores);
  const strongest = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const weakest = entries.reduce((a, b) => (b[1] < a[1] ? b : a))[0];

  const comments: Array<{ excerpt: string; content: string }> = [];
  if (ESSAY_SENTENCES[weakest]) {
    comments.push({
      excerpt: ESSAY_SENTENCES[weakest],
      content: PUSH_BY_CATEGORY[weakest],
    });
  }
  if (strongest !== weakest && ESSAY_SENTENCES[strongest]) {
    comments.push({
      excerpt: ESSAY_SENTENCES[strongest],
      content: PRAISE_BY_CATEGORY[strongest],
    });
  }

  const grammarIssues =
    scores.grammar_and_mechanics < 5
      ? [
          {
            id: 'mechanics-1',
            excerpt: ESSAY_SENTENCES.grammar_and_mechanics,
            kind: 'error',
            message:
              "Possessive/contraction slip (“Its” → “It's”) and a comma splice joining two independent clauses.",
          },
        ]
      : [];

  const feedback =
    `Overall: your ${label(strongest)} is carrying this piece, while ` +
    `${label(weakest)} is where the next revision should focus.`;

  return { comments, grammarIssues, feedback };
}

function label(key: string) {
  return key
    .replace(/_and_/g, ' & ')
    .replace(/_/g, ' ')
    .replace('evidence & support', 'evidence & analysis');
}

function letterFor(pct: number) {
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A-';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C-';
  if (pct >= 67) return 'D+';
  if (pct >= 60) return 'D';
  return 'F';
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z]+/g, '.');
}

async function createStudent(
  prisma: PrismaClient,
  organizationId: string,
  name: string
) {
  const user = await prisma.user.create({
    data: {
      email: `dev.student.${slugify(name)}@yawp.local`,
      name,
      password: { create: createPassword('yawp-dev') },
      memberships: { create: { organizationId, role: 'STUDENT' } },
    },
    include: { memberships: true },
  });
  return user.memberships[0]!.id;
}

async function seedClassReportingData(
  prisma: PrismaClient,
  params: {
    classId: string;
    organizationId: string;
    assignmentTypeId: string;
    teacherMembershipId: string;
    studentNames: string[];
    paperTitles: string[];
    now: number;
  }
) {
  const {
    classId,
    organizationId,
    assignmentTypeId,
    teacherMembershipId,
    studentNames,
    paperTitles,
    now,
  } = params;

  const studentMembershipIds = await Promise.all(
    studentNames.map((name) => createStudent(prisma, organizationId, name))
  );

  await prisma.class.update({
    where: { id: classId },
    data: {
      students: { connect: studentMembershipIds.map((id) => ({ id })) },
    },
  });

  // One assignment (paper) per title, each with a class assignment.
  const papers = [];
  for (let p = 0; p < paperTitles.length; p++) {
    const assignment = await prisma.assignment.create({
      data: {
        assignmentTypeId,
        title: paperTitles[p],
        prompt: `Write a polished essay for "${paperTitles[p]}".`,
        submitForGrade: true,
        pointValue: 100,
      },
    });
    const classAssignment = await prisma.classAssignment.create({
      data: { assignmentId: assignment.id, classId },
    });
    papers.push({
      assignmentId: assignment.id,
      classAssignmentId: classAssignment.id,
    });
  }

  let submissionCount = 0;
  for (let s = 0; s < studentMembershipIds.length; s++) {
    const membershipId = studentMembershipIds[s];
    const trajectory = TRAJECTORIES[s % TRAJECTORIES.length];
    for (let p = 0; p < paperTitles.length; p++) {
      const pct = scoreFor(s, p, trajectory);
      const rubricScores = rubricScoresFor(pct, p);
      // Papers spaced two weeks apart; the newest landed ~two weeks ago.
      const submittedAt = new Date(now - (paperTitles.length - p) * 2 * WEEK);
      const gradedAt = new Date(submittedAt.getTime() + 3 * DAY);
      const title = paperTitles[p];
      const text = essayTextFor(studentNames[s]);
      const html = `<p>${text}</p>`;
      const { comments, grammarIssues, feedback } =
        writingEvidenceFor(rubricScores);

      const document = await prisma.document.create({
        data: {
          title,
          text,
          html,
          membershipId,
          assignmentTypeId,
          assignmentId: papers[p].assignmentId,
          classAssignmentId: papers[p].classAssignmentId,
        },
      });
      await prisma.submission.create({
        data: {
          documentId: document.id,
          title,
          text,
          html,
          submittedAt,
          gradedByMembershipId: teacherMembershipId,
          gradedAt,
          numericPercentage: pct,
          overallScore: to5(pct),
          letterGrade: letterFor(pct),
          rubricScores,
          overallComment: commentFor(rubricScores),
          feedback,
          grammarIssues,
          releasedAt: gradedAt,
          comments: {
            create: comments.map((comment) => ({
              content: comment.content,
              excerpt: comment.excerpt,
              membershipId: teacherMembershipId,
            })),
          },
        },
      });
      submissionCount++;
    }
  }

  return { studentCount: studentMembershipIds.length, submissionCount };
}

export async function seedReporterDemoData(
  prisma: PrismaClient,
  params: {
    organizationId: string;
    assignmentTypeId: string;
    teacherMembershipId: string;
    primaryClassId: string;
    secondaryClassId: string;
    now: number;
  }
) {
  const primary = await seedClassReportingData(prisma, {
    classId: params.primaryClassId,
    organizationId: params.organizationId,
    assignmentTypeId: params.assignmentTypeId,
    teacherMembershipId: params.teacherMembershipId,
    studentNames: PRIMARY_STUDENT_NAMES,
    paperTitles: PRIMARY_PAPERS,
    now: params.now,
  });

  const secondary = await seedClassReportingData(prisma, {
    classId: params.secondaryClassId,
    organizationId: params.organizationId,
    assignmentTypeId: params.assignmentTypeId,
    teacherMembershipId: params.teacherMembershipId,
    studentNames: SECONDARY_STUDENT_NAMES,
    paperTitles: SECONDARY_PAPERS,
    now: params.now,
  });

  console.log(
    `📊 Reporter demo: ${primary.studentCount + secondary.studentCount} students, ` +
      `${primary.submissionCount + secondary.submissionCount} released submissions across 2 classes.`
  );
}
