# UA WCAG 2.1 AA Self-Evaluation Draft

Date: 2026-06-27

Status: WCAG-self-evaluation approach approved by Bryant on 2026-06-27. This
is not a VPAT/ACR. It is the WCAG 2.1 Level AA compliance-status evaluation UA
requested as an alternative to a current VPAT. Do not finalize until manual
keyboard, screen reader, and zoom/reflow evidence is recorded.

## Scope

Product: YAWP! Writing Program Services

Flows in scope for UA review:

- Public login and access
- Student writing/editor workflow
- Tutor chat and process feedback
- Student submission
- Teacher dashboard and class/document views
- Teacher grading and feedback views
- Organization/setup/admin workflows used for implementation
- Teacher's Lounge training content

## Summary posture

YAWP! should be represented as substantially remediated and under active WCAG
2.1 AA evaluation, not as fully conformant without qualification. Automated
testing has passed on representative flows, and multiple issues found during
that testing have been fixed. Manual keyboard, screen reader, and zoom/reflow
evidence still needs to be completed before claiming full support for the
screen-reader-dependent and keyboard-only criteria.

## Evidence completed

- Automated axe scan exists for representative UA flows.
- Public `/accessibility` page implemented.
- Teacher's Lounge captions/transcripts are supported in-product.
- Active Teacher's Lounge caption/transcript assets were generated and uploaded.
- Media accessibility helper links are rendered below primary module resources.
- Color contrast issues found by automated audit were remediated.
- Several unnamed controls and editor naming issues found by automated audit
  were remediated.

## Vendor-question answers

| UA question | Current answer | Status | Evidence / limitation |
|---|---|---|---|
| Vendor accessibility webpage | `https://yawp.school/accessibility` once deployed | Partially Supports | Implemented in app and draft verified by Bryant; publish hold until formal keyboard-only and screen-reader verification are complete |
| Product accessibility webpage | Same page currently covers YAWP product scope | Partially Supports | Can be split later if UA requires separate vendor/product pages |
| VPAT/ACR or WCAG evaluation | No VPAT/ACR; WCAG 2.1 AA self-evaluation draft provided | Partially Supports | This document is the draft evaluation |
| Keyboard-only operation | Many flows use native controls and keyboard-capable components | Not Evaluated / Partial | Needs manual keyboard pass |
| Assistive technology testing | Not final | Not Evaluated | Needs VoiceOver; NVDA recommended |
| Audio/video captions/transcripts | Teacher's Lounge supports captions/transcripts; active assets uploaded | Supports for captions/transcripts | Teacher Lounge visual-only instructional content remediation is tracked in Central Station `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y` |
| Accessible output | Primary output is browser-rendered HTML | Partially Supports | Conservative no-tagged-PDF wording approved by Bryant on 2026-06-27 |
| User-facing accessibility docs | Public page implemented | Partially Supports | Needs deploy and owner sign-off |
| Setup/implementation adjustments | Draft guidance exists | Partially Supports | UA evaluator access plan approved; exact reviewer links generated at send time |
| Common accessibility issues | Known limitations drafted | Partially Supports | Needs final manual QA findings |
| Reporting accessibility issues | Support mail link implemented | Partially Supports | Need support owner/process sign-off |
| Addressing accessibility concerns | Draft remediation process on public page | Partially Supports | Need owner/SLA/escalation sign-off |

## Known limitations to disclose

- No completed VPAT/Accessibility Conformance Report yet.
- Manual screen reader evidence is not final.
- Manual keyboard-only evidence is not final.
- 200% zoom/reflow evidence is not final.
- Browser print/save-as-PDF output is not represented as guaranteed tagged PDF
  output.
- Dedicated school-level high-contrast/font/theme controls are not currently
  available.
- Teacher Lounge visual-content remediation is tracked in Central Station
  `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y` because at least one video has
  important on-screen information not covered by audio/transcript.

## Manual evidence required before final send

- Complete `docs/compliance/accessibility/ua-manual-qa-script.md`.
- Record tester, date, browser, OS, assistive technology, flows covered,
  findings, and remediation links if any.
- Update this draft's status labels after manual evidence is complete.
