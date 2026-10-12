# Lesson Planner: Brian's second run, turned into work

Source: `session-log-run-2.md`, Brian's Oct 12 run of the planner on the same
*Things They Carried* lesson (English 11, Period 5, 50 minutes), on the PR 437
preview build (`claude/beautiful-gates-i8db40`, HEAD e7b1853), plus Kevin's
item 39 (a live stack panel beside the chat). Every item in the log maps to a
numbered change below. Nothing here is built yet.

All code paths are under `services/web-app/app/` unless they start with
`packages/`, `services/` or `e2e/`. Line numbers are against e7b1853.

Companion documents: the wave-1 plan
[`2026-10-11-lesson-planner-brian-review.md`](./2026-10-11-lesson-planner-brian-review.md)
and its report-out
[`2026-10-11-lesson-planner-brian-review-report.md`](./2026-10-11-lesson-planner-brian-review-report.md).

## What Brian said, in short

Brian's reactions sort into five groups. The order is the order the work
should go in.

1. **Two things broke his trust and must be fixed first.** On the stack, Edit on
   the slide deck opened a blank description box, and saving it deleted the
   deck (items 23, 24, 27). The "download" button on the lesson plan did
   nothing (item 33). Brian: "I can't imagine a situation where a teacher would
   ever want to do this."
