/**
 * The essay demo: one English 10 class, two thesis-driven essay assignments,
 * and a full class set of real-length essays on each — graded, with the spread
 * of strengths and misses an assignment summary is built to read.
 *
 * The rest of the local-dev seed is a QA bench: one of every exit ticket, a
 * Daily Pages set, a class starter, four personas in four lifecycle states on
 * a two-sentence essay. All of that is load-bearing for someone, and none of
 * it is something to put in front of a teacher. This is the class to demo
 * from: open it, open an assignment, generate the summary, find models.
 *
 * The scores are not decoration. Each assignment is written so the class is
 * weakest in two categories, and so that in each of those there is a paper
 * strong enough to hold up as a model and a "near miss" — solid everywhere
 * but that one category — for the class to learn from. That is the shape the
 * assignment summary's models picker looks for.
 */

export const ESSAY_DEMO_CLASS_CODE = 'DEV-CLASS-ESSAYS';
export const ESSAY_DEMO_CLASS_TITLE = 'English 10 - Period 1';

export const ESSAY_DEMO_RUBRIC_KEYS = [
  'thesis_and_content',
  'organization_and_structure',
  'evidence_and_support',
  'voice_and_style',
  'grammar_and_mechanics',
] as const;

export type EssayDemoRubricKey = (typeof ESSAY_DEMO_RUBRIC_KEYS)[number];

export type EssayDemoStudent = { key: string; name: string };

export const ESSAY_DEMO_COHORT: EssayDemoStudent[] = [
  { key: 'maya', name: 'Maya Okafor' },
  { key: 'daniel', name: 'Daniel Reyes' },
  { key: 'priya', name: 'Priya Nair' },
  { key: 'jonah', name: 'Jonah Feldman' },
  { key: 'aaliyah', name: 'Aaliyah Brooks' },
  { key: 'ethan', name: 'Ethan Kowalski' },
  { key: 'sofia', name: 'Sofia Marquez' },
  { key: 'marcus', name: 'Marcus Bell' },
  { key: 'hannah', name: 'Hannah Liu' },
  { key: 'theo', name: 'Theo Andersson' },
];

export function essayDemoEmail(key: string, suffix = '') {
  return `dev.essay.${key}${suffix}@yawp.local`;
}

export type EssayDemoGrade = {
  /** One to five, against the default thesis-driven essay rubric. */
  scores: Record<EssayDemoRubricKey, number>;
  /** Per-category feedback, as the teacher would leave it. */
  comments: Record<EssayDemoRubricKey, string>;
  overallComment: string;
  /** Inline comments; each excerpt must appear verbatim in the essay. */
  inlineComments: { excerpt: string; content: string }[];
};

export type EssayDemoSubmission = {
  studentKey: string;
  title: string;
  /** Plain-text paragraphs, in order. */
  paragraphs: string[];
  submittedDaysAgo: number;
  /** Absent: handed in and waiting to be graded. */
  grade?: EssayDemoGrade;
};

export type EssayDemoAssignment = {
  title: string;
  prompt: string;
  /** How long ago it was assigned, so the newer one lists first. */
  assignedDaysAgo: number;
  submissions: EssayDemoSubmission[];
};
