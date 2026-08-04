/**
 * Builds the local-dev demo roster: two full classes of students, a semester of
 * assignments, and the graded work underneath them.
 *
 * This module is pure — it takes a clock and returns a plan. `seed-demo-roster`
 * writes that plan to the database. Keeping the two apart means the grade math,
 * the growth arcs, and the essay generation are unit-testable without Postgres,
 * and the same plan can be replayed deterministically.
 *
 * Why it exists: the old dev seed had four students and two assignments, which
 * is not enough data for Class Summary (needs a spread of rubric levels across
 * a class) or Reporter (needs several graded, released papers per student, over
 * time, moving in different directions).
 */
import {
  rubricCategories,
  type RubricKey,
} from '../../../../services/web-app/app/domain/grading/rubric.ts';
import {
  computeWeightedPercentage,
  letterFromPercent,
} from '../../../../services/web-app/app/domain/grading/gradeMath.ts';
import {
  CATEGORY_COMMENTS,
  DEMO_ROSTER_ASSIGNMENTS,
  DEMO_ROSTER_CLASSES,
  DEMO_ROSTER_STUDENTS,
  ESSAY_POOLS,
  FREE_WRITE_POOLS,
  INLINE_COMMENTS,
  OVERALL_COMMENTS,
  type DemoArc,
  type DemoAssignmentSpec,
  type DemoClassKey,
  type DemoClassSpec,
  type DemoStudentSpec,
  type DemoTopic,
} from './demo-roster-content';

export {
  DEMO_ROSTER_ASSIGNMENTS,
  DEMO_ROSTER_CLASSES,
  DEMO_ROSTER_STUDENTS,
} from './demo-roster-content';
export type {
  DemoArc,
  DemoAssignmentSpec,
  DemoAssignmentState,
  DemoClassKey,
  DemoClassSpec,
  DemoExistingAssignmentKey,
  DemoStudentSpec,
} from './demo-roster-content';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type DemoWorkState = 'in-progress' | 'submitted' | 'graded' | 'released';

export type DemoRubricScores = Record<
  RubricKey,
  { score: number; comment: string }
>;

export type DemoInlineComment = {
  content: string;
  excerpt: string;
  occurrence: number;
};

export type DemoWorkPlan = {
  studentKey: string;
  assignmentKey: string;
  classKey: DemoClassKey;
  documentTitle: string;
  text: string;
  html: string;
  state: DemoWorkState;
  createdAt: Date;
  submittedAt: Date | null;
  gradedAt: Date | null;
  releasedAt: Date | null;
  rubricScores: DemoRubricScores | null;
  overallScore: number | null;
  overallComment: string | null;
  numericPercentage: number | null;
  letterGrade: string | null;
  inlineComments: DemoInlineComment[];
};

export type DemoAssignmentPlan = DemoAssignmentSpec & {
  assignedAt: Date;
  dueAt: Date;
};

export type DemoGrowthPlan = {
  studentKey: string;
  classKey: DemoClassKey;
  focus: string;
  targetSkills: string[];
  body: string;
  baseline: {
    averagePercentage: number;
    rubricLevels: Record<string, number>;
    capturedAt: string;
  };
  createdAt: Date;
  checkInAt: Date;
};

export type DemoRosterPlan = {
  students: DemoStudentSpec[];
  assignments: DemoAssignmentPlan[];
  work: DemoWorkPlan[];
  growthPlans: DemoGrowthPlan[];
};

