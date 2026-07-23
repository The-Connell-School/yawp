/**
 * App-side constants for the College Admissions Essay course.
 *
 * The system key is duplicated from the seed data (packages/prisma) because the
 * web app cannot import from the prisma scripts package — same pattern the AP
 * History domain uses.
 */

export const COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY = 'college_admissions_essay';

export type CollegeEssayExemplar = {
  /** Display label for the link. */
  label: string;
  /** External URL — a college's or coach's published "essays that worked". */
  href: string;
  /** Short note on what the reader will find. */
  blurb: string;
};

/**
 * License-safe exemplars: we LINK OUT to real published personal statements
 * rather than reproduce them. Every essay belongs to the student who wrote it;
 * these pages publish them with permission. Students read them for the feel,
 * never to copy.
 */
export const COLLEGE_ESSAY_EXEMPLARS: CollegeEssayExemplar[] = [
  {
    label: 'Johns Hopkins — Essays That Worked',
    href: 'https://apply.jhu.edu/college-planning-guide/essays-that-worked/',
    blurb:
      'Admitted students’ essays, each with a note on why the admissions committee loved it.',
  },
  {
    label: 'Connecticut College — Essays That Worked',
    href: 'https://www.conncoll.edu/admission/apply/essays-that-worked/',
    blurb: 'A curated set of standout personal statements from admitted students.',
  },
  {
    label: 'Hamilton College — College Essays That Worked',
    href: 'https://www.hamilton.edu/admission/apply/college-essays-that-worked',
    blurb: 'Real essays reprinted with the students’ permission.',
  },
  {
    label: 'College Essay Guy — Outstanding Essay Examples',
    href: 'https://www.collegeessayguy.com/blog/college-essay-examples',
    blurb:
      'A big collection of personal statements, many annotated to show what makes them work.',
  },
];

/** Empathetic intro shown above the exemplar links. */
export const COLLEGE_ESSAY_EXEMPLARS_INTRO =
  'These essays are genuinely hard, and it helps to see what "good" actually ' +
  'looks like. Here are a few colleges and coaches who publish real personal ' +
  'statements that worked. Read them for the feel — the object, the voice, the ' +
  'turn — not to copy. Every one belongs to the student who wrote it, and yours ' +
  'has to sound unmistakably like you.';
