# Teacher's Lounge → teacher community board

Status: Phase 1 built behind `teacher_lounge_community` (2026-10-13). See
"Phase 1 as built" below.
Source: Kevin's request to rethink the Teacher's Lounge now that its training
materials are moving into the modules and lessons themselves.

## Phase 1 as built (2026-10-13)

Decided: the hybrid feed (Question / Share / Win), keep the "Teacher's
Lounge" name, simplified layout from the second round of mockups.

| Piece | Where |
| --- | --- |
| Flag, off by default, per school | `domain/feature-flags/feature-flags.ts` (`LOUNGE_COMMUNITY_FLAG`) |
| Tables (additive migration) | `20261013120000_teacher_lounge_community` |
| Pure logic (bylines, mentions, privacy nudge, Top ranking, validation, access rule) | `app/domain/lounge/*.ts`, unit tested |
| Reads and writes | `app/domain/lounge/lounge.server.ts`, real-DB test with `LOUNGE_DB_TESTS=1` |
| Emails | `app/domain/lounge/notifications.server.ts` |
| Feed, identity card, composer, thread | `routes/app.lounge._index`, `app.lounge.welcome`, `app.lounge.new`, `app.lounge.$postId` |
| Staff inbox (asks, mentions, reports) | `routes/app.admin.lounge`, new "Lounge" admin tab |
| Nav | Lounge item opens `/app/lounge` when the flag is on; course grid keeps `/app/teacher-trainings` with Community / Trainings tabs |
| E2E | `e2e/tests/teacher.lounge-community.spec.ts` |

PR previews (`yawp_pr_<n>` databases) seed the flag on for everyone so the
community is visible there; demo and production stay off.

Flag off, nothing changes: the nav item, the course grid page, and its
markup are exactly as before, and every `/app/lounge` URL returns 404.

Defaults chosen where the decisions below were still open:

- **Cross-school identity.** On first post or reply a teacher picks Full
  name and school, First name + last initial and school (default), or First
  name only (school hidden). They can change it later.
- **Who is "the Yawp team".** Every user with `isAdmin`. They always see the
  community, appear by full name with "Yawp team", and are listed first in
  the @mention picker.
- **Asking Brian.** A checkbox, "Ask the Yawp team to answer this", or an
  @mention of a team member, puts the thread in the inbox. A team reply
  marks it answered. "Keep it private" makes a post visible only to its
  author and the team.
- **Video replies.** A Loom, YouTube, or Vimeo https link on a team reply,
  shown as "Watch the video". Upload through the S3 pipeline is Phase 2.
- **Emails.** Replies and mentions email the person (opt-out column exists,
  no settings UI yet). Questions for the team email
  `LOUNGE_STAFF_NOTIFY_EMAILS` (comma separated); unset means inbox only.
- **Limits.** 10 posts and 60 replies per teacher per hour.
- **Moderation.** Report on any post or reply; the team hides or dismisses
  from the inbox. Authors can delete their own. No editing yet.

To pilot: set `LOUNGE_STAFF_NOTIFY_EMAILS` for Brian, then target the flag
at the pilot schools from Yawp Internal.

### Round 2 (2026-10-16): one-click shares, Brian on video, pinned prompt

- **Shares.** "Attach from Yawp" in the composer lists the teacher's own
  assignments (deployed to one of their classes). The post stores a frozen
  snapshot (`LoungeAttachment`), so the share survives edits to the original
  and never reads another school's records. The feed shows it as one line;
  the thread shows one card with Preview and "Use in my class". That button
  counts the use (`LoungeAttachmentUse`, once per teacher) and opens
  `/app/assignment-types/<type>?loungeShare=<id>`, where the normal creation
  sheet opens with the prompt and the teacher picks classes. Schools without
  that assignment type see "Your school doesn't offer … yet". Only the prompt
  carries over; points, tutor, and grading settings use the teacher's
  defaults. Lesson Planner lessons and rubrics are not shareable yet.
- **Video.** The Yawp team can record in the browser (MediaRecorder, mp4
  where supported, else webm, 5-minute cap) or upload a file (up to 500 MB)
  on posts and replies. Files go straight from the browser to the videos
  bucket with a presigned PUT; the database keeps only the key and playback
  URLs are signed per page load. E2E, opted-in local dev
  (`LOUNGE_VIDEO_LOCAL_STORE=true`), and PR previews store videos on disk
  instead (`/api/lounge/video-local`); production and demo always use S3.
  Captions and transcripts are not generated; the reply text is required and
  shows above the video.
