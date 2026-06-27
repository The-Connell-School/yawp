# UA Bryant Action Packet

Date: 2026-06-27

Purpose: This is the smallest practical action packet for Bryant/Brian. It
contains only the approvals and manual evidence that still require a human.

## Start here

Use this packet in order:

1. Open the local preview environment using the commands below.
2. Complete the manual QA cards that apply.
3. Fill in `docs/work/ua-manual-qa-evidence-log.md`.
4. Answer the approval questions in the "Sign-off sheet" section.
5. Send or edit the two email drafts after sign-off.

## Bryant reply format

To make the sign-off step quick, Bryant can reply with this filled in:

```text
Accessibility email: YES / NO / EDIT:
AI functionality email: YES / NO / EDIT:
Publish /accessibility page after keyboard/screen-reader verification: YES / NO / EDIT:
Use yawp@theconnellschool.com for accessibility intake: YES / NO / EDIT:
Send WCAG self-evaluation instead of VPAT/ACR: YES / NO / EDIT:
Keep conservative PDF/output wording: YES / NO / EDIT:
Teacher Lounge in UA review scope: YES - confirmed by Bryant; remediation tracked in `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y`
Need privacy/terms pages in this packet: NO - operator decision; use privacy/data-security one-pager for vendor-security review
Create UA evaluator accounts: YES / NO / EDIT:
```

## Local preview setup

This uses the same deterministic E2E seed data used by the accessibility tests.
It is the right local preview for keyboard, VoiceOver, and 200% zoom review.

From the repo root:

```bash
cd /Users/bryantbrock/.codex/worktrees/bc6b/yawp
source /Users/bryantbrock/.codex/skills/node-runtime-fix/scripts/use-modern-node.sh
bun run --cwd services/web-app test:e2e:prepare
cd services/web-app
set -a
source e2e/.env.e2e
set +a
E2E=true bun run dev -- --port 5173 --host 127.0.0.1 --strictPort
```

Leave that terminal running. Open:

```text
http://127.0.0.1:5173/accessibility
```

Stop the preview with `Control-C` in the terminal.

If port `5173` is already in use, stop the old dev server and rerun the command.
The Playwright config and current test evidence use `5173`.

Record the build/commit in the evidence log:

```bash
git rev-parse --short HEAD
```

Local preview evidence is enough for pre-send confidence and remediation triage.
If UA will review production, repeat the final smoke/manual checks against
`https://yawp.school` after deployment and record that production URL in the
evidence log.

## Local review accounts

These credentials are for the local seeded review environment only.

| Role | Email | Password |
|---|---|---|
| Student | `jdoe@brock.software` | `johndoe` |
| Teacher | `teacher.e2e@yawp.test` | `teacher-e2e-password` |
| Admin | `admin.e2e@yawp.test` | `admin-e2e-password` |

## Generate the exact local QA URLs

After `test:e2e:prepare` completes, run this from the repo root in a second
terminal:

```bash
node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync("services/web-app/e2e/.e2e-context.json","utf8")); const base="http://127.0.0.1:5173"; console.log([`Public accessibility: ${base}/accessibility`,`Login: ${base}/auth/login`,`Student editor: ${base}/app/documents/${c.editedDocumentId}`,`Teacher dashboard: ${base}/app`,`Teacher class: ${base}/app/my-classes/${c.classId}`,`Teacher grading: ${base}/app/submissions/${c.submittedSubmissionId}`,`Teacher Lounge: ${base}/app/teacher-trainings/${c.teacherTrainingId}`,`Admin organization: ${base}/app/organization`,`Admin assignment type: ${base}/app/admin/assignment-types/${c.assignmentTypeId}`].join("\n"))'
```

Use those generated URLs in the QA cards below.

## Manual QA cards

Record results in `docs/work/ua-manual-qa-evidence-log.md`.

### Card 1: Keyboard-only QA

Environment:

