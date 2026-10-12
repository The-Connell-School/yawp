# Free tier: locked assignment types

A free classroom includes three assignment types: Class Starter, Prewriting,
and Thesis Statement. Its teacher also sees some paid types on the
dashboard, grayed out, so they can see what a paid plan adds. A locked tile
is not a dead link. It opens that type's "See how it works" guide as a
teaser.

## Who sees them

Teachers whose organization plan is `FREE_CLASSROOM`, and only while the
`free_tier` flag is on. Paid schools and students never do. They also show
during read-only impersonation, because a teaser writes nothing and support
staff should see what the teacher sees.

## What a teacher sees

- **Dashboard tiles.** The locked tiles follow the free ones in the
  Assignments row. The art is gray and faded, and a lock sits where a free
  tile has its + button. The tooltip says "Included with a paid plan".
- **The teaser.** `/app/assignment-type-previews/<slug>` shows the same guide
  a paid teacher opens from the type's page, with three changes: a "Back to
  dashboard" link, an "Included with a paid plan" banner above the hero, and
  a footer button back to the dashboard instead of "Create an assignment".
- **The dashboard tour** says that grayed-out types come with a paid plan.

Locked types never appear in the creation sheet or on the Assignments page.
The type page and the paid guide route keep their own access checks, so a
free teacher still cannot open them.

## The catalog

`services/web-app/app/domain/free-tier/locked-assignment-types.ts` lists the
teasers as plain data, not database rows. A free classroom has no link to a
paid type, and a preview or local database may not have the type at all.

| Slug | Title | Guide |
| --- | --- | --- |
| `thesis-driven-essay` | The Thesis-Driven Essay | `components/how-it-works/thesis-essay-guide.tsx` |
| `ap-history-essay` | AP History Essay | `components/how-it-works/ap-history-guide.tsx` |

To add one:

1. Write the type's guide as a component taking `GuideFrameProps`, following
   `docs/how-to-guides.md`.
2. Add an entry to `LOCKED_ASSIGNMENT_TYPE_TEASERS` with tile art under
   `public/img/`.
3. Render its guide for that slug in
   `routes/app.assignment-type-previews.$slug/route.tsx`.
4. Extend `e2e/tests/free-tier.locked-assignment-types.spec.ts`.

The route lives outside `/app/free-tier/` on purpose. The app shell renders
that prefix as the bare onboarding shell, with no sidebar.

## Tests

- `e2e/tests/free-tier.locked-assignment-types.spec.ts`: tiles, both
  teasers, 404 for unknown slugs, flag off, paid teachers and students, and
  phone width.
- `locked-assignment-types.test.ts` and the teaser route's `route.test.ts`.

## Rollback

Turning `free_tier` off hides everything. There is no table to remove.
