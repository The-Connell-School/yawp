# UA Manual Accessibility QA Script

Date: 2026-06-27

Purpose: Produce manual evidence for the University of Alabama accessibility
review. This script covers the items automated axe tests do not prove:
keyboard-only completion, screen reader behavior, and 200% zoom/reflow.

Bryant-facing setup, exact local preview commands, seeded credentials, generated
QA URLs, and yes/no approval prompts are in
`docs/work/ua-bryant-action-packet.md`.

## Record for each pass

- Tester:
- Date:
- Environment:
- Browser:
- Assistive technology:
- Build/commit:
- Account/role:
- Findings:
- Fix links:
- Retest result:

## Keyboard-only pass

Use only keyboard input. Do not use the mouse or trackpad.

Keys to exercise:

- Tab and Shift+Tab
- Enter and Space
- Escape for dialogs/menus where applicable
- Arrow keys in menus, tabs, radio groups, and editor controls where applicable

Flows:

1. Public `/accessibility`
   - Reach all links.
   - Confirm focus is visible.
   - Confirm no keyboard trap.
2. Login
   - Reach email/password fields.
   - Submit login.
   - Confirm errors are reachable/readable if credentials fail.
3. Student editor
   - Open a student document.
   - Reach editor.
   - Type text.
   - Reach toolbar controls.
   - Reach tutor controls.
   - Submit work if assignment state allows.
4. Tutor chat
   - Move through quick-action/buttons.
   - Focus chat input.
   - Send a message.
   - Reach retry/error controls if present.
5. Teacher dashboard
   - Navigate classes/documents/assignments areas.
   - Confirm cards/actions are keyboard reachable.
6. Teacher grading
   - Open a submission.
   - Move through essay, comments, grading panel, release controls.
   - Confirm no keyboard trap in sheets/dialogs.
7. Teacher's Lounge
   - Open Teacher's Lounge.
   - Open a module.
   - Reach video controls where video exists.
   - Reach captions/transcript links.
8. Admin/setup
   - Navigate organization/admin pages in the UA setup scope.

Pass criteria:

- Every core action can be reached and activated by keyboard.
- Focus is visible.
- Tab order is logical enough to complete the task.
- Escape closes popovers/dialogs where expected.
- No component traps focus permanently.

## VoiceOver pass

Recommended environment: macOS with Safari or Chrome and VoiceOver.

Flows:

1. Public `/accessibility`
   - Heading structure is understandable.
   - Support email link is announced as a link.
2. Login
   - Fields have names.
   - Errors are announced or reachable.
3. Student editor
   - Editor has an understandable name/role.
   - Toolbar controls have names.
   - Document content can be reviewed.
4. Tutor chat
   - Existing messages are readable in order.
   - New message behavior is observed and documented.
5. Teacher dashboard
   - Navigation, headings, class/document links, and actions are announced
     clearly enough to complete the flow.
6. Teacher grading
   - Essay content, comments, scores, and release controls are understandable.
7. Teacher's Lounge
   - Module headings and resources are announced.
   - Caption/transcript links are reachable and named.

Pass criteria:

- Critical controls have accessible names.
- Main regions/headings support navigation.
- Dynamic status or chat behavior is either announced or documented as a known
  limitation.

## NVDA pass

Recommended environment: Windows with NVDA and Chrome or Edge.

Repeat the VoiceOver flows. If time is constrained, prioritize:

1. Login
2. Student editor
3. Tutor chat
4. Teacher grading
5. Teacher's Lounge media links

## 200% zoom/reflow pass

Environment: Desktop browser at 200% zoom.

Flows:

1. Public `/accessibility`
2. Login
3. Student editor
4. Tutor chat
5. Teacher dashboard
6. Teacher grading
7. Teacher's Lounge module

Pass criteria:

- No horizontal scrolling for normal reading/task completion unless the content
  is inherently wide.
- Controls remain visible and usable.
- Text does not overlap or clip.
- Sticky/fixed UI does not cover required controls.

## Audio/video content check

For each Teacher's Lounge video in UA scope:

1. Confirm captions exist.
2. Confirm transcript exists.
3. Check whether the video shows important instructions or examples that are
   not spoken aloud and not written in the transcript.
4. If yes, add audio-description support or expand the transcript.
5. If no, record "captions/transcript cover the instructional content."
