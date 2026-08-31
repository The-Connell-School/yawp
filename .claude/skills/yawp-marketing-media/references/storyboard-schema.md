# Storyboard schema

A storyboard is a JSON file in `storyboards/` describing what to film, in order.
It drives both the narration script and the browser run, so the words and the
pictures cannot drift apart.

## Top level

```json
{
  "name": "teacher-assignment-to-grading",
  "title": "One class, from assignment to feedback",
  "audience": "Department chairs evaluating YAWP!",
  "goal": "Show the full teacher loop without leaving the platform.",
  "persona": "teacher",
  "viewport": { "width": 1440, "height": 900 },
  "deviceScaleFactor": 1,
  "defaultHold": 1.5,
  "scenes": []
}
```

| Field | Meaning |
|---|---|
| `name` | File name without `.json`. Also names the recorded `.webm`. |
| `title`, `audience`, `goal` | Documentation for whoever edits this next. Not rendered. |
| `persona` | Dev-login persona key. Override with `--persona`. Omit for public-only storyboards and pass `--no-login`. |
| `viewport` | Capture size. `--width`/`--height` win if passed. |
| `deviceScaleFactor` | Use `2` for stills shown large. Doubles file size. |
| `defaultHold` | Seconds to linger at the end of each scene, when the scene does not set `hold`. |

## Scene

```json
{
  "id": "student-work",
  "goto": "/app/student-work",
  "waitFor": "main",
  "waitForTimeout": 20000,
  "settle": 0.8,
  "narration": "Submitted work collects in one queue.",
  "steps": [],
  "hold": 2,
  "screenshot": true,
  "screenshotName": "student-work",
  "fullPage": false
}
```

Execution order in a scene: `goto` → `waitFor` → `settle` → scene `narration`
cue → `steps` in order → `hold` → screenshot.

| Field | Meaning |
|---|---|
| `id` | Scene identifier, used in screenshot names and the manifest. |
| `goto` | Route or absolute URL. Omit to continue on the current page. |
| `waitFor` | CSS selector that must be visible before the scene proceeds. |
| `settle` | Seconds to wait after load, for animations. `false` disables. |
| `narration` | One cue, fired once the scene is on screen. |
| `steps` | Interactions. See below. |
| `hold` | Seconds to linger at the end of the scene. |
| `screenshot` | `false` to skip the end-of-scene screenshot. |
| `fullPage` | `true` for a full-page still. Default is viewport only. |

## Steps

| `action` | Fields | Notes |
|---|---|---|
| `goto` | `path` or `url`, `waitUntil` | Navigate mid-scene. |
| `click` | target | |
| `hover` | target | |
| `fill` | target, `text` | Sets a value instantly. |
| `type` | target, `text`, `delay`, `at` | Types character by character. Use for the editor — it reads as writing on camera. `"at": "end"` moves the caret to the end of the document first, so the demo continues the draft instead of typing into the middle of it. |
| `press` | `key`, optional target | |
| `scrollTo` | target | Scrolls the element into view. |
| `scroll` | `y` | Wheel scroll in pixels. |
| `waitFor` | target, `state` | `visible` by default. |
| `wait` | `seconds` | |
| `screenshot` | `name`, `fullPage` | Extra still mid-scene. |
| `login` | `persona`, `path` | Switch roles on camera, for example teacher → student. |
| `narrate` | `text` | Fires a cue at this exact point in the scene. |

Targets, in priority order:

- `"role": "link", "name": "graded"` → `getByRole` with a case-insensitive name regex
- `"text_selector": "Overall grade"` → `getByText`
- `"selector": ".ProseMirror"` → CSS locator

All targets take `.first()`, so an ambiguous match will not fail the run — but it
may film the wrong element. Prefer specific names.

Any step can set:

- `"optional": true` — log and continue if it fails; the scene is marked
  `partial`. Use for links whose presence depends on seed data.
- `"timeout": 15000` — per-step timeout in milliseconds.

## Narration cues

Cues are numbered by walking the storyboard in execution order: each scene's
`narration`, then any `narrate` steps in that scene, then the next scene. That
ordering is what makes `--emit-cues`, prepared audio, and `markers.json` line up.

Consequence: **changing narration means regenerating the prepared audio.** The
runner refuses to start if the prepared manifest's cue count does not match the
storyboard.

## Timing

With `--prepared-narration`, each cue holds the screen for its real audio
duration plus a short gap, so narration never runs into the next action. Without
it, the runner estimates from word count so the untethered capture is still
watchable — but only the prepared path produces a usable `markers.json`.

If the finished video's narration leads or lags the picture by a constant
amount, re-run with `--marker-offset 0.4` (or a negative value) rather than
hand-editing markers.
