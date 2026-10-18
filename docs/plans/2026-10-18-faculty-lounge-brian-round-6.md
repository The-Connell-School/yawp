# Faculty Lounge, round 6: Brian's video feedback (2026-10-18)

Brian reviewed the Faculty Lounge on video. This plan turns every change he
asked for into work items, with the files to touch, the tests to write first
(AGENTS.md: e2e first for UI, unit first for domain code), and the order to
ship in.

## Where the code lives

The Faculty Lounge is **not on `main`**. It is on:

- `claude/youthful-clarke-htiae9`: open PR
  [The-Connell-School/yawp#484](https://github.com/The-Connell-School/yawp/pull/484)
  (Faculty Lounge, with the Thesis-Driven Essay decks merged in).
- `claude/laughing-franklin-0bgkot`: four commits on top of #484 (the "Teach
  this lesson" card replaces the Trainings module uploads; new handouts).

Everything in Part 1 goes onto this line of work (branch from
`laughing-franklin`, or from #484 if `laughing-franklin` is folded in first),
not onto `main`. The whole Lounge is behind the `teacher_lounge_community`
flag and hasn't launched, so Part 1 changes need no new flag. Part 2 touches
pages teachers already use, so each Part 2 item gets its own flag
(AGENTS.md rule 2).

File paths below are relative to `services/web-app/app/` unless they start
with `packages/` or `docs/`.

---

## Part 1: Faculty Lounge

### 1.1 Header: drop the label above the title, drop the tabs

Brian: the orange caps "TEACHERS USING YAWP!" says nothing and is a Claude
Code tell. Also: there's no Community or Trainings tab any more. The page is
just "Faculty Lounge" and then the posts.

**Change**
- `components/lounge/lounge-masthead.tsx`
  - Delete the `<p className="lounge-accent … uppercase …">Teachers using YAWP!</p>` line.
  - Delete the `<nav>` with the Community · Trainings tabs and the
    `MastheadTab` component.
  - Remove the `active` prop. Update the doc comment.
  - Keep the settings gear, Contact Us, and the `action` slot (New post).
- `routes/app.teacher-trainings._index/route.tsx`,
  `routes/app.teacher-trainings.$id/route.tsx`,
  `routes/app.teacher-trainings.$id_.modules_.$moduleId/route.tsx`: these
  render the masthead with `active="trainings"` while the community flag is
  on. Replace it with the pre-Lounge Trainings header (a plain page title and
  a back link to the Lounge). **Don't delete these routes yet.** Old links,
  emails, and the "course leads back to the Lounge" link still point at them.
  They retire after 2.2 ships and has run in production for a couple of
  weeks.
- `routes/app/sidebar-nav.tsx` (`applyLoungeCommunityLink`): keep
  `alsoActiveFor: ['/app/teacher-trainings']` until those routes retire, then
  remove it.

**Tests first**
- `e2e/tests/teacher.faculty-lounge-launch.spec.ts`: the Lounge heading is
  exactly "Faculty Lounge". The text "Teachers using YAWP!" isn't on the
  page. There's no "Community" or "Trainings" link in the header. Contact Us
  and Lounge settings are still there.
- `routes/app/sidebar-nav.lounge.test.ts`: still passes unchanged.

**Parked (don't build):** a "Videos" tab or video wall for casual
phone or laptop videos from Brian. Revisit once he starts posting video replies.

### 1.2 Topics: match the site's features

Brian wants topics to line up with site features so the team can track what
teachers talk about.

`domain/lounge/topics.ts` says keys are stored on `LoungePost.topic` and must
never be renamed. So **relabel the existing keys** instead of renaming them,
**retire** AP History, and **add** two new keys. None of the seeded launch
posts use `daily-pages`, `thesis-essays`, or `ap-history` (they use
`writing-lessons`, `grading`, `classroom-routines`, and `other`), so nothing
seeded is affected.

| Key (unchanged) | Old label | New label | Composer? |
|---|---|---|---|
| `writing-lessons` | Writing Lessons | **Writing practice** | yes |
| `daily-pages` | Daily Pages | **Class starters** | yes |
| `thesis-essays` | Thesis & Essays | **Thesis development** | yes |
| `grading` | Grading & Rubrics | Grading & rubrics | yes |
| `reporter` | Reporter | Reporter | yes |
| `lesson-planner` | Lesson Planner | Lesson planner | yes |
| `ap-history` | AP History | AP History | **no (retired)** |
| `classroom-routines` | Classroom Routines | Classroom routines | yes |
| `prewriting` *(new)* | | **Prewriting** | yes |
| `lessons-learned` *(new)* | | **Lessons learned** | yes |
| `other` | Something else | Something else | yes |

The composer lists topics in Brian's order: Writing practice, Class
starters, Thesis development, Grading & rubrics, Reporter, Lesson planner,
Classroom routines, Prewriting, Lessons learned, Something else.

**Change**
- `domain/lounge/topics.ts`: update the labels, add the two keys, and add a
  `retired?: true` field. Export `COMPOSER_TOPICS` (all topics that aren't
  retired). `isLoungeTopic` and `loungeTopicLabel` still accept retired keys,
  so an old AP History post (if one exists) still shows its label and topic
  link. Add a separate `isComposerTopic` for validation.
- `domain/lounge/validation.ts`: new posts must use a composer topic, or no
  topic (below). Retired keys are rejected for new posts.
- `routes/app.lounge.new/route.tsx`: build the `<select>` from
  `COMPOSER_TOPICS`.
- `routes/app.lounge._index/route.tsx`: topic chips come from live counts,
  so a retired topic only shows up if posts already use it. That's fine; no
  change needed.

**"Or nothing": the topic becomes optional.** Brian said teachers can tag a
post "with any of these things or nothing." Today the topic is required, and
`LoungePost.topic` is a non-null `String`.
- Migration (additive, safe): `ALTER TABLE "LoungePost" ALTER COLUMN "topic"
  DROP NOT NULL`. Schema: `topic String?`.
- Validation: an empty topic becomes `null`. The select's first option
  changes from a disabled "Choose a topic" to a selectable "No topic".
- `lounge.server.ts`: `toSummary` gives `topicLabel: null` for a null topic.
  `listLoungeTopicCounts` drops the null group. `feedWhere` already handles
  "no filter".
- Thread page: show no topic link for a null topic (it already hides
  `other`).
- `LoungePostRow`: show no topic for a null topic.

**Tests first**
- `domain/lounge/validation.test.ts`: accepts `prewriting` and
  `lessons-learned`. Rejects `ap-history` on a new post. An empty topic
  becomes `null`.
- New `domain/lounge/topics.test.ts`: the composer order is exactly Brian's
  list, and a retired key still has a label.
- `domain/lounge/lounge.integration.test.ts`: a post with a null topic shows
  in the feed and is left out of the topic counts.
- e2e: the composer's topic menu has the new labels, has no AP History, and a
  post with no topic saves.

### 1.3 Post types: General question, Share an assignment, Win, with instructions

Brian worked it out on camera. He landed on three types: **General question**,
**Share an assignment**, and **Win**. Each type gets its instruction line
just below the type picker and above the title, so teachers know what the
post is for.

The DB enum `LoungePostKind` (`QUESTION | SHARE | WIN`) stays. Only the
labels and copy change.

**Change**
- `domain/lounge/topics.ts`, `LOUNGE_POST_KINDS`: add a `prompt` field:

  | Key | Label | Prompt (under the picker) | Title placeholder |
  |---|---|---|---|
  | `QUESTION` | General question | *Copy needed from Brian; draft:* "Ask anything about teaching writing or using YAWP!" | Your question, in one line |
  | `SHARE` | Share an assignment | "Share an assignment that worked. What made it land?" (his Assignment Share thread text) | Name the assignment |
  | `WIN` | Win | "Share a sample of student work that made you happy or proud this week. Remember to take the student's name off." (his Wins thread text) | What happened? |

- `routes/app.lounge.new/route.tsx`: render
  `<p id="lounge-kind-prompt">{prompt}</p>` between the type `<fieldset>` and
  the Title field. Link it with `aria-describedby` on the title input. It
  updates when the type changes.
- `routes/app.lounge.$postId/route.tsx`, `KIND_LABEL` (line ~276): use the
  labels from `LOUNGE_POST_KINDS`; don't keep a second copy.
- `components/lounge/lounge-post-row.tsx`: the kind pill reads from the same
  source.
- `domain/lounge/validation.ts`: the error message becomes "Choose General
  question, Share an assignment, or Win."
- The "Unanswered" sort still filters on `kind: 'QUESTION'`. No change.

**Tests first**
- e2e: each type shows its prompt above the title, and switching types swaps
  it.
- Unit: every kind has a non-empty `prompt`.

### 1.4 Attachments, copy fixes, and closing the picker by clicking outside

**a. Attach from YAWP! only on Share an assignment.**
- Composer: render `<AttachFromYawp>` only when `kind === 'SHARE'`. Clear any
  selection when the type changes away from Share.
- Server (`routes/app.lounge.new/route.tsx` action, or `createLoungePost`):
  ignore `attachAssignmentId` unless `kind === 'SHARE'`, so a crafted form
  can't attach to a question.

**b. Label copy.** In `AttachFromYawp`, change the label "Attached from
YAWP!" to **"Attach one of your YAWP! lessons"**. The button stays "Attach
from YAWP!". Also change the picker's caps header "YOUR ASSIGNMENTS" to
sentence case, "Your assignments" (same rule as 1.1).

**c. Student-writing note.** Under Details, change it to **"Sharing student
writing is welcome, but be sure to take the student's name off first."**
Keep it on every post type, since Wins are where student work shows up most.

**d. Click outside to close.** In `AttachFromYawp`, add a document
`pointerdown` listener while `open`. If the target is outside both the panel
(`panelRef`) and the toggle button (add a `buttonRef`), call
`setOpen(false)`. Escape already closes it. Return focus to the button when
it closes.

**Tests first**
- e2e: on General question and on Win there's no "Attach from YAWP!". On
  Share an assignment it shows with the new label.
- e2e: open the picker, click the page heading, and the picker is gone.
- Integration: a QUESTION post sent with `attachAssignmentId` is saved with
  no attachment.

### 1.5 Remove "Keep it private between me and the YAWP! team"

Brian wants a single channel to the team. Private questions go through
Contact Us.

**Change**
- `routes/app.lounge.new/route.tsx`: remove the `askPrivately` checkbox, its
  state, and the `values.askPrivately` field. Keep "Ask the YAWP! team to
  answer this."
- Add one quiet line under that checkbox: "Something just for the YAWP!
  team? Use **Contact Us**." It links to `/app/lounge/contact?from=/app/lounge/new`.
- `domain/lounge/validation.ts`: new posts always have
  `askPrivately: false`. Keep the field in the type for now so
  `createLoungePost` doesn't change shape.
- **Backward compatibility:** keep all the `STAFF_ONLY` read paths
  (`findVisiblePost`, `feedWhere`, the inbox, the "Only you and the team can
  see this" banner). Any private post that already exists, including on
  preview databases, stays private and readable by its author.

**Tests first**
- e2e: the composer has no "Keep it private" option, and has a Contact Us
  link.
- Validation unit test: `askPrivately: 'on'` in the form gives
  `askPrivately: false`.
- The existing integration tests for `STAFF_ONLY` visibility still pass.

### 1.6 Next and previous post, with a preview of each

Brian wants readers to move through posts without going back to the feed:
definitely at the bottom of a post, maybe at the top too, and each button
should preview the post it leads to.

**Order.** Follow the Latest feed. **Next** goes to the next older post (the
one below it in the feed) and **Previous** to the next newer one, both
sorted by `createdAt desc, id desc`. Use only posts the viewer can see in the
feed (`feedWhere`: live, not hidden, not deleted, community or their own).
Include pinned posts as ordinary posts. A staff member viewing a draft or a
scheduled post gets no next or previous.

**Change**
- `domain/lounge/lounge.server.ts`: new
  `getAdjacentLoungePosts(viewer, { id, createdAt }, now)`. It returns
  `{ previous, next }`, each `{ id, title, kindLabel, author name, excerpt }`
  or `null`. That's two `findFirst` queries with tie-breaks on `id` (the
  existing `excerptOf` gives the teaser). An optional `topic` limits it to
  one topic (see below).
- `routes/app.lounge.$postId/route.tsx` loader: call it, but skip it when
  `post.isUnpublished`.
- New `components/lounge/lounge-post-nav.tsx`:
  - **Bottom (after the replies and reply box):** two cards side by side
    ("← Previous post" / "Next post →"), each with the title and one or two
    lines of excerpt. They stack on phones.
  - **Top:** a compact text row next to the "← Faculty Lounge" back link
    ("‹ Previous · Next ›"), with the title in a `title` attribute.
  - Use `<nav aria-label="More posts">` and real `<Link>`s, so they work
    without JavaScript.
- Nice to have: when the reader came from a topic-filtered feed, carry
  `?topic=` on the post links (`LoungePostRow`'s href) and on next/previous,
  so they stay inside that topic.

**Tests first**
- Integration (`lounge.integration.test.ts`): with posts A < B < C by time,
  B gets previous = C and next = A. Hidden, deleted, draft, scheduled, and
  other people's private posts are skipped. The newest post has no previous
  and the oldest has no next.
- e2e: open a post, click "Next post", and land on the older post, whose
  title matches the teaser.

### 1.7 "Lessons learned": the item Brian remembered from his notes

Brian asked Kevin to look in his notes for a "lessons learned" idea that goes
beyond assignment sharing. **It's in the launch content:**
`packages/prisma/scripts/lounge-launch/content.ts`, under `HOPPER`, seed key
`hopper:lessons-learned`, by Brian, saved as a **draft**:

> A space to share the best things you've figured out along the way.
> *It used to go like that, and now it goes like this.* … Share what you used
> to do, what you do now, and why it changed. … Start your post with "New
> teacher here," and ask away.

It can't go live yet because it still has two `[bracketed notes]` Brian has
to fill in (what came back from the take-home essays, and a one-line moment
when it clicked). `docs/plans/2026-10-12-teacher-lounge-community-board.md`
records this.

**Change**
- Add the `lessons-learned` topic (1.2).
- In `content.ts`, change `hopper:lessons-learned` from `topic: 'other'` to
  `topic: 'lessons-learned'`. Seeding is create-only by seed key, so
  databases that already have the post need a one-time update. Add it to
  `packages/prisma/scripts/lounge-launch/seed.ts` as an idempotent "move
  `topic` from `other` to `lessons-learned` where `seedKey` matches and the
  topic is still `other`".
- Recommendation (for Brian to confirm): when Brian publishes it, pin it next
  to Wins and Assignment Share as a standing thread.
- Optional: when a teacher picks the Lessons learned topic, show a hint under
  the topic menu: "What you used to do, what you do now, and why it changed."
- **Send Brian** the two bracketed lines to fill in.

**Tests first**
- `packages/prisma/scripts/lounge-launch/seed.test.ts`: a seeded Lessons
  Learned post with topic `other` moves to `lessons-learned`. One a person
  edited to some other topic is left alone. Running it twice changes nothing.

### 1.8 Image or screenshot attachments (needs Brian's OK)

Brian suggested teachers might attach a screenshot when asking about
something in YAWP!, and asked whether that invites bad behavior.

**Assessment to send Brian.** The risk is real but small. Only signed-in
teachers who accepted the House Rules can post, there's already a Report
button and team hiding, and posts are rate-limited. The bigger risk is
**privacy**, not bad actors: a screenshot of a class page or a photo of
student work can show student names. That's manageable with the rules
below.

**If Brian approves**, build it behind a sub-flag,
`lounge_post_images`:
- Allowed on **General question** and **Win** (a photo of student work fits
  Win). Not on Share an assignment, which already has its attachment.
- 1 to 3 images, PNG, JPEG, or WebP, at most 5 MB each.
- Re-encode on the server and strip EXIF/GPS data. Check whether `sharp` is
  already a dependency before adding anything.
- Store them like Lounge videos: `domain/lounge/video-storage.server.ts` and
  `services/s3.server.ts` provide the private key plus a per-request signed
  URL. New table `LoungePostImage (id, postId, key, contentType, width,
  height, createdAt)` in an additive migration.
- Hidden or deleted posts don't serve their images. The Report flow covers
  them through the post.
- The upload control shows the privacy line: "Crop out student names and
  faces first."
- Count uploads against the existing `lounge-post` rate limit.

**Tests first:** a unit test for type, size, and count validation; an
integration test that an image on a hidden post isn't served to teachers; an
e2e test that uploads one screenshot on a question and sees it on the post.

---

## Part 2: Beyond the Faculty Lounge

### 2.1 Site-wide: no decorative caps labels above headings

Brian's rule: the orange caps label above a heading is a Claude Code tell and
usually says nothing. Use one only if it tells the reader something. This
applies to pages and slide decks.

**Change**
1. **Stop new ones.** Add a short "Design rules" section to `AGENTS.md` (so
   Claude Code, Codex, and Cursor all see it): *"No decorative uppercase
   labels above headings. A small label above a title is allowed only if it
   gives information that's nowhere else on the screen (for example a
   status). Never use it to restate the page or section name."*
2. **Clean up the Lounge first** (same PR as Part 1):
   - `lounge-masthead.tsx:23`, "Teachers using YAWP!": remove (1.1).
   - `app.lounge.$postId/route.tsx:479`, the caps "QUESTION · TOPIC" line
     above the post title: this one does carry information (the type and a
     topic link). Keep the content, but restyle it as normal-case small text
     or a quiet chip instead of orange caps.
   - `lounge-featured.tsx:78` and `:125`, and
     `app.lounge.$postId/route.tsx:408`: review each. Keep the ones that are
     real status pills; rewrite the rest in sentence case.
   - `app.lounge.new/route.tsx:449`, "YOUR ASSIGNMENTS": sentence case
     (1.4b).
3. **Audit the rest of the app.** 57 route and component files use
   `uppercase tracking…`. Most are fine (table headers, form labels, status
   pills). Go through the list, screenshot every **label directly above an
   h1 or h2**, and remove or rewrite the decorative ones. Likely spots:
   `app.lesson-planner*`, `app.writing-lessons*`, the
   `app.assignment-types.$id/*` library and directions panels, `accessibility`,
   and `terms`.
4. **Slide decks.** Check the Thesis-Driven Essay deck renderer
   (`scripts/thesis-essay-decks/render-hybrid-deck.ts`, `shared-slides.ts`)
   and `present.thesis-essay.$slug` / `present.$conversationId.$messageId`
   for the same pattern. Brian named slide decks specifically.

Rollout: these are copy and style changes, not feature replacements. Ship
them as a separate small PR off `main` (the Lounge ones go in the Part 1 PR),
with before and after screenshots for each page in the PR description.

### 2.2 Training videos move onto the assignment pages

Brian: the training videos leave the Lounge and go on the matching
assignment page (for example, the thesis-driven essay video on the
thesis-driven essay page). Some assignments have videos and some don't.
**He'll show exact placement in his upcoming thesis-driven essay page video.
This item is blocked on that video.**

There's a pattern to reuse: #452 / #484 already put each Thesis-Driven Essay
deck on the assignment page step it teaches (`app.assignment-types.$id`
loader, `buildThesisDecks`, `deckForModuleTitle`, `ThesisDeckLinks`, behind
`THESIS_ESSAY_DECKS_FLAG`).

**Plan**
1. **Inventory (can start now):** list each Teacher Training course and
   module, its videos, and the assignment type and step each one teaches.
   Share the table with Brian to confirm.
2. **Mapping:** start with a static map in code
   (`domain/teacher-trainings/assignment-videos.ts`: assignment type key and
   optional step, mapped to the training module ID), the same way decks map
   by module title. Move it to a DB column only if the team needs to edit it
   in admin.
3. **UI:** a "How to teach this" video block on `app.assignment-types.$id`,
   placed where Brian's video shows. Reuse the training module video player.
   Only render it for assignments that have a video.
4. **Flag:** `assignment_page_training_videos`.
5. **Retire the Trainings pages** only after it has run in production for a
   couple of weeks: then remove the routes' Lounge links and `alsoActiveFor`
   (1.1).

**Tests first:** an e2e test that a teacher on the thesis-driven essay page
sees the video with the flag on and doesn't with it off, and that an
assignment with no video shows no block. A unit test on the map.

### 2.3 Contact Us button on the teacher dashboard

Brian: "probably" also put a Contact Us button on the teacher dashboard.
Confirm, then build it.

**The catch:** `/app/lounge/contact` uses `requireLoungeMember`. That
requires the community flag *and* sends anyone who hasn't accepted the House
Rules to the welcome box. A teacher arriving from the dashboard shouldn't
have to join the Lounge just to ask for help.

**Change**
- Move the contact form to a route outside the Lounge, `/app/contact`, gated
  only on being a signed-in teacher. It still calls
  `createLoungeContactMessage` (same inbox, same `LOUNGE_CONTACT_EMAILS`
  email), and the `from` return path is checked against an allow-list.
  `/app/lounge/contact` keeps working by rendering or redirecting to the same
  form (backward compatibility).
- Add the button on the teacher view of `routes/app._index/route.tsx`, behind
  flag `teacher_dashboard_contact_us`. Placement to confirm with Brian
  (header corner suggested).
- The Lounge masthead's Contact Us links to the same form.

**Tests first:** e2e: a teacher who has never opened the Lounge clicks
Contact Us on the dashboard, sends a message, and it shows in the admin
Lounge inbox. With the flag off there's no button.

### 2.4 Free tier: Class starters, not Daily Pages; no AP History

Brian: "Daily pages is not a thing for the free tier," and free-tier teachers
"don't have access" to AP History.
- The Lounge side is covered in 1.2.
- **Audit:** grep the free-tier surfaces (`components/free-account-usage.tsx`,
  `components/assignments/assignment-creation-sheet.tsx`,
  `domain/guided-tours/tours.ts`, the `routes/app/free-account.css` pages,
  marketing) for "Daily Pages" and "AP History" text a free-tier teacher can
  see. Most already say "Class Starter". Fix anything left (copy only).

---

## Shipping order

| # | PR | Contents | Base | Blocked on |
|---|---|---|---|---|
| A | Lounge round 6 | 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, plus the Lounge part of 2.1 | the #484 line | the General question prompt copy (can ship with the draft) |
| B | Lounge images | 1.8 | after A | Brian's OK |
| C | Caps-label cleanup | 2.1 audit + `AGENTS.md` rule | `main` | none |
| D | Dashboard Contact Us | 2.3 | after #484 merges (needs `createLoungeContactMessage`) | Brian confirming "probably" |
| E | Training videos on assignment pages | 2.2 | `main` / after #484 | Brian's placement video |
| F | Free-tier copy | 2.4 | `main` | none |

Within PR A, make one small commit per item (AGENTS.md rule 3), each with its
test first. Before pushing, run `./bin/project test --profile changed --json`
and the three Lounge e2e specs (`teacher.faculty-lounge-launch`,
`teacher.lounge-community`, `teacher.lounge-shares-video`). Update the
existing assertions those specs make about the Community/Trainings tabs,
"Question / Share / Win", and the private checkbox in the same commit as the
change that breaks them. Add a "Round 6" section to
`docs/plans/2026-10-12-teacher-lounge-community-board.md` when it lands.

## Questions for Brian

1. **Name:** "Share an assignment" or "Share a lesson"? He used both. This
   plan uses *Share an assignment*.
2. **General question prompt:** what should the line under the picker say?
   Draft: "Ask anything about teaching writing or using YAWP!"
3. **Win wording:** "student work" (his thread) or "student writing" (what he
   said on video)?
4. **Images (1.8):** OK to allow 1 to 3 screenshots or photos on General
   question and Win, with the privacy rules above?
5. **Next / previous:** bottom only, or top and bottom? The plan does both,
   with a compact top row.
6. **Lessons Learned:** fill in the two bracketed lines, and should it be
   pinned as a standing thread next to Wins and Assignment Share?
7. **Dashboard Contact Us:** yes or no, and where on the dashboard?
8. **Videos tab:** parked until he starts posting video replies. Confirm.