2. **The stack is not yet the outline of the lesson.** He wants to add *every*
   activity (reading, discussion, quick write), not only writing assignments
   (item 4, quote: "The function of the stack is to build an outline of my
   lesson with everything that's going to happen"); add everything then refine
   (3); drag to reorder (1); remove from the list (2); auto-save (6); "Create
   this assignment in YAWP!" on writing items right in the stack (5); the deck
   as the last step (7); no filters (36); no internal codes (17, 21, 26). Kevin
   adds: show the stack live beside the chat while planning (39).
3. **Fit the period.** The plan and the deck both ran long for 50 minutes
   ("14 slides · 57 min"); flag or trim (8, 9). The "50 min" footer's source is
   unclear.
4. **The deck.** Keep it to this day's reading (10, "getting ahead of itself");
   hide minutes from the slide face (14); edit text on the slide (13); softer
   orange and raised white tiles (11, 12, "subtle, subtle, subtle"); duplicate
   titles; "Write for 4 minutes. Go." (16); footer logo undecided (15).
5. **The lesson plan document.** Too long and a transcript; should be a
   concise plan (Overview, Goals, Teacher will, Materials, numbered
   Instructions, closing) with a short summary and function per part (28, 29,
   32); must open in Word or Google Docs (30, "required"); no logo (31).

Plus the chat flow: the class starter swap must come back as clickable
choices with three buttons and no FW codes (20–22); class starter prompts
bundled into one block (log line 54); framings bundled in the plan view (55);
"you don't have to use all of these" not seen (26); "YAWP!" everywhere (18);
plainer wording on the replace-edits dialog.

**Keep, do not touch:** the planner's voice and the engagement answer
("really beautiful"; Brian wants this as the model personality), read-aloud
"If you like…" phrasing, framing options as separate chat items, the stack
list as separate items with click-to-scroll, Remove / Edit / Save as PDF on
stack cards, the deck built in stack order with the exit ticket closing, deck
Edit / Present / Save to PowerPoint, per-slide move / duplicate / trash,
speaker notes, the hand-edit protection dialog, "I'm done for today", the
handout view with per-piece checkboxes and "Download alone", the planner
recognizing an already-built deck (19), and the make-up handout (37).

## Checklist items Brian did not re-check

These wave-1 items were "not checked this run" and stay as built: R1-01 to
R1-03, intake one-question-per-step, intake chips, class list from real
classes, per-step tweak (deferred), three exit-ticket buttons, closing prompt,
time and cut notes. No work here; Brian should re-check them on the next run
with the intake and stack flags on.

## Where the code is today (what the reports found)

| Area | Current behavior | Code |
| --- | --- | --- |
| Stack data | No packet table. A stack = kept `LessonPlanMessage` rows (`keptAt`, `keptAudience`, `keptTitle`) + `LessonPlanMaterial` rows (`slot` unique per conversation, `kind`, `audience`, `content`, `editedAt`, `sourceMessageId`, `blockKey`). The deck is a material with `slot='deck'`, `kind='slides'`, content = the `yawp-slides` fence. **No order/position column.** Order = source message time, reply before its materials. | `packages/prisma/schema.prisma` L1459–1558; `domain/lesson-planner/load-lesson-packet.server.ts` L67–131; `lesson-material.ts` L37–40, 272–283 |
| Stack list | `ResourceIndex` shows title, kind icon, minutes and a jump button only. Filters All/Plan/Handout/Slides appear when >2 kinds. Edit / Remove (stack v2, 6 s Undo) / Save as PDF live in the full-plan section header, not the list. No reorder anywhere. | `routes/app.lesson-planner_.$conversationId.packet/resource-index.tsx` L40–130; `packet/route.tsx` L59–128, 551–652 |
| Packet API intents | `keep`, `drop`, `rename`, `rename-section`, `rename-material`, `edit-material` (overwrites `content`, sets `editedAt`, **no kind check**), `delete-material`, `add-material` (re-reads the block from the reply, upserts by slot, 409 on hand-edit unless `confirmReplace`), `remove-material`, `publish`, `unpublish`, `delete`. | `routes/api.domain.lesson-planner.packet/route.ts` L33–386 |
| **Deck-edit bug** | `buildLessonPacket` strips the slides fence out of a deck material, leaving `section.content === ''` and `section.deck` set. The stack renders `SlideDeckCard` **without `editHref`**, so the only "Edit" is the generic section-header button, which mounts `MaterialRichEditor` on the empty prose. Save posts `edit-material` with the typed text as the whole `content`; the server writes it over the fence. The deck JSON is gone. On reload: no deck, "hhhh" as the body, "Slides" + "Edited" badges. Chat card then points Present / PPTX / Edit at the corrupted material id, which 404. | `lesson-packet.ts` L258–273; `packet/route.tsx` L602–643, 711–715; `material-rich-editor.tsx` L193–204; packet API L213–216; `app.lesson-planner/route.tsx` L282–293, 1322–1333; `load-deck.server.ts` L52–61 |
| **Download bug** | "Create Lesson Plan", "Save Lesson Plan as PDF", "Print Lesson Plan" do not exist in code. They were model-written `suggestions` chips; clicking one only sends the text as a chat message, and the model can only answer with Markdown. Links the model writes to URLs no tool returned lose their href (`verifyLessonLinks`); `#` anchors survive and do nothing. The real exports are the stack page's "Print / Save as PDF" anchor with `download` to the `.pdf` route (headers correct, e2e-covered) and "Print this reply" (`window.open` + `print()`, silently blocked by popup blockers except for a toast). | `build-system-prompt.ts` L624–638; `app.lesson-planner/route.tsx` L1466–1480; `lesson-links.ts`; `packet/route.tsx` L317–329, 352–356; `packet[.]pdf/route.ts` L85–100; `assistant-markdown.tsx` L156–194 |
| Lesson plan export | `renderPacketPdf` is a dump: title, then one page per section with full prose, every slide + notes, every nested material in full. No summary step, no Overview/Goals structure. The only condensed view is the on-screen Outline tab. No logo (a terracotta rule and PDF `Creator` metadata only). No .docx anywhere; `app/domain/office` is read-only OOXML parsing. `pdfkit` and `pptxgenjs` are the only document deps. No Google integration. | `lesson-pdf.server.ts` L372–469; `markdown-blocks.ts`; `package.json` L109, 114; `present…[.]pptx/route.ts` (binary download pattern) |
| Writing items in stack | `exerciseAsMaterial` kinds class-starter / daily-pages / exit-ticket as `audience: 'student'`; `packetKindForMaterial` maps all of them to `'handout'`. Content gets a trailing `_Class Starter prompt FW-021_` line, which renders in the stack, PDF, handout and editor. No create link in the stack: the packet loader has no type ids and does not select `sourceMessageId`. Chat has `dailyPagesCreateHref` / `exitTicketCreateHref`. All exit tickets share slot `ticket`, so a second one replaces the first. | `artifact-from-reply.ts` L32–70; `lesson-material.ts` L252–261; `load-lesson-packet.server.ts` L78–87; `daily-pages-card.tsx` L108–120; `exit-ticket-card.tsx` L135–144 |
| Non-writing steps | Only fenced blocks can be stacked: `yawp-material`, `yawp-daily-pages` (stack v2), `yawp-exit-ticket`, the deck. Reading, discussion, quick writes written as prose have no button. `yawp-practice` and `yawp-resource` have no toggle. "Add the whole lesson" (`keep`) files the *whole reply* as one section; nested `yawp-material` blocks (the framings) show inside it with no separate controls. | `reply-parts.ts` L31–60; `lesson-packet.ts` L234–253; `packet/route.tsx` L723–749 |
| Class starter block | Prompt rule: one prompt per `yawp-daily-pages` fence, three fences. But the example at L368 tells the model to write `**Class starter (5 min)** — Daily Pages prompt FW-001: "…"` inline, contradicting L578/L581 and labelling an FW id as Daily Pages. The parser takes only the first `id:`; several prompts in one fence become one card, one create link with all of them, one stack item. L360, L434 and tool notes also tell the model to cite ids. | `build-system-prompt.ts` L358–371, 434, 558–582; `daily-pages-block.ts` L147–181, 205; `lesson-planner-tools.server.ts` L84, 134, 319, 331 |
| Swap flow | No "swap" chip and no swap rule in the prompt. The `slot:` revision rule (L98) does not apply to this fence (`splitHeader` only knows `id:`/`kind:`). Replace-by-slot already exists in `add-material` (`replaced` token, `conflict` + `confirmReplace`); exit tickets use it via the shared `ticket` slot. The client has no way to know which stack item is the current class starter (tokens only). | `build-system-prompt.ts` L98; packet API L301–358; `app.lesson-planner/route.tsx` L277–303, 522–560 |
| Period length | Never reaches the system prompt. It lives only in the teacher's intake message ("For English 11 · Period 3, 50 minutes."), which can scroll out of the 20-message / 24,000-char history. `Class.periodMinutes` is read only to seed the slider. No server check that step minutes sum to the period. The stack's "50 min" footer is `packet.totalMinutes`, parsed from "(N min)" in each section's first heading. | `build-system-prompt.ts` L123, 381–388, 686–730; `api.domain.lesson-planner/route.ts` L77–78, 174–186, 365–374; `lesson-packet.ts` L74–80, 298; `packet/route.tsx` L426 |
| Deck minutes | `deckDurationMinutes` is a plain sum. c9bfb1a added one prompt line (L504: minutes total the period); nothing validates or repairs the total. The stack section (L78) says the opposite: total the *pieces'* minutes, "not a period you assumed". Stack contents fed to the model include the existing deck itself. | `slide-deck.ts` L502–504; `build-system-prompt.ts` L78, 504; `stack-contents.server.ts` L338–363 |
| Time labels on slides | Template-made: `TILE_SLIDE_EYEBROWS[layout] + ' · N MIN'` in both renderers. Editor has a Minutes input per slide, no running total. | `tile-theme.ts` L8–17; `tile-slide-canvas.tsx` L27–30, 82–91; `lesson-pptx-tile.server.ts` L49–52 |
| Deck look | Tokens only in `TILE_THEME` (pptx); HTML hard-codes the same hexes (`#D27151` terracotta, `#F7F5EE` cream, `#FFFEFA` paper, `#E6E2D6` wash, `#D6D4CC` rule). The orange top line is the `prompt` layout (class starter). Solid orange: title left block, whole closing slide, compare left header, bullets bar and dots. Card = `ring-1 ring-black/5 shadow-sm` (HTML) / 0.75pt `D6D4CC` line + soft shadow (pptx). HTML wordmark skips title/closing; pptx master draws it on every slide. No logo image. | `lesson-pptx-tile.server.ts` L19–35, 55–83, 152, 403–433; `tile-slide-canvas.tsx` L24–25, 46, 59–77, 112, 166, 220, 277 |
| Deck editor | Title, reorder, duplicate, delete with 8 s Undo, per-slide form (layout, minutes, title, subtitle, text, attribution, bullets, columns, speaker notes). The slide canvas is display-only. Save upserts the `deck` material and redirects to the chat. Loader accepts a message id or a material id. | `routes/app.lesson-planner_.$conversationId.deck.$deckId/route.tsx` L73–97, 180–356; `deck-edit.server.ts` L14–59; `load-deck.server.ts` L47–55 |
| Deck scope | No prompt rule limits a deck to the day's reading; day-scope wording exists only for unit days (L120–131). "You've already created a slide deck from this stack" is model text prompted by the inventory section (L94–99). | `build-system-prompt.ts` L94–99, 475–510 |
| Student-facing timing | "Write for 4 minutes. Go." is model text; the prompt pushes time boxes ("Prefer '3 minutes: students write…'", L523) and nothing keeps timing off the slide body. | `build-system-prompt.ts` L493, 523, 578 |
| Chips and C6 | "You don't have to use all of these" is client-only (`plan-stack-invite`), shown when stack v2 is on AND `looksLikeLessonPlan` finds ≥2 `#`–`###` headings AND the message has an id. A plan with bold step labels fails the check. | `app.lesson-planner/route.tsx` L1385–1393; `suggestions.ts` L212–214 |
| Branding | The prompt never says how to write the name; it uses "Yawp" 58 times. Teacher-facing "Yawp" without "!": progress label "Looking things up in Yawp", toast "Allow pop-ups for Yawp", prompt L201 (closing slide text "open it in Yawp"), L537, starter tile L781. | `planning-progress.ts` L74; `assistant-markdown.tsx` L164; `build-system-prompt.ts` L201, 537, 781 |
| Make-up handout | Model improvisation (a `yawp-material` handout). Stack → chat canned message exists for `?build=deck|handout` (`FROM_STACK_SUGGESTIONS`). | `packet/route.tsx` L343–351; `app.lesson-planner/route.tsx` L596–611; `suggestions.ts` L39–42 |
| Flags | `lesson_planner_intake_v2`, `lesson_planner_stack_v2`, `lesson_planner_deck_v2`, all off by default, on in PR previews. Prompt version `LESSON_PLANNER_PROMPT_VERSION = '2026-10-11-review-v1'` is a cache key only. | `domain/feature-flags/feature-flags.ts` L46–59; `build-system-prompt.ts` L649, 719 |
| Tests | Unit co-located (`bun test app/`). E2E `e2e/tests/teacher.lesson-planner.spec.ts` (smoke) and `teacher.lesson-planner-review.spec.ts` (15 tests, flags on/off) seed canned replies; the LLM is never called. No e2e covers Edit on a deck in the stack, chips about files, .docx, or reorder. | `e2e/README.md` |

## Ground rules for execution (from AGENTS.md)

- **TDD.** E2E first for every screen or flow change; unit tests first for
  domain, server and prompt changes.
- **Backward compatibility.** Anything a teacher sees goes behind a flag;
  the old behavior stays until the new one has run in production for a couple
  of weeks. This wave extends `lesson_planner_stack_v2` and
  `lesson_planner_deck_v2` (both still off in prod, so extending them is safe)
  and adds two flags: `lesson_planner_stack_panel` (item 39, depends on stack
  v2) and `lesson_planner_plan_export_v2` (concise plan + Word file). Schema
  changes are additive and nullable, with rollback SQL, and readers fall back
  to today's behavior when the new column is null (dual-read). Prompt changes
  ship as a version bump, one commit each.
- **Bug fixes that only remove a way to lose data (S1) and copy fixes ship
  without a flag.**
- Small atomic commits, one change each. Push to the designated branch when
  asked.

## Branch strategy (decide before the first commit)

PR 437 is an open draft on `claude/beautiful-gates-i8db40`, 10 commits behind
`main` (merges cleanly). Brian tested that build, and every change below
touches code that only exists there. The designated branch for this work,
`claude/bold-clarke-cysz8h`, has been reset onto PR 437's head so the work
stacks on it.

- **Recommended:** keep PR 437 as is, open wave 2 as a second PR from
  `claude/bold-clarke-cysz8h` with base `claude/beautiful-gates-i8db40`, and
  retarget it to `main` once 437 merges. Reviewers see wave 2 on its own.
- Alternative: push wave 2 commits straight onto PR 437's branch (one large
  PR). Needs explicit permission, since it is not the designated branch.
