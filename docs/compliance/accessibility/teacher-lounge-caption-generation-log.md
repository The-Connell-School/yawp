# Teacher's Lounge Caption Generation Log

Date: 2026-06-26

## Source

Caption and transcript assets were generated from the active Teacher's Lounge production videos in `s3://yawp-production-videos`.

Active modules were identified from the production-fidelity Teacher's Lounge module fixture, using each module's `videoS3Key`.

## Tooling

- Audio extraction: `ffmpeg`
- Speech-to-text: local `whisper-cli`
- Model: local `ggml-small.en.bin`
- No source video files were committed to the repository.

## Generated Assets

Local package:

```text
/tmp/yawp-teacher-lounge-captions.zip
```

Generated output:

- 13 WebVTT caption files
- 13 Markdown transcript files
- 13 plain-text transcript files
- `manifest.json` mapping generated files to Teacher's Lounge module IDs and source video keys

Covered modules:

- Meet Your Instructor
- Welcome to YAWP!
- How to be a Happy Teacher
- Critical Writing in the Age of AI
- Introduction to Lesson Plan Modules
- Lesson 1: Introduce Students to YAWP!
- Lesson 2: Pre-writing
- Lesson 3: Developing a Thesis Statement
- Lesson 4: Introduction Paragraph
- Lesson 5: Body Paragraphs
- Lesson 6: The Conclusion
- Lesson 7: Titling Your Essay
- Lesson 8: Review my Essay (optional)

## Validation

The generated package was structurally validated after generation:

- Every `.vtt` file starts with `WEBVTT`.
- Every `.vtt` file contains timestamp cues.
- Every Markdown transcript includes a transcript section and non-empty content.

Result: PASS, 13/13 caption files and 13/13 Markdown transcripts validated.

## Production Upload Status

After generation, the caption and transcript assets were uploaded to production
as Teacher's Lounge module resources. A production verification query showed the
13 active modules each had one caption resource and one transcript resource.

The module page now renders media accessibility links as a subdued helper row
below primary resources. That UI follow-up is merged to `main` in commit
`a4f1fe6`.

Remaining work is not upload work; it is checking whether any UA-scoped video
shows important instructions or examples that are not spoken aloud and not
written in the transcript.
