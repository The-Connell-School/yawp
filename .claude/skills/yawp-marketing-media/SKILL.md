---
name: yawp-marketing-media
description: Use when creating YAWP! marketing material — product demo videos, narrated walkthroughs, feature clips, screenshot sets for the site or a deck, launch and release announcements, sales one-pagers, social posts, or landing page copy. Also use when asked to record, film, or capture the app for anything audience-facing rather than for QA evidence.
---

# YAWP! Marketing Media

## Purpose

Produce marketing material for YAWP! that shows the real product: narrated demo
videos, screenshot sets, and the copy that goes around them. Every visual claim
is captured from the running app, so what a prospect sees is what ships.

This skill is the YAWP!-specific layer on top of the portable `qa-video-capture`
skill, which owns browser capture, local Kokoro narration, MP4 muxing, and
optional publishing. This skill owns storyboards, personas, brand voice, and
deliverable formats.

Read `README.md` before first use. Run `./bin/doctor` to check both skills.

## Non-negotiables

- **Show the real app.** Every frame comes from the running YAWP! app against
  seeded local data. No mockups, no slideware, no "imagine if" screens.
- **Never capture real student work.** Use local dev personas and seeded data
  (`bun db:seed-local-dev`). Never point capture at production, staging with
  real users, or any database containing real student names, essays, or grades.
  A demo video is a publication.
- **Do not narrate a feature that is not on screen.** If the storyboard says a
  feature appears and the capture shows something else, fix the storyboard or
  cut the claim. Watch the video before it goes anywhere.
- **Feature-flagged work is not marketable yet.** Per `AGENTS.md`, new features
  live behind flags until verified in production. Do not market a flagged
  feature as available without checking with the user first.
- See `references/brand.md` for voice, audiences, and claim rules.

## Workflow

1. **Frame the ask.** What is the deliverable (demo video, feature clip,
   screenshot set, copy), who is the audience (teacher, department chair,
   school admin, student), and where does it run (site, email, deck, social)?
   `references/deliverables.md` has a spec for each format.

2. **Pick or write a storyboard.** Existing storyboards are in `storyboards/`.
   A new one is a JSON file: scenes, routes, interactions, narration.
   Schema and step reference: `references/storyboard-schema.md`.
   Routes, personas, and seeded states: `references/demo-paths.md`.

3. **Start the app with seeded data.**

   ```bash
   bun dev   # runs scripts/worktree-local-setup.sh, seeds dev personas
   ```

   The dev port is printed on startup; pass it as `--url`.

4. **Audit the storyboard before recording.** Selectors drift as the UI changes.

   ```bash
   node scripts/capture_marketing_demo.mjs \
     --storyboard teacher-assignment-to-grading \
     --url http://localhost:3000 --audit
   ```

   Audit visits each scene's route, checks its `waitFor`, and screenshots it.
   Fix any scene reporting `error` before recording.

5. **Record.** One command runs cues, narration, capture, and mux:

   ```bash
   scripts/make_marketing_video.sh teacher-assignment-to-grading \
     ~/yawp-marketing/teacher-demo http://localhost:3000
   ```

   Run the steps individually when iterating — see "Manual pipeline" below.

6. **Review before delivering.** Open the MP4 and at least two screenshots.
   Confirm: narration matches what is on screen, no real names or emails are
   visible, no console errors or empty states are on camera, text is legible at
   the delivery size. Re-record rather than shipping a "close enough" take.

7. **Write the copy.** Video and screenshots ship with words around them.
   Use `references/brand.md` for voice and `references/deliverables.md` for the
   shape of each piece. Draft copy in the repo or hand it back in chat; do not
   post anything to a public channel without the user asking.

8. **Publish only when asked.** `qa-video-capture/scripts/publish_qa_video.mjs`
   puts the MP4 on a Netlify site the recipient owns. Requires
   `QA_VIDEO_NETLIFY_*` variables. Generated password pages are a courtesy gate,
   not access control.