- Either way, land the two P0 fixes (S1, S2) first and get the preview
  redeployed so Brian can confirm them.

---

## S. Stop the bleeding (ship first, no flag)

### S1. Editing a deck in the stack must never destroy it

Items 23, 24, 25, 27. Brian: "serious", top priority in his list for Kevin.

**Fix, in three layers so no single one has to hold:**

1. **Server refuses to overwrite a deck with prose.** In the packet API
   `edit-material` handler (L213–229): load the material first; if
   `kind === 'slides'` (or the stored content parses as a `yawp-slides` fence),
   return 400 `{ error: 'deck-not-editable-as-text' }`. Same guard for any
   future kind whose content is structured. Generalize: `edit-material` only
   applies to prose kinds (`handout`, `notes`, `sample`, `step`, class starter,
   daily pages, exit ticket).
2. **Stack deck card gets the real controls** (item 25): pass
   `editHref={/app/lesson-planner/${cid}/deck/${section.id}}` (deck v2),
   `onToggle` is not needed here, but add **Remove** (reuse the section
   Remove-with-Undo, L614–626) and **Save as PDF** (already in the header). Hide
   the generic header **Edit** for `kind === 'slides'` (L602–613). The deck
   editor already accepts a material id (`load-deck.server.ts` L47–55).
3. **Deck editor returns to where it came from.** Add `?from=stack` to the
   edit link from the stack; the editor's Save redirect (route L96) and "Back
   without saving" (L157–159) go to the stack when present, otherwise the chat.
   Brian: "a teacher should be able to check what's in the stack and edit the
   deck right there."

Also: an edited deck material keeps its own description separate from its
slides (item 27). Today a deck has no description field; the body shown under
the card should be the deck summary (`N slides · title`), never editable prose.
The fix in (1) makes "hhhh" impossible; nothing else needed.

**Recovery for already-corrupted decks:** none can exist in prod (flag off).
In the demo space, toggling "In the stack" off and on from the chat card
refiles the original deck.

**Tests first.**
- `api.domain.lesson-planner.packet/route.test.ts`: `edit-material` on a
  `kind:'slides'` material returns 400 and leaves `content` untouched.
- E2E (`teacher.lesson-planner-review.spec.ts`): seed a filed deck, open the
  stack, the deck card shows Present / Save to PowerPoint / Edit / Save as PDF /
  Remove; no generic Edit button on the deck section; Edit opens the deck
  editor; Save returns to the stack with the renamed deck; Remove shows Undo.

### S2. The export buttons in the planner must really download

Item 33, blocker for item 30.

**Fix.**

1. **The app owns every file action; the model offers none.** Prompt rule in
   the suggestions section (L624–638) and the stack section (L77): "Never
   offer to print, download, export, save as PDF, or create a lesson plan
   file. The app has those buttons on the stack page; when a teacher asks for
   a file, say where the button is in one line." Bump
   `LESSON_PLANNER_PROMPT_VERSION`.
2. **Client safety net.** In `withStandardSuggestions` (`suggestions.ts`
   L221) drop any model chip matching
   `/\b(print|download|export|pdf|word|docx|google docs|save (the|this|my)? ?lesson plan|create (a |the )?lesson plan)\b/i`.
   Replace the dropped set with one app-owned chip, "Open the stack to print
   or download", that links (not sends) to the stack page. Unit-test the
   filter.
3. **Rename the stack export controls** to say what they do:
   "Download PDF" (not "Print / Save as PDF": there is no print dialog) and,
   once D2 lands, "Download for Word / Google Docs". Keep `download` anchors;
   they are the working path.
4. **"Print this reply" tells the teacher when the popup was blocked** (it
   already toasts) and offers the PDF link as the fallback in the toast.

**Tests first.** `suggestions.test.ts`: file-shaped chips are filtered and the
stack chip is appended. `build-system-prompt.test.ts`: the no-file-offers
rule is present. E2E: seed a reply whose suggestions include "Save Lesson Plan
as PDF" → the chip is not rendered; the "Open the stack" chip navigates.

---

## A. The stack is the outline of the lesson

### A1. Order lives in the data; drag to reorder, move up/down, auto-save

Items 1, 6. Brian: teachers should move items up or down to sequence the
lesson; no save button.

