import type { MarketingStoryboard } from './storyboard';

/**
 * Curated, hand-verified storyboards for the site's most marketable moments,
 * framed around how the product supports the science of teaching and
 * learning: frequent low-stakes writing, fast criterion-referenced feedback,
 * visible progress, and teacher development. Every target below was checked
 * against the real seeded interface before it was written down, so rendering
 * a library entry involves no model and no guessing — it is the reliable path
 * to marketing media.
 *
 * Clips estimate ≤ this hint; the test suite enforces it.
 */
export const MAX_CLIP_SECONDS_HINT = 20;

export type MarketingLibraryEntry = {
  slug: string;
  title: string;
  /** Why this moment matters pedagogically — shown to the admin, and good default copy. */
  description: string;
  kind: 'CLIP' | 'STILLS';
  storyboard: MarketingStoryboard | Record<string, unknown>;
};

export const MARKETING_LIBRARY: MarketingLibraryEntry[] = [
  {
    slug: 'library-daily-pages-prompt-library',
    title: 'Daily Pages: prompt to assignment in seconds',
    description:
      'Frequent low-stakes writing builds fluency, but only if assigning it is effortless. A teacher opens the Daily Pages prompt library and turns a prompt into a class assignment in one motion.',
    kind: 'CLIP',
    storyboard: {
      slug: 'library-daily-pages-prompt-library',
      title: 'Daily Pages: prompt to assignment in seconds',
      audience: 'Teachers and curriculum leads',
      goal: 'Show the prompt library removing the cost of daily writing practice',
      persona: 'teacher',
      viewport: { width: 1280, height: 800 },
      scenes: [
        {
          id: 'dashboard',
          goto: '/app',
          waitFor: 'main',
          settle: 0.8,
          hold: 0.5,
          screenshot: false,
          steps: [{ action: 'click', role: 'link', name: 'Daily Pages' }],
        },
        {
          id: 'prompt-library-open',
          settle: 0.8,
          hold: 2,
          screenshot: true,
          steps: [
            { action: 'waitFor', role: 'button', name: 'Prompt Library' },
            { action: 'click', role: 'button', name: 'Prompt Library' },
            { action: 'wait', seconds: 0.6 },
          ],
        },
        {
          id: 'new-assignment',
          settle: 0.8,
          hold: 2.5,
          screenshot: true,
          steps: [
            { action: 'click', role: 'button', name: 'New' },
            // The menu is portaled to the end of the document; only the role
            // finds it. Matching by text lands on page copy higher up.
            { action: 'waitFor', role: 'menuitem', name: 'Assignment' },
            { action: 'click', role: 'menuitem', name: 'Assignment' },
            { action: 'wait', seconds: 0.5 },
          ],
        },
      ],
    },
  },
  {
    slug: 'library-feedback-rubric-loop',
    title: 'Feedback students actually see',
    description:
      'Feedback moves learning when it is specific, criterion-referenced, and arrives while the work still matters. A student opens their graded essay: overall grade, rubric scores per criterion, and the teacher’s comments anchored to their own sentences.',
    kind: 'CLIP',
    storyboard: {
      slug: 'library-feedback-rubric-loop',
      title: 'Feedback students actually see',
      audience: 'Teachers, department chairs, and administrators',
      goal: 'Show the full feedback loop from the student side',
      persona: 'student-graded',
      viewport: { width: 1280, height: 800 },
      scenes: [
        {
          id: 'student-dashboard',
          goto: '/app',
          waitFor: 'main',
          settle: 1,
          hold: 0.5,
          screenshot: false,
          steps: [{ action: 'click', text: 'Graded civic essay' }],
        },
        {
          id: 'graded-submission',
          settle: 1,
          hold: 2,
          screenshot: true,
          steps: [
            { action: 'waitFor', text: 'Overall Feedback' },
            { action: 'wait', seconds: 0.8 },
            { action: 'scroll', y: 350 },
            { action: 'wait', seconds: 1 },
          ],
        },
      ],
    },
  },
  {
    slug: 'library-student-daily-writing',
    title: 'A place to think and write',
    description:
      'Writing is thinking made visible. A student picks up their draft and keeps going in a clean, distraction-light editor with the assignment prompt in view — practice happens in the tool, not around it.',
    kind: 'CLIP',
    storyboard: {
      slug: 'library-student-daily-writing',
      title: 'A place to think and write',
      audience: 'Teachers and families',
      goal: 'Show the student drafting experience',
      persona: 'student',
      viewport: { width: 1280, height: 800 },
      scenes: [
        {
          id: 'student-dashboard',
          goto: '/app',
          waitFor: 'main',
          settle: 1,
          hold: 0.5,
          screenshot: false,
          steps: [{ action: 'click', text: 'Practice essay draft' }],
        },
        {
          id: 'drafting',
          settle: 1,
          hold: 2,
          screenshot: true,
          steps: [
            { action: 'waitFor', selector: '.ProseMirror' },
            {
              action: 'type',
              selector: '.ProseMirror',
              at: 'end',
              value: ' The bell rang, but nobody moved.',
            },
          ],
        },
      ],
    },
  },
  {
    slug: 'library-teacher-grading-hub',
    title: 'Every writer, one pipeline',
    description:
      'Formative assessment only works when teachers can see the whole class at once. The Documents hub shows every student’s work by stage — in progress, needs grading, needs releasing, released — so no writer slips through.',
    kind: 'STILLS',
    storyboard: {
      slug: 'library-teacher-grading-hub',
      title: 'Every writer, one pipeline',
      audience: 'Teachers and administrators',
      goal: 'Show the grading pipeline across a class',
      persona: 'teacher',
      viewport: { width: 1280, height: 800 },
      scenes: [
        {
          id: 'grading-hub',
          goto: '/app/student-work',
          waitFor: 'main',
          settle: 1.2,
          hold: 1.5,
          screenshot: true,
          steps: [{ action: 'waitFor', text: 'Needs Grading' }],
        },
      ],
    },
  },
  {
    slug: 'library-teacher-at-a-glance',
    title: 'The teacher’s day at a glance',
    description:
      'Classes, assignments, and grading in one view. Screenshot set of the teacher dashboard, class list, and assignments page — the surfaces a school evaluates first.',
    kind: 'STILLS',
    storyboard: {
      slug: 'library-teacher-at-a-glance',
      title: 'The teacher’s day at a glance',
      audience: 'Administrators and buying committees',
      goal: 'Screenshot set of the primary teacher surfaces',
      persona: 'teacher',
      viewport: { width: 1280, height: 800 },
      scenes: [
        {
          id: 'dashboard',
          goto: '/app',
          waitFor: 'main',
          settle: 1.2,
          hold: 1,
          screenshot: true,
          steps: [],
        },
        {
          id: 'my-classes',
          goto: '/app/my-classes',
          waitFor: 'main',
          settle: 1.2,
          hold: 1,
          screenshot: true,
          steps: [],
        },
        {
          id: 'assignments-entry',
          goto: '/app',
          waitFor: 'main',
          settle: 1,
          hold: 0,
          screenshot: false,
          steps: [{ action: 'click', role: 'link', name: 'Daily Pages' }],
        },
        {
          id: 'assignments-detail',
          settle: 1.2,
          hold: 1,
          screenshot: true,
          steps: [],
        },
      ],
    },
  },
  {
    slug: 'library-class-roster',
    title: 'Know your class in one click',
    description:
      'From the class list into a roster with every student’s documents one click away — the connective tissue between teaching and the work itself.',
    kind: 'CLIP',
    storyboard: {
      slug: 'library-class-roster',
      title: 'Know your class in one click',
      audience: 'Teachers',
      goal: 'Show the class list opening into a roster',
      persona: 'teacher',
      viewport: { width: 1280, height: 800 },
      scenes: [
        {
          id: 'my-classes',
          goto: '/app/my-classes',
          waitFor: 'main',
          settle: 1,
          hold: 1,
          screenshot: false,
          steps: [
            { action: 'click', role: 'link', name: 'English 10 - Period 3' },
          ],
        },
        {
          id: 'class-detail',
          settle: 1,
          hold: 2.5,
          screenshot: true,
          steps: [
            { action: 'waitFor', selector: "[data-testid='class-detail-header']" },
          ],
        },
      ],
    },
  },
  {
    slug: 'library-teachers-lounge',
    title: 'Teacher development built in',
    description:
      'Adopting a writing platform is a practice change, and practice changes need support. The Teacher’s Lounge carries training modules teachers work through inside the same product they teach with.',
    kind: 'STILLS',
    storyboard: {
      slug: 'library-teachers-lounge',
      title: 'Teacher development built in',
      audience: 'Administrators and instructional coaches',
      goal: 'Show built-in teacher training',
      persona: 'teacher',
      viewport: { width: 1280, height: 800 },
      scenes: [
        {
          id: 'teachers-lounge',
          goto: '/app/teacher-trainings',
          waitFor: 'main',
          settle: 1.2,
          hold: 1.5,
          screenshot: true,
          steps: [{ action: 'waitFor', text: "Teacher's Lounge" }],
        },
      ],
    },
  },
  {
    slug: 'library-landing-page',
    title: 'The front door',
    description:
      'The public landing page — “A space for students to think and write” — as a clean still for decks and one-pagers.',
    kind: 'STILLS',
    storyboard: {
      slug: 'library-landing-page',
      title: 'The front door',
      audience: 'Everyone',
      goal: 'Landing page hero still',
      persona: 'teacher',
      viewport: { width: 1280, height: 800 },
      scenes: [
        {
          id: 'landing',
          goto: '/',
          waitFor: 'main',
          settle: 1.2,
          hold: 1,
          screenshot: true,
          steps: [],
        },
      ],
    },
  },
];
