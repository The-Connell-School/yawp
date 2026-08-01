# Marketing Media Studio

**Status:** Phases 1 and 2 implemented, behind a flag, not yet deployed
**Branch:** `claude/yawp-marketing-skill-ydi8ne`

An admin describes a feature or a course; YAWP! writes a storyboard, films it
against a demo environment, and hands back screenshots (phase 1) or a short
silent clip (phase 2) for marketing use.

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
   A preview environment already does both.
3. Set the three studio variables on the web app; the tab appears for admins.
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
- **Copy generation.** The studio produces media, not captions or launch posts.
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