9. **Report.** Lead with file paths (and the public URL if one was requested).
   Say which scenes ran clean, which were skipped or degraded, and which claims
   in the narration you could not verify on screen.

## Manual pipeline

```bash
# 1. cues from the storyboard
node scripts/capture_marketing_demo.mjs \
  --storyboard student-draft-to-feedback \
  --emit-cues ~/yawp-marketing/student/cues.json

# 2. narration audio (local Kokoro, no network)
node ../qa-video-capture/scripts/narrate_qa_video.mjs \
  --prepare-only \
  --cue-file ~/yawp-marketing/student/cues.json \
  --out ~/yawp-marketing/student/prepared-narration.json

# 3. capture, paced to the real narration, writing markers.json
node scripts/capture_marketing_demo.mjs \
  --storyboard student-draft-to-feedback \
  --url http://localhost:3000 \
  --prepared-narration ~/yawp-marketing/student/prepared-narration.json \
  --out ~/yawp-marketing/student/capture

# 4. mux to H.264/AAC MP4
node ../qa-video-capture/scripts/narrate_qa_video.mjs \
  --video ~/yawp-marketing/student/capture/video/student-draft-to-feedback.webm \
  --prepared-manifest ~/yawp-marketing/student/prepared-narration.json \
  --markers-file ~/yawp-marketing/student/capture/markers.json \
  --out ~/yawp-marketing/student/student-draft-to-feedback.mp4
```

Screenshot-only sets skip narration entirely:

```bash
node scripts/capture_marketing_demo.mjs \
  --storyboard feature-screenshots \
  --url http://localhost:3000 \
  --out ~/yawp-marketing/screenshots
```

## Capture runner options

- `--storyboard` name under `storyboards/` or a path to a JSON file. Required.
- `--url` base URL of the running app. Defaults to `$YAWP_MARKETING_BASE_URL`.
- `--out` output directory. Defaults to `./yawp-marketing-media/<name>-<timestamp>`.
- `--emit-cues <file>` write the cue file and exit.
- `--prepared-narration <file>` pace scenes to real audio and write `markers.json`.
- `--audit` route and selector check only.
- `--persona` override the storyboard persona. `--no-login` for public pages.
- `--storage-state` use a saved Playwright session instead of dev login.
- `--width`, `--height` viewport override. `--headed`, `--slowmo` for debugging.
- `--marker-offset` seconds added to every marker, to nudge narration sync.
- `--continue-on-error` finish the run and report failed scenes.

Set `YAWP_MARKETING_CHROMIUM_PATH` if the machine's Chromium build does not match
the engine's Playwright version (common in containers with a preinstalled browser).

Outputs: `screenshots/`, `video/<storyboard>.webm`, `cues.json`, `markers.json`,
`narration.txt`, `manifest.json`.

## Narration rules

Same discipline as QA narration, tuned for an audience that is deciding whether
to buy:

- One cue per visible moment. Cue starts only after the state is on screen.
- 6 to 18 words per cue. Say what the screen cannot say by itself.
- Name the outcome for a teacher or student, not the UI element. "Feedback stays
  attached to the sentence it belongs to," not "click the comment icon."
- Silence during navigation and loading is fine, and usually better.
- If narration runs past the next action, lengthen the scene `hold` or shorten
  the cue. The muxer rejects overlap by design — fix timing, do not force it.

## Extending this skill

- **New demo:** add a storyboard to `storyboards/`. Start from an existing one.
- **New route or persona:** update `references/demo-paths.md` so the next run
  does not have to rediscover it.
- **New step type:** add a case to `runStep` in `scripts/capture_marketing_demo.mjs`
  and document it in `references/storyboard-schema.md`.
- **Positioning changes:** update `references/brand.md`. It is the single source
  for voice and claims, and it should be edited rather than argued with.
- **Mobile or tablet framing:** pass `--width`/`--height`, or add a `viewport`
  to the storyboard.
