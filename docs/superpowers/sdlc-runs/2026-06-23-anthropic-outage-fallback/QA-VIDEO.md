# QA Video Evidence

Status: published.

Page URL: https://brocksoftwareqa-video.netlify.app/yawp/anthropic-outage-fallback-real-app-20260623/

Direct MP4: https://brocksoftwareqa-video.netlify.app/assets/yawp/anthropic-outage-fallback-real-app-20260623/yawp-anthropic-fallback-real-app-qa.mp4

Local narrated MP4: `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-real-app-20260623/yawp-anthropic-fallback-real-app-narrated.mp4`

Raw recording: `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-real-app-20260623/raw-video/page@35fd7551bb8e5ced6ff41c55a187e6c6.webm`

Screenshot proof:

- `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-real-app-20260623/screenshots/00-tutor-retrying-state.png`
- `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-real-app-20260623/screenshots/00-grading-retrying-state.png`
- `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-real-app-20260623/screenshots/01-tutor-fallback-response.png`
- `/Users/bryantbrock/qa-media/yawp/anthropic-fallback-real-app-20260623/screenshots/02-grading-fallback-response.png`

MP4 SHA-256: `9a3361896b87c9ccaf8ead219f0a501d0354411863b7429a7b4cc9b8dda8e7f2`

Video details:

- Duration: 55.08 seconds.
- Video codec: H.264.
- Audio codec: AAC.
- Narration: Kokoro Sarah (`af_sarah`).

Proof type:

- Real Yawp app running locally at `http://127.0.0.1:5173` against seeded E2E data.
- Local provider mock returns an Anthropic `529 overloaded_error` and deterministic OpenAI `gpt-4o-mini` fallback responses through the providers' normal SDK base URL configuration.
- The video shows the actual tutor panel rendering `Retrying...`, then saving the tutor response into the live conversation.
- The video shows the mounted teacher submission grading panel rendering `Retrying...`, then populating the real rubric and overall feedback fields.

Note:

- This supersedes the earlier command-backed proof harness. The earlier harness proved tests/build; this video proves the changed UX inside the real app.
