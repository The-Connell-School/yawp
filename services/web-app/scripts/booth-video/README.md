# NCTE booth video

A silent, looping, ~5-minute 1080p MP4 of the real app, for the Yawp! booth.
Plan and storyboard: `docs/plans/2026-10-22-ncte-booth-video.md`.

```bash
bash services/web-app/scripts/booth-video/run.sh yawp-ncte-booth.mp4
```

To record against another checkout (the new stack lives in the Lesson Planner
branch, The-Connell-School/yawp#437), point `BOOTH_APP_ROOT` at a git worktree
of it; this folder is copied there and run from it:

```bash
git worktree add ../yawp-437 origin/claude/beautiful-gates-i8db40
(cd ../yawp-437 && bun install)
BOOTH_APP_ROOT=../yawp-437 bash services/web-app/scripts/booth-video/run.sh yawp-ncte-booth.mp4
```

`run.sh` **wipes and re-seeds the local dev database**, starts the app, records
every section in a 1920×1080 X display and joins the clips. It takes about ten
minutes.

## Changing what the video says

Everything on screen is in **`copy.mjs`**: the title cards, captions and
callouts (`SECTIONS`, `VO`), the demo class and its essays, what Maya types,
and every scripted model reply. Edit it and run `run.sh` again.

Brian's recorded talking points go into `VO` as caption and callout text. A
caption is one short line (about 12 words). A callout has a title and a one-
sentence body.

## How it works

| File | Job |
|---|---|
| `run.sh` | The whole pipeline, start to finish |
| `seed-booth.ts` | `base`: the booth class, 24 students, flags. `class-work`: the classmates' graded essays, attached to the assignment section 1 creates live |
| `fake-anthropic.mjs` | A local stand-in for the Anthropic Messages API (`ANTHROPIC_BASE_URL`). The app runs unmodified |
| `replies.mjs` | Picks the scripted reply for each model call by its system prompt |
| `record.mjs` | Drives the app in Chromium, one clip per shot (`--only summary,planner` to redo sections) |
| `harness.mjs` | Browser launch, ffmpeg capture, cursor, captions and callouts |
| `overlay.js` | The on-screen voiceover, styled after the in-app guided tour |
| `cards.mjs` | Opening, section and closing cards |
| `assemble.mjs` | Cross-fades, H.264 + silent AAC, `+faststart` |
| `state.ts` | Prints the booth class's current ids for `record.mjs` |

The AI replies are scripted, as in the "See how it works" guides, and the
closing card says so. Every other screen, save and render is the real app.

## Requirements

Linux with `Xvfb`, `ffmpeg` (libx264) and the pinned Chromium at
`/opt/pw-browsers` (`BOOTH_CHROMIUM` overrides it), plus two fonts so the app
renders as designed: **Roboto** (`apt-get install fonts-roboto`) and
**Cormorant Garamond** (the editor's font, from
`github.com/google/fonts/tree/main/ofl/cormorantgaramond`). The new stack and
its slide decks also use **Bricolage Grotesque**, **Instrument Sans**,
**Gelasio** and **Arimo** (all in `github.com/google/fonts/tree/main/ofl`).
Docker for the local database.

`BOOTH_PACE` (default 0.85) scales how long captions and callouts stay up.

## Playing it at the booth

Copy the MP4 to a USB stick (exFAT or FAT32; the file is far under 4 GB) and
set the screen's media player to repeat. It needs no internet.
