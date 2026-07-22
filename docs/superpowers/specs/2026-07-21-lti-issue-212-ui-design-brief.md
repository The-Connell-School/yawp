# LTI UI Design Brief — Issue #212

Companion to `docs/superpowers/specs/2026-07-22-lti-launch-pilot-design.md`. Covers UI only. Backend route contracts (loaders/actions/params) are being wired in parallel — this brief assumes data shapes described there but does not touch any files.

Built from the existing shadcn/ui (`new-york`) system already in `services/web-app/app/components/ui/*`: cva-variant `Button`/`Badge`, CSS-variable colors (`primary`/`secondary`/`destructive`/`success`/`muted`/`border`), `Card`, `Table`, `Tabs`, `AlertDialog` via `ConfirmationDialog`, `Sheet`. No new visual system, no dashboard redesign — this reuses the exact patterns in `app.admin.organizations.$id/route.tsx` and `app.admin.audit/route.tsx`.

---

## 1. `/lti/link` — account-link confirmation page

Public, unauthenticated-adjacent route (user has just logged into Yawp per the pilot design, step 4). Full-bleed centered layout matching `auth.login/route.tsx`: `mx-auto w-full max-w-md`, logo, centered heading block, no sidebar/nav chrome.

### Structure

```
<div className="mx-auto w-full max-w-md">
  <div className="mt-8 flex flex-col gap-3 text-center">
    <img src="/img/logo_for_light_mode.png" ... className="mx-auto mb-8 h-auto w-48 ..." />
    <h1>Link your Yawp account</h1>
    <p className="text-muted-foreground">Confirm this is you before we connect your class.</p>
  </div>

  <div className="mx-auto mt-10 w-full max-w-md px-8">
    <Card className="bg-muted">
      <CardHeader>
        <CardTitle className="text-base">You're linking to</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Organization</dt>
            <dd className="text-base font-medium">{organizationName}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Course</dt>
            <dd className="text-base font-medium">{courseName}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Your role</dt>
            <dd>
              <Badge variant={role === 'TEACHER' ? 'secondary' : 'info-soft'}>
                {role === 'TEACHER' ? 'Teacher' : 'Student'}
              </Badge>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>

    <Form method="post" className="mt-6 flex flex-col gap-2">
      <input type="hidden" name="intent" value="confirm-link" />
      <Button className="w-full" type="submit">Link account</Button>
      <Button className="w-full" variant="outline" type="submit" name="intent" value="cancel-link" formNoValidate>
        Cancel
      </Button>
    </Form>
  </div>
</div>
```

### Copy (exact)

- H1: `Link your Yawp account`
- Subtitle: `Confirm this is you before we connect your class.`
- Card title: `You're linking to`
- Field labels: `Organization`, `Course`, `Your role`
- Role badge text: `Teacher` / `Student` — never the raw LTI role URI.
- Primary button: `Link account`
- Secondary button: `Cancel`
- Below the buttons, small print (`text-xs text-muted-foreground text-center mt-3`): `This link only uses your organization, course, and role — no other data from your school's system is shared with Yawp.`

