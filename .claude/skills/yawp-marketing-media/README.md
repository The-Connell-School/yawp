# YAWP! Marketing Media skill

Storyboard-driven marketing capture for YAWP!: narrated product demos, feature
clips, and screenshot sets recorded from the running app.

## How the two skills fit together

```
.claude/skills/
  qa-video-capture/       portable engine: Playwright capture, Kokoro narration,
                          MP4 muxing, optional Netlify publishing
  yawp-marketing-media/   this skill: storyboards, dev personas, brand voice,
                          deliverable formats
```

`yawp-marketing-media` never re-implements narration or publishing. It produces
the video, the cue list, and the cue markers; `qa-video-capture` turns those into
a narrated MP4.

`qa-video-capture` was exported from Bryant Brock's working skill on 2026-08-01
and is installed here verbatim. Reuse terms for that original code are Bryant's
to grant — see `qa-video-capture/README.md`.

## Setup

One time, to install the engine's dependencies:

```bash
cd .claude/skills/qa-video-capture
./bin/bootstrap
```

Bootstrap needs Node 18+, npm, Python 3.10–3.13, FFmpeg/FFprobe, and curl. It
installs Playwright Chromium and downloads the Kokoro voice model into
`~/.qa-video-capture` (about 115 MB, not committed).

Then check both skills:

```bash
.claude/skills/yawp-marketing-media/bin/doctor
```

## Making a video

```bash
# terminal 1 — app with seeded dev personas
bun dev

# terminal 2 — record
cd .claude/skills/yawp-marketing-media
node scripts/capture_marketing_demo.mjs \
  --storyboard teacher-assignment-to-grading --url http://localhost:3000 --audit

scripts/make_marketing_video.sh teacher-assignment-to-grading \
  ~/yawp-marketing/teacher-demo http://localhost:3000
```

Audit first — it catches selector drift in seconds instead of after a full take.

## Asking Claude for it

```text
Use yawp-marketing-media to make a 90-second demo video for department chairs
showing the teacher grading loop, plus screenshots for the site.
```

Claude reads `SKILL.md`, picks or writes a storyboard, audits it against the
running app, records, and reports what it could and could not verify on screen.

## Layout

```text
yawp-marketing-media/
  SKILL.md                          workflow Claude follows
  README.md
  bin/doctor
  scripts/capture_marketing_demo.mjs   storyboard runner
  scripts/make_marketing_video.sh      cues → narration → capture → mux
  storyboards/
    teacher-assignment-to-grading.json
    student-draft-to-feedback.json
    feature-screenshots.json
  references/
    brand.md                        voice, audiences, claim rules
    demo-paths.md                   routes, personas, seeded states, selectors
    storyboard-schema.md            storyboard and step reference
    deliverables.md                 format specs and delivery checklist
```

## Environment

| Variable | Purpose |
|---|---|
| `YAWP_MARKETING_BASE_URL` | Default app URL. Falls back to `http://localhost:3000`. |
| `YAWP_QA_VIDEO_SKILL` | Path to `qa-video-capture` if it is not a sibling folder. |
| `YAWP_MARKETING_CHROMIUM_PATH` | Chromium binary to launch, when the machine's browser build does not match the engine's Playwright version. |
| `QA_VIDEO_KOKORO_VOICE`, `QA_VIDEO_KOKORO_SPEED` | Narration voice and pace. |
| `QA_VIDEO_NETLIFY_*` | Only needed to publish a public review link. |

## Safety

Marketing capture runs against local dev data only. Dev login works exclusively
where local dev auth is enabled, and the seeded personas are fictional. Do not
point this at production, and do not publish anything containing real student
work — a demo video is a publication.

Media output is gitignored. Keep captures under `~/yawp-marketing/` or another
folder outside the repo unless the user asks for them committed.
