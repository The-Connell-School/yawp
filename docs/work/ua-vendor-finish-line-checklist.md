# UA Vendor Review Finish-Line Checklist

Date: 2026-06-27

This checklist tracks the remaining work for The University of Alabama vendor
review. It separates work Codex can complete from work that needs Bryant/Brian
approval, manual assistive-technology evidence, or external submission.

Bryant-facing action packet:
`docs/work/ua-bryant-action-packet.md`

| Item | Current state | Type | Blocked by | Artifact / evidence |
|---|---|---|---|---|
| Accessibility email to Rachel Thompson | Content approved by Bryant, not sent | Send-readiness hold | Public page deployed; manual-status wording current; evaluator account readiness confirmed | `docs/work/ua-accessibility-email-draft.md` |
| AI functionality email to Mary Anne Canant | Content approved by Bryant, not sent | Send-readiness hold | Production config current at send time; send target/thread confirmed | `docs/work/ua-ai-functionality-email-draft.md` |
| Public accessibility page | Draft verified by Bryant and implemented in app at `/accessibility`; not live yet | Publish-readiness hold | Formal keyboard-only and screen-reader verification completed; final wording updated if findings change | `services/web-app/app/routes/accessibility/route.tsx` |
| Public accessibility page test | Implemented and passing locally | Engineering done | None | `services/web-app/e2e/tests/public-accessibility.spec.ts` |
| Public page axe audit coverage | Added to UA axe audit and passing locally | Engineering done | None | `services/web-app/e2e/tests/accessibility.ua-axe.spec.ts`; `docs/compliance/accessibility/automated-audit-log.md` |
| Product accessibility/WCAG self-evaluation | WCAG-self-evaluation approach approved by Bryant; not final | Manual evidence hold | Keyboard, VoiceOver, and zoom/reflow evidence recorded; final status labels updated if findings change | `docs/work/ua-wcag-2-1-aa-self-evaluation-draft.md`; `docs/work/ua-bryant-action-packet.md` |
| Manual keyboard-only walkthrough | Exact local-preview steps and evidence log created, not executed as final evidence | Manual | Human walkthrough of UA-scoped flows | `docs/work/ua-bryant-action-packet.md`; `docs/work/ua-manual-qa-evidence-log.md` |
| VoiceOver walkthrough | Exact macOS steps and evidence log created, not executed as final evidence | Manual | Human screen reader pass on macOS | `docs/work/ua-bryant-action-packet.md`; `docs/work/ua-manual-qa-evidence-log.md` |
| NVDA walkthrough | Optional but recommended; script created | Manual | Windows/NVDA access and tester time | `docs/compliance/accessibility/ua-manual-qa-script.md` |
| 200% zoom/reflow check | Exact 200% zoom steps and evidence log created, not executed as final evidence | Manual | Human walkthrough at browser zoom | `docs/work/ua-bryant-action-packet.md`; `docs/work/ua-manual-qa-evidence-log.md` |
| Teacher's Lounge captions/transcripts | Implemented, generated, uploaded, and UI follow-up merged to `main` | Done | None | `docs/compliance/accessibility/teacher-lounge-caption-generation-log.md`; `a4f1fe6` |
| Teacher Lounge visual-content remediation | Confirmed in UA scope; Bryant confirmed at least one video has important on-screen information not covered by audio/transcript; backlog ticket created | Backlog task | Identify affected production module(s), add expanded transcript notes or audio-description support, verify upload/evidence | Central Station `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y`; `docs/work/ua-bryant-action-packet.md` |
| Accessible output/PDF claim | Conservative no-tagged-PDF wording approved by Bryant | Done | None | `docs/work/ua-wcag-2-1-aa-self-evaluation-draft.md` |
| Accessibility issue-reporting process | Approved by Bryant using `yawp@theconnellschool.com` | Operational readiness | Confirm inbox owner/escalation before external launch | `/accessibility`; draft emails |
| UA evaluator accounts | Not created | Manual | Decide reviewer roles, credentials delivery method, and data scope | `docs/work/ua-accessibility-email-draft.md` |
| UA evaluator instructions | Drafted inside Rachel email | Manual sign-off | Confirm account setup and product scope | `docs/work/ua-accessibility-email-draft.md` |
| AI/data handling mini-policy | Drafted conservatively | Manual sign-off | Confirm production config and vendor contractual data-use terms | `docs/work/ua-ai-functionality-email-draft.md` |
| Privacy/terms pages | Not implemented in this pass | Product/legal | Decide whether UA requires public privacy/terms pages now or later | Not yet created |
| Post-QA remediation | Unknown | Engineering | Depends on manual keyboard/screen-reader/zoom findings | To be created if findings appear |

## Current blockers that require Bryant or Brian

1. Accessibility email content is approved; confirm send-readiness after deploy,
   current manual-status wording, and evaluator account readiness.
2. AI functionality email content is approved; confirm production config and
   send target/thread at send time.
3. Accessibility support intake address is approved as
   `yawp@theconnellschool.com`; confirm inbox owner/escalation before external
   launch.
4. Public `/accessibility` page draft is verified; do not deploy until formal
   keyboard-only and screen-reader verification are complete.
5. WCAG-self-evaluation approach is approved; complete or assign the manual
   keyboard, VoiceOver, and zoom/reflow pass before finalizing.
6. Confirm the production AI provider/model wording and contractual data-use
   claims at send time.
7. Teacher Lounge videos are in UA scope; visual-content remediation is the
   next backlog item: Central Station
   `YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y`.
8. Decide whether UA needs public privacy/terms pages for this review or only
   the accessibility and AI responses.