**Fix.**
- **Schema (additive, nullable):** `LessonPlanMaterial.position Int?` and
  `LessonPlanMessage.position Int?` (kept replies are stack entries too).
  Migration + rollback under `packages/prisma/migrations/`, with the lock
  timeout pattern from 50a6e19. Add to `lesson-planner-migration-order.test.ts`
  if that test enumerates planner migrations.
- **Dual-read ordering:** in `load-lesson-packet.server.ts` L101–131 and
  `stack-contents.server.ts` L13–47 (factor one `orderStackEntries` helper in
  `domain/lesson-planner/stack-order.ts`): sort by `position` when every entry
  has one; entries with `null` keep today's time-based order and are slotted
  after positioned ones. The first `reorder` write assigns positions to every
  entry, so a stack is either fully legacy or fully positioned.
- **New intent `reorder`** in the packet API: body `{ conversationId, order:
  ['m:<materialId>' | 'r:<messageId>', …] }`; validates every id belongs to the
  conversation; writes positions 0..n in one transaction. Also `move` with
  `{ entry, direction: 'up'|'down' }` for keyboard and the side panel.
- **New `StackList` component** (`routes/app.lesson-planner_.$conversationId.packet/stack-list.tsx`),
  used by the stack page under stack v2 and by the side panel (A7). Drag with
  pointer events plus up/down buttons (accessible, no dependency; if a library
  is wanted, `@dnd-kit/sortable` is the usual choice, but check it is not
  already excluded by the bundle rules). Optimistic reorder; `useFetcher`
  posts `reorder` on drop; a failure rolls back and toasts. No Save button.
- **The document view follows the list order** (same `entries`), and the
  PDF, docx and stack-contents-for-the-model all read `orderStackEntries`,
  so "build the deck from this stack" honors the sequence (item 7).

**Tests first.** `stack-order.test.ts` (legacy, mixed, positioned).
`packet/route.test.ts`: `reorder` rejects a foreign id, writes positions,
`move` swaps neighbors. E2E: seed three materials, drag the third to the top
(or use the up button twice), reload, order persists; the deck-from-stack
message is unchanged (ordering is server-side).

### A2. Remove from the list, simple list, no filters

Items 2, 36 (and the "partly fixed" wave-1 item).

**Fix.** In `StackList` each row has: drag handle, kind icon, title, minutes,
a **Remove** (trash) that uses the existing `hiddenIds` + Undo toast logic
(`packet/route.tsx` L59–128, lift it into a hook `useStackRemoval`). Remove the
All/Plan/Handout/Slides chips (`resource-index.tsx` L40–50, 79; `packet/route.tsx`
L219–222) under stack v2; the handout view keeps its own checkboxes. Keep
click-to-scroll (Brian: works well).

**Tests first.** E2E: with stack v2 on, the list has no filter chips; Remove
in the list hides the row with Undo; Undo brings it back; after 6 s the
section is gone on reload.

### A3. Every activity can be added to the stack, one moment at a time

Item 4, log line 52–55. Brian: "I should be able to add this activity, even
though it's not a writing assignment."

Two parts: a deterministic split of plan prose into steps (works on every
reply, no model compliance needed) and a prompt rule that makes the split
reliable.

**Fix.**
- **New artifact kind `step`.** Add to `ArtifactKind` /
  `MATERIAL_KIND_LABELS` (`lesson-material.ts` L46–72, label "Lesson step"),
  `KIND_ICON` (`material-card.tsx` L31–42), `packetKindForMaterial` → `'plan'`,
  teacher audience.
- **Step splitter** `domain/lesson-planner/plan-steps.ts`: from a reply's
  markdown parts (`splitReplyParts`), produce steps at each `##`/`###` heading
  (title, `readMinutes`-style minutes, body up to the next heading), keyed
  `st:N` (≤8 chars, fits `materialKey`). Fenced blocks inside a step stay
  with their own cards. Fallback: a paragraph starting with a bold label and
  "(N min)" is also a step (covers the model's `**Class starter (5 min)**`
  habit).
- **Client:** under stack v2, each step part in `MessageBubble` gets a small
  **"Add to stack" / "In the stack"** toggle in its header row (same
  `onMaterial(messageId, 'st:N', added)` path as materials). `add-material`
  on the server resolves `st:N` through `artifactFromAssistantReply` →
  `plan-steps.ts`, slot `step:<slug>`.
- **Prompt rule (version bump):** under stack v2, "Write every step of a plan
  under its own `###` heading with its minutes, e.g. `### Read aloud (12
  min)`. One step, one heading. Framings, class starters and exit tickets keep
  their own blocks; name them in the step in one line." This also fixes C6's
  detector (E4).
- `yawp-practice` gets a stack toggle too (kind `practice`, student audience,
  inlined via `inlinePlannedPractice`), since Brian wants quick writes in the
  outline; `artifactFromAssistantReply` gains a `pr:N` key.

**Tests first.** `plan-steps.test.ts` (headings, bold labels, minutes, no
duplicate keys, fences excluded). `artifact-from-reply.test.ts` for `st:N`.
E2E: seed a plan with three `###` steps; each has Add to stack; add the
reading step alone → the stack shows one "Lesson step" item titled from the
heading.

### A4. "Add everything, then refine in the stack"

Item 3, and log lines 52 ("one lump item"), 55 (framings bundled in the plan
view).

**Fix.** Under stack v2, "Add the whole lesson to the stack" no longer sends
`keep`. It sends a new intent **`keep-all`**: the server runs the step
splitter and `readLessonMaterials` / daily-pages / exit-ticket readers over the
reply and upserts **one material per step and per fenced block**, in reply
order, assigning `position`. Nothing is kept as a whole-reply section, so each
piece has its own Remove, rename, reorder and (for prose) Edit. The chat
toggles light up for every piece (the response returns the full token list;
the client merges it into `addedMaterials`). "Add the whole lesson" becomes
"Add everything to the stack".

Stack v1 (`keep`) is untouched. `buildLessonPacket` still renders legacy kept
replies.

Framings (line 55): because each framing is already its own `yawp-material`
with slot `frame-*`, `keep-all` files them separately. In the concise export
(D1) only the framings in the stack appear.

**Tests first.** `packet/route.test.ts`: `keep-all` on a seeded plan creates
N materials in order, idempotent on repeat, respects hand-edit conflicts (409
with the list of conflicting slots). E2E: Add everything → stack list shows
one row per step and per framing, each removable.

### A5. Writing items: "Create this assignment in YAWP!" from the stack

Item 5. Handouts are fine as an option, not the default for writing items.

**Fix.**
- Packet loader selects `sourceMessageId`, `blockKey`, `kind` and loads the
  assignment type ids (`findWritingExerciseTypeIds`, factor out of the chat
  loader `app.lesson-planner/route.tsx` L197–210 into a shared server helper).
