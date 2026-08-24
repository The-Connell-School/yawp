# Demo paths, personas, and seeded states

Everything here is local dev only. Never capture marketing media against
production or any environment with real student data.

## Running the app

```bash
bun dev
```

`bun dev` runs `scripts/worktree-local-setup.sh`, starts the worktree Postgres
container, applies migrations, and seeds dev personas. The dev port is printed
on startup and lives in `.worktree-local/config.env` as `DEV_PORT`. If login
fails with "Can't reach database server", the worktree Postgres container is
down — re-run `bun worktree:setup`.

Reseed personas alone:

```bash
bun db:seed-local-dev
```

## Dev personas

Password for all personas is `yawp-dev`. The capture runner logs in through
`POST /auth/dev-login`, which only works when local dev auth is enabled.
Source of truth: `packages/prisma/scripts/local-dev/dev-personas.ts`.

| Storyboard `persona` | Email | Role | Seeded state |
|---|---|---|---|
| `admin` | dev.admin@yawp.local | Teacher, platform admin, org owner | Multi-class teacher with admin surfaces |
| `owner` | dev.owner@yawp.local | Teacher, org owner | Organization owner |
| `teacher` | dev.teacher@yawp.local | Teacher (Alex Teacher) | Primary teacher on the main dev class |
| `teacher-multi` | dev.teacher.multi@yawp.local | Teacher (Jordan Teacher) | Assigned to multiple classes |
| `student` | dev.student@yawp.local | Student (Sam Student) | Fresh in-progress document |
| `student-submitted` | dev.student.submitted@yawp.local | Student (Riley Student) | Submitted, awaiting grading |
| `student-graded` | dev.student.graded@yawp.local | Student (Casey Student) | Released grade with teacher comments |
| `student-unreleased` | dev.student.unreleased@yawp.local | Student (Taylor Student) | Graded, not yet released |

Persona keys map to emails as `dev.<key with dots>@yawp.local`, so
`student-graded` becomes `dev.student.graded@yawp.local`. You can also pass a
full email as `--persona`.

Best personas for marketing:

- Teacher story → `teacher` (one clean class) or `admin` (fuller dashboards).
- Student story → `student` for the editor, then switch to `student-graded`
  with a `login` step to show returned feedback.
- Never use `student-unreleased` on camera without explaining it; an unreleased
  grade looks like a bug to someone who does not know the model.

## Routes worth filming

Public:

- `/` — landing page, login and create account
- `/info` — learn more
- `/accessibility` — accessibility statement

Teacher:

- `/app` — dashboard / workspace
- `/app/my-classes` — class list
- `/app/my-classes/:classId` — one class, student documents and status
- `/app/assignments` — assignments
- `/app/assignment-types/:id` — assignment type detail
- `/app/student-work` — submitted work queue
- `/app/teacher-trainings` — teacher training modules

Student:

- `/app` — student dashboard, assigned writing
- `/app/documents/:id` — the editor
- `/app/submissions/:id` — graded submission with rubric and comments

Admin / org:

- `/app/admin/assignment-types`, `/app/admin/organizations`,
  `/app/admin/teacher-courses`, `/app/admin/teacher-trainings`
- `/app/organizations/schools/:schoolId`

IDs are seed-dependent. Prefer clicking a link by role and name over hardcoding
an ID in a storyboard, so the storyboard survives a reseed.

## Useful selectors

- Editor: `.ProseMirror` (single source of truth, see
  `services/web-app/e2e/test-helpers.ts`). Wait for it to be visible before
  typing; the editor sets `data-sync-ready="true"` when it is wired up.
- Graded submission page: headings matching `/overall grade/i` and
  `/overall feedback/i`; a `Graded` label in the nav.
- Class labels in the dev seed look like `Grade 9th … Period 1st`.

When a selector cannot be found, the e2e specs in `services/web-app/e2e/tests`
are the best place to look — they exercise the same screens and are kept
current with the UI.

## Things that photograph badly

- Empty states on a fresh seed. Reseed or pick a persona with real data.
- The submissions queue mid-load. Add a `wait` step before the screenshot.
- Long class or student lists that scroll off. Scroll into view first, or
  narrow the viewport height.
