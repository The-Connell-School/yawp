---
name: qa-video-capture
description: Use when asked to create QA screenshots, record browser verification, produce a narrated QA video, inspect an app or pull request visually, or publish reviewable media evidence.
---

# QA Video Capture

## Purpose

Create reviewable visual evidence for app work: screenshots, a short narrated browser video, an optional phone-safe public URL, and a concise status readout covering what worked, what failed, and what still needs product judgment.

Read `README.md` before first use. Run `./bin/doctor` to verify local dependencies.

## Proof subject rule

QA media must show the actual app under test, its deployed or local preview, or a purpose-built tool actively interacting with the real app backend, API, database, webhook, or CLI.

Acceptable proof:

- Browser or mobile footage of the app while changed behavior is used.
- Before and after screenshots for tiny static visual changes.
- A small proof tool that calls the real app surface and visibly shows observed results.
- For backend-only changes, a tool that sends a real request or event, then displays returned or persisted state.

Unacceptable proof:

- A presentation explaining expected behavior.
- A static report that does not exercise the app.
- Mocked data or a disconnected prototype, unless the work specifically concerns that prototype.
- Narration claiming success when the screen does not show verification.

## Workflow

1. Identify target.
   - Inspect existing package scripts and use the app's normal development server.
   - Reuse a running server when possible.
   - For a pull request, use its branch and preview URL when available.

2. Define a small QA path.
   - Cover named acceptance criteria and routes.
   - Keep footage short enough to review quickly.
   - Use visible checkpoints, reloads, and cross-role checks when persistence or permissions matter.
   - For narrated videos, give each scene one checkpoint and one short narration cue.

3. Capture media.
   - Use `scripts/capture_browser_qa.mjs` for standard route screenshots and a browser video.
   - Use `scripts/narrate_qa_video.mjs` for local Kokoro narration and H.264/AAC output.
   - Pause 5 to 7 seconds after important state changes so reviewers can read the UI.
   - Keep raw captures, narration audio, manifests, screenshots, and final MP4 files.
   - Store outputs outside target code repositories unless the user specifies another location.

4. Verify artifacts.
   - Confirm screenshots are nonblank.
   - Confirm video exists, has nonzero size, and includes audible narration when narration was requested.
   - Review at least one screenshot and the final video before reporting.
   - Report observed counts and states, especially for deletion, persistence, authentication, and permissions.

5. Publish only when requested.
   - Use `scripts/publish_qa_video.mjs` after final MP4 exists.
   - Configure recipient-owned Netlify site variables first. This package contains no site ID, credentials, tokens, passwords, or Brock Software publishing defaults.
   - Treat generated password pages as lightweight review gates, not strong access control.
   - Never publish credentials, customer data, or other sensitive information to a public host.

6. Report outcome.
   - Put public page URL first when one was requested.
   - Summarize pass and fail status plus visible issues.
   - Separate implementation defects from product or design questions.

## Capture helper

```bash
node scripts/capture_browser_qa.mjs \
  --url http://localhost:3000 \
  --routes /,/dashboard \
  --seconds 6 \
  --out ~/qa-media/example
```

Options:

- `--url`: base URL or preview URL. Required.
- `--routes`: comma-separated routes or full URLs. Defaults to `/`.
- `--out`: output directory. Defaults to `./qa-media/<timestamp>`.
- `--seconds`: seconds to linger on each route. Defaults to `5`.
- `--width`, `--height`: viewport size. Defaults to `1440x1000`.

Output includes screenshots, WebM video, and `manifest.json`.

## Narration rules

- Use one cue per stable visual checkpoint.
- Make the relevant UI state visible before cue starts.
- Keep cues short, usually 6 to 18 words and 2 to 4 seconds.
- Explain what is not obvious: expected counts, persistence, permissions, or background state.
- Do not narrate every click or read visible labels without reason.
- Silence is fine during loading and navigation.
- If narration overlaps next action, shorten cue or record a longer pause.

## Narration helper

Simple narration:

```bash
node scripts/narrate_qa_video.mjs \
  --video /absolute/path/input.webm \
  --script-file /absolute/path/narration.txt \
  --out /absolute/path/output-narrated.mp4
```

Audio-paced scripted interaction:

```bash
node scripts/narrate_qa_video.mjs \
  --prepare-only \
  --cue-file examples/cues.json \
  --out /absolute/path/prepared-narration.json
```

During Playwright capture, mark actual cue start times only after each target state is visible. Then mux:

```bash
node scripts/narrate_qa_video.mjs \
  --video /absolute/path/input.webm \
  --prepared-manifest /absolute/path/prepared-narration.json \
  --markers-file /absolute/path/markers.json \
  --out /absolute/path/output-narrated.mp4
```

Narration defaults:

- Voice: `af_sarah`
- Speed: `1.08`
- Language: `en-us`
- Home: `~/.qa-video-capture`, override with `QA_VIDEO_HOME`
- Python: local Kokoro virtual environment, override with `QA_VIDEO_KOKORO_PYTHON`
- Model directory: local Kokoro model directory, override with `QA_VIDEO_KOKORO_MODEL_DIR`

The helper rejects cue overlap and video overrun by default. Fix timing rather than forcing mismatched output.

## Optional public link helper

Configure:

```bash
export QA_VIDEO_NETLIFY_SITE_ID="your-site-id"
export QA_VIDEO_NETLIFY_SITE_NAME="your-site-name"
export QA_VIDEO_SITE_URL="https://your-site-name.netlify.app"
export QA_VIDEO_SITE_LABEL="Your Team QA Video"
```

Publish:

```bash
node scripts/publish_qa_video.mjs \
  --video /absolute/path/output-narrated.mp4 \
  --title "Example QA video" \
  --project example-project \
  --slug ticket-123 \
  --filename example-ticket-123-qa.mp4
```

Publisher writes `public-url.json` next to MP4. It prints page, project, direct video, deploy, password, and verification details. Netlify CLI must already be authenticated. Default fallback uses tmpfiles.org only when Netlify fails. Disable fallback with `--fallback false` for private material.

## Scripted capture timing pattern

```js
const prepared = JSON.parse(fs.readFileSync(preparedNarrationPath, "utf8"));
const markers = [];
const startedAt = Date.now();

async function narrateVisibleCue(index) {
  const cue = prepared.cues.find((item) => item.index === index);
  markers.push({ index, start: (Date.now() - startedAt) / 1000 });
  await page.waitForTimeout(Math.ceil((cue.duration + 0.25) * 1000));
}

await target.scrollIntoViewIfNeeded();
await narrateVisibleCue(1);
fs.writeFileSync(markersPath, `${JSON.stringify(markers, null, 2)}\n`);
```
