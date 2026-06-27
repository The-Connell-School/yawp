# UA Manual QA Evidence Log

Date: 2026-06-27

Build/commit: `cc663b0`

Environment URL: Local Playwright-managed E2E preview at
`http://127.0.0.1:5173`

Tester: Codex

## Summary decision

| Area | Result | Notes / fix links |
|---|---|---|
| Keyboard-only QA | PASS WITH LIMITATIONS | Automated keyboard smoke evidence passed across UA-scoped public, login, student editor, teacher dashboard, grading, Teacher Lounge, and admin flows. Found and fixed an editor `Tab` focus trap in `cc663b0`. |
| VoiceOver QA | Not run | Formal VoiceOver listening pass is still required before claiming full screen-reader testing. Automated role/name and axe coverage passed, but that is not a substitute for VoiceOver. |
| 200% zoom/reflow QA | PASS WITH LIMITATIONS | Automated 640px viewport reflow proxy passed for representative UA flows with no document-level horizontal scroll. Human browser-zoom review is still recommended before a full manual claim. |
| Teacher Lounge visual-content check | Needs remediation | Bryant confirmed at least one video has important on-screen information missing from audio/transcript; tracked in Central Station `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y` |

## Keyboard-only QA

Tester: Codex

Date: 2026-06-27

Browser: Chromium via Playwright

Account roles tested: Public, student, teacher, admin

Result: PASS WITH LIMITATIONS

Findings:

- Public accessibility page, login, student editor, teacher dashboard, teacher
  grading, Teacher Lounge module, and admin organization/setup routes exposed
  keyboard-reachable controls in the automated smoke pass.
- Student editor initially trapped `Tab` by inserting non-breaking spaces when
  not inside a list. Remediated in `cc663b0`: list indentation remains, while
  non-list `Tab` falls through to browser focus traversal.
- Evidence command:
  `bunx playwright test --project=chromium e2e/tests/accessibility.ua-manual-evidence.spec.ts`

Retest notes:

- `accessibility.ua-manual-evidence.spec.ts`: 3/3 passed on 2026-06-27.
- Existing `document-editor.spec.ts`: 15/15 passed after the `Tab` fix.

## VoiceOver QA

Tester:

Date:

Browser:

Assistive technology:

Account roles tested:

Result: PASS / PASS WITH LIMITATIONS / FAIL

Findings:

- Formal VoiceOver pass has not been completed.
- Automated support evidence completed so far: UA axe audit 6/6 passed, and the
  Playwright evidence spec verifies accessible names/roles for key controls
  using role-based locators.

Retest notes:

- Do not claim formal screen-reader testing until VoiceOver is run and logged.

## 200% zoom/reflow QA

Tester: Codex

Date: 2026-06-27

Browser: Chromium via Playwright

Account roles tested: Public, student, teacher, admin

Result: PASS WITH LIMITATIONS

Findings:

- 640px CSS viewport was used as an automated proxy for 200% desktop browser
  zoom from a 1280px baseline.
- Public accessibility page, login, student editor, teacher dashboard, teacher
  grading, and Teacher Lounge module routes did not produce document-level
  horizontal scrolling in the automated reflow proxy.
- Evidence command:
  `bunx playwright test --project=chromium e2e/tests/accessibility.ua-manual-evidence.spec.ts`

Retest notes:

- Human browser-zoom review is still recommended before representing this as a
  completed manual 200% zoom walkthrough.

## Teacher Lounge visual-content check

Reviewer:

Date:

Environment:

Result: NEEDS REMEDIATION

Video review notes:

| Video/module | Captions present | Transcript present | Important on-screen instructions/examples not spoken or written? | Decision |
|---|---|---|---|---|
| Unknown pending backlog review | Yes for active modules | Yes for active modules | Yes, confirmed by Bryant; affected module(s) still need identification | Central Station `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y` |

Remediation notes:

- TBD

## Final claims allowed after evidence

Use this section only after the relevant rows above are complete.

- Keyboard-only support claim:
- Screen-reader support claim:
- 200% zoom/reflow claim:
- Teacher Lounge media claim:

Current allowed wording:

- Keyboard-only support claim: "Automated keyboard smoke testing has passed on
  representative UA-scoped flows, and an editor `Tab` focus-trap found during
  testing has been remediated. We are not yet claiming a completed human
  keyboard walkthrough."
- Screen-reader support claim: "Automated role/name and axe testing has passed
  on representative flows. Formal VoiceOver testing is not yet complete."
- 200% zoom/reflow claim: "Automated reflow proxy testing passed on
  representative UA-scoped flows. A human browser-zoom review is still
  recommended before claiming a completed manual zoom walkthrough."
- Teacher Lounge media claim: "Captions/transcripts are available for active
  modules, but Teacher Lounge visual-only instructional content remediation is
  still tracked separately."
