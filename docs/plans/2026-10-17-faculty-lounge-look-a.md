# Faculty Lounge, Look A: "The Letter"

Date: 2026-10-17. Builds on PR #484 (branch `claude/youthful-clarke-htiae9`).
Mockup: the "Faculty Lounge: three looks" canvas, artboards A (feed) and A (thread).

## What changes, in one paragraph

The Lounge keeps every behavior it has today and gets a new face. The page
band with tabs becomes a masthead inside the content column. Brian's pinned
welcome post renders as a letter at the top, with the House Rules beside it
as a dark panel and the YAWP! team's faces underneath. Feed rows get an
avatar, a serif title, and one preview line (Brian's answer when there is
one). The thread page puts Brian's answer in its own white card with a
"Brian's answer" badge, and replies become avatar rows. Nothing moves in the
database and no route changes its URL.

## Design decisions (settled unless you say otherwise)

- **Type.** Titles in Cormorant Garamond, which the app already loads for
  the public pages (`.yawp-public`), at 600 weight and one step larger than
  the mockup's Fraunces since Cormorant runs small. Body stays Roboto. If
  Cormorant looks too thin next to Roboto in the first build, we switch to
  Fraunces; it is one `@import` and one CSS variable.
- **Color.** The app's existing tokens: cream background, ink text, clay
  primary. Two additions as CSS variables in `app.css`: `--lounge-ink`
  (#2A2824) for the dark panel and the serif titles, and six muted avatar
  tones. No new accent.
- **Avatars.** Initials in a circle, color picked from the six tones by a
  stable hash of the user id. The YAWP! team is always ink on cream. No
  photos in this round.
- **Pinned posts.** The first pinned post (oldest pin) is the letter: title,
  author, a 280-character excerpt, and the reply count. The second is the
  dark panel: title and the first line of its body. A third or fourth pinned
  post (Brian's weekly prompt) stacks under the dark panel as a small cream
  card. One pinned post alone spans the full width. None: no featured
  section, the feed starts at the filter row.
- **The team block.** "The YAWP! team" with the faces of admins who have
  posted or replied in the Lounge, up to six. No teacher count.
- **Preview line on a feed row.** In this order: the first YAWP! team
  reply's first 160 characters; else the post body's first 160 characters;
  else nothing. Shares show the attachment line instead of a preview.
  Questions that are all title (the launch questions) therefore show Brian's
  answer, which is the point.
- **Answered marker.** "Brian answered" using the answering admin's first
  name, "YAWP! team answered" if the name is missing. Video answers keep the
  camera icon: "Brian answered on video".
- **Sorts and topics.** The sort tabs read Latest / Most helpful /
  Unanswered (keys stay `new` / `top` / `unanswered`, so links keep
  working). Topics become chips: "All topics" plus the topics that have at
  least one live post, most posts first, up to six, and the selected topic
  always shown. The `?topic=` param is unchanged.
- **Trainings.** The masthead carries a small "Community · Trainings" line
  under the title, so the course grid keeps its one-click path and the
  trainings page shares the masthead with "Trainings" current.
- **Thread.** Eyebrow "Question · Topic", serif title, avatar byline, the
  action row (helpful, reply, pin, edit, delete, report) as quiet pill
  buttons. YAWP! team answers render as a white card with the "Brian's
  answer" badge, the body at 17px, and the video player inside the card.
  Replies are avatar rows separated by hairlines. The reply box keeps the
  mention picker and the staff video recorder. Draft and scheduled banners,
  the share card, edit forms, and hidden/private notices keep their current
  behavior, restyled to match.
- **Composer, welcome box, settings, Contact Us.** Serif h1 and the same
  back link; otherwise unchanged.
- **Phone.** The letter and the dark panel stack. Chips wrap. Avatars drop
  to 36px. The masthead actions wrap under the title.

## Work, in order

Each step is a commit with its tests, e2e first for anything on screen.

### 1. Domain: what the new feed needs to know

`app/domain/lounge/lounge.server.ts`

- `LoungePostSummary` gains `preview: string | null` and
  `answeredBy: string | null` (first name of the first YAWP! team reply's
  author). The summary select adds `body` and, on the staff replies
  sub-select, `body` plus `author.name`, ordered by `createdAt asc`.
- `LoungePinnedPost` gains `excerpt`, `author: LoungeByline`, `kind`.
- New `listLoungeTeam(): Promise<Array<{ userId, name, initials }>>`:
  admins with at least one live Lounge post or reply, by first activity,
  capped at six.
- New `listLoungeTopicCounts(viewer, now)`: live, visible posts grouped by
  topic, count desc.

`app/domain/lounge/avatar.ts` (new, pure): `initialsFor(name)`,
`avatarToneFor(userId)` (hash into six tones), `previewFor({ body,
staffReplyBody, attachment })`. Unit tests first.

Integration test additions in `lounge-launch.integration.test.ts`: a seeded
launch question's summary has `preview` starting with Brian's answer and
`answeredBy` "Brian"; `listLoungeTeam` lists Brian and Kevin and not an
admin who has never posted; topic counts match the seed.

### 2. Components

`app/components/lounge/`

- `lounge-avatar.tsx`: `<LoungeAvatar name userId isStaff size>`.
- `lounge-masthead.tsx` replaces `lounge-header.tsx`: eyebrow, serif title,
  Community · Trainings line, and the action cluster (settings, Contact Us,
  New post). Same props as today plus `active`.
- `lounge-byline.tsx`: optional avatar, unchanged text.
- `lounge-featured.tsx`: the letter card, dark panel, small pinned cards,
  and the team block, from `pinned` and `team`.
- `lounge-post-row.tsx`: one feed row, extracted from the index route so the
  row is testable on its own.
- `app.css`: `.lounge-serif` and the two variable groups.

### 3. Feed route

`app/routes/app.lounge._index/route.tsx`: loader adds `team` and
`topicCounts` (both only on the first page, like `pinned`), renders
`LoungeFeatured`, the filter row with chips, and `LoungePostRow`s. The vote
action is unchanged.

E2E first: `teacher.faculty-lounge-launch.spec.ts` gains a test that the
first visit after the welcome box shows the letter with Brian's name, the
House Rules panel, the team block with Brian, and Q1's row previewing
"Use the Class Starter". Existing assertions that read "YAWP! team
answered" change to the admin's first name ("Admin answered" in e2e).

### 4. Thread route

`app/routes/app.lounge.$postId/route.tsx`: restyle only. The answer card,
avatar rows, and pill actions. All intents, forms, and banners stay.

E2E: the existing thread assertions already use region names ("Answers
from the YAWP! team", "Replies"); keep those names on the new markup so the
specs stay green, and add one check that Brian's answer card carries the
"Brian's answer" badge.

### 5. The other Lounge pages and the trainings grid

Composer, welcome, settings, Contact Us: serif h1 and back link.
`app.teacher-trainings._index`: use `LoungeMasthead` with `active="trainings"`.

### 6. Verify, document, push

- `tsc`, Lounge unit tests, the three DB integration suites, all Lounge e2e
  specs, and the trainings/dashboard/thesis/exit-ticket regression specs.
- Screenshots at 1280 and 390 with the seeded launch content.
- Append "Round 4: Look A" to `2026-10-12-teacher-lounge-community-board.md`
  and update the PR #484 description.

## What this does not do

- No new tables, columns, or migrations.
- No photos or avatar uploads.
- No change to the admin inbox.
- No change to emails.
- No Discuss tabs on modules, search, or unread badge.

## Rough size

About a day of focused work: a morning for steps 1 and 2, an afternoon for
3 and 4, and a short session for 5 and 6. Five or six commits on the same
branch, so PR #484 stays the one PR.

## Things to confirm before step 2

1. Cormorant Garamond (already in the app) or Fraunces (the mockup's font)
   for titles. Default: Cormorant.
2. The House Rules panel shows the rules post's title and its first line.
   Fine, or should it list the seven rule titles from `launch.ts` instead?
   Default: title and first line, since the panel reflects whatever the
   second pinned post is.
3. The team block lists admins who have posted. If Bryant and Eric should
   appear before they post anything, I can list all admins instead.
   Default: only those who have posted.