- For `class-starter`, `daily-pages` and `exit-ticket` materials, the stack
  card shows **"Create this {Class Starter | Daily Pages | exit ticket} in
  YAWP!"** using `dailyPagesCreateHref` / `exitTicketCreateHref`. The exit
  ticket's config is re-derived from the source reply with
  `artifactFromAssistantReply(sourceMessage.content, blockKey)`; if the source
  is gone, fall back to a prompt-only create link.
- Badge reads the item's own kind ("Class starter", "Daily Pages", "Exit
  ticket") instead of "Handout"; `packetKindForMaterial` keeps returning
  `'handout'` for the PDF grouping, but the badge uses
  `MATERIAL_KIND_LABELS[kind]`.
- Exit tickets stop sharing slot `ticket`: slot `exit-ticket:<slug>` like
  starters, so the three options can coexist (`artifact-from-reply.ts` L62–64;
  update `artifact-from-reply.test.ts`). The "revise THAT one" path still
  works through the explicit `slot:` header.

**Tests first.** Loader test for type ids and hrefs. E2E: a filed class
starter in the stack shows the create link pointing at the assignment-type
route with `newPrompt`; its badge says "Class starter".

### A6. Hide internal prompt codes everywhere

Items 17, 21, 26.

**Fix.**
- Stop writing the id into content: `artifact-from-reply.ts` L48–50 drops the
  `_${label} prompt ${promptId}_` footer. Store the id in a new nullable
  column `LessonPlanMaterial.promptId String?` (needed by A5 if the create
  sheet wants the library id; otherwise the prompt text is enough and the
  column can wait: **recommend the column**, it is cheap and keeps the
  "rides along" promise honest).
- Display-time scrub for legacy rows: `stripPromptIdFooter(content)` applied
  in `buildLessonPacket` and `buildStudentHandout`, so already-filed starters
  stop showing the line without a data migration.
- Prompt (version bump): remove the inline-citation example at L368 and the
  "cite its prompt id" wording at L360, L434, and in tool notes
  (`lesson-planner-tools.server.ts` L84, 134, 319, 331). Ids go **only** in the
  fence header `id:` line, which no card renders. Add: "Never show a prompt
  id (FW-021, sf-…) in prose, a slide, a handout or a suggestion."
- Stack contents for the model (`stack-contents.server.ts`) strip the footer
  too, so the model stops echoing it.

**Tests first.** `artifact-from-reply.test.ts` (content has no id; `promptId`
set), `lesson-packet.test.ts` L106/167 updated, `build-system-prompt.test.ts`
(no citation example; the never-show rule), e2e: a filed starter shows no
`FW-` text anywhere on the stack page or in the handout.

### A7. The stack takes shape beside the chat (item 39)

Kevin: when a teacher adds something from the chat, a right-hand panel shows
the current stack; items appear as they are added; the panel expands to the
full stack page; remove and reorder work in the panel.

**Fix.** New flag `lesson_planner_stack_panel` (requires stack v2).
- **Layout:** `app.lesson-planner/route.tsx` currently renders the left rail,
  a centered `max-w-3xl` transcript and the bottom "pieces in this lesson's
  stack / Open the stack" bar (L897–918). Add a right `<aside>` (`w-80`,
  `hidden lg:flex`; below `lg` the bar stays and opens the panel as a sheet)
  that mounts `StackList` (A1) in compact mode: drag handle, title, kind
  icon, Remove, and a header "Your stack · N pieces" with **"Open the full
  stack"** linking to the packet page. It opens automatically the first time
  `keptCount` goes from 0 to >0 in a session; a close control remembers the
  choice in `localStorage` like `readRailPreference`.
- **Data:** the chat loader already returns `addedMaterials` tokens; add a
  small JSON loader `api.domain.lesson-planner.packet` **GET**
  `?conversationId=` returning ordered `{ id, kind, title, minutes,
  entryKey }` from `loadLessonPacket` (reuse `orderStackEntries`). The panel
  fetches it on mount and revalidates after every `packetFetcher` completion
  (add-material, remove-material, keep-all, reorder, delete-material) and
  after each streamed reply lands. Optimistic add: when a chat toggle fires,
  the panel inserts a placeholder row with the card's title until the fetch
  returns.
- **Behavior parity:** Remove in the panel uses the same `useStackRemoval`
  hook (Undo toast) and clears the chat card's "In the stack" state through the
  existing token map. Reorder posts `reorder`. Clicking a row scrolls the
  transcript to the source card when it is on screen, otherwise opens the
  stack page anchored to the section.
- **Build strip at the bottom of the panel** once it has pieces: "Create a
  slide deck from this stack", "Create handouts" (A8), "Lesson plan" (D).

**Tests first.** E2E (`teacher.lesson-planner-review.spec.ts`): flag off → no
aside; flag on, file a class starter from the chat → the aside appears with
that row; remove it in the aside → chat toggle returns to "Add to stack";
"Open the full stack" navigates; two rows reorder with the up button and the
stack page shows the new order.

### A8. Labels, the final step, and the make-up handout

Items 7, 19, 35, 37, 38, and the dialog wording.

**Fix.**
- Rename the view button "Student handout" → **"Create handouts"** and the
  strip link "Student handout from this stack" → **"Create handouts from this
  stack"** (`packet/route.tsx` L314, L347–351); update
  `FROM_STACK_SUGGESTIONS.handout` wording if it leaks into chat.
- Move the "Build from this stack" strip (L333–358) **below the list** under
  stack v2 and title it "When the sequence is set:" with **"Create a slide deck
  from this stack"** as the last button (item 7). When the stack already holds
  a deck (`kind === 'slides'`), the button reads **"Rebuild the slide deck from
  this stack"** and the chat message becomes "Rebuild the slide deck from my
  stack, replacing the one in it", so the planner's "you've already created a
  deck" recognition (item 19, keep) has a clear answer path.
- Add the make-up affordance (item 37/38) as one line under the handout
  controls: **"Send this lesson to a student who missed class"** →
  `?build=makeup`, canned message in `suggestions.ts`: "Make a make-up handout
  from my stack for a student who was absent today. Tell them to go to their
  Assignments in YAWP! and complete the class starter and Daily Pages
  assignments." Extend the allow-list at `app.lesson-planner/route.tsx` L603.
  Wording and placement are Brian and Kevin's call; this is the default.
- Replace-edits dialog (`app.lesson-planner/route.tsx` L536): "You edited this
  in the stack. Replace your edits with this version?" with buttons "Replace"
  / "Keep my edits". Same text in the packet 409 path.

**Tests first.** E2E for each label; `?build=makeup` posts the canned text
once and drops the param; the strip renders below the list; the rebuild label
appears when a deck is filed.

---

## B. The plan fits the period

### B1. The period length reaches the planner, every turn

Items 8, 9 depend on this. Today the server never tells the model the
length.

**Fix.**
- Schema (additive): `LessonPlanConversation.periodMinutes Int?` and
  `classId String?` (nullable FK to `Class`, `onDelete: SetNull`). Written when
  the intake reply is sent (intake v2 already posts the length to
  `api.domain.lesson-planner.class-length`; also record it on the
  conversation), and when `readLessonAsks` sees the composed "…, N minutes."
  message under the old intake. Unit days already have `day.minutes`.
