# Assignment Flow Polish Design

## Goal

Implement the polish Brian requested in the `looking great` Gmail thread:
teachers who quick-create an assignment from the dashboard return to the
dashboard when they exit the builder, the teacher Assignments page exposes the
checkbox-style delete flow clearly, and the class grading header no longer lets
the Students/Documents counts dominate the banner. The same thread also includes
a newer dashboard grading-bar ordering request; include it as a small fourth
polish item because it touches the same dashboard surface and only reorders
existing controls.

## Source Evidence

The verified Gmail thread is `looking great` / `Re: looking great` from Brian
Connell.

- June 15, 2026 6:26 AM CT: dashboard assignment-type `+` quick-create works,
  but after creating it sends the teacher to Assignments; Brian expects the user
  to return to the page they launched from. If launched from Assignments, they
  should return to Assignments.
- June 15, 2026 11:53 AM CT: the grading screen heading with Students and
  Documents counts should not take up the whole banner; it should justify left
  and take less space.
- June 15, 2026 12:06 PM CT: on the Assignments screen, allow teacher assignment
  deletion using the same checkbox style as Students.
- June 16, 2026 6:57 AM CT: on the dashboard grading bar, put To grade / To
  release above the By class / By student / By assignment options.

## Current Repo Context

- Dashboard assignment cards live in
  `services/web-app/app/routes/app._index/components/assignments-at-a-glance.tsx`.
  The header "New assignment" link and card `+` links currently navigate to
  `/app/assignments?create=1...`.
- The Assignments page sheet host lives in
  `services/web-app/app/routes/app.assignments._index/route.tsx`. It consumes
  `create=1` and `assignmentType=...` search params, opens
  `AssignmentCreationSheet`, strips those params, then stays on Assignments when
  the sheet closes.
- The shared creation sheet lives in
  `services/web-app/app/components/assignments/assignment-creation-sheet.tsx`.
  It already closes by calling `onOpenChange(false)` when the create fetcher
  succeeds.
- Teacher Assignments already has checkbox selection, a selected-row delete
  action, a bulk `delete-assignments` action, and e2e coverage in
  `services/web-app/e2e/tests/teacher.assignments-page.spec.ts` proving student
  documents survive deletion. This item is mostly coverage/affordance polish,
  not a rebuild.
- The student table checkbox/delete pattern lives in
  `services/web-app/app/routes/app.my-classes.$classId/route.tsx`.
- The class header tabs live in
  `services/web-app/app/routes/app.my-classes.$classId/class-detail-header.tsx`.
  The current tab list is a full-width flex row and each tab uses a large
  tabular number, so the counts consume the bottom banner.
- The dashboard grading card order lives in
  `services/web-app/app/routes/app._index/components/teacher-grading-at-a-glance.tsx`.
  It currently renders mode cards first and the To grade / To release stat strip
  below them.

Claude `/ui` orchestration was attempted for non-editing visual guidance, but
the local Claude CLI returned `401 Invalid authentication credentials`. The
visual spec below stays constrained to Brian's explicit text and existing Yawp
components; implementation must include screenshot/e2e verification rather than
claiming external UI-worker review.

## Clarifying Decisions

- "Previous page" for dashboard quick-create means a safe in-app return target,
  not browser history. Use an explicit `returnTo` search param so direct
  `/app/assignments?create=1` behavior remains unchanged.
- Exiting the builder means any sheet close when a safe `returnTo` was supplied:
  successful create, cancel, or dismiss should return to the launching page.
- Only same-app absolute paths that start with `/app` are valid return targets.
  Ignore external URLs, protocol-relative URLs, and malformed values.
- The Assignments delete backend should remain as-is unless tests expose a bug.
  The implementation should preserve existing document safety: deleting an
  assignment must leave student documents intact and unlink their assignment
  references through the existing schema behavior.
- The class header should not get a new design system. Keep the existing header,
  art, metadata, and active-tab indicator, but make the Students/Documents tab
  group compact, left-aligned, and visually secondary to the class identity.
