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
    'Dashboard for the signed-in persona. Teachers see section headings "My Classes" (class cards named "English 10 - Period 3" and "English 11 - Period 5", role link), "Assignments", and "Grading". The "Assignments" section shows assignment-type cards as links (for example "Daily Pages"); clicking one navigates to that assignment type\'s detail page, where a button named "Prompt Library" expands the prompt library, and a button named "New" opens a dropdown. To pick something out of that dropdown, click the button named "New" and then click "role": "menuitem" named "Assignment" — never target a menu entry by text, because the menu renders in a portal at the end of the document and a text match lands on page copy higher up instead, then times out. There is no standalone assignments list page — that detail page is reached only by clicking a card from here. Students see a welcome heading and their class cards ("English 10 - Period 3", "GBA 300 - Period 2") — NOT their documents. A student\'s writing is on /app/my-documents; go there directly rather than looking for essay cards on the dashboard. Filming the prompt library takes exactly two scenes: first a scene with "goto": "/app" that clicks the link named "Daily Pages"; then a scene with NO goto (the click already navigated) that waits for and clicks the button named "Prompt Library".',
  '/app/my-documents':
    'Student-only list of the signed-in student\'s documents under heading "My Documents", one row per document with the document title as clickable text. Persona student has "Practice essay draft" (opens the editor, whose writing surface is "selector": ".ProseMirror") and "Untitled draft"; persona student-graded has "Graded civic essay" (opens the graded submission, where "Overall Feedback", "Overall Grade", and a "Rubric" with per-criterion scores are visible); persona student-submitted has "Submitted civic essay". Click the title text to open it; the next scene needs no goto.',
  '/app/my-classes':
    'Teacher class list under heading "My Classes". Class cards are links named "English 10 - Period 3" and "English 11 - Period 5". Clicking one opens the class detail, defaulting to a "Students" tab; a role "tab" named "Assignments" switches to that class\'s assignments table (aria-label "Assignments") listing seeded assignments "Thesis essay: civic responsibility" and "Daily Pages - week 2", where a button named "New Assignment" opens the create sheet.',
  '/app/assignments':
    'Teacher "My Assignments": every assignment across the teacher\'s classes in one table under headings "My Assignments" and "Assigned", with columns Assignment, Classes, Type, Documents. Seeded rows are links named "Daily Pages - week 2" (English 10 - Period 3, type Daily Pages), "International expansion brief" (GBA 300 - Period 2, 7 documents), and "Thesis essay: civic responsibility" (English 10 - Period 3, The Thesis-Driven Essay). A button named "New Assignment" opens the create flow. Good for showing breadth — one teacher\'s whole workload on a screen. Clicking a row navigates, so the next scene must omit "goto".',
  '/app/documents':
    'Teacher grading hub, heading "Documents", subtitle "Review, grade, and release student submissions across your classes." Every student submission in one table (Student, Document, Class, Assignment, Status) with 12 seeded rows. Above it are five "role": "tab" filters carrying live counts: "All" 12, "In Progress" 4, "Needs Grading" 3, "Needs Releasing" 2, "Released" 3 — clicking one filters the table, which is the single clearest way to show a grading pipeline with stages. There are also buttons "Actions", "Filter", and a "List" view switcher. Document titles are plain table cells, not links; to open one, click its text and mark the step "optional": true. This page is worth filming for the table itself: prefer a paced scroll or a tab click over opening a row.',
  '/app/reporter':
    'Yawp Reporter, the plain-language reporting surface. Heading "Yawp Reporter", subtitle "Ask about your classes and students in plain language", then "What would you like to know?" and the line "Yawp Reporter reads your classes, assignments, and released grades to answer questions and build reports." A textarea with placeholder "Ask Yawp Reporter…" takes the question, and four suggestion buttons sit under it: "Grade report for a class", "Growth report for a student", "Who needs attention?", "How are my classes doing?". A "New report" button starts a fresh one; past reports list on the left ("Your past reports will show up here." when empty). The photogenic moment is the ASKING: type a real question into the textarea with { "action": "type", "selector": "textarea", "value": "..." }, or click a suggestion, and hold on it. Answering runs a live model call that takes many seconds and is never the same twice, so never depend on the answer appearing — if a scene submits at all, mark that step and anything after it "optional": true.',
  '/app/student-work':
    'LEGACY PATH — this redirects to /app/documents. Do not use it in a new storyboard; navigate to "/app/documents" instead, because the redirect happens mid-capture and can race the scene\'s waitFor. See the /app/documents entry for what is on the page.',
  '/app/teacher-trainings':
    'Teacher training module list with two seeded trainings shown as cards. Film the list; mark any card click "optional": true.',
};

/** The guide as prompt lines, one route per line. */
export function describeRoutesForPrompt(): string {
  return ALLOWED_ROUTES.map(
    (route) => `- ${route} — ${ROUTE_GUIDE[route]}`
  ).join('\n');
}