- `buildLessonPlannerSystemPromptBlocks` takes `lesson: { periodMinutes,
  className }` and writes, in the uncached tail: "This lesson is N minutes
  (English 11 · Period 5). Every plan and every deck fits N minutes." Replace
  the stack-section line L78 ("add up to the minutes of the pieces … not to a
  period you assumed") with: "A deck built from the stack covers each piece in
  the stack's order and its slide minutes total the lesson length; if the
  pieces need more than that, say which to cut rather than stretching the
  deck."
- The stack page header and the chat show the length as "Period: 50 min"
  beside "Planned: 57 min" (B2), so the "50 min" footer's source is no longer
  a mystery (wave-1 partly-fixed item).

**Tests first.** `build-system-prompt.test.ts` (length line present when
known, absent when not; no contradiction with L504). `route.test.ts`: the
length is read from the conversation. Migration order test.

### B2. Flag when the plan or the deck runs long

Items 8, 9. Brian: flag when content exceeds the time, or trim.

**Fix.**
- **Plan:** `domain/lesson-planner/plan-timing.ts` sums step minutes from the
  reply (reuse `plan-steps.ts`); if the total exceeds `periodMinutes` by more
  than 10%, the plan card shows a quiet line: "This plan runs 57 min; your
  period is 50. Trim it?" with a pinned chip **"Trim this to 50 minutes"**
  (sends a canned message). Under the stack, the same arithmetic over stack
  entries: "Planned 57 min · Period 50 min" in the header, amber when over.
- **Deck:** after `repairSlideDeck` in `api.domain.lesson-planner/route.ts`
  L461–497, compute `deckDurationMinutes`; when it exceeds the period, mark
  the deck `overBy` and the `SlideDeckCard` shows "57 min for a 50-min period"
  in amber with a chip **"Fit the deck to 50 minutes"**. The deck editor shows a
  running total next to the slide list and the period, live as minutes
  change. No automatic trimming of a teacher's deck.
- **Prompt (version bump):** "Before you hand over a plan or a deck, add up
  the minutes and compare to the lesson length. If it is over, cut and say
  what you cut." (L383–386 already says most of this for plans; extend to
  decks and make the stack rule consistent, B1.)

**Tests first.** `plan-timing.test.ts`; `slide-deck.test.ts` for `overBy`;
e2e: seed a 57-minute plan and deck on a 50-minute conversation → both flags
show; a 50-minute deck shows none; the editor total updates when a slide's
minutes change.

---

## C. The deck

### C1. Deck content stays on this day's material

Item 10. Brian: "limit that knowledge to this particular day's lesson and
chapter."

**Fix (prompt, version bump).** In the deck section (L499–506) and the stack
section (L77–79): "A deck covers only the reading, text and material in this
lesson's stack (or this reply's plan). Do not bring in later chapters, other
stories, or what you know about the book beyond today's reading. If a slide
needs context from outside the day's reading, use only what a framing in the
stack already says." Also exclude the existing deck material from
`loadStackContents` when the request is to build or rebuild a deck
(`stack-contents.server.ts` L338–363), so the old deck cannot seed the new
one with out-of-scope slides.

**Tests first.** `build-system-prompt.test.ts` (scope rule present);
`stack-contents.server.test.ts` (deck excluded when `excludeKinds: ['slides']`).

### C2. Minutes come off the slide face

Item 14. Keep the minutes for the teacher.

**Fix (deck v2).** `tile-slide-canvas.tsx` L27–30 and
`lesson-pptx-tile.server.ts` L49–52: the eyebrow is the layout label only.
Minutes stay in the editor (per slide + running total, B2), in the presenter's
speaker-notes header ("Speaker notes · 5 min"), and in the PDF notes view.
Update `teacher.lesson-planner-review.spec.ts` L537 (`'TODAY · 1 MIN'` →
`'TODAY'`) and `lesson-pptx-tile.server.test.ts` L140–144 (minutes present in
notes, absent on the face).

### C3. Softer orange, raised white tiles, one source of truth for the theme

Items 11, 12, log line 62–63. "Subtle, subtle, subtle."

**Fix (deck v2).**
- Move the colour tokens from `TILE_THEME` into `tile-theme.ts` so both
  renderers import them (HTML hard-codes hexes today). Add tokens: `accent`
  (the current `D27151`, kept for eyebrows, numerals, quote marks, dots),
  `accentSoft` (a desaturated, lighter terracotta for blocks, e.g. around
  `E3A48C`), `tileBorder` (a faint orange, e.g. `accent` at ~35% over paper
  ≈ `EBC9BC`).
- **Blocks:** title-slide left block and the closing slide use `accentSoft`
  (or cream with an `accent` rule, to be chosen by eye); compare left header
  uses `accentSoft`; bullets bar stays `accent` at 1% width (it is a hairline).
- **Prompt (class starter) slide:** replace the top band (`tile-slide-canvas.tsx`
  L166; `lesson-pptx-tile.server.ts` L152 `addBand`) with the raised tile:
  paper fill, 1pt `tileBorder` line, soft shadow (HTML `shadow-md`; pptx
  `shadow` opacity ~0.14, blur 8, offset 3). Apply the same tile treatment to
  quote, steps and compare cards for consistency.
- **Wordmark parity:** make the pptx master skip the wordmark on title and
  closing like the HTML does (or draw it in paper on the closing slide); keep
  slide numbers.
- Render the *Things They Carried* deck to PNGs (LibreOffice, as in wave 1)
  and the Present view and attach them to the PR for Brian's eye. Tune the two
  new tokens there, not in code review.

**Tests first.** `lesson-pptx-tile.server.test.ts`: tokens come from
`tile-theme.ts`; prompt slide has a bordered rounded rect and no band; no
media. A small render test for `TileSlideCanvas` asserting the border class on
the prompt layout.

### C4. Edit directly on the slide, in sync with the form

Item 13.

**Fix (deck v2).** `TileSlideCanvas` gains an `editable` mode used only by the
deck editor: title, subtitle, body, each bullet, column labels/text and
attribution render as `contentEditable` spans (or small inline inputs sized by
the layout) bound to the same `slides[i]` state the form uses, so typing on the
slide updates the form and typing in the form updates the slide. Enter in a
bullet adds one; Backspace on an empty bullet removes it. Speaker notes stay
below (they are not on the face). Layout and minutes stay in the form. The
read-only canvas (Present, thumbnails) is unchanged.

**Tests first.** E2E: click the title on the slide, type, the form's Title
field shows the text; type in the form's Text field, the slide shows it;
save; Present shows both.

### C5. Small deck rules: duplicate titles, timing in the body, closing text

Items 16, log lines 59, 64; and branding on the closing slide.

**Fix (prompt, version bump).**
- "No two consecutive slides share a title. A fact slide and its big question
  get different titles."
