# Handle + password preview QA captures

Screenshots captured against the PR preview (`pr-413.preview.yawp.school`) using the Playwright helper in `../capture-handle-password-preview.mjs`.

| File | Scenario |
|------|----------|
| `00-preview-gate-passed.png` | Preview access gate (login shell) |
| `01-teacher-logged-in.png` | Teacher dashboard after email login |
| `02-teacher-my-classes.png` | Teacher class list (yawp.school styling) |
| `03-teacher-opened-class.png` | Teacher opened a class |
| `04-teacher-student-join-link.png` | Class detail / students area |
| `05-join-handle-form-preview.png` | Join landing (handle flow entry) |
| `12h-session-unit-test.log` | Unit test: `getSessionExpirationDateForUser` ≈ 12h for handle-only |

Free-tier **student join link**, duplicate-handle, class-full, handle login, and teacher reset flows are covered in CI E2E (`auth.free-tier-handle-join.spec.ts`) because this preview seat uses the standard school-plan seed (no `Student join link` on class pages). Re-run the capture script with `PREVIEW_JOIN_PATH` when a `FREE_CLASSROOM` preview org is available.

Do not commit preview access codes or join tokens in this folder.
