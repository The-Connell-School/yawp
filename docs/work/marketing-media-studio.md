# Marketing Media Studio

**Status:** Phases 1 and 2 implemented, behind a flag, not yet deployed
**Branch:** `claude/yawp-marketing-skill-ydi8ne`

An admin describes a feature or a course; YAWP! writes a storyboard, films it
against a demo environment, and hands back screenshots (phase 1), a short
silent clip (phase 2), or a how-to guide for marketing use.

## How-to guides (`GUIDE` jobs)

A guide is the studio's lead deliverable: one self-contained HTML page in the
shape of the in-app "See how it works" guides (`docs/how-to-guides.md`), which
a school can forward to a department head or a district can approve a feature
from. Clips and stills are its parts.

- **Copy on the storyboard.** A guide storyboard carries a `guide` block
  (headline, highlight, lede, workflow heading, range list, use cases, will,
  won't, demo footer, start label) and tags scenes `hero`, `range`, `step`, or
  `extra` with a heading and a line or two. Untagged scenes are filmed only to
  get the camera somewhere.
- **The standard is enforced, not suggested.** `validateGuideStoryboard` holds
  the shape (one hero still, at most 3 steps, will and won't, demo footer). A
  generated draft that misses it goes back to the model with what is missing,
  and a pasted one is refused. `lintGuideCopy` catches em-dash asides, "not X,
  but Y", marketing filler, a missing Oxford comma, and YAWP! written any other
  way. Lint findings get the model one more pass and never fail a job.
- **The prompt is the style guide.** The GUIDE system prompt carries the job of
  a guide, its shape, the copy rules, the will / won't honesty rule, and the
  Reporter guide's voice as the example.
- **Rendering.** The run is filmed once like a clip. Each tagged scene with
  something happening in it is cut into its own silent 1120px H.264 loop, each
  tagged still is downscaled to a 1120px JPEG, and everything is inlined into
  `<slug>.html` (a `DOCUMENT` output). The page has no script and loads
  nothing; it works from an email attachment, prints cleanly (clips fall back
  to stills), and respects dark mode and reduced motion.
- **Review.** The job page shows the guide in a sandboxed frame with a short
  pre-share checklist. The model cannot read the code, so a person still checks
  every won't line is true before the guide is shared.
- **Library.** `library-daily-pages-guide` renders a Daily Pages guide with
  one click from verified targets.

## Why it is shaped this way

The LLM does not drive a browser. It writes a **storyboard** — a JSON document
validated by `@app/marketing-media` before anything is stored or executed. That
schema is the whole security boundary:

- `goto` accepts only an allowlisted route. Detail pages are reached by clicking
  a link, so a generated URL can never address a record by id.
- Admin routes are not on the allowlist. They are not marketing material and
  they show org-wide data.
- Personas are limited to the seeded demo accounts.
- Steps are a closed set with no script evaluation. Selectors reject markup and
  url schemes. Keys are allowlisted.
- Scene count, typed text, per-step waits, and total render time are capped, so
  one storyboard cannot occupy the worker indefinitely.

A storyboard that fails validation is handed back to the model once with the
errors, then reported to the admin. It is re-validated again in the worker
before a browser is pointed at it.

## Pieces

| Piece | Path |
|---|---|
| Storyboard schema and job vocabulary | `packages/marketing-media` |
| Job row | `MarketingMediaJob` in `packages/prisma/schema.prisma` |
| Flag and demo-target gate | `services/web-app/app/utils/marketing-studio.server.ts` |
| Brief → storyboard | `services/web-app/app/services/marketing-storyboard.server.ts` |
| Admin surface | `app/routes/app.admin.marketing-media.*` |
| Renderer worker | `services/marketing-renderer` |
| Infrastructure | `infra/marketing-renderer.tf` |

## Never film production

Two independent gates, both fail closed, both requiring an explicit statement
rather than an inference:

- The web app hides the studio unless `MARKETING_STUDIO_ENABLED=on`, a
  `MARKETING_RENDER_TARGET_URL` is set, and `MARKETING_RENDER_TARGET_IS_DEMO`
  is exactly `confirmed`.
- The worker refuses to start under the same confirmation rule, and always films
  its own configured target even if the job row names a different one.
- Both sides additionally check the target host against a shared allow-list
  (`packages/marketing-media/src/render-target.ts`): `*.preview.yawp.school`,
  `demo.yawp.school`, and local development. Production is not on the list, so
  even a mis-set `confirmed` cannot point the camera at it — the web app hides
  the studio and the worker refuses to start, naming the rule.

This follows the reasoning already written down in `local-dev-auth.server.ts`:
inferring "this must be safe" from environment shape was the bug there, so this
asks for a signal instead. A demo video is a publication; a wrong target puts a
real student's essay in a marketing asset.

## Rollout

Backward compatible by construction — a new table, new routes, and a new
service, with no change to existing behavior. The admin tab does not appear
until the flag is on.

1. Apply the migration (`20260801120000_add_marketing_media_job`).
2. Stand up a demo environment with seeded personas and local dev auth enabled.
   Seed-mode preview environments already do both: their compose render sets
   the three studio variables automatically, runs a renderer container that
   films the web container over the internal network, and stores outputs on a
   shared volume the app serves itself (`MARKETING_MEDIA_DIR`) — no AWS
   anywhere. Queued jobs on a seeded preview render on their own.
   (Production-dump previews get none of this.)
3. For any other environment, set the three studio variables by hand; the tab
   appears for admins.
4. Build and push the renderer image, then set
   `marketing_renderer_desired_count = 1`. At zero, jobs queue and nothing films
   them, which is the safe default.
5. Watch the first renders. Failures land on the job row with a reason.

To roll back: set `MARKETING_STUDIO_ENABLED` to anything else and scale the
renderer to zero. The table and routes can stay.

## What is not built

- **Phase 3, narration.** Kokoro narration, cue markers, and audio muxing exist
  today only in the local `yawp-marketing-media` Claude skill. Bringing it
  in-app means either shipping the voice model in the worker image or moving to
  hosted TTS, plus narration timing, which is the fiddliest part of the skill.
- **Copy generation beyond guides.** Guides carry their own copy; the studio
  still does not write captions or launch posts for clips and stills.
- **Demo data seeding for a chosen course.** Picking a course today attaches it
  to the job and tells the model about it; it does not copy that course into the
  demo tenant. Storyboards therefore film what the demo tenant already has.
- **Deployment.** The Terraform has not been applied, and the migration has not
  been run against a real database.

## Verification

Unit tests cover the schema, the flag gate, storyboard generation and retry, the
admin routes, job claiming and retry transitions, transcode arguments, and the
worker's config refusal. An e2e spec covers the admin surface end to end using a
pasted storyboard, so it does not need an LLM.

The renderer was exercised against a stub app: dev-login, persona switch
mid-storyboard, typing into `.ProseMirror`, optional-step skipping, numbered
stills, and WebM capture all verified. The H.264 transcode itself was not run —
the container had no full ffmpeg build — so the first real clip should be
watched before anyone trusts phase 2.
