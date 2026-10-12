# Free tier: locked assignment types as teasers

Stacked on PR #433 (page tours for free classroom teachers). Brian's ask: a
free classroom teacher should see the paid assignment types sitting next to
the three free ones, grayed out, so they can see what a paid plan adds. A
locked tile is not a dead link. Opening it shows that type's "See how it
works" guide, as a teaser, instead of the type's page.

## Where things stand today

- A free classroom gets exactly three assignment types: Class Starter,
  Prewriting and Thesis Statement. Provisioning links only those kinds
  (`FREE_CLASSROOM_ASSIGNMENT_KINDS`, `provision-free-classroom.server.ts`),
  and `filterAssignmentTypesForOrganizationPlan` drops anything else on the
  dashboard and the Assignments page.
- The dashboard shows assignment types as tiles in `AssignmentsAtAGlance`
  (`app/routes/app._index/components/assignments-at-a-glance.tsx`). Each tile
  links to `/app/assignment-types/:id` and carries a `+` button that opens the
  creation sheet. The free-tier quota spec asserts the tile titles are exactly
  the three free ones.
- The assignment type page loader looks the type up through
  `getAvailableAssignmentTypesForScopes` and redirects to `/app` with an error
  toast when the teacher's scopes do not include it. A free teacher cannot open
  a paid type's page, which is right and stays.
- Only The Thesis-Driven Essay has a guide:
  `app/routes/app.assignment-types.$id_.how-it-works/route.tsx`, media in
  `public/img/thesis-essay-guide`. Its loader runs the same access check as
  the type page, so a free teacher is redirected away from it too. The guide
  pieces live in `app/components/how-it-works/guide.tsx`; the rules for
  writing one are in `docs/how-to-guides.md`.
- PR #433 adds a `data-tour-variant` on the type page and tours keyed by
  kind; the tours never mention paid types.

## Which types to tease first

Two, as asked:

1. **The Thesis-Driven Essay.** It already has a finished guide with clips,
   so it costs nothing to show, and it is the natural next step after the free
   Thesis Statement module.
2. **AP History Essay.** Named in the ask. It has no guide yet, so one gets
   written in this PR (see step 5). It is the DBQ / LEQ coach with the
   College Board rubric, a strong teaser for history teachers.

The catalog is data, so adding Daily Pages or Exit Ticket later is one entry
plus a guide.

## Design

### Locked tiles are static catalog data, not database rows

A free classroom's organization has no `OrganizationAssignmentType` row for
a paid type, and some free deployments (preview, local dev) may not even have
the type seeded. So the locked tiles must not depend on the type existing for
that teacher. A small catalog in
`app/domain/free-tier/locked-assignment-types.ts` (shared code, no server
imports) lists each teaser:

```ts
export const LOCKED_ASSIGNMENT_TYPE_TEASERS = [
  {
    slug: 'thesis-driven-essay',
    title: 'The Thesis-Driven Essay',
    blurb: 'A full critical essay with the Tutor beside the student.',
    image: '/img/thesis-essay-guide/hero.jpg',
  },
  {
    slug: 'ap-history-essay',
    title: 'AP History Essay',
    blurb: 'DBQ and LEQ coaching on the College Board rubric.',
    image: '/img/ap-history-guide/hero.jpg',
  },
] as const;
```

Each teaser links to `/app/assignment-type-previews/:slug`. That route is new and
renders the same guide a paid teacher sees at
`/app/assignment-types/:id/how-it-works`, so the guide bodies get lifted out
of the route files into components the two routes share.

### Who sees them

Same eligibility as the tours in PR #433: the teacher's organization plan is
`FREE_CLASSROOM` and the `free_tier` flag is on. Paid schools, students, and
read-only impersonation never see a locked tile, and the preview route 404s
for anyone else (same shape as `POST /api/guided-tours`). The flag is still
off in production, so merging ships nothing visible.

### What a locked tile looks like

In the same horizontal row as the free tiles, after them:

- Same size and shape; the image and title are at reduced opacity
  (`opacity-60`, grayscale on the image), with a small lock badge in the
  corner where the `+` button sits on a free tile. No `+` button.
- `aria-label`: "The Thesis-Driven Essay, included with a paid plan. See how
  it works." Screen readers get the same story a sighted teacher gets.
- Tooltip on hover: "Included with a paid plan".
- The row heading gains nothing; the tiles say it themselves. If Brian wants
  a caption under the row ("More assignment types come with a paid plan"), it
  is one line in `AssignmentsAtAGlance`.

