# Marketing renderer

Worker that films validated storyboards against a demo environment and uploads
the results for the admin Marketing Studio (`/app/admin/marketing-media`).

Phase one produces screenshots. Phase two also produces a short silent MP4.
Narration is phase three and is not implemented here.

## How a job flows

1. An admin submits a brief in the web app. Claude turns it into a storyboard,
   which is validated against `@app/marketing-media` before it is stored.
2. The job row lands in `MarketingMediaJob` with status `QUEUED`.
3. This worker claims the oldest ready job, re-validates the storyboard, and
   drives Chromium through it.
4. Stills — and, for a `CLIP` job, an H.264 MP4 — go to the videos bucket under
   `marketing-media/<jobId>/`. A `GUIDE` job is filmed the same way, then each
   guide step is cut into its own short loop and everything is inlined into one
   how-to guide page (`src/guide.ts`), shipped as a `DOCUMENT` output beside its
   stills and loops. The job flips to `SUCCEEDED` with the output list.
5. The admin page signs a short-lived URL per output. Nothing is public.

A failure re-queues the job until `MAX_RENDER_ATTEMPTS`, then stops with the
reason on the row.

## Safety

The worker refuses to start unless `MARKETING_RENDER_TARGET_IS_DEMO=confirmed`.
The web app demands the same thing separately, so neither side can point this at
production on its own. The target must hold seeded demo data and have local dev
auth enabled — the worker signs in as a seeded persona over `/auth/dev-login`.

A job records the environment it was queued against, but the worker always films
its own configured target. The queue cannot redirect the browser.

## Running it

```bash
export DATABASE_URL=postgresql://...              # the app database
export MARKETING_RENDER_TARGET_URL=https://demo.yawp.school
export MARKETING_RENDER_TARGET_IS_DEMO=confirmed
export AWS_S3_BUCKET_FOR_VIDEOS=yawp-...-videos
export AWS_S3_REGION_FOR_VIDEOS=us-east-1
# for a preview environment target, also:
# export MARKETING_RENDERER_ACCESS_CODE=brave-otter-4193

bun run --cwd services/marketing-renderer start        # poll forever
bun run --cwd services/marketing-renderer render-once  # drain one job and exit
```

| Variable | Purpose |
|---|---|
| `MARKETING_RENDERER_WORKER_ID` | Lock owner in the job row. Defaults to host-pid. |
| `MARKETING_RENDERER_POLL_MS` | Idle poll interval. Defaults to 5000. |
| `MARKETING_RENDERER_CHROMIUM_PATH` | Chromium binary, when the image already has one. |
| `MARKETING_RENDERER_LOGIN_PATH` | Dev login endpoint. Defaults to `/auth/dev-login`. |
| `FFMPEG_PATH` | ffmpeg binary. Defaults to `ffmpeg` on PATH. |
| `MARKETING_RENDERER_ACCESS_CODE` | Seat code for a target behind the preview access gate. Traded for the access cookie before filming; unset for ungated targets. |
| `MARKETING_MEDIA_STORAGE` | `s3` (default) or `disk`. Disk mode copies outputs to `MARKETING_MEDIA_DIR`, a volume the web app serves itself — used by preview environments, which have no AWS credentials. |
| `MARKETING_MEDIA_DIR` | Output directory for disk mode; the web app must mount the same path. |

## Tests

```bash
bun run --cwd services/marketing-renderer test
```

Covers job claiming and lock recovery, retry and give-up transitions, shot
naming, transcode arguments, config refusal, and the persona/cookie helpers.
Driving a real browser is exercised by rendering against a running app rather
than in unit tests.

## Deploying

`Dockerfile` builds the worker on Playwright's Jammy image plus ffmpeg. The
Terraform in `infra/` defines the ECR repository and an ECS service that is
scaled to zero by default — set `marketing_renderer_desired_count = 1` when you
want renders to run.