- The dashboard grading-bar ordering request is included because it was the
  latest concrete ask in the verified thread and is a small reorder of existing
  elements.

## Approaches Considered

### Recommended: Safe `returnTo` on the Existing Assignments Host

Dashboard links append `returnTo=/app` while still opening the existing
Assignments sheet host. The Assignments route stores a sanitized return target
when it consumes `create=1`, removes the transient search params, and navigates
back to the target when the sheet closes.

Tradeoffs:
- Smallest behavioral change.
- Keeps assignment creation validation, fetcher behavior, and duplicate/edit
  flows in the existing Assignments route.
- Temporarily lands on Assignments while the sheet is open, matching current
  architecture.
- Generalizes to future launch pages without relying on browser history.

### Alternative: Host the Creation Sheet Directly on the Dashboard

Dashboard renders `AssignmentCreationSheet` itself and opens it in-place.

Tradeoffs:
- Best URL purity because the teacher never leaves `/app`.
- Requires adding creation class data and standardization flags to the dashboard
  loader, plus converting dashboard card links into buttons.
- More duplicate state between Dashboard and Assignments for the same builder
  entry point.

### Alternative: Use Browser History

After the sheet closes, call `navigate(-1)` if the teacher came from the
dashboard.

Tradeoffs:
- Minimal code.
- Fragile for direct links, reloads, new tabs, and users whose previous browser
  entry is not the dashboard.
- Harder to test deterministically.

## Recommended Design

### 1. Dashboard Quick-Create Return

Add a small helper in
`services/web-app/app/routes/app.assignments._index/route.tsx`:

- `sanitizeAssignmentCreateReturnTo(value: string | null): string | null`
- Return the value only when it starts with `/app` and does not start with `//`.
- Return `null` for empty, relative, external, or protocol-relative values.

In `AssignmentsRoute`:

- Import `useNavigate`.
- Add `createReturnTo` state.
- When `searchParams.get('create') === '1'`, read and sanitize `returnTo`.
- Store the sanitized value before stripping `create`, `assignmentType`, and
  `returnTo` from the URL.
- In the `AssignmentCreationSheet` `onOpenChange`, when `open` becomes false and
  `createReturnTo` is set, clear create state and navigate to that target with
  `replace: true`.
- Preserve current behavior when `returnTo` is missing or invalid.

In `AssignmentsAtAGlance`:

- Append `returnTo=/app` to both dashboard assignment creation entry points:
  the "New assignment" link and each card `+` link.
- Keep the assignment-type card title/image link pointing to the assignment type
  page.

### 2. Assignments Checkbox Delete

Keep the existing table checkbox model and bulk delete action:

- Header checkbox selects all filtered assignments.
- Row checkbox selects one assignment.
- Selected assignments reveal the existing edit and delete icon actions.
- Delete confirmation keeps the current warning that student documents remain
  but unlink from the assignment.

Polish only if needed:

- Add explicit `aria-label`s to the header checkbox and each row checkbox if the
  e2e update needs stable accessible locators.
- Keep the icon-only delete action consistent with the Students table's compact
  selected-row action style.
- Do not introduce per-row trash buttons or a second destructive flow.

### 3. Compact Class Header Counts

In
`services/web-app/app/routes/app.my-classes.$classId/class-detail-header.tsx`:

- Change `ClassHeaderTabBar` from a full-width flex row to a compact inline tab
  group.
- Keep it left-aligned inside the existing border-top area with horizontal
  padding matching the header content.
- Render each tab as label plus count on one compact line, for example
  `Students 14`, using smaller tabular count text instead of the current large
  stacked number.
- Preserve `role="tablist"`, `role="tab"`, `aria-selected`, keyboard/focus
  styling, `data-state`, and the animated active indicator.
- Keep responsive behavior safe by allowing the compact group to wrap or scroll
  only if needed; it should not overlap the class title, art, or Edit Class
  button.

### 4. Dashboard Grading Bar Order