### What opens

`/app/assignment-type-previews/:slug` renders the guide inside the app shell
with:

- A "Back to dashboard" button instead of "Back to <type page>".
- A banner above the hero: "Included with a paid plan. This is what your
  students and you would get." with one link to the growth or contact page
  the free-tier spec names (if none exists yet, the banner has no link; do
  not invent a sales page in this PR).
- The guide's footer button, which today reads "Start using it" and links to
  the type page, becomes "Back to dashboard" for the teaser. A free teacher
  cannot start it.
- The guide body itself is unchanged, so the will / won't section stays
  true, and the same clips play.

The existing `/app/assignment-types/:id/how-it-works` route keeps its access
check and its back link; only its body moves into a shared component.

### Tours

PR #433's dashboard tour has an "Assignments" step. Its copy gains one
sentence: "Grayed-out types come with a paid plan. Open one to see how it
works." No new tour, no new step: the tile row is already the step's target.

## Steps

Each step is one or two commits, tests first (AGENTS.md rule 1).

### 1. Branch

```
git fetch origin claude/gallant-bell-9h4g19
git checkout -B claude/kind-goodall-tkmrs0 origin/claude/gallant-bell-9h4g19
```

The draft PR's base is `claude/gallant-bell-9h4g19`, not `main`, so its diff
shows only this work. When #433 merges, retarget the base to `main`.

### 2. E2E tests first: `e2e/tests/free-tier.locked-assignment-types.spec.ts`

Log in as `dev.teacher.free@yawp.local` the way
`free-tier.guided-tour.spec.ts` does. Cases:

- Dashboard shows the three free tiles, then the two locked tiles, in that
  order, each with the lock badge and no `+` button.
- Clicking the Thesis-Driven Essay locked tile lands on
  `/app/assignment-type-previews/thesis-driven-essay`, shows the "Teach the
  thesis-driven essay" heading, the paid-plan banner, the `guide-wont`
  section, and clips served from `/img/thesis-essay-guide/`.
- The AP History teaser renders its own heading and `guide-wont` section.
- The footer and back links return to `/app`.
- The teaser route returns 404 for a paid teacher (`e2eContext.teacherEmail`)
  and for a student, and for the free teacher when the flag is off
  (`setFreeTierFlag(false)`, restored in `afterAll`).
- A paid teacher's dashboard has no locked tiles.
- Phone width: no horizontal overflow on the teaser page, the same check the
  thesis guide spec makes.

Update `free-tier.bundle-quotas.spec.ts`: its tile-title assertion lists the
three free types. Scope its locator to unlocked tiles
(`[data-locked="false"]`) so it keeps asserting what it meant, or extend the
expected list. Prefer scoping; the test is about the quota tiles.

### 3. Unit tests first, then the catalog

`app/domain/free-tier/locked-assignment-types.test.ts`:

- `lockedAssignmentTypeTeasersFor({ plan, freeTierEnabled, readOnlyImpersonation })`
  returns the catalog only for `FREE_CLASSROOM` with the flag on and not
  impersonating; `[]` otherwise.
- `findTeaser(slug)` returns the entry or `null`; unknown slugs are `null`.
- Every entry's `image` exists under `public/` (a `bun test` that stats the
  file keeps the catalog honest).

Then write `locked-assignment-types.ts` to pass them.

### 4. Lift the thesis guide body into a shared component

- Move everything below the loader in
  `app.assignment-types.$id_.how-it-works/route.tsx` into
  `app/components/how-it-works/thesis-essay-guide.tsx`, exported as
  `ThesisEssayGuide({ backTo, backLabel, footer, banner })`.
- The route becomes loader plus a one-line render. Run
  `teacher.thesis-essay-guide.spec.ts` to prove nothing moved for paid
  teachers.
- `GuideFooter` grows an optional second shape (a plain back button instead
  of a start button) or the teaser passes its own footer node. Pick whichever
  is the smaller change; the teaser must not show "Start using it".

### 5. The AP History guide

Written to `docs/how-to-guides.md`:

- Hero, the range (DBQ and LEQ for AP U.S. History, AP European History,
  and AP World History, the courses `AP_HISTORY_COURSE_LABEL` lists),
  the main workflow in at most three steps (pick a prompt from the AP History
  library, students write with sources beside the draft and the Tutor
  coaching toward rubric points, grade on the College Board rubric and
  release), the will / won't section, the demo footer.
