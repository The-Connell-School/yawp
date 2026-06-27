# Teacher's Lounge Media Accessibility

Date: 2026-06-26

## Current Product Behavior

Student-side YAWP writing workflows do not require audio or video playback.

Teacher's Lounge modules may include video. Module resources now support a lightweight media-accessibility path:

- Upload a WebVTT caption file as a module resource with content type `text/vtt` or a `.vtt` file name.
- Upload a transcript as a module resource with content type `text/plain`, `text/markdown`, or a `.txt`/`.md` file name. A generic file with `transcript` in the name is also recognized.
- When a module has a video and a caption resource, the video player renders a default English `<track kind="captions">`.
- When a caption or transcript resource exists, the module page exposes download links under "Media accessibility."

## Evidence

- Caption/transcript resource detection: `services/web-app/app/utils/teacher-training-media-accessibility.test.ts`
- Caption track rendering: `services/web-app/app/routes/app.teacher-trainings.$id_.modules_.$moduleId/video-caption-track.test.tsx`
- UA automated axe scan: `services/web-app/e2e/tests/accessibility.ua-axe.spec.ts`

Verified commands:

```bash
bun test services/web-app/app/utils/teacher-training-media-accessibility.test.ts
bun test 'services/web-app/app/routes/app.teacher-trainings.$id_.modules_.$moduleId/video-caption-track.test.tsx'
source /Users/bryantbrock/.codex/skills/node-runtime-fix/scripts/use-modern-node.sh && bun run --cwd services/web-app test:e2e:a11y
```

## Visual-Content Remediation

Caption and transcript assets have been generated and uploaded for the active
Teacher's Lounge production modules identified during the 2026-06-26 UA review
work.

On 2026-06-27, the active production videos were sampled from
`s3://yawp-production-videos` with `ffmpeg` contact sheets and visual review.
Ten transcript resources were expanded in production with `## Visual notes`
sections covering important visual-only or visual-dependent instructional
content. The expanded transcripts cover text-card training notes, slide-deck
instructions, writing prompts, activity directions, sample essay screenshots,
YAWP tutor/document screenshots, diagrams, and formatting directions.

Production verification:

- 13/13 active production modules have transcript resources.
- 10/13 transcript resources include `## Visual notes` sections.
- 3/13 sampled modules did not need expanded transcript notes because they were
  talking-head/title/decorative-only in the sampled visual pass.
- A public production resource check confirmed the expanded transcript for
  `06-introduction-to-lesson-plan-modules-transcript.md` is served at
  `https://yawp.school/api/teacher-training-module-resource/50185670-7905-4166-a244-d9a432a6d34d`.

Re-run this visual-content check when Teacher's Lounge videos change.
