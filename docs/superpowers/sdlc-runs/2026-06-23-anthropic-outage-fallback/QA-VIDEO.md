# QA Video Evidence

Status: published.

Page URL: https://brocksoftwareqa-video.netlify.app/yawp/anthropic-outage-fallback-20260623/

Direct MP4: https://brocksoftwareqa-video.netlify.app/assets/yawp/anthropic-outage-fallback-20260623/yawp-anthropic-outage-fallback-qa.mp4

Local narrated MP4: `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-20260623/yawp-anthropic-fallback-qa-narrated.mp4`

Raw recording: `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-20260623/proof-videos/page@0d7c546919c816d0a2f75ae9eb8fffb9.webm`

Screenshot proof:

- `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-20260623/proof-screenshots/01-proof-ready.png`
- `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-20260623/proof-screenshots/02-proof-passed.png`

MP4 SHA-256: `416aaf8a30e0960563b4059aa71eaaee2b3c8248c5c3598baf7f04f79c0d41bb`

Video details:

- Duration: 31.8 seconds.
- Video codec: H.264.
- Audio codec: AAC.
- Narration: Kokoro Sarah (`af_sarah`).

Proof type:

- Browser proof harness that actively runs real Yawp repository commands.
- Commands shown in the video: focused fallback tests, OpenAI service env tests, web app typecheck, production build.

Note:

- A direct e2e app capture was attempted against the seeded teacher grading UI. React Router rejected the synthetic Playwright data-route response before the component could render `Retrying...`, so the final published video uses the accepted command-backed proof harness. The committed route/UI tests remain the direct proof for tutor and grading retry behavior.
