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
4. **Restart all tours**, in the Settings menu, forgets every tour the teacher
   finished or skipped, so each page shows its welcome card again.

Only **Finish** keeps a welcome card away for good. **Skip** (or ✕) hides
it for the rest of that authenticated session; at the next login every unfinished
page greets the teacher again, starting with the dashboard. Closing a tour
partway through records nothing.

## Who sees it

Teachers whose organization plan is `FREE_CLASSROOM`, and only while the
`free_tier` flag is on and the separate `guided-tours` flag is enabled for their organization. `guided-tours` defaults OFF on demo and production, with no deployment override. Nobody sees it during read-only impersonation. Paid
accounts and students never do.

## Pages and steps

The tours are defined in `services/web-app/app/domain/guided-tours/tours.ts`:

| Tour | Page | Steps point at |
| --- | --- | --- |
| `waiting-preview` | `/app/free-tier/preview` | Permitted content, read-only guidance, locked actions |
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
| `document` | `/app/documents/:id` | Tutor, editor toolbar, comments, Submit, saved/history/print (Tour this page is in the ⋮ menu) |

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
eligible. Read-only impersonation receives 403 before persistence access.
Browser skips are keyed by a one-way digest of the authenticated session and user,
so a new login or account does not inherit another session’s skips.

The e2e seed marks every tour finished for `dev.teacher.free@yawp.local`, so
that other specs never see a welcome card. `free-tier.guided-tour.spec.ts`
clears those rows before each of its tests.

## Rollback

Turn `guided-tours` off to hide the tour UI and reject tour persistence without
changing free-tier access. Keep the additive `UserTour` table and progress.
The follow-up migration installs both the impersonation mutation audit and
truncate guard; the existing fail-closed coverage guard is unchanged.
A production migration requires the driver's RDS snapshot for the final head.

## Local verification

Use `./bin/project test --profile guided-tours-unit --json`,
`guided-tours-db`, and `guided-tours-browser` after an isolated bootstrap.
The browser profile uses its worktree's Postgres host and app port, a disposable
`yawp_guided_tours_e2e` database, at most two workers, and no hosted resources.
Set `GUIDED_TOURS_SHOTS` to save welcome, spotlight, replay, restart, mobile,
and flag-off evidence. Desktop and mobile onboarding regressions also verify
that the class-preparation and administrator steps suppress tours until approval;
approval is a local fixture transition and sends no email. Stop all owned
processes and remove test resources after QA.


## Approval waiting integration

The existing approval gate identifies waiting free-classroom teachers before a
membership is provisioned. With both tour flags enabled locally, the permitted
read-only preview offers its own tour. It does not grant access to dashboard
routes, teaching tools, assignments, or student invitations. Only the exact tour
POST reaches the action; waiting teachers can record only `waiting-preview`
completion or dismissal. Normal page-tour writes and reset remain forbidden.
Class preparation and administrator details still have no tours. Read-only
impersonation hides controls and denies writes. Flags remain default OFF.
