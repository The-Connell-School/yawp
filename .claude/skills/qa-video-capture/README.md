# QA Video Capture Skill

Portable Claude Code skill for browser QA screenshots, Playwright video capture, local Kokoro Sarah narration, iPhone-compatible MP4 output, and optional Netlify publishing.

This package is self-contained except for third-party runtimes and model files installed by `bin/bootstrap`. It contains no credentials, passwords, customer data, private media, Brock Software site configuration, or 115 MB Kokoro model binaries.

## Install in Claude Code

Copy extracted `qa-video-capture` folder into either location:

- Global: `~/.claude/skills/qa-video-capture`
- One project: `<project>/.claude/skills/qa-video-capture`

Then:

```bash
cd ~/.claude/skills/qa-video-capture
./bin/bootstrap
./bin/doctor
```

Bootstrap installs local Node and Python dependencies, installs Playwright Chromium, and downloads Kokoro model plus voice files into `~/.qa-video-capture/kokoro`. It does not install Node, Python, FFmpeg, or Netlify CLI system-wide.

Requirements:

- Node.js 18 or newer
- npm
- Python 3.10 through 3.13
- FFmpeg and FFprobe on `PATH`
- `curl`
- Optional: authenticated Netlify CLI for public links

## First prompt

In Claude Code:

```text
Use qa-video-capture to verify this app. Capture screenshots and a short narrated video proving the acceptance criteria. Keep raw media and report observed pass/fail states.
```

Claude reads `SKILL.md` and uses helpers under `scripts/`.

## What to customize

- Edit `SKILL.md` for preferred QA routes, evidence standards, review pace, voice, and reporting format.
- Change `QA_VIDEO_KOKORO_VOICE` or `QA_VIDEO_KOKORO_SPEED` for another local voice profile.
- Set `QA_VIDEO_SITE_LABEL` for generated review-page branding.
- Configure recipient-owned Netlify variables before publishing.
- Extend `capture_browser_qa.mjs` for login, form actions, mobile devices, fixtures, or app-specific checkpoints.

## Publishing safety

Generated project passwords are client-side gates. They discourage casual access but are not a substitute for authenticated hosting. Do not publish secrets, customer data, regulated data, or production credentials. Public publishing is optional. Capture and narration work without Netlify.

## Package map

```text
qa-video-capture/
  SKILL.md
  README.md
  THIRD_PARTY.md
  agents/openai.yaml
  bin/bootstrap
  bin/doctor
  examples/cues.json
  examples/markers.json
  package.json
  package-lock.json
  requirements.txt
  scripts/capture_browser_qa.mjs
  scripts/narrate_qa_video.mjs
  scripts/kokoro_local_tts_qa_video.py
  scripts/publish_qa_video.mjs
  SHA256SUMS
```

## Ownership and provenance

Exported from Bryant Brock's working `qa-video-capture` skill on 2026-08-01. Publisher defaults were neutralized for handoff. Original working skill was not changed.

No license is granted by implication for Bryant's original skill code. Recipient should agree on reuse terms with Bryant. Third-party components retain their own licenses, listed in `THIRD_PARTY.md`.
