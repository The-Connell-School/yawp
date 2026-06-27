# UA WCAG 2.1 AA Self-Evaluation Draft

Date: 2026-06-27

Status: WCAG-self-evaluation approach approved by Bryant on 2026-06-27. This
is not a VPAT/ACR. It is the WCAG 2.1 Level AA compliance-status evaluation UA
requested as an alternative to a current VPAT. Do not finalize until the
remaining manual-status wording and Teacher Lounge visual-content limitation are
updated for send time.

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
that testing have been fixed. Automated keyboard-smoke and reflow-proxy
evidence has also passed. A macOS VoiceOver smoke pass covered representative
public, login, student editor, teacher grading, and Teacher Lounge controls.
YAWP should still avoid claiming full screen-reader support across every
dynamic workflow.

## Evidence completed

- Automated axe scan exists for representative UA flows.
- Public `/accessibility` page implemented.
- Teacher's Lounge captions/transcripts are supported in-product.
- Active Teacher's Lounge caption/transcript assets were generated and uploaded.
- Media accessibility helper links are rendered below primary module resources.
- Color contrast issues found by automated audit were remediated.
- Several unnamed controls and editor naming issues found by automated audit
  were remediated.
- Automated keyboard-smoke evidence passed on representative UA flows.
- An editor `Tab` focus trap found during keyboard evidence testing was
  remediated in `cc663b0`.
- Automated 640px viewport reflow proxy passed on representative UA flows.
- macOS VoiceOver smoke evidence passed with limitations on representative
  public, login, student editor, teacher grading, and Teacher Lounge controls.

## Vendor-question answers

| UA question | Current answer | Status | Evidence / limitation |
|---|---|---|---|
| Vendor accessibility webpage | `https://yawp.school/accessibility` once deployed | Partially Supports | Implemented in app and draft verified by Bryant; publish hold until formal keyboard-only and screen-reader verification are complete |
| Product accessibility webpage | Same page currently covers YAWP product scope | Partially Supports | Can be split later if UA requires separate vendor/product pages |
| VPAT/ACR or WCAG evaluation | No VPAT/ACR; WCAG 2.1 AA self-evaluation draft provided | Partially Supports | This document is the draft evaluation |
| Keyboard-only operation | Automated keyboard smoke passed across representative UA flows | Partially Supports | Editor `Tab` focus trap remediated in `cc663b0`; human walkthrough not yet claimed |
| Assistive technology testing | VoiceOver smoke evidence completed with limitations | Partially Supports | Dynamic tutor-chat announcements and NVDA were not evaluated |
| Audio/video captions/transcripts | Teacher's Lounge supports captions/transcripts; active assets uploaded | Supports for captions/transcripts | Teacher Lounge visual-only instructional content remediation is tracked in Central Station `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y` |
| Accessible output | Primary output is browser-rendered HTML | Partially Supports | Conservative no-tagged-PDF wording approved by Bryant on 2026-06-27 |
| User-facing accessibility docs | Public page implemented | Partially Supports | Needs deploy and owner sign-off |
| Setup/implementation adjustments | Draft guidance exists | Partially Supports | UA evaluator access plan approved; exact reviewer links generated at send time |
| Common accessibility issues | Known limitations drafted | Partially Supports | Needs final VoiceOver findings and Teacher Lounge visual-content remediation |
| Reporting accessibility issues | Support mail link implemented | Partially Supports | Need support owner/process sign-off |
| Addressing accessibility concerns | Draft remediation process on public page | Partially Supports | Need owner/SLA/escalation sign-off |

## Known limitations to disclose

- No completed VPAT/Accessibility Conformance Report yet.
- Full screen-reader coverage is not final; current evidence is a representative
  macOS VoiceOver smoke pass.
- Human manual keyboard-only walkthrough is not final, although automated
  keyboard smoke evidence passed.
- Human 200% zoom/reflow walkthrough is not final, although automated reflow
  proxy evidence passed.
- Browser print/save-as-PDF output is not represented as guaranteed tagged PDF
  output.
- Dedicated school-level high-contrast/font/theme controls are not currently
  available.
- Teacher Lounge visual-content remediation is tracked in Central Station
  `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y` because at least one video has
  important on-screen information not covered by audio/transcript.

## Remaining evidence before final send

- Complete any remaining send-time review needed from
  `docs/compliance/accessibility/ua-manual-qa-script.md`.
- Record tester, date, browser, OS, assistive technology, flows covered,
  findings, and remediation links if any.
- Update this draft's status labels after manual evidence is complete.
