# Demo videos

Short, shareable MP4s of what a feature actually feels like to use. A visible
cursor glides between elements, clicks land with a ripple, text types at human
speed, and captions narrate each beat. Roughly 30 seconds, drops straight into
Slack or a PR comment.

Demos are **scripts, not recordings**. Nobody screen-captures anything by hand,
and re-recording after a UI change is one command.

## Quick start

```bash
# From the repo root, in one terminal:
bun dev

# In another:
bun demo writing-practice
# → services/web-app/demos/out/writing-practice.mp4
```

To see the tool itself without starting the app or a database:

```bash
bun demo self-test
```

`bun demo` with no arguments lists what is available.

### Flags

| Flag | What it does |
| --- | --- |
| `--headed` | Watch the browser drive itself. The single best debugging tool here. |
| `--rate=2` | Halve every pause. For iterating on a script, not for the final take. |
| `--base-url=…` | Record against a preview environment instead of localhost. |
| `--out=…` | Write somewhere other than `demos/out/`. |
| `--keep-raw` | Keep the intermediate `.webm` next to the `.mp4`. |

## Writing a demo

Drop a file in `demos/scripts/<name>.demo.ts`. It is picked up automatically —
there is no registry to update.

```ts
import { defineDemo } from '../runtime/record';
import { signIn } from '../runtime/sign-in';

export default defineDemo({
  name: 'my-feature',
  kicker: 'New in Yawp',
  title: 'My feature',
  subtitle: 'One sentence on why it matters.',

  // Runs behind the title card. Nothing here appears in the video.
  async setup(stage) {
    await signIn(stage.page, 'teacher');
  },

  async run(stage) {
    const { page } = stage;

    await stage.goto('/app/my-feature', { say: 'Start here' });
    await stage.click(page.getByRole('button', { name: /create/i }), {
      say: 'One click to create one',
    });
    await stage.type(page.getByLabel(/title/i), 'Week 3 reflection');
    await stage.highlight(page.getByTestId('result'), {
      say: 'And it shows up straight away',
      hold: 1500,
    });
  },
});
```

`stage.page` is the raw Playwright `Page`, so anything the e2e suite can do, a
demo can do. Locators work exactly as they do in `e2e/tests/` — and copying a
locator from the matching spec is usually the fastest way to start.

### The verbs

| Verb | Effect |
| --- | --- |
| `say(text)` | Caption, held for its reading time. |
| `goto(path, { say })` | Navigate and wait for the page to settle. |
| `moveTo(target)` | Glide the cursor somewhere without clicking. |
| `click(target, { say, spotlight })` | Glide, ripple, click, wait for the result. |
| `type(target, text, { clear })` | Focus and type key by key. |
| `highlight(target, { say, hold })` | Dim the page and ring one element. |
| `clearHighlight()` | Drop the scrim. |
| `scrollTo(target)` | Smooth-scroll something into the middle of the frame. |
| `beat(ms)` | Hold on the current frame. |

Every verb takes `say`, so narration usually rides along with an action rather
than sitting on its own line.

## What makes a good one

- **One idea per demo.** "Here is writing practice" beats "here is everything
  we shipped this month." Two short videos beat one long one.
- **Thirty seconds.** Past about forty-five, people stop scrubbing and leave.
- **Caption the intent, not the mechanics.** "They check it without waiting on a
  teacher" tells the viewer something; "clicks the Check Response button" is
  narrating what they can already see.
- **Start where the value is.** Sign-in, empty states, and navigation belong in
  `setup`, behind the title card.
- **Let results breathe.** After the click that matters, `hold` for a beat.
  Cutting away the instant something appears reads as a glitch.
- **Use seeded data that looks real.** "Grade 9 English · Period 1" sells it;
  "Test Class 1" does not.

## How it works

1. Playwright launches Chromium at 1280×800, capturing at 2× so text stays
   sharp, and starts recording immediately.
2. An overlay is injected with `addInitScript` — cursor, captions, cards, and
   spotlight, all inside a shadow root so app CSS cannot reach them. It
   reinstalls on every navigation and restores its state from `sessionStorage`,
   which is why the cursor does not jump and the title card does not flicker
   when the app routes.
3. `setup` runs behind the title card, so sign-in never reaches the video.
4. The script runs. Playwright's real mouse only jumps to each target at the
   end of a glide — moving it in lockstep would light up every row the cursor
   swept past.
5. The context closes, Playwright writes a `.webm`, and ffmpeg trims the setup
   off the front and transcodes to H.264 MP4.

The recording is deterministic: typing jitter is seeded, so the same script
produces the same cadence twice, and two takes are comparable by eye.

### Why not just record the screen?

Because it goes stale. A hand-captured video is wrong the moment the UI moves,
and nobody re-records it. These are scripts against the real app — when the
feature changes, `bun demo <name>` again and the video is current.

## Requirements

**ffmpeg**, for the MP4 transcode. Playwright bundles its own build, but it is
compiled `--disable-everything` with only VP8/WebM enabled and cannot produce
an MP4, so it is deliberately not used as a fallback. Any of these work:

```bash
bun add -d ffmpeg-static     # from services/web-app; already a devDependency
brew install ffmpeg          # macOS
apt-get install ffmpeg       # Linux
```

Point at a specific binary with `DEMO_FFMPEG_PATH` if you need to.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DEMO_BASE_URL` | Default target. Defaults to `http://127.0.0.1:5173`. |
| `DEMO_FFMPEG_PATH` | Use a specific ffmpeg binary. |
| `DEMO_CHROMIUM_PATH` | Use a pre-installed Chromium, for containers whose browser build does not match this Playwright version. |
| `DEMO_PASSWORD` | Password for demo sign-ins. Defaults to `yawp-dev`. |
| `DEMO_{STUDENT,TEACHER,ADMIN}_EMAIL` | Re-point one role, e.g. when recording against an e2e-seeded database. |

## Never record against production

Demos sign in against a seeded local database. This is a product used by real
students, and these videos get posted in Slack and attached to PRs — no frame
should ever contain a real student's name or work. `demos/out/` is gitignored
for the same reason: videos are regenerated, not committed.

## Troubleshooting

**"Demo overlay is not installed on this page"** — the page navigated somewhere
the init script did not run, usually an external origin.

**"Target has no bounding box"** — the element exists but is not visible. It is
probably behind a feature flag that is off in the seed, or collapsed at this
viewport width.

**The video shows the login screen** — `setup` threw partway through, so the
trim point landed early. Re-run with `--headed` to see where it stopped.

**Sign-in fails** — the seeded database is missing or stale:
`bun db:seed-local-dev`.

**Motion looks choppy** — something in the app is blocking the main thread
during the capture. Record that section on its own with `--headed` to find it.

## Tests

```bash
bun demo:test    # from the repo root
```

Covers the pure logic — easing, caption timing, typing cadence, ffmpeg flags —
and the ordering the Stage guarantees: cursor arrives before the click, scrim
rises before the caption that describes it. Both are invisible in a passing run
and glaring in a bad video.