**No LMS PII rule**: never render LMS user id, email, display name, subject identifier, or platform issuer/URL on this page. Only `organizationName`, `courseName` (Yawp's own class name from the course mapping, not the raw LMS context title unless that's what's stored), and the mapped Yawp role. If the loader can't resolve one of these three, treat it as a resolution failure and render the generic error page (Section 2) instead of a partially-filled confirmation.

### Interaction states

- **Default**: as above.
- **Submitting**: primary button shows the existing `isLoading` spinner treatment (`Button` already renders a `Loader2` prefix when `isLoading` is passed) with label unchanged; both buttons `disabled` while `fetcher.state !== 'idle'`.
- **Already linked / duplicate submit**: if the pending-link cookie is already consumed, don't show a dead form — loader should redirect to `/lti/error` (generic) rather than rendering this page in a broken state. Document this as a loader responsibility for the backend contract, not something the UI branches on.
- **Wrong signed-in user**: per security invariant #6, this can't happen mid-flow (a different authenticated user fails before reaching this page), so no UI state is needed for it here — it surfaces as a generic error prior to this page.

### Accessibility

- `h1` is the only top-level heading; card title is `CardTitle` rendered as its default (non-heading) element — fine, since it's a labeled section, not a document heading.
- The three fields use real `<dl>/<dt>/<dd>` (matches `description-lists` convention: `dt` higher-contrast/`font-medium`, `dd` regular weight).
- Role badge: add `aria-label="Role: Teacher"` on the `Badge` span since color/pill shape alone shouldn't carry the only signal — screen reader gets the plain-text equivalent regardless, but this makes intent explicit for anyone using a badge-scanning shortcut.
- Both buttons are real `<button type="submit">` (via `Form`), reachable by keyboard, visible focus ring from the existing `focus-visible:ring-2 focus-visible:ring-ring` on `Button` — no custom focus styling needed.
- Cancel must not silently no-op — its `formAction`/intent should still hit the server so the pending link is explicitly invalidated, not just abandoned client-side.

### Responsive

- Already mobile-first by inheriting the `auth.login` shell: `max-w-md` container works at all widths with `px-8` inner gutter.
- Stack is already single-column; nothing collapses. On very small screens the `dl` grid stays single-column (no `sm:grid-cols-2` — this is a short, 3-row list, don't split it side-by-side or it gets cramped under `w-48` logo + heading).
- Buttons are `w-full` at all breakpoints — this is a confirmation gate, not a toolbar; don't shrink them into an inline pair on desktop.

---

## 2. `/lti/error` — generic safe error page

Same public shell as `/lti/link` and `auth.login`. This is intentionally the *only* LTI-facing error surface — covers invalid state/nonce, expired transaction, disabled registration, unmapped course, failed token verification, replayed launch, everything. Per security invariant #9: **no cause-specific copy, no registration/tenant identifiers, no debug detail** ever rendered here, even for admins (admins get detail via the audit trail in Section 3, not this page).

### Structure

```
<div className="mx-auto w-full max-w-md">
  <div className="mt-8 flex flex-col gap-3 text-center">
    <img src="/img/logo_for_light_mode.png" ... />
    <h1>We couldn't complete that</h1>
    <p className="text-muted-foreground">
      Something went wrong connecting your class. Nothing was changed, and no data was shared.
    </p>
  </div>

  <div className="mx-auto mt-10 w-full max-w-md px-8">
    <div className="rounded-xl border bg-muted p-6 text-center">
      <p className="text-sm text-muted-foreground">
        Try launching from your course again. If this keeps happening, contact your school's Yawp administrator with this code:
      </p>
      <p className="mt-3 font-mono text-sm tabular-nums">{supportCode}</p>
    </div>

    <Button asChild className="mt-6 w-full">
      <Link to="/app">Go to Yawp</Link>
    </Button>
  </div>
</div>
```

### Copy (exact)

- H1: `We couldn't complete that`
- Body: `Something went wrong connecting your class. Nothing was changed, and no data was shared.`
- Support box lead-in: `Try launching from your course again. If this keeps happening, contact your school's Yawp administrator with this code:`
- Support code: opaque, short, bounded (e.g. the existing bounded non-secret support-code format from the launch design — not a stack trace, not a raw transaction id). Rendered in `font-mono` + `tabular-nums` per the numeric-content convention.
- Button: `Go to Yawp` (routes to `/app`; unauthenticated users hit the normal `requireUserId` redirect-to-login from there — don't special-case it here).

**What must never appear on this page**: registration name, organization name, issuer/platform URL, course name, error class/exception message, HTTP status detail, any LMS-supplied string (context title, user name/email), stack traces. If a future contributor is tempted to interpolate `error.message` into this template, that's the one thing to explicitly flag in review — this page's entire job is to be the same regardless of cause.

### Interaction states

- Static page, no form, no loading state — it's a terminal state. The only interactive element is the `Go to Yawp` link/button.
- No error-severity variation (no red/destructive styling) — this isn't a "danger" page from the *user's* point of view, it's a neutral "that didn't work, try again" page. Keep it in the same neutral `muted`/`border` palette as the confirmation page, not `destructive`.

### Accessibility

- Same `h1` pattern as Section 1.
- Support code block: wrap in `<p>` with a preceding label sentence in the same paragraph (as drafted above) rather than a bare floating code string, so screen readers get context before the code.
- Single focus stop other than the link — no keyboard trap risk.

### Responsive

- Identical shell/breakpoint behavior to Section 1 — same `max-w-md`, same `px-8`, single column, full-width button throughout.

---

## 3. `/app/admin/organizations/:id/lti` — admin LTI diagnostics/configuration page

Nested under the existing global-admin org detail page (`app.admin.organizations.$id/route.tsx`), reachable from that page — not a new top-level `adminTabs` entry (LTI is per-organization configuration, not a global admin section). Add a link/button from the org detail page's action row (next to "Edit Organization") rather than duplicating the org header chrome; this new route renders its own page but keeps the same `p-3 md:p-5` / `Card` conventions as its parent so it reads as the same product.

### Page layout

```
<div className="grid gap-4 p-3 md:p-5">
  {/* header */}
  <div className="flex flex-wrap items-center justify-between gap-2">
    <Button variant="ghost" asChild>
      <Link to={`/app/admin/organizations/${organization.id}`}>
        <ChevronLeft size={18} />
        {organization.name}
      </Link>
    </Button>
    <div className="flex items-center gap-2">
      <Badge variant={org.ltiEnabled ? 'success' : 'secondary'}>
        {org.ltiEnabled ? 'LTI enabled' : 'LTI disabled'}
      </Badge>
    </div>
  </div>

  {/* tenant gate card */}
  <Card className="bg-muted">
    <CardHeader><CardTitle>Organization LTI access</CardTitle></CardHeader>
    <CardContent>
      {/* toggle row, see below */}
    </CardContent>
  </Card>

  <Tabs defaultValue="registrations">
    <TabsList>
      <TabsTrigger value="registrations">Registrations</TabsTrigger>
      <TabsTrigger value="mappings">Course mappings</TabsTrigger>
      <TabsTrigger value="audit">Recent activity</TabsTrigger>
    </TabsList>
    <TabsContent value="registrations">…</TabsContent>
    <TabsContent value="mappings">…</TabsContent>
    <TabsContent value="audit">…</TabsContent>
  </Tabs>
</div>
```

Use `Tabs` (already in `components/ui/tabs.tsx`, Radix-based) instead of stacking all three sections vertically — this page has three genuinely independent datasets (registrations, mappings, audit) and stacking them the way `app.admin.audit` stacks Timeline/AI-logs would make this page very long. Tabs keep it scannable and match the existing `adminTabs` visual idiom (pill-style, active = `bg-background text-foreground shadow-sm`) without inventing a new pattern.

### 3a. Tenant gate card

Single toggle row, same shape as the feature-flag rows already in `app.admin.organizations.$id/route.tsx` (the "Production pilot features" checkboxes) — reuse that exact `label` + description block pattern but promote it to a `Switch` since this is a single primary on/off, not a multi-checkbox group:

```
<div className="flex items-center justify-between gap-4 rounded-md border bg-background px-4 py-3">
  <div className="min-w-0">
    <p className="font-medium">Enable LTI for this organization</p>
    <p className="text-sm text-muted-foreground">
      Turns on the LTI launch entry point for every registration below. Individual registrations still need their own toggle.
    </p>
  </div>
  <Switch checked={org.ltiEnabled} onCheckedChange={...} name="ltiEnabled" />
</div>
```

Copy: `Enable LTI for this organization` / `Turns on the LTI launch entry point for every registration below. Individual registrations still need their own toggle.` This directly states the two-gate model from security invariant #2 (org gate AND registration gate) so an admin doesn't assume flipping this alone turns anything on.

### 3b. Registrations tab

Table (matches `Tables` guideline: no card wrapper *around* the table itself, sentence-case headers, `whitespace-nowrap`, horizontal-only dividers, `w-full`). Each row is a registration:

| Column | Content |
|---|---|
| Registration | Registration label/name (admin-set, not raw issuer URL) |
| Status | `Badge`: `success` "Active" / `secondary` "Disabled" / `destructive` "Uninstalled" |
| Deployment | truncated deployment id, `font-mono text-xs`, with a copy affordance reusing `~/components/ui/tooltip-id-copy.tsx` (already exists for exactly this "copy this long id" pattern elsewhere) |
| Course mappings | count, e.g. `12 mapped` |
| Actions | `DropdownMenu` (already in `components/ui/dropdown-menu.tsx`) with `Disable` / `Re-enable` / `Uninstall` |

Row action semantics:
- **Disable** — reversible, soft. Regular `secondary`/`outline` button inside the dropdown, no confirmation dialog required (it's the safe direction), but still POST-only (no GET side effects).
- **Re-enable** — same, no confirmation.
- **Uninstall** — irreversible per invariant #10 (invalidates outstanding transactions/pending links; registration stops all reads). This is the one destructive action on the page: wrap it in `ConfirmationDialog` with `variant="destructive"`, and per the buttons guideline, the *dialog's* confirm button is allowed to be a solid `destructive` primary (dialogs are their own page for the "one primary button" rule), while the *trigger* inside the row/dropdown stays a plain menu item, never a solid red button sitting in the table row itself.
  - Dialog title: `Uninstall registration`
  - Dialog description: `This immediately stops all launches from this registration and cannot be undone. Anyone mid-launch will see a generic error. Existing course mappings and audit history are kept for your records.`
  - Confirm button text: `Uninstall registration`
  - Cancel: `Cancel`

Empty state (no registrations yet): centered `text-sm text-muted-foreground` row, `No LTI registrations yet for this organization.` — matches the existing "No owners found…" empty-row pattern in the org detail table.

### 3c. Course mappings tab

Table, same conventions:

| Column | Content |
|---|---|
| LMS context | opaque label only if one exists in the mapping record already (e.g. admin-entered nickname) — **not** the raw LMS course title/id if that counts as LMS-sourced PII beyond what's already safely stored; if only an internal context id exists, show it `font-mono text-xs` with copy affordance, same as deployment id |
| Yawp class | `Link` to the actual class admin page, class name as link text |
| Registration | which registration it belongs to (badge or plain text) |
| Actions | `Edit mapping` (opens a `Sheet`, same right-side-drawer pattern as "Edit Organization"), `Remove mapping` |

"Add mapping" is a `Button` (secondary size, per the buttons guideline — it's an inline list action, not the page's primary submit) opening a `Sheet` with: registration select, LMS context identifier input, class select (scoped to `organization.id` only — reinforces invariant #8, a mapped class must belong to this org). Sheet title: `Map an LTI course`. Submit button: `Save mapping`.

Remove mapping uses the same `ConfirmationDialog` pattern as delete-organization elsewhere, but this is a much lower-stakes action (doesn't uninstall anything, doesn't affect existing identities) — description should say so plainly: `Removes this course mapping. Existing linked accounts are not affected; new launches to this context will show a generic error until it's mapped again.`

### 3d. Recent activity (audit) tab

Reuse the exact expand/collapse row component shape from `app.admin.audit/route.tsx`'s `AuditItem` (chevron, event-type label, status pill, right-aligned timestamp, `divide-y divide-border` list, no card-wrapping the list itself, `bg-destructive/5` row tint for failures) — don't invent a new list primitive, this page should feel like the same audit surface, just prefiltered to this org's LTI events.

Row anatomy: `eventType` (e.g. `launch.success`, `launch.replay_rejected`, `link.created`, `registration.uninstalled`) · status badge (`success` green-soft / `failure` destructive-soft, same classes as `AuditItem`'s inline badge, not the `Badge` component — keep bit-for-bit consistent with the existing audit page's hand-rolled pill since that's the established convention there) · registration name · subject digest (short, `font-mono`, explicitly labeled `Subject (hashed)` when expanded so nobody mistakes it for an email) · timestamp.

Expanded detail (`DetailRow` pattern, reused verbatim): registration, context id, subject hash, outcome, bounded metadata JSON via the existing `JsonBlock` component. **Never** render raw state/nonce, JWTs, or provider bearer tokens even in the expanded/admin view — the audit record shouldn't contain them per invariant #9, so this is enforced by what the backend stores, but the UI should not add a raw-payload passthrough "just in case" a field like that shows up.

Empty state: `No LTI activity recorded yet for this organization.`

No pagination needed at pilot scale — cap at the same `take: N` / infinite-scroll-on-intersection pattern as `app.admin.audit` if it grows, but for the initial build a simple `take: 100, orderBy desc` with a static "showing last 100" note is enough; don't build the `IntersectionObserver` infinite-scroll unless the backend contract already returns more than fits.

### Status semantics (page-wide vocabulary)

Keep exactly three states, consistently colored, everywhere on this page (org gate, registration rows, audit outcomes):

- **Active / success** → `Badge variant="success"` (`bg-green-100 text-green-900`) or the audit page's inline `bg-green-500/15 text-green-700` pill — pick one per surface (badge for row-level status, pill for audit-event outcome) and don't mix within a surface.
- **Disabled / neutral-off** → `Badge variant="secondary"` — this is not an error state, it's an intentional off switch, so it must not use `destructive` or orange/red.
- **Uninstalled / failure** → `Badge variant="destructive"` for uninstalled-registration status; `bg-destructive/15 text-destructive` pill for audit failures — same rule as `AuditItem`.

Never introduce a fourth ad-hoc color (no purple/teal "info" badge for LTI-specific states) — the existing `success`/`secondary`/`destructive` vocabulary already covers everything this page needs.

### Interaction states

- Toggle (org gate, registration enable/disable): optimistic-safe — use a `useFetcher` submit on change, disable the `Switch` while `fetcher.state !== 'idle'`, and revert visually if the action returns an error (standard shadcn `Switch` `disabled` prop during submission).
- Uninstall: dialog confirm button shows loading state (spinner via `Button isLoading`) while the fetcher is submitting; dialog should not auto-close until the response resolves, so a slow uninstall doesn't look like it silently succeeded.
- Table row actions: dropdown items are plain buttons; no hover-transition on non-interactive table cells (per interactivity guideline — only the `DropdownMenu` trigger and its items get hover states).
- Copy-id affordance: reuse `tooltip-id-copy.tsx` verbatim rather than rebuilding a copy button — it already has the right feedback/tooltip states.

### Accessibility

- Every icon-only action (dropdown trigger `⋯`, copy-id button) has an accessible name via `aria-label` or visually-hidden text — the codebase already does this via Radix defaults on `DropdownMenu`/`Tooltip`, just confirm labels are specific ("Registration actions for {registrationName}", not generic "Actions").
- `Tabs`/`TabsList`/`TabsTrigger` from Radix already provide correct `role="tablist"`/`aria-selected` semantics and keyboard arrow-key navigation — no custom work needed, just use the primitive as-is.
- `ConfirmationDialog` (wraps Radix `AlertDialog`) already traps focus and returns focus to the trigger on close — no additional focus management needed for Uninstall.
- Status badges: since these are load-bearing (not decorative), each one's text content is the actual status word (`Active`, `Disabled`, `Uninstalled`) — never color-only. This is already the pattern in `AuditItem` and should stay that way here.
- Switch: associate with a visible label via the existing row layout (label text is a sibling, not a wrapping `<label>` around the whole row) — if reusing shadcn `Switch`, pass `aria-label` matching the visible row title as a fallback in case the row markup doesn't formally associate them.

### Responsive / mobile behavior

- Header row (`org name back-link` + `enabled/disabled` badge): already `flex-wrap` — stacks the badge under the back button on narrow screens rather than truncating either.
- Tenant gate card: the label/description + `Switch` row goes `flex items-center justify-between` on `sm:` and up; **below `sm:`**, stack it (`flex-col items-start gap-2`, switch below the text) since the description text plus a switch side-by-side gets cramped under ~380px — this is the one place the brief deviates from "just reuse the flex row," because the row has a two-sentence description, unlike the org page's short single-line checkboxes.
- Registrations/mappings tables: wrap in the standard responsive-table two-div pattern (`-mx-4 -my-2 overflow-x-auto ... sm:-mx-6 lg:-mx-8` outer, `inline-block min-w-full px-4 py-2 ... sm:px-6 lg:px-8` inner) matching this page's `p-3 md:p-5` container padding exactly, so columns scroll horizontally on phones instead of squeezing.
- Tabs: `TabsList` already scrolls fine at 3 items; no special mobile handling needed (unlike the 5-item global `adminTabs` bar which needs `overflow-x-auto`, 3 tabs fit on a 320px screen without wrapping).
- Audit rows: the existing `AuditItem` row (chevron, label, badge, timestamp) already truncates the summary label and right-aligns timestamp with `shrink-0` — reuse verbatim, it was already designed mobile-first for the audit page.
- Sheet (Add/Edit mapping): existing `Sheet` component is already full-width on mobile / `sm:max-w-md` on desktop per its use in the org edit sheet — no changes needed.

---

## Component/utility reuse checklist

Nothing new to build except page-specific layout glue. Every primitive referenced already exists:

- `Button`, `Badge`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Table*`, `Tabs*`, `Sheet*`, `Input`, `Label`, `Switch`, `DropdownMenu*`
- `ConfirmationDialog` (destructive uninstall/remove flows)
- `GeneralErrorBoundary` (route-level `ErrorBoundary` export on all three new routes, same as every other route in the app)
- `tooltip-id-copy.tsx` (deployment/context id copy affordance)
- The audit page's local `DetailRow`/`JsonBlock`/`AuditItem` shape (either import if extracted, or hand-copy the same markup — don't redesign it)
- `~/utils/misc` `cn()` for conditional classes

`switch.tsx` also already exists in `components/ui` and matches the toggle pattern used in this brief — confirmed present, no new primitives required at all for this build.
