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
    'Dashboard for the signed-in persona. Teachers see section headings "My Classes" (class cards named "English 10 - Period 3" and "English 11 - Period 5", role link), "Assignments", and "Grading". The "Assignments" section shows assignment-type cards as links (for example "Daily Pages"); clicking one navigates to that assignment type\'s detail page, where a button named "Prompt Library" expands the prompt library, and a button named "New" opens a dropdown. To pick something out of that dropdown, click the button named "New" and then click "role": "menuitem" named "Assignment" — never target a menu entry by text, because the menu renders in a portal at the end of the document and a text match lands on page copy higher up instead, then times out. There is no standalone assignments list page — that detail page is reached only by clicking a card from here. Students see their assigned writing as cards: persona student has "Practice essay draft", student-submitted has "Submitted civic essay", student-graded has "Graded civic essay" (role link). Clicking a student draft card opens the editor, whose writing surface is "selector": ".ProseMirror". Filming the prompt library takes exactly two scenes: first a scene with "goto": "/app" that clicks the link named "Daily Pages"; then a scene with NO goto (the click already navigated) that waits for and clicks the button named "Prompt Library".',
  '/app/my-classes':
    'Teacher class list under heading "My Classes". Class cards are links named "English 10 - Period 3" and "English 11 - Period 5". Clicking one opens the class detail, defaulting to a "Students" tab; a role "tab" named "Assignments" switches to that class\'s assignments table (aria-label "Assignments") listing seeded assignments "Thesis essay: civic responsibility" and "Daily Pages - week 2", where a button named "New Assignment" opens the create sheet.',
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