- Every will / won't line checked against the code: the tutor prompt in
  `app/domain/ap-history/tutor-prompt.ts` (never writes for the student,
  never calls the student ready to submit, mechanics never cost a point), the
  grade release route, and the paste report.
- Media in `public/img/ap-history-guide/`. Stills can be captured in this
  session with Playwright against a local run seeded by
  `seed-ap-history.ts`. Clips are better recorded by a person in the real
  app with demo classes, as the other guides were; until then the guide uses
  stills (`GuideImage`) and the PR says so. Keep the folder near 3 MB.
- Component `app/components/how-it-works/ap-history-guide.tsx`, the same
  props as the thesis guide.
- Also give paid teachers the guide: add the `SeeHowItWorksLink` on the AP
  History type page and teach the `how-it-works` route to pick the guide by
  `systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY` as well as by the thesis
  title. Extend `teacher.thesis-essay-guide.spec.ts`'s "no guide on other
  types" case so it still uses Daily Pages, which stays guideless.

### 6. The teaser route: `app/routes/app.assignment-type-previews.$slug/route.tsx`

The path is deliberately outside `/app/free-tier/`: the app shell renders
every path under that prefix without the sidebar (it is the onboarding
shell), and a teaser should look like any other app page, with the sidebar
and the tour button in place.

- Loader: `requireUserId`, `requireMembership`, `isFreeTierEnabled`,
  `profile.organization.plan === 'FREE_CLASSROOM'`, role `TEACHER`, and
  `findTeaser(params.slug)`; any miss throws a 404 `Response`. Impersonation
  is read from the same place the app shell reads it.
- Renders the matching guide component with `backTo="/app"`, the paid-plan
  banner, and the back-button footer.
- Unit test for the loader with mocked membership, the same style as
  `api.guided-tours/route.test.ts`.

### 7. Dashboard tiles

- `app._index/route.tsx` loader: compute `lockedAssignmentTypes` with
  `lockedAssignmentTypeTeasersFor(...)` and return it next to
  `teacherAssignmentTypes`.
- `AssignmentsAtAGlance` takes `lockedAssignmentTypes` and renders a
  `LockedAssignmentTypeTile` for each after the free tiles. Both tile kinds
  get `data-locked` so tests can tell them apart.
- No change to the creation sheet or the Assignments page: locked types are
  not creatable and should not appear in any picker.

### 8. Tour copy

One sentence added to the `dashboard` tour's `dashboard-assignments` step in
`app/domain/guided-tours/tours.ts`. `tours.test.ts` already snapshots step
targets, not copy, so no test change beyond reading it once.

### 9. Docs

- `docs/free-tier/locked-assignment-types.md`: who sees the tiles, the
  catalog, how to add a type, rollback (flag off hides everything; the
  catalog has no table).
- `docs/how-to-guides.md`: one line under "Where it lives in the app" saying a
  guide can also be shown as a free-tier teaser and what changes (back link,
  banner, footer).

### 10. Checks before each push

```
cd services/web-app
bun run typecheck
bun test app/domain/free-tier app/components/how-it-works app/routes/app.assignment-type-previews.\$slug
./bin/project test --profile changed --json
playwright test --project=chromium e2e/tests/free-tier.locked-assignment-types.spec.ts e2e/tests/free-tier.bundle-quotas.spec.ts e2e/tests/free-tier.guided-tour.spec.ts e2e/tests/teacher.thesis-essay-guide.spec.ts
```

Then prettier on the touched files.

### 11. Draft PR

Open as a draft against `claude/gallant-bell-9h4g19`. Body: the summary
above, the two teaser types, a "Try it on this preview" line using the
`?code=…&devLogin=dev.teacher.free%40yawp.local` link from #433, the test
list, and an "Open for review" section naming: the AP History guide copy as a
first draft, stills instead of clips, and the banner's missing upgrade link.

## Backward compatibility

- Nothing changes for `SCHOOL` plans: the catalog returns `[]`, the type page
  and the thesis guide keep their access checks, the AP guide is additive.
- Everything new is behind `free_tier`, which is off in production.
- No schema change, no migration, nothing to roll back beyond the flag.

## Open questions for Brian

1. Thesis-Driven Essay and AP History Essay as the first two, or a different
   pair? (Daily Pages and Exit Ticket are the other candidates with the most
   finished pages.)
2. Where should the "Included with a paid plan" banner send a teacher? If
   there is no page yet, the banner stays a statement with no link.
3. Stills are enough for the AP History guide's first version, or should the
   PR wait on recorded clips?
