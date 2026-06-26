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

## Remaining Operational Work

For any Teacher's Lounge video included in UA's launch scope, YAWP still needs the actual caption and transcript assets uploaded for each required module. The product now supports rendering and linking those assets, but the assets themselves are content work.