- **Pinned prompt.** The Yawp team can pin a post (checkbox when posting, or
  Pin to top / Unpin in the thread). The newest pinned post shows above the
  feed as "This week from <first name>".

Before relying on recording in production: the videos bucket's CORS allows
PUT from https://yawp.school and the App Runner URL, which covers the app.

### Round 3 (2026-10-16): Brian's launch notes ("Seeding the Faculty Lounge")

- **Name.** With the community on, the Lounge is the **Faculty Lounge** (nav,
  header, emails) and the team is the **YAWP! team**. Off, it stays
  Teacher's Lounge. One constant (`LOUNGE_NAME` in
  `app/domain/lounge/launch.ts`) if we change our minds.
- **Welcome box.** A teacher's first visit to any Lounge page opens Brian's
  welcome text and seven House Rules. "Enter the Lounge" stays off until
  "I agree to follow the Lounge's House Rules." is checked. The optional
  "YAWP! may share my posts, with my name removed…" consent is stored
  (`LoungeProfile.shareConsentAt`) and can be changed in Lounge settings,
  which also hold the email switch. The YAWP! team skips the box.
- **Names.** Always first name, last initial, and school. The identity-card
  choice is gone; old profiles keep their stored style but it is ignored.
- **Student writing** is allowed with the name taken off (replaces the 10/9
  "no student writing" rule). The composer says so; the name nudge stays.
- **Contact Us** sits in the Lounge header. Messages never post in the
  Lounge: they land in a Messages section of the inbox (Mark handled) and
  email `LOUNGE_CONTACT_EMAILS`, falling back to
  `LOUNGE_STAFF_NOTIFY_EMAILS`. Whether that is Brian, Brock, or both is an
  environment setting.
- **Pins.** Several pinned posts show above the feed, oldest pin first, so
  the welcome post leads and the House Rules follow.
- **Drafts and scheduling.** The YAWP! team can post now, save a draft, or
  schedule a time. Teachers never see a draft or a scheduled post before it
  goes live, and nobody is notified until then. The inbox lists drafts and
  scheduled posts with Publish now and a date picker, flags bracketed
  `[notes]`, and refuses to publish a post that still has them.
- **Editing.** Authors edit their own posts and replies. Edits made after a
  post went live show "edited".
