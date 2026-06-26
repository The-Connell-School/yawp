# Automated Accessibility Audit Log

## 2026-06-26 UA axe audit

Tool: `@axe-core/playwright` 4.12.1 using axe WCAG tags `wcag2a`, `wcag2aa`, `wcag21a`, and `wcag21aa`.

Command:

```bash
source /Users/bryantbrock/.codex/skills/node-runtime-fix/scripts/use-modern-node.sh && bun run --cwd services/web-app test:e2e:a11y
```

Result: PASS, 5/5 Playwright tests.

Scanned surfaces:

- `/auth/login`
- Student document editor and tutor surface at `/app/documents/:id`
- Teacher dashboard at `/app`
- Teacher's Lounge index, course page, and module page
- Teacher grading view at `/app/submissions/:id`

Findings remediated during this audit:

- Light-theme primary and muted text tokens did not meet WCAG AA contrast on common backgrounds.
- Student editor ProseMirror textbox had no accessible name.
- Tutor navigation and chat icon controls lacked accessible names.
- Editor toolbar dropdown triggers produced unnamed or nested interactive controls.
- App navigation collapse/close controls lacked accessible names.
- Teacher's Lounge no-video modules could produce `NaN` progress values.
- Grading status and help text used opacity-reduced muted text below WCAG AA contrast.

Limitations:

- This is automated static/runtime scanning evidence. It does not prove keyboard-only completion, screen reader announcement quality, captions/transcripts, or tagged PDF output.
- VoiceOver and NVDA checks still need a manual or specialist pass before claiming screen-reader-dependent WCAG criteria as fully supported.