- "Slide text never carries a time instruction ('Write for 4 minutes. Go.').
  Minutes live in `minutes`, which the teacher sees and students do not."
  Default decision; Brian's item 16 is open, so this is the recommended answer
  and easy to reverse.
- Closing slide text at L201 becomes "Exit ticket: open it in YAWP! before you
  go" (E6).

**Tests first.** `build-system-prompt.test.ts` for each rule.

### C6. Footer logo: undecided, prepare the option

Item 15. Brian and Kevin to decide; Brian's "phantom logo" idea is a very
transparent circle logo or wordmark at the bottom.

**Fix (only if chosen).** `tile-theme.ts` gains `footerMark: 'wordmark' |
'logo' | 'none'`. `logo` draws `public/img/yawp_black_logo.png` at ~12%
opacity, centered bottom, in both renderers (`doc.image`-style `addImage` with
`transparency` in pptxgenjs; `opacity-[0.12]` in HTML). Default stays
`wordmark` (today's behavior). Ship the switch so the demo space can show both
to Brian. The no-media test (`lesson-pptx-tile.server.test.ts` L125–130)
becomes conditional.

---

## D. The lesson plan document

### D1. A concise plan, not a transcript

Items 28, 29, 32. Brian's reference: the YAWP! pre-writing lesson plan, three
pages: Overview, Goals, Teacher will, Materials, numbered Instructions,
closing. Each part gets a short summary and its function.

**Fix (flag `lesson_planner_plan_export_v2`).**
- **A plan document model** `domain/lesson-planner/lesson-plan-doc.ts`:
  `{ title, class, periodMinutes, overview, goals[], teacherWill[],
  materials[], instructions: { n, title, minutes, summary, function }[],
  closing }`, built from the ordered stack entries.
- **Summaries come from one model call**, not from the teacher's stack text:
  `domain/lesson-planner/plan-summary.server.ts` sends the stack contents
  (already assembled by `loadStackContents`) with a strict JSON schema and
  asks for two sentences per part (what happens; why it serves the lesson),
  the overview, goals and the teacher-will list. Cache the result on the
  conversation (`LessonPlanConversation.planSummary Json?`,
  `planSummaryStackHash String?`); regenerate only when the stack hash
  changes. Deterministic fallback when the model call fails or the flag is
  off: first sentence of each entry, no function line.
- **Materials** lists each handout, class starter, exit ticket and the deck by
  title only ("Class starter: 'Carry' prompt (YAWP! assignment)"). Writing
  prompts are **not** reproduced in full; the handout export has them.
- **Framings** (item 32): only framings in the stack appear, as one
  instruction each if the teacher kept several, with its function; never all
  three at full length.
- **Renderers:** `renderLessonPlanPdf(doc)` (pdfkit, same fonts, no logo) and
  `renderLessonPlanDocx(doc)` (D2). The old `renderPacketPdf` stays as "Full
  packet (PDF)" for teachers who want everything.

**Tests first.** `lesson-plan-doc.test.ts` (structure from a seeded stack;
framings once; materials by title). `plan-summary.server.test.ts` with a fake
model (schema enforced; cache hit on same hash; fallback). `lesson-pdf` test
for the new renderer: under three pages for the seeded *Things They Carried*
stack.

### D2. The plan opens in Word and Google Docs

Item 30, "required". No .docx exists; the repo has `pdfkit` and `pptxgenjs`.

**Fix.**
- Add the `docx` npm package (pure JS, no native deps; check the bundle and
  the Docker image). `domain/lesson-planner/lesson-plan-docx.server.ts` renders
  the `LessonPlanDoc` with real heading styles (Heading 1/2), a numbered list
  for Instructions and plain paragraphs, so Google Docs' importer keeps the
  structure and teachers can add standards.
- New resource route `routes/app.lesson-planner_.$conversationId.packet[.]docx/route.ts`
  mirroring the `.pptx` route (`Content-Type:
  application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `Content-Disposition: attachment`, `Content-Length`, `Cache-Control:
  private, no-store`).
- Stack page buttons under the flag: **"Download for Word / Google Docs"**
  (`.docx`, the primary), **"Download PDF"**, and under a "More" menu "Full
  packet (PDF)". A one-line hint: "Open the .docx in Google Docs with File →
  Open → Upload." A direct "Save to Google Drive" needs Google OAuth and is
  out of scope for this wave.
- No logo (item 31): neither renderer draws one. PDF `Creator` metadata stays.

**Tests first.** `lesson-plan-docx.server.test.ts`: the zip has
`word/document.xml`, headings carry `Heading1` styles, the numbered list has
N items, the text contains no `FW-` id and no "YAWP" without "!". Route test
for headers. E2E: clicking the Word button downloads a file ending in `.docx`
starting with `PK`.

---

## E. The chat flow

### E1. Class starter swap: clickable choices, three buttons, no codes

Items 20, 21, 22.

**Fix.**
- **App-owned chip.** Under a class starter card (stack v2), pin **"Swap out
  the class starter prompt"** (`suggestions.ts`, like `FOLLOW_ON_SUGGESTIONS`).
  It sends the canned message "Swap out the class starter prompt: offer two
  others." The client remembers `swapRequestedFor = { messageId, blockKey }`.
- **Prompt (version bump):** "When asked to swap or offer other class starter
  or Daily Pages prompts, give each alternative as its own `yawp-daily-pages`
  block (with `id:`), never as bullets or prose." Add
  `build-system-prompt.test.ts` coverage.
- **Three buttons on swap replies.** `DailyPagesCard` gets a `swapFor` prop.
  When the previous teacher turn was the swap message (the client checks the
  last user message, or the server tags the reply `swapOf` in
  `LessonPlanMessage.toolCalls`-style metadata), the card shows: **"Add to
  stack"** (existing), **"Use this one instead"** (Brian's phrasing; sends new
  intent `replace-material` `{ conversationId, messageId, materialKey,
  replaceKind: 'class-starter' }` which deletes every `kind:'class-starter'`
  material in the stack and upserts this one at the old one's `position`; 409
  on hand-edit as today), and **"Create class starter assignment"** (the
  existing create link). The normal starter options keep their two controls.
- Codes: covered by A6.

**Tests first.** `packet/route.test.ts` for `replace-material` (removes the
old starter, keeps position, foreign key rejected). `suggestions.test.ts` for
the pinned chip. E2E: seed a starter in the stack, then a swap reply with two
blocks → each has three buttons; "Use this one instead" → the stack holds one
starter, the new one, at the same place; the old card's toggle reads "Add to
stack".

### E2. One prompt per class starter card, always

Log line 54.

**Fix.**
- Prompt: delete the inline example at L368 (A6) so the model is not told to
  put the starter in the step; keep L573–581.
- Parser hardening in `daily-pages-block.ts` `splitHeader` / `readDailyPages`:
  if a fence body contains more than one `id:` line, or prompts separated by
  a blank line each beginning with `id:`, split into several exercises with
  keys `dp`, `dp:1`, … (the key scheme already exists at L259–270). One card
  per prompt even when the model bundles.

**Tests first.** `daily-pages-block.test.ts` (bundled fence → N exercises,
each with its own id and ≤600-char prompt).

### E3. Framings stay separate in the plan view

Log line 55. Solved by A4 (`keep-all`) for stack v2. For legacy kept replies,
`SectionContent` (`packet/route.tsx` L723–749) gives each nested material its
own Remove (sends `remove-material` for that block) and rename, so a bundled
section can be pruned. Small; do with A2.

### E4. "You don't have to use all of these" shows under every plan

Item 26. The line exists (`plan-stack-invite`) but requires two `#`-`###`
headings.

**Fix.** `looksLikeLessonPlan` (`suggestions.ts` L212–214) also accepts two or
more bold step labels with minutes, or two `plan-steps.ts` steps. With A3's
prompt rule, headings become the norm anyway.

**Tests first.** `suggestions.test.ts` (bold-label plan counts); e2e L116–149
extended with a bold-label plan fixture.

### E5. Pinned chips are visible after a plan and after a deck

Wave-1 "partly fixed". Today `FOLLOW_ON_SUGGESTIONS` are pinned unless the
piece is already in the stack. Keep; after B2 the "Trim" chip joins them when
the plan is over time. No other change.

### E6. "YAWP!" everywhere

Item 18. Brian: caps with an exclamation point, everywhere, for now.

**Fix.**
- Prompt (version bump), in "Who you are": "The product's name is written
  YAWP! (all caps, exclamation point) every time, in prose, on slides and in
  handouts." Rewrite teacher- or student-facing prompt text: L201, L537, L781,
  and the "Yawp renders/validates" lines that the model tends to echo (L358–371,
  L401–414, L528–547). Internal comments can stay.
- UI strings: `planning-progress.ts` L74 ("Looking things up in YAWP!"),
  `assistant-markdown.tsx` L164, PDF `Creator` and pptx `company` → "YAWP!".
- Add a unit test that scans `build-system-prompt.ts` output and the
  teacher-facing string tables for `/\bYawp\b(?!!)/` and `/\bYAWP\b(?!!)/`
  and fails on a hit, so it stays fixed.

**Tests first.** The scan test; `planning-progress.test.ts` L37 updated.

---

## Sequencing

| Phase | Changes | Size | Why in this order |
| --- | --- | --- | --- |
| 0. Trust | S1, S2 | 1–2 days | The two bugs Brian hit; redeploy the preview and ask him to confirm |
| 1. Stack is the outline | A1, A2, A6, A5, A8, E3, E4 | 1–1.5 weeks | Order column + list controls unblock everything else; codes and labels are cheap wins |
| 2. Fit the period and prompt fixes | B1, B2, E2, E1, E6, C1, C5 | 1 week | One prompt version bump carries all the rules; B1 needs the schema column |
| 3. Every activity, add everything | A3, A4 | 1 week | Depends on the step splitter and on positions |
| 4. Deck | C2, C3, C4, C6 (if chosen) | 1 week | Render samples to Brian before merging C3 |
| 5. The document | D1, D2 | 1 week | Needs ordered stack (A1), summaries, the `docx` dependency |
| 6. Live stack panel | A7 | 1 week | Reuses `StackList`, `reorder`, removal hook from phases 1 and 3 |

One prompt version bump per phase, not per rule, so cached prompts turn over
a handful of times rather than thirty.

## Decisions for Kevin (defaults taken if unanswered)

1. **Branch:** stack wave 2 as a second PR on top of 437 (recommended), or
   push onto 437's branch?
2. **S2:** filter file-shaped chips client-side as well as in the prompt?
   (Recommended yes; the prompt alone was not enough for the "add all" rule.)
3. **A1:** hand-rolled pointer drag plus up/down buttons (recommended, no new
   dependency) or `@dnd-kit/sortable`?
4. **A4:** under stack v2, "Add everything" files one item per step and
   fence and no longer keeps the whole reply. (Recommended yes.)
5. **A5/A6:** add `LessonPlanMaterial.promptId`? (Recommended yes.) Exit
   tickets stop sharing one slot? (Recommended yes.)
6. **E1:** "Use this one instead" removes *every* class starter in the stack
   and places the new one where the first was. (Recommended; the alternative
   is replacing only the most recent.)
7. **D1:** one model call per export to write the summaries, cached by stack
   hash (recommended), or deterministic first-sentence summaries only (free,
   weaker)?
8. **D2:** `docx` package and a `.docx` route; no Google Drive OAuth this
   wave. (Recommended.)
9. **C3:** the two new colour tokens are tuned by eye on rendered samples
   with Brian, not fixed in this plan.
10. **New flags:** `lesson_planner_stack_panel` and
    `lesson_planner_plan_export_v2`; A1–A6, A8, B2 UI, C2–C5 ride the
    existing stack v2 / deck v2 flags. (Recommended.)

## Decisions for Brian and Kevin together (log says so)

- **Item 15, deck footer logo:** wordmark (today), faded logo, or none. C6
  ships the switch either way.
- **Item 16, "Write for 4 minutes. Go.":** this plan's default removes
  student-facing time instructions from slide text (C5). Say so if it should
  stay.
- **Item 38, make-up button wording and placement:** default "Send this
  lesson to a student who missed class" under the handout controls (A8).
- **Dialog wording** for replacing hand edits (A8 default: "Replace your edits
  with this version?").

## Open questions to check with Brian on the next run

- The "Create Lesson Plan / Save Lesson Plan as PDF / Print Lesson Plan"
  buttons were chat chips written by the planner, not app buttons. After S2
  they will not appear. Confirm the stack page's "Download PDF" and the new
  Word download are what he expects.
- "Saving the description deleted the whole deck": the deck's slides were
  overwritten, not the item. The fix (S1) removes the text editor from decks
  entirely. Confirm the stack deck card now does what he wants.
- Which deck showed "Historical Context" twice: a stack-built deck after the
  framings were filed? C1's exclusion of the old deck and C5's rule should
  stop it; worth re-checking.
- Does he want the stack's "Add to stack" on every step by default (A3), or
  only "Add everything, then refine" (A4)? The plan does both.

## How it will be checked

- TDD per AGENTS.md: unit tests for every domain, server and prompt change;
  e2e for every screen change, in `teacher.lesson-planner-review.spec.ts`
  (new `describe` blocks per phase) and, where smoke journeys change, in
  `teacher.lesson-planner.spec.ts`.
- With all flags off, the existing planner e2e specs pass unchanged, and
  `edit-material` still works for prose materials.
- Flags on in the PR preview (`669bd91` pattern) so Brian runs the same lesson
  a third time with the same log template.
- `./bin/project test --profile changed --json` and
  `bun run typecheck` in `services/web-app` before each push; render the deck
  (pptx via LibreOffice, Present in Chromium) and the Word file (open in
  LibreOffice Writer) and attach screenshots to the PR.