In
`services/web-app/app/routes/app._index/components/teacher-grading-at-a-glance.tsx`:

- When there is grading work, render `GradingQueueStatStrip` before the mode-card
  grid.
- Leave the all-caught-up empty state unchanged.
- Do not redesign the cards or counts beyond the order Brian requested.

## Test Strategy

Follow TDD during implementation. No production code changes before the matching
e2e or unit test has been written and observed failing for the expected reason.

### E2E First

Update `services/web-app/e2e/tests/teacher.dashboard-workspace.spec.ts`:

- Adjust the existing "Assignments" link expectation to include the dashboard
  return target.
- Add a test that signs in as the teacher, opens the dashboard assignment-card
  `+` quick-create flow, creates an assignment, and expects the final URL to be
  `/app` with the dashboard still visible. Before implementation, this should
  fail because the teacher remains on `/app/assignments`.
- Add a dashboard grading order assertion that compares the vertical position of
  `To grade` against `By class` or `By student`. Before implementation, this
  should fail because the stat strip is below the mode cards.

Update `services/web-app/e2e/tests/teacher.assignments-page.spec.ts`:

- Rename or expand the delete test to assert the checkbox-driven selected state:
  row checkbox is visible, checking it reveals the selected-assignment delete
  action, confirming deletion removes the row, and the linked student document
  survives with assignment links nulled.
- If new accessible checkbox labels are added, assert those labels in the e2e.

Update `services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts`:

- Add a desktop visual invariant for the header tab group: the `Class sections`
  tablist is visible, left-aligned within the header, and its width is
  materially smaller than the header width. Before implementation, this should
  fail because the current tablist spans the banner.

### Unit Coverage

Update `services/web-app/app/routes/app.assignments._index/route.test.ts`:

- Test `sanitizeAssignmentCreateReturnTo('/app') === '/app'`.
- Test it preserves safe app paths with query strings such as
  `/app/my-classes/class-1?tab=documents`.
- Test it rejects `https://example.com/app`, `//example.com/app`, `assignments`,
  and empty values.

Existing component tests for
`services/web-app/app/components/assignments/assignment-creation-sheet.tsx`
should not need changes because the return behavior belongs to the route host,
not the shared sheet.

## Verification Commands

Run the targeted tests first:

```bash
cd services/web-app
bun test app/routes/app.assignments._index/route.test.ts
playwright test --project=chromium e2e/tests/teacher.dashboard-workspace.spec.ts e2e/tests/teacher.assignments-page.spec.ts e2e/tests/teacher.class-page-redesign.spec.ts
```

Then run the smoke suite because all touched e2e files are already smoke-gated:

```bash
cd services/web-app
bun run test:e2e:smoke
bun run typecheck
```

If the full smoke suite is too slow during implementation, run the targeted
Playwright command after each red/green cycle and the full smoke suite before
final completion.

## Backward Compatibility

- No schema or data model change.
- Existing `/app/assignments?create=1` direct links keep their current behavior
  unless a valid `returnTo` is present.
- Existing assignment creation, edit, duplicate, delete, and AP History library
  protections remain in place.
- Existing student documents are not deleted when assignments are deleted.
- No feature flag is required because this is a narrow UI/navigation polish that
  preserves old behavior for callers without `returnTo`.

## Out Of Scope

- The earlier `Create Class` blank school dropdown note from the same email
  thread.
- The earlier class student delete bug from the same email thread.
- Assignment builder feature expansion and grading assistant work.
- Redesigning the teacher dashboard beyond the one requested grading-bar order
  change.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders remain.
- Internal consistency: the quick-create design keeps the existing Assignments
  host and uses an explicit safe return target; the test plan exercises that
  path directly.
- Scope check: the work is limited to one route host, two dashboard components,
  one class header component, and focused e2e/unit coverage.
- Ambiguity check: cancel/dismiss behavior is explicitly treated as exiting the
  builder when `returnTo` is present, matching Brian's "upon exiting" wording.
