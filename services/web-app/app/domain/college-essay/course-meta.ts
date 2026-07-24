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

/** Short empathetic tagline shown as the lead line inside the Examples dropdown. */
export const COLLEGE_ESSAY_EXEMPLARS_TAGLINE =
  'These are hard. Want to see what they look like?';

/** Explanatory intro shown above the exemplar links. */
export const COLLEGE_ESSAY_EXEMPLARS_INTRO =
  'Here are a few colleges and coaches who publish real personal statements ' +
  'that worked. Read them for the feel — the object, the voice, the turn — not ' +
  'to copy. Every one belongs to the student who wrote it, and yours has to ' +
  'sound unmistakably like you.';

/** Heading for the how-to-use directions at the top of the course page. */
export const COLLEGE_ESSAY_DIRECTIONS_TITLE = 'How this works';

/** Lead paragraph for the directions callout. */
export const COLLEGE_ESSAY_DIRECTIONS_INTRO =
  'This is a self-discovery process that happens to end in a 650-word essay. ' +
  'The pre-writing is not a warm-up — it is half the work.';

/** Ordered steps for the directions callout. */
export const COLLEGE_ESSAY_DIRECTIONS_STEPS: string[] = [
  'Work through the modules in order — start with Orientation and resist jumping ahead to drafting.',
  "Do the pre-writing first. You won't start writing until you've found a topic you'd be proud to talk about — that's the one hard gate in this course.",
  'Use the Tutor as a coach: it asks questions and points at what is working, but it will never write the essay for you.',
  'Want to see what a strong one looks like? Open Examples below for real personal statements to read.',
];