- Browser: Chrome or Safari
- Mouse/trackpad: do not use
- Keys: `Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, arrow keys

Steps:

1. Open `/accessibility`.
2. Tab through every visible link.
3. Confirm focus is visible and no focus trap occurs.
4. Open `/auth/login`.
5. Use only the keyboard to log in as the student.
6. Open the generated Student editor URL.
7. Tab to the editor, type one short sentence, reach toolbar controls, reach
   tutor controls, and return to the document.
8. Log out or use a new browser profile/session.
9. Log in as the teacher.
10. Open the generated Teacher dashboard URL.
11. Reach class/document/assignment links and actions by keyboard.
12. Open the generated Teacher grading URL.
13. Move through essay content, comments, grading controls, and release controls.
14. Confirm `Escape` closes any open popover, menu, dialog, or sheet.
15. Open the generated Teacher Lounge URL.
16. Open a module.
17. Reach video controls if a video is present.
18. Reach captions/transcript links if present.
19. Log out or use a new browser profile/session.
20. Log in as admin.
21. Open the generated Admin organization and Admin assignment type URLs.
22. Confirm visible controls can be reached and activated by keyboard.

Pass if:

- every core action above is reachable and activatable;
- focus is visible;
- tab order is logical enough to complete the workflow;
- no component traps focus permanently.

### Card 2: VoiceOver QA

Environment:

- macOS
- Safari or Chrome
- Toggle VoiceOver with `Command-F5`
- VoiceOver modifier: `Control-Option`

Useful commands:

- `Control-Option-Right` / `Control-Option-Left`: move through items
- `Control-Option-Space`: activate focused item
- `Control-Option-U`: rotor for headings, links, and form controls
- `Command-F5`: turn VoiceOver off when finished

Steps:

1. Open `/accessibility`.
2. Use the rotor to inspect headings and links.
3. Confirm the support email is announced as a link.
4. Open `/auth/login`.
5. Confirm email and password fields have understandable names.
6. Log in as the student.
7. Open the generated Student editor URL.
8. Confirm the editor has an understandable name/role.
9. Confirm toolbar controls and tutor controls have names.
10. Confirm existing tutor messages can be reviewed in order.
11. Log in as the teacher.
12. Open Teacher dashboard, Teacher grading, and Teacher Lounge URLs.
13. Confirm headings, links, resources, captions/transcript links, and key
    grading controls are announced clearly enough to complete the workflow.

Pass if:

- critical controls have names;
- headings and regions support orientation;
- dynamic tutor/chat behavior is either announced or recorded as a limitation.

### Card 3: 200% zoom/reflow QA

Environment:

- Chrome or Safari desktop browser
- Browser zoom set to 200%

Steps:

1. Open `/accessibility`.
2. Open `/auth/login`.
3. Log in as the student and open the generated Student editor URL.
4. Log in as the teacher and open Teacher dashboard, Teacher grading, and
   Teacher Lounge URLs.
5. Log in as admin and open Admin organization and Admin assignment type URLs.

Pass if:

- normal reading/task completion does not require horizontal scrolling;
- controls remain visible and usable;
- text does not overlap or clip;
- sticky/fixed UI does not cover required controls.

### Card 4: Teacher Lounge visual-content check

Status: Bryant confirmed on 2026-06-27 that Teacher Lounge is in UA scope and
that at least one video shows important instructions or examples that are not
spoken aloud and not written in the transcript. This is now a backlog item:
Central Station `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y`.

Use production for this remediation because UA will review production Teacher's
Lounge content. Use local preview only to verify UI mechanics.

For each UA-scoped Teacher Lounge video:

1. Confirm captions exist.
2. Confirm a transcript exists.
3. Watch or skim the video.
4. Check whether the video shows important instructions or examples that are
   not spoken aloud and not written in the transcript.
5. If yes, mark "Needs audio-description support or expanded transcript notes."
6. If no, mark "Captions/transcript cover the instructional content."

## Sign-off sheet

Answer each item with `YES`, `NO`, or `EDIT: ...`.

1. Accessibility email to Rachel:
   - File: `docs/work/ua-accessibility-email-draft.md`
   - Approval needed: send as drafted after deployment/manual-status update?

2. AI functionality email to Mary Anne:
   - File: `docs/work/ua-ai-functionality-email-draft.md`
   - Approval needed: disclose Anthropic Claude Sonnet `claude-sonnet-4-6` as
     primary and OpenAI `gpt-4o-mini` as configured fallback unless production
     config says otherwise?

3. Public accessibility page:
   - File: `services/web-app/app/routes/accessibility/route.tsx`
   - Current status: draft/content verified by Bryant on 2026-06-27.
   - Approval needed: publish this page and use `https://yawp.school/accessibility`
     in UA communications after formal keyboard-only and screen-reader
     verification are complete?

4. Support process:
   - Current draft: `yawp@theconnellschool.com`
   - Approval needed: use this as the accessibility intake address and treat
     reports as product defects?

5. WCAG self-evaluation:
   - File: `docs/work/ua-wcag-2-1-aa-self-evaluation-draft.md`
   - Approval needed: send as a WCAG 2.1 AA self-evaluation instead of claiming
     a completed VPAT/ACR?

6. Accessible output/PDF claim:
   - Current claim: browser-rendered HTML is the primary output; no tagged-PDF
     guarantee unless separately tested.
   - Approval needed: keep this conservative wording?

7. Teacher Lounge scope:
   - Approved: Teacher Lounge videos are in UA review scope.
   - Remediation ticket: Central Station
     `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y`.

8. Privacy/terms pages:
   - Operator decision: not required for the accessibility packet.
   - Follow-up artifact:
     `docs/work/ua-privacy-data-security-one-pager-draft.md`.
   - Public legal pages are deferred unless UA/legal specifically asks.

9. UA evaluator accounts:
   - File: `docs/work/ua-evaluator-access-instructions-draft.md`
   - Approval needed: create student, teacher, and admin reviewer accounts for
     UA, and deliver credentials through a secure channel?

## What Codex has already verified

- Public accessibility page regression: 2 Playwright tests passed.
- UA axe audit: 6/6 Playwright tests passed.
- Typecheck: passed.
- Teacher Lounge media tests: 6/6 passed.

## What not to claim yet

- Do not claim a completed VPAT/ACR.
- Do not claim full screen-reader support until the VoiceOver pass is recorded.
- Do not claim full keyboard-only support until the keyboard pass is recorded.
- Do not claim tagged PDF output.
- Do not claim captions/transcripts cover all Teacher Lounge video content until
  Central Station `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y` is complete.
