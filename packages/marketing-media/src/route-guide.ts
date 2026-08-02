import { ALLOWED_ROUTES, type AllowedRoute } from './storyboard';

/**
 * What is actually on each allowed route, written for the storyboard
 * generator.
 *
 * The generator has no eyes: every click target it writes is a guess unless
 * this guide names it. Every element and seeded title below was read out of
 * the real route components and the local-dev seed, so a storyboard that
 * stays inside this guide clicks things that exist. When a page or the seed
 * changes, update the entry — the guide being slightly stale is recoverable
 * (steps time out fast and optional steps skip), but the guide being vague
 * sends the model back to inventing selectors.
 *
 * Seeded names referenced here come from
 * packages/prisma/scripts/local-dev/seed-synthetic-data.ts.
 */
export const ROUTE_GUIDE: Record<AllowedRoute, string> = {
  '/':
    'Public landing page (logged out): hero, log in, and create account. ' +
    'Film it as a establishing shot — scroll, do not click.',
  '/info':
    'Public "learn more" page describing the product. Scroll only; no reliable interactive targets.',
  '/accessibility':
    'Public accessibility statement. Text page; scroll only.',
  '/app':
    'Dashboard for the signed-in persona. Teachers see section headings "My Classes" (class cards named "English 10 - Period 3" and "English 11 - Period 5", role link), "Assignments", and "Grading". Students see their assigned writing as cards: persona student has "Practice essay draft", student-submitted has "Submitted civic essay", student-graded has "Graded civic essay" (role link). Clicking a student draft card opens the editor, whose writing surface is "selector": ".ProseMirror".',
  '/app/my-classes':
    'Teacher class list under heading "My Classes". Class cards are links named "English 10 - Period 3" and "English 11 - Period 5". Clicking one opens the class detail with its student documents.',
  '/app/assignments':
    'Teacher assignments page under heading "Assignments". A button named "New Assignment" opens the create sheet. The assignments table (aria-label "Assignments") lists seeded assignments "Thesis essay: civic responsibility" and "Daily Pages - week 2" — each row title is a button with that name. Below the table, assignment-type chips are links (for example "Daily Pages"); clicking a chip opens that assignment type\'s detail page, where a button named "Prompt Library" expands the prompt library. That click-through is the only way to film the prompt library.',
  '/app/student-work':
    'Teacher queue of submitted student work; seeded with "Submitted civic essay" from Riley Student. Prefer filming the queue itself; mark any row click "optional": true.',
  '/app/teacher-trainings':
    'Teacher training module list with two seeded trainings shown as cards. Film the list; mark any card click "optional": true.',
};

/** The guide as prompt lines, one route per line. */
export function describeRoutesForPrompt(): string {
  return ALLOWED_ROUTES.map(
    (route) => `- ${route} — ${ROUTE_GUIDE[route]}`
  ).join('\n');
}
