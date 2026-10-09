# Free tier: page tours

Free classroom teachers don't get a hands-on orientation, so each main page
gives them a short guided tour instead. The pattern follows The Nest's tour:

1. **A welcome card**, bottom-right, the first time a teacher opens a toured
   page. It offers **Take a tour** or **Skip** (✕ also skips).
2. **The spotlight tour.** The page dims, the element being explained gets a
   ring, and a card shows the title, "Step N of M", progress pills, back/next
   buttons and **Finish**. Escape or ✕ closes it.
3. **Tour this page**, in the sidebar above Settings, replays the current
   page's tour at any time.

## Who sees it

Teachers whose organization plan is `FREE_CLASSROOM`, and only while the
`free_tier` flag is on. Nobody sees it during read-only impersonation. Paid
schools and students never do.

## Pages and steps

The tours are defined in `services/web-app/app/domain/guided-tours/tours.ts`:

| Tour | Page | Steps point at |
| --- | --- | --- |
| `dashboard` | `/app` | Classes, Assignments, Grading, sidebar |
| `my-classes` | `/app/my-classes` | Class grid, Create Class (one-class limit) |
| `class` | `/app/my-classes/:id` | Student join link, roster, tabs |
| `my-assignments` | `/app/assignments` | New Assignment, assigned list |
| `documents` | `/app/documents` | Status filters, filter/group/actions, document list |
| `writing-practice` | `/app/writing-lessons` | Create assignment, practice you assigned, lesson library |
| `teachers-lounge` | `/app/teacher-trainings` | Courses |
| `lesson-planner` | `/app/lesson-planner` | Message box, starter ideas, saved lessons, See how it works |
| `organization` | `/app/organization/*` | Tabs, tab content |
| `type-class-starter` | `/app/assignment-types/:id` (Class Starter) | New menu, how it works, prompt library, modules, your drafts |
| `type-prewriting` | `/app/assignment-types/:id` (Prewriting) | New menu, modules, your drafts |
| `type-thesis-statement` | `/app/assignment-types/:id` (Thesis Statement) | New menu, modules, your drafts |

An assignment type page's URL doesn't say which type it is, so the page
names its kind with `data-tour-variant`, and `tourForPage` picks that
type's tour. Types without a tour get none.

A step targets an element by its `data-tour="..."` attribute. If that
element isn't on screen (another tab is open, or a phone hides the sidebar),
the step is skipped. If none of a tour's elements are on screen, the tour
shows one centered card instead.

To add a tour, add it to `TOURS` and `TOUR_IDS`, match its path in
`tourForPathname`, and put `data-tour` on the elements it points at.

## Storage

`UserTour` holds one row per user and tour, with `status` set to `completed`
or `dismissed`. With no row, the welcome card shows. Once a tour is
`completed`, closing a replay early never changes it back to `dismissed`.
`POST /api/guided-tours` records the outcome; it returns 404 for anyone not
eligible.

The e2e seed marks every tour finished for `dev.teacher.free@yawp.local`, so
that other specs never see a welcome card. `free-tier.guided-tour.spec.ts`
clears those rows before each of its tests.

## Rollback

Turning `free_tier` off hides everything. To remove the table, use the
migration's `rollback.sql`.
