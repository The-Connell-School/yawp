# Google Classroom integration

Google Classroom offers three genuinely different ways in, at three very
different costs. This PR builds the first one and stops there deliberately.
The other two are written up here so choosing one later is a decision, not a
rediscovery.

---

## What is built: Share to Classroom (link-out)

A teacher on a class assignment page clicks **Share to Google Classroom**.
Google asks which course to post to and creates the coursework itself. Students
click the link in Classroom and land back in YAWP.

```
YAWP · assignment page
  └─ [Share to Google Classroom]  ── POST /api/classroom/share
       └─ 302 → classroom.google.com/share?url=…&title=…&itemtype=assignment
            └─ teacher picks a course; Classroom creates the assignment
                 └─ student clicks → /classroom/launch/:token
                      └─ sign in → roster check → /app?tab=assignments
```

**Why this one first.** It needs no Google credentials, no OAuth consent
screen, no Google verification review, and no particular Workspace edition. It
works for every school YAWP already has, today. It is also the piece the other
two options build on: both of them still need a stable per-assignment URL and a
launch route that resolves it, which is exactly what this adds.

**What it does not do.** YAWP never learns the Classroom course id, never sees
the Classroom roster, and cannot write grades back. The teacher does the
posting; we only hand over a link.

### Moving parts

| Piece | Location |
| --- | --- |
| Share link model | `ClassAssignmentShareLink` in `packages/prisma/schema.prisma` |
| Rollout gate | `Organization.googleClassroomEnabled` |
| Token mint / resolve / revoke | `services/web-app/app/integrations/google-classroom/share-link.server.ts` |
| Google URL construction | `services/web-app/app/integrations/google-classroom/share-url.ts` |
| Share endpoint | `services/web-app/app/routes/api.classroom.share/` |
| Launch route | `services/web-app/app/routes/classroom.launch.$token/` |
| Teacher control | `services/web-app/app/components/assignments/share-to-google-classroom.tsx` |

### Decisions worth knowing

**The share endpoint is a POST, not a link.** Rendering the URL on the
assignment page would mean minting a token on read, so every page view would
create a share link nobody asked for. The token is minted by a deliberate act.

**The button is a plain `<form>`, not react-router's `<Form>`.** The action
answers with a cross-origin redirect to `classroom.google.com`. A client-side
submission would try to resolve that redirect itself and be stopped at the
origin boundary; only a native form POST lets the browser follow it. There is a
component test pinning this down, because the failure is silent.

**The launch route is not gated on the org flag.** The flag stops new links
being minted. It does not break links a teacher already posted into Classroom
mid-unit — revoking the individual link is the switch that closes an existing
door. Turning the flag off after a rollout should not strand a class.

**A revoked token is indistinguishable from a guessed one.** Both 404. Nothing
about the launch response tells a prober which assignments exist.

**Sign-in happens after the token resolves**, so a dead link never sends
someone through a login round trip only to fail on the far side.

**One row per assignment**, enforced by a unique index. Rotation and revocation
both mutate that row, so a superseded URL can never be resurrected by a second
row pointing at the same assignment.

### Rollout

`googleClassroomEnabled` is `false` for every organization. Turn it on for one
pilot organization, watch `ClassAssignmentShareLink.launchCount`, then widen.
Nothing about the existing assignment flow changes while the flag is off.

---

## Option 2: Classroom API with OAuth (not built)

The teacher connects their Google account once. YAWP then lists their real
Classroom courses and creates coursework through the Classroom API, rather than
handing the teacher off to Google's own dialog.

```
Teacher: [Connect Google Classroom] → Google OAuth consent
  └─ YAWP stores a refresh token per teacher
       └─ pick a course in YAWP → POST courses.courseWork.create
            └─ real Classroom coursework: due date, points, link material
                 └─ later: roster sync, and grades pushed to the Classroom gradebook
```

**What it buys.** Course pick-list inside YAWP, so the teacher never leaves.
Due dates and point values pushed from YAWP instead of retyped. Roster import,
which would remove class-code entry for Classroom schools. Grade passback —
the single biggest ask, and the reason this option eventually matters.

**What it costs.**

- A Google Cloud project, OAuth client, and consent screen per environment.
- Google verification review. The Classroom scopes needed for coursework and
  rosters are sensitive/restricted, which means a security assessment and a
  real review cycle — budget weeks, not days.
- Storing and refreshing per-teacher OAuth tokens: new secret material at rest,
  new revocation paths, new failure modes when a teacher's Google password
  changes or an admin revokes the grant.
- Token refresh and API error handling on a path a teacher is waiting on.

**Relevant scopes.** `classroom.courses.readonly`,
`classroom.coursework.students`, and for grade passback the coursework and
student-submission scopes. Roster access adds `classroom.rosters.readonly`.

**What this PR leaves in place for it.** `ClassAssignmentShareLink` is still
the right link to attach as the coursework's `Link` material, and
`/classroom/launch/:token` is still where students land. Option 2 replaces the
*posting* step, not the link. The natural next commits are a
`GoogleClassroomConnection` model (per-teacher tokens) and a course picker
route; nothing built here has to be undone.

---

## Option 3: Classroom add-on (not built)

The literal "button inside Google Classroom": YAWP appears in the add-ons
picker while a teacher composes an assignment, and students see YAWP content
inline in Classroom rather than following a link out.

```
Google Classroom → Create assignment → Add-ons
  └─ [YAWP] card
       └─ iframe: Attachment Discovery — pick or create a YAWP assignment
            └─ Teacher View / Student View iframes render inside Classroom
```

**What it buys.** The tightest integration available, and the one teachers
picture when they ask for this. Students never leave Classroom.

**What it costs, and why it is not first.**

- **Schools must be on Google Workspace for Education Plus or the Teaching and
  Learning Upgrade.** Add-ons simply do not appear for other editions. This is
  a licensing fact about the customer, not something YAWP can engineer around,
  and it likely excludes much of the current customer base.
- Google Workspace Marketplace listing and review as a Classroom add-on.
- Google Sign-In via Google Identity Platform is required, which is a change to
  YAWP's authentication story, not just an integration.
- Three separate iframe surfaces to build and keep working: Attachment
  Discovery, Teacher View, Student View.
- Development requires a test domain carrying one of those licenses.

**Prerequisite to even evaluate this:** find out how many YAWP schools are on
Education Plus or the Teaching and Learning Upgrade. If the answer is "few",
Option 3 is not worth building regardless of how good it looks in a demo.

---

## Recommendation

Ship Option 1 behind the flag and learn from `launchCount` whether teachers
actually route students through Classroom. If they do, Option 2 is the next
step, and grade passback is the thing to build toward — it is the feature
teachers ask for, and it is reachable without the licensing wall that gates
Option 3.

## References

- [Add a Classroom Share Button](https://developers.google.com/workspace/classroom/guides/sharebutton) — the `classroom.google.com/share` endpoint and its `url`, `title`, `body`, `itemtype`, `courseid` parameters
- [Classroom add-ons developer journey](https://developers.google.com/workspace/classroom/add-ons/get-started/developer-journey) — add-on requirements and review process
- [Use Classroom add-ons](https://support.google.com/edu/classroom/answer/12234529) — the Education Plus / Teaching and Learning Upgrade requirement