/* -------------------------------------------------------------------------- */
/* Deterministic randomness                                                    */
/* -------------------------------------------------------------------------- */

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32, seeded by string, so a given seed always yields the same run. */
function createRandom(seed: string): () => number {
  let state = hashString(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[Math.floor(createRandom(seed)() * items.length) % items.length];
}

/** A stable value in [-spread, spread] for the given seed. */
function jitter(seed: string, spread: number): number {
  return (createRandom(seed)() * 2 - 1) * spread;
}

function chance(seed: string, probability: number): boolean {
  return createRandom(seed)() < probability;
}

/* -------------------------------------------------------------------------- */
/* Growth arcs                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How far a student's rubric level sits from their baseline on the nth graded
 * paper. These are deliberately blunt: the point is that a teacher opening
 * Reporter sees students who are clearly climbing, clearly sliding, and clearly
 * stuck, rather than forty students hovering at a B-minus.
 */
function arcOffset(arc: DemoArc, index: number, count: number): number {
  const progress = count > 1 ? index / (count - 1) : 0;
  switch (arc) {
    case 'rising':
      return -1 + 2 * progress;
    case 'late-bloomer':
      return progress < 0.6 ? -0.6 : -0.6 + 2.2 * ((progress - 0.6) / 0.4);
    case 'steady-high':
      return 0.15;
    case 'steady-mid':
      return 0;
    case 'slipping':
      return 0.9 - 2.1 * progress;
    case 'struggling':
      return -0.3 + 0.4 * progress;
    case 'volatile':
      return index % 2 === 0 ? 0.8 : -0.8;
  }
}

function clampLevel(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

const CLASS_BY_KEY = new Map<DemoClassKey, DemoClassSpec>(
  DEMO_ROSTER_CLASSES.map((klass) => [klass.key, klass])
);

function categoryOffset(student: DemoStudentSpec, category: RubricKey): number {
  let offset = 0;
  if (category === student.strength) offset += 0.7;
  if (category === student.weakness) offset -= 0.9;

  // Individual strengths and weaknesses cancel out across a class, which leaves
  // every rubric skill averaging the same 3.2 — so "which skill is my class
  // weakest in?" has no answer. A per-class tilt gives each class a real gap to
  // teach into, and a different one from the other class.
  const profile = CLASS_BY_KEY.get(student.classKey)!.skillProfile;
  if (category === profile.strong) offset += 0.35;
  if (category === profile.weak) offset -= 0.55;

  return offset;
}

function buildRubricScores(
  student: DemoStudentSpec,
  assignment: DemoAssignmentSpec,
  index: number,
  count: number
): DemoRubricScores {
  const arc = arcOffset(student.arc, index, count);
  const scores = {} as DemoRubricScores;

  for (const category of rubricCategories) {
    const key = category.key;
    const level = clampLevel(
      student.baseline +
        arc +
        categoryOffset(student, key) +
        jitter(`${student.key}:${assignment.key}:${key}`, 0.4)
    );

    let comment = '';
    if (key === student.weakness && level <= 3) {
      comment = pick(
        CATEGORY_COMMENTS[key].weak,
        `${student.key}:${assignment.key}:weak`
      );
    } else if (key === student.strength && level >= 4) {
      comment = pick(
        CATEGORY_COMMENTS[key].strong,
        `${student.key}:${assignment.key}:strong`
      );
    }

    scores[key] = { score: level, comment };
  }

  return scores;
}

function averageLevel(scores: DemoRubricScores): number {
  const values = rubricCategories.map((category) => scores[category.key].score);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type EssayBand = 'high' | 'mid' | 'low';

function bandFromLevel(level: number): EssayBand {
  if (level >= 3.8) return 'high';
  if (level >= 2.7) return 'mid';
  return 'low';
}

/* -------------------------------------------------------------------------- */
/* Essays                                                                      */
/* -------------------------------------------------------------------------- */

function claimFor(topic: DemoTopic, band: EssayBand): string {
  if (band === 'high') return topic.claimHigh;
  if (band === 'mid') return topic.claimMid;
  return topic.claimLow;
}

function voiceSentence(student: DemoStudentSpec, band: EssayBand): string {
  if (band === 'high') {
    return `The argument is not abstract to me; it shows up in something as ordinary as ${student.voice}.`;
  }
  if (band === 'mid') {
    return `I think about this when I think about ${student.voice}.`;
  }
  return `This makes me think of ${student.voice}.`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

type Essay = {
  text: string;
  html: string;
  thesisSentence: string;
  evidenceSentence: string;
  closingSentence: string;
};

/** A ten-minute free write: no thesis, no sources, and never graded. */
function buildFreeWrite(
  student: DemoStudentSpec,
  assignment: DemoAssignmentSpec,
  band: EssayBand
): Essay {
  const pools = FREE_WRITE_POOLS[band];
  const topic = assignment.topic;
  const seed = `${student.key}:${assignment.key}`;

  const opener = pick(pools.openers, `${seed}:fw-opener`)(topic);
  const middle = pick(pools.middles, `${seed}:fw-middle`)(topic);
  const closing = pick(pools.closers, `${seed}:fw-closer`)(topic);
  const voice = voiceSentence(student, band);

  const paragraphs = [[opener, middle].join(' '), [voice, closing].join(' ')];

  return {
    text: paragraphs.join('\n\n'),
    html: paragraphs
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join(''),
    thesisSentence: opener,
    evidenceSentence: middle,
    closingSentence: closing,
  };
}

function buildEssay(
  student: DemoStudentSpec,
  assignment: DemoAssignmentSpec,
  band: EssayBand
): Essay {
  if (assignment.form === 'free-write') {
    return buildFreeWrite(student, assignment, band);
  }

  const pools = ESSAY_POOLS[band];
  const topic = assignment.topic;
  const seed = `${student.key}:${assignment.key}`;

  const opener = pick(pools.openers, `${seed}:opener`)(topic);
  const thesis = claimFor(topic, band);
  const evidence = pick(pools.evidence, `${seed}:evidence`)(topic);
  const analysis = pick(pools.analysis, `${seed}:analysis`)(topic);
  const counter = pick(pools.counters, `${seed}:counter`)(topic);
  const rebuttal = pick(pools.rebuttals, `${seed}:rebuttal`)(topic);
  const secondAnalysis = pick(pools.analysis, `${seed}:analysis-two`)(topic);
  const closing = pick(pools.closers, `${seed}:closer`)(topic);
  const voice = voiceSentence(student, band);

  const paragraphs = [
    [opener, thesis].join(' '),
    [evidence, analysis].join(' '),
    [counter, rebuttal, secondAnalysis].join(' '),
    [closing, voice].join(' '),
  ];

  return {
    text: paragraphs.join('\n\n'),
    html: paragraphs
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join(''),
    thesisSentence: thesis,
    evidenceSentence: evidence,
    closingSentence: closing,
  };
}

/** An unfinished draft: the student got the opening down and stopped. */
function buildDraft(
  student: DemoStudentSpec,
  assignment: DemoAssignmentSpec,
  band: EssayBand
): Essay {
  const pools = ESSAY_POOLS[band];
  const opener = pick(
    pools.openers,
    `${student.key}:${assignment.key}:draft`
  )(assignment.topic);
  const thesis = claimFor(assignment.topic, band);
  const text = `${opener} ${thesis}`;

  return {
    text,
    html: `<p>${escapeHtml(text)}</p>`,
    thesisSentence: thesis,
    evidenceSentence: opener,
    closingSentence: opener,
  };
}

function buildInlineComments(
  student: DemoStudentSpec,
  assignment: DemoAssignmentSpec,
  essay: Essay,
  band: EssayBand
): DemoInlineComment[] {
  const seed = `${student.key}:${assignment.key}`;
  const candidates: DemoInlineComment[] = [
    {
      content: pick(INLINE_COMMENTS.thesis[band], `${seed}:c-thesis`),
      excerpt: essay.thesisSentence,
      occurrence: 1,
    },
    {
      content: pick(INLINE_COMMENTS.evidence[band], `${seed}:c-evidence`),
      excerpt: essay.evidenceSentence,
      occurrence: 1,
    },
    {
      content: pick(INLINE_COMMENTS.closing[band], `${seed}:c-closing`),
      excerpt: essay.closingSentence,
      occurrence: 1,
    },
  ];

  const count = 1 + Math.floor(createRandom(`${seed}:c-count`)() * 3);
  return candidates.slice(0, Math.min(count, candidates.length));
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                        */
/* -------------------------------------------------------------------------- */

function buildAssignments(now: Date): DemoAssignmentPlan[] {
  return DEMO_ROSTER_ASSIGNMENTS.map((assignment) => {
    const assignedAt = new Date(now.getTime() - assignment.weeksAgo * WEEK_MS);
    return {
      ...assignment,
      assignedAt,
      dueAt: new Date(assignedAt.getTime() + 6 * DAY_MS),
    };
  }).sort((a, b) => a.assignedAt.getTime() - b.assignedAt.getTime());
}

/** A growth report needs at least this many released papers to say anything. */
const MIN_RELEASED_PER_STUDENT = 3;

/**
 * Real rosters have gaps, so some students miss a paper — but never so many
 * that a growth report runs out of points. A missing paper is only ever taken
 * from released work when the class has one to spare; otherwise it comes from
 * the unreleased batch. Anchors — the strongest and weakest writer in each
 * class — never miss, which keeps the full rubric spread on every assignment
 * for Class Summary.
 */
function missingAssignmentKeys(
  student: DemoStudentSpec,
  gradedAssignments: DemoAssignmentPlan[]
): Set<string> {
  if (student.anchor) return new Set();
  const missing = new Set<string>();
  if (!chance(`${student.key}:missing`, 0.22)) return missing;

  const releasedCount = gradedAssignments.filter(
    (assignment) => assignment.state === 'released'
  ).length;
  const droppable =
    releasedCount > MIN_RELEASED_PER_STUDENT
      ? gradedAssignments
      : gradedAssignments.filter(
          (assignment) => assignment.state !== 'released'
        );
  if (droppable.length === 0) return missing;

  const index = Math.floor(
    createRandom(`${student.key}:missing-index`)() * droppable.length
  );
  const target = droppable[index];
  if (target) missing.add(target.key);

  return missing;
}

function gradedWorkPlan({
  student,
  assignment,
  index,
  count,
  now,
}: {
  student: DemoStudentSpec;
  assignment: DemoAssignmentPlan;
  index: number;
  count: number;
  now: Date;
}): DemoWorkPlan {
  const rubricScores = buildRubricScores(student, assignment, index, count);
  const level = averageLevel(rubricScores);
  const band = bandFromLevel(level);
  const essay = buildEssay(student, assignment, band);

  const submittedAt = new Date(
    assignment.dueAt.getTime() -
      Math.round(jitter(`${student.key}:${assignment.key}:submit`, 1) * DAY_MS)
  );
  const gradedAt = new Date(assignment.dueAt.getTime() + 5 * DAY_MS);
  const released = assignment.state === 'released';
  const numericPercentage = computeWeightedPercentage(rubricScores)!;

  return {
    studentKey: student.key,
    assignmentKey: assignment.key,
    classKey: student.classKey,
    documentTitle: assignment.title,
    text: essay.text,
    html: essay.html,
    state: released ? 'released' : 'graded',
    createdAt: new Date(assignment.assignedAt.getTime() + DAY_MS),
    submittedAt,
    gradedAt,
    releasedAt: released
      ? new Date(Math.min(gradedAt.getTime() + DAY_MS, now.getTime()))
      : null,
    rubricScores,
    overallScore: Math.round(level),
    overallComment: pick(
      OVERALL_COMMENTS[band],
      `${student.key}:${assignment.key}:overall`
    ),
    numericPercentage,
    letterGrade: letterFromPercent(numericPercentage),
    inlineComments: buildInlineComments(student, assignment, essay, band),
  };
}

function ungradedWorkPlan({
  student,
  assignment,
  index,
  count,
  submitted,
}: {
  student: DemoStudentSpec;
  assignment: DemoAssignmentPlan;
  index: number;
  count: number;
  submitted: boolean;
}): DemoWorkPlan {
  // Levels are computed but discarded: they only choose how strong the draft
  // reads, so an ungraded paper still looks like the student who wrote it.
  const band = bandFromLevel(
    averageLevel(buildRubricScores(student, assignment, index, count))
  );
  const essay = submitted
    ? buildEssay(student, assignment, band)
    : buildDraft(student, assignment, band);

  return {
    studentKey: student.key,
    assignmentKey: assignment.key,
    classKey: student.classKey,
    documentTitle: assignment.title,
    text: essay.text,
    html: essay.html,
    state: submitted ? 'submitted' : 'in-progress',
    createdAt: new Date(assignment.assignedAt.getTime() + DAY_MS),
    submittedAt: submitted
      ? new Date(
          assignment.dueAt.getTime() -
            Math.round(
              jitter(`${student.key}:${assignment.key}:submit`, 1) * DAY_MS
            )
        )
      : null,
    gradedAt: null,
    releasedAt: null,
    rubricScores: null,
    overallScore: null,
    overallComment: null,
    numericPercentage: null,
    letterGrade: null,
    inlineComments: [],
  };
}

function buildGrowthPlan({
  student,
  released,
  now,
}: {
  student: DemoStudentSpec;
  released: DemoWorkPlan[];
  now: Date;
}): DemoGrowthPlan | null {
  if (released.length === 0) return null;

  const latest = released[released.length - 1];
  const rubricLevels: Record<string, number> = {};
  for (const category of rubricCategories) {
    rubricLevels[category.key] = latest.rubricScores![category.key].score;
  }

  const averagePercentage = Math.round(
    released.reduce((sum, entry) => sum + (entry.numericPercentage ?? 0), 0) /
      released.length
  );

  const targetSkills = rubricCategories
    .map((category) => ({
      key: category.key,
      label: category.label,
      score: rubricLevels[category.key],
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);

  const labels = targetSkills.map((skill) => skill.label);
  const firstName = student.name.split(' ')[0];

  return {
    studentKey: student.key,
    classKey: student.classKey,
    focus: `Rebuild ${labels[0]} before the next essay, using ${labels[1]} as the lever.`,
    targetSkills: targetSkills.map((skill) => skill.key),
    body: [
      `## Focus`,
      `${firstName} is averaging ${averagePercentage}% across released papers, and the two skills holding the grade down are ${labels[0]} and ${labels[1]}.`,
      '',
      `## Priorities`,
      `1. **${labels[0]}** — a ten-minute mini-lesson on the move, then a revision of the weakest paragraph from the last essay. Grade the paragraph, not the paper.`,
      `2. **${labels[1]}** — annotate one model paragraph together, marking where the writer does the thing ${firstName} is skipping.`,
      '',
      `## Cadence`,
      `Check in every two weeks: one revised paragraph submitted, one three-minute conference.`,
      '',
      `## Conference talking points`,
      `- Name the specific move, not the grade: "the sentence after the quotation is missing."`,
      `- Ask ${firstName} to read the thesis aloud and say what a reader could disagree with.`,
      `- Agree on one measurable change for the next draft.`,
    ].join('\n'),
    baseline: {
      averagePercentage,
      rubricLevels,
      capturedAt: new Date(now.getTime() - 3 * WEEK_MS).toISOString(),
    },
    createdAt: new Date(now.getTime() - 3 * WEEK_MS),
    checkInAt: new Date(now.getTime() + 10 * DAY_MS),
  };
}

export function buildDemoRoster({ now }: { now: Date }): DemoRosterPlan {
  const assignments = buildAssignments(now);
  const work: DemoWorkPlan[] = [];

  for (const klass of DEMO_ROSTER_CLASSES) {
    const classKey = klass.key;
    const classAssignments = assignments.filter((assignment) =>
      assignment.classKeys.includes(classKey)
    );
    const gradedAssignments = classAssignments.filter(
      (assignment) => assignment.state !== 'awaiting-grading'
    );
    const students = DEMO_ROSTER_STUDENTS.filter(
      (student) => student.classKey === classKey
    );

    for (const student of students) {
      const missing = missingAssignmentKeys(student, gradedAssignments);

      for (const [index, assignment] of gradedAssignments.entries()) {
        if (missing.has(assignment.key)) continue;
        work.push(
          gradedWorkPlan({
            student,
            assignment,
            index,
            count: gradedAssignments.length,
            now,
          })
        );
      }

      for (const assignment of classAssignments) {
        if (assignment.state !== 'awaiting-grading') continue;
        if (chance(`${student.key}:${assignment.key}:absent`, 0.08)) continue;
        work.push(
          ungradedWorkPlan({
            student,
            assignment,
            index: gradedAssignments.length,
            count: gradedAssignments.length,
            submitted: !chance(`${student.key}:${assignment.key}:draft`, 0.18),
          })
        );
      }
    }
  }

  // Growth plans go to the students a teacher would actually flag: the sharpest
  // decline in each class, so Reporter has a plan to report progress against.
  const growthPlans: DemoGrowthPlan[] = [];
  for (const klass of DEMO_ROSTER_CLASSES) {
    const candidates = DEMO_ROSTER_STUDENTS.filter(
      (student) =>
        student.classKey === klass.key &&
        (student.arc === 'slipping' || student.arc === 'struggling')
    );

    const ranked = candidates
      .map((student) => {
        const released = work
          .filter(
            (entry) =>
              entry.studentKey === student.key && entry.state === 'released'
          )
          .sort(
            (a, b) =>
              (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0)
          );
        const first = released[0]?.numericPercentage ?? 0;
        const latest = released[released.length - 1]?.numericPercentage ?? 0;
        return { student, released, delta: latest - first };
      })
      .sort((a, b) => a.delta - b.delta);

    for (const candidate of ranked.slice(0, 1)) {
      const plan = buildGrowthPlan({
        student: candidate.student,
        released: candidate.released,
        now,
      });
      if (plan) growthPlans.push(plan);
    }
  }

  return {
    students: DEMO_ROSTER_STUDENTS,
    assignments,
    work,
    growthPlans,
  };
}