- **Launch content.** `packages/prisma/scripts/lounge-launch/content.ts` holds
  Brian's text word for word: the welcome post and House Rules (pinned), Q1
  to Q6 asked by Kevin with Brian's answers as YAWP! team replies, the Wins
  and Assignment Share threads, and the hopper (revision policy, "is it
  really theirs", Tutor off, the essay stack, Lessons Learned) as drafts to
  release about weekly. Seeding is create-only by seed key, so it never
  duplicates or overwrites edits, and a live post may not contain
  `[placeholders]`. PR previews seed it automatically under stand-in authors
  who cannot sign in. For a real database:

  ```
  LOUNGE_SEED_BRIAN_EMAIL=… LOUNGE_SEED_KEVIN_EMAIL=… bun run seed-lounge-launch          # dry run
  LOUNGE_SEED_BRIAN_EMAIL=… LOUNGE_SEED_KEVIN_EMAIL=… bun run seed-lounge-launch --yes    # create
  ```

  Both accounts must be YAWP! team (admin) accounts. Not seeded, because the
  notes do not have the text yet: Brian's own first reply under the welcome
  post, his first posts in Wins and Assignment Share, and his answers to the
  hopper questions. Lessons Learned is seeded with his bracketed notes and
  cannot go live until they are filled in. Replies from Kevin, Bryant, and
  Eric are for them to write in the app.

Not built yet: Discuss tabs on modules and lessons, sharing Lesson Planner
lessons and rubrics, captions for videos, unread badge, weekly digest,
search, using the share consent anywhere outside the Lounge.

## Why now

Today "Teacher's Lounge" (`/app/teacher-trainings`, sidebar label in
`app/routes/app/sidebar-nav.tsx`) is a grid of `TeacherTraining` courses: Brian's
video modules (S3 multipart upload, signed playback URLs), per-module resource
blobs, and per-teacher watch progress. That content is being linked from where
teachers actually work: `utils/writing-lessons/lounge-links.server.ts` maps each
Writing Lesson to Brian's module, and the Lesson Planner surfaces lounge modules
as resource cards. Once every module lives beside the lesson it teaches, the
Lounge page is a door to a room that has been emptied.

The room is still worth having. What teachers do not have anywhere in Yawp is
each other: a place to ask "how are you teaching thesis statements with
Daily Pages?" and get an answer from another teacher, or from Brian.

## What we already have to build on

| Need | Existing piece | Notes |
| --- | --- | --- |
| Who is a teacher | `OrgMembership.role = TEACHER` | Memberships are per school. A community spans schools, which is new for this app (see Decision 1). |
| Who is "the Yawp team" | `User.isAdmin` / `isSuperAdmin` | Brian and staff. Mentionable-staff list can start from this. |
| Rich text + sanitizing | Tiptap starter kit, DOMPurify | Already used in the document editor; post bodies can reuse a slimmed Tiptap. |
| Comment/reply shape | `DocumentComment` → `DocumentCommentResponse`, `SubmissionComment` | Same one-level thread shape proposed below. |
| Video from Brian | `services/s3.server.ts` multipart upload + `getSignedGetUrl` | Upload is admin-only today, which is exactly a staff video reply. |
| Email | `utils/email.server.ts` (`sendEmail`, SES/Resend, react-email) | Mention and reply notifications. |
| Scheduled work | EventBridge daily rule in `infra/main.tf` → API destination | Pattern for a weekly digest. |
| Rollout gating | `domain/feature-flags` (`off` / `everyone` / `targeted` by org) | Community ships behind a targeted flag. |
| Abuse limits | `RateLimitBucket` / `RateLimitDecision` | Per-user post and reply limits. |
| Admin surface | `/app/admin/*` routes | Moderation queue and "Ask Brian" inbox live here. |

Nothing exists yet for: cross-school identity, notifications/inbox, votes,
mentions, tags, reports.

## Brainstorm

### 1. What kind of place is it?

Four shapes were considered. The recommendation is the hybrid (D).

| Shape | Feels like | Fits "how are you teaching X?" | Risk |
| --- | --- | --- | --- |
| A. Q&A board | Stack Overflow, Discourse Q&A | Very well: question, answers, accepted answer | Can feel formal; nobody posts a "win" there |
| B. Subreddit | Reddit with tags, upvotes, nested comments | Well | Nesting and karma invite the Reddit tone we don't want |
| C. Short-post stream | Bluesky/Twitter | Poorly: answers get buried | Low friction but no structure for Brian to answer |
| **D. Hybrid feed (recommended)** | One feed; each post is a Question, Share, or Win | Well | Must resist feature creep |

Shape D in one sentence: **one feed of typed posts, upvote-only, tagged by
product area, flat replies, with a staff answer that can be pinned to the top of
a thread.**

Why upvote-only and flat: the goal is the first-month-of-Bluesky feeling. No
downvotes, no karma, no nested pile-ons. "Helpful" is the only button. If a
thread genuinely needs sub-threads later, one level of nesting can be added.

### 2. Post types

- **Question**: "How are you teaching conclusions to 9th graders who rush?"
  Has an open/answered state. Staff or the asker can mark a reply as the answer.
- **Share**: a lesson, a rubric tweak, a routine, a resource link. Can attach a
  Yawp object (see 4).
- **Win**: a student moment, a thing that worked. No answer state. The
  positivity half of the feed.
- Later, maybe: **Request** (feature ask), routed to Central Station.

Each post: title, body (Tiptap: bold, italic, lists, links, quotes; no images in
v1), 1 to 3 tags, type, optional attached Yawp object, optional "ask the Yawp
team" checkbox.

### 3. Tags that map to how Brian thinks

Tags should be product areas, so staff can triage and so module pages can filter
the feed to themselves: Writing Lessons, Daily Pages, Thesis & Essays, Grading &
Rubrics, Reporter, Lesson Planner, AP History, Classroom Routines, Wins,
Feature Requests. Staff-curated, not free-form, at least at first.

### 4. The Yawp-specific superpower: attach a thing

Generic forums link out. Ours can attach the actual object: a Writing Lesson, a
training module, an assignment type, a lesson-planner packet, a rubric. The
card renders inline and, for things a teacher owns, offers "copy to my
school" later. This is what makes "how are you teaching X" answerable with
"like this" instead of a paragraph.

### 5. @Brian and the Yawp team

- `@` autocomplete lists staff first (Brian, then the team), then people already
  in the thread. Other teachers are mentionable only once they have posted (so a
  quiet teacher is never dragged in).
- Mentioning staff, or ticking **Ask the Yawp team**, puts the post in a staff
  inbox at `/app/admin/lounge` with states New → Answered → Closed and an owner.
- Brian answers in public by default (one answer helps everyone), with a
  "reply privately" option that emails the asker and leaves a "Brian answered
  this privately" marker on the thread.
- Brian's reply can be text, a video uploaded through the existing multipart
  pipeline, or (v1 shortcut) a pasted Loom/YouTube link rendered inline.
- The thread shows an expectation: "The Yawp team usually answers within two
  school days."
- Staff replies carry a Yawp badge and can be pinned to the top of the thread.

### 6. Identity across schools (the big design question)

Everything in Yawp today is scoped to a school (`OrgMembership`). A community
is only useful if teachers from different schools see each other. Proposal:

- The author of a post is the `User`, not the membership. A new `LoungeProfile`
  row per user holds display name, a school label snapshot ("The Connell
  School"), optional grade band / subject, and `guidelinesAcceptedAt`.
- First post or reply opens a one-time card: "Here's how you'll appear: *Brian
  C. · The Connell School*. Edit?" plus the guidelines. No posting until
  accepted.
- Students never see any of it: every loader requires an active TEACHER
  membership. Intern mock-admin and QA accounts should be excluded or sandboxed.
- Which schools are in: all paying plans plus FREE_CLASSROOM teachers (the
  community is a retention and acquisition tool). Gate by the feature flag's
  targeted-org list during pilot, then everyone.

### 7. Guardrails

- Short community guidelines (be kind, no student names or work with names,
  no selling, assume good faith), accepted once, linked from the composer.
- Soft PII nudge in the composer: if the body looks like it contains an email,
  phone number, or "Student Name:" pattern, show a reminder, do not block.
- Report button on posts and replies → moderation queue in admin. Staff can
  hide, lock, pin, edit tags, and leave a visible moderator note.
- Rate limits via the existing bucket model (for example 10 posts/day, 60
  replies/day per user).
- Authors can edit for 24 hours and delete their own posts (soft delete; replies
  remain with "[deleted]" author).
- Moderation log (who hid what, when) in the admin audit pattern already used.
- FERPA posture: we tell teachers not to post identifiable student work, we
  never feed posts to a model without a flag, and hidden posts are retained 30
  days then purged by the retention job.

### 8. Cold start, which is where communities die

- Brian seeds 10 to 15 real questions from teacher emails, answered in his
  voice, before anyone else sees the board.
- **Discuss tabs on modules and lessons**: every training module and Writing
  Lesson page gets a "Discuss" tab that is the community feed filtered to that
  tag, with the composer pre-tagged. The community shows up where teachers
  already are instead of being a destination they must remember. This is the
  bridge between moving materials into modules and the new board.
- A weekly "Prompt from Brian" post pinned to the top of the feed.
- Weekly digest email (top posts, unanswered questions) using the daily
  EventBridge pattern, opt-out per user.

### 9. Ideas parked for later

Nested replies, polls, "copy this assignment to my school", search, "teachers
in your grade band", badges for helpful answers, AI "similar questions" at
compose time, AI summary of long threads, Request posts that create Central
Station tickets, a public read-only view for marketing.

## Decisions needed before building

1. **Cross-school visibility.** Confirm teachers may see names and school labels
   of teachers at other schools. (Recommendation: yes, with the first-post
   identity card and an opt-out "post as First name only".)
2. **Who is in.** All plans including free classroom, or paid only? (Rec: all.)
3. **Name.** Keep "Teacher's Lounge" and change what it means, or rename
   ("The Staff Room", "Teachers' Commons"). (Rec: keep the label, since it is
   already in the sidebar and in teachers' habits; the training grid becomes a
   "Trainings" tab inside it.)
4. **Brian's commitment.** What response time can he promise, and who covers
   when he cannot? The inbox and the "usually answers within…" line depend on it.
5. **Moderation owner.** Who checks the report queue, and how often.
6. **Video replies in v1** or Loom links first. (Rec: links first, upload in
   phase 2.)

## Proposed plan

Every phase follows AGENTS.md: e2e first for UI, unit tests first for server
code, additive migrations, behind a flag, old Lounge untouched until the new
one has run in production for at least two weeks. Track it as a Central Station
ticket; this doc is the spec body.

### Phase 0: decide and write (about 1 week, no code)

- Resolve the six decisions above.
- Write the community guidelines and the identity-card copy.
- Brian drafts the seed questions and answers.
- Low-fi mock of feed, thread, composer, and admin inbox for one review.

### Phase 1: MVP behind `teacher_lounge_community` (targeted orgs)

Data (one additive migration):

- `LoungeProfile` (userId unique, displayName, schoolLabel, gradeBand?,
  subject?, guidelinesAcceptedAt, emailOptOut).
- `LoungePost` (authorUserId, type, title, bodyHtml, bodyText, status
  open/answered/locked, pinnedAt, hiddenAt, deletedAt, askStaff boolean,
  staffState new/answered/closed, staffOwnerUserId?, answerReplyId?).
- `LoungeReply` (postId, authorUserId, bodyHtml, bodyText, isStaff,
  pinnedAt, hiddenAt, deletedAt, videoS3Key?, externalVideoUrl?).
- `LoungeTag` + `LoungePostTag`.
- `LoungeVote` (userId, postId? / replyId?, unique per target).
- `LoungeMention` (replyId or postId, mentionedUserId, notifiedAt).
- `LoungeReport` (reporterUserId, target, reason, resolvedAt, resolvedBy).

Routes and UI:

- `/app/lounge`: feed with New / Top / Unanswered sort, tag filter, type chips.
- `/app/lounge/new`: composer (Tiptap slim, tags, type, ask-staff box,
  identity card on first use).
- `/app/lounge/:postId`: thread, flat replies, upvotes, pinned staff answer,
  report, mention autocomplete.
- Sidebar: "Teacher's Lounge" points at `/app/lounge` when the flag is on for
  the teacher's org, with a "Trainings" tab linking to the untouched
  `/app/teacher-trainings`. Flag off: nothing changes.
- `/app/admin/lounge`: staff inbox (ask-staff and mentions), reports, pin /
  hide / lock actions.
- Mention and reply notifications by email through `sendEmail`; plain
  "someone replied to your question" and "Brian mentioned you" templates.

Server logic with unit tests first: mention parsing, HTML sanitizing allowlist,
Top ranking (votes with time decay), PII nudge detector, rate limits, access
rule (active TEACHER membership in a flagged org; staff always).

E2E first: teacher posts a question → second teacher replies → first teacher
upvotes and marks answer; teacher mentions @Brian → post appears in admin
inbox → Brian's reply shows pinned with badge; student cannot reach any
`/app/lounge` route; reporting hides nothing until staff acts.

Pilot: Connell School plus two or three friendly schools, seeded by Brian.

### Phase 2: context and video

- "Discuss" tab on training modules and Writing Lesson pages: feed filtered to
  the matching tag, composer pre-tagged.
- Attach a Yawp object to a post (lesson, module, assignment type, packet).
- Staff video replies through the multipart upload pipeline with signed
  playback (replaces the link-only shortcut).
- In-app unread badge on the sidebar item (count of replies and mentions since
  last visit).

### Phase 3: everyone

- Flag to `everyone`; retire the Lounge grid as the sidebar target once every
  training module is reachable from its lesson and the community has been
  stable for two or more weeks (grid stays at its URL).
- Weekly digest email via EventBridge → internal API route.
- Search, nested replies if threads demand it, Request posts to Central
  Station.

### What success looks like in the pilot

- A majority of pilot teachers post or reply at least once in the first month.
- Every ask-staff post gets a staff reply inside the promised window.
- Zero reports that required removal (tone holds).
- Teachers open a Discuss tab from a module or lesson, not only from the
  sidebar.
