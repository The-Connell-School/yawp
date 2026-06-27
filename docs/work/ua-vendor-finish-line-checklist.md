# UA Vendor Review Finish-Line Checklist

Date: 2026-06-27

This checklist tracks the remaining work for The University of Alabama vendor
review. It separates work Codex can complete from work that needs Bryant/Brian
approval, manual assistive-technology evidence, or external submission.

Bryant-facing action packet:
`docs/work/ua-bryant-action-packet.md`

| Item | Current state | Type | Blocked by | Artifact / evidence |
|---|---|---|---|---|
| Accessibility email to Rachel Thompson | Content approved by Bryant, not sent | Send-readiness hold | Public page deployed; manual-status wording current; reviewer invite/share links generated at send time | `docs/work/ua-accessibility-email-draft.md` |
| AI functionality email to Mary Anne Canant | Content approved by Bryant, not sent | Send-readiness hold | Production config current at send time; send target/thread confirmed | `docs/work/ua-ai-functionality-email-draft.md` |
| Public accessibility page | Draft verified by Bryant and implemented in app at `/accessibility`; not live yet | Publish-readiness hold | Public wording narrowed to evidence completed so far; deploy/prod smoke | `services/web-app/app/routes/accessibility/route.tsx` |
| Public accessibility page test | Implemented and passing locally | Engineering done | None | `services/web-app/e2e/tests/public-accessibility.spec.ts` |
| Public page axe audit coverage | Added to UA axe audit and passing locally | Engineering done | None | `services/web-app/e2e/tests/accessibility.ua-axe.spec.ts`; `docs/compliance/accessibility/automated-audit-log.md` |
| Product accessibility/WCAG self-evaluation | WCAG-self-evaluation approach approved by Bryant; not final | Evidence done with limitation | Final status labels and send-time wording | `docs/work/ua-wcag-2-1-aa-self-evaluation-draft.md`; `docs/work/ua-manual-qa-evidence-log.md` |
| Manual keyboard-only walkthrough | Automated keyboard smoke passed; editor `Tab` focus trap remediated in `cc663b0`; human walkthrough not claimed | Evidence done with limitation | Human walkthrough only if we want to claim completed manual keyboard QA | `docs/work/ua-manual-qa-evidence-log.md`; `services/web-app/e2e/tests/accessibility.ua-manual-evidence.spec.ts` |
| VoiceOver walkthrough | macOS VoiceOver smoke pass completed with limitations; full screen-reader support not claimed | Evidence done with limitation | Dynamic tutor-chat announcements and NVDA only if stronger screen-reader claim is needed | `docs/work/ua-manual-qa-evidence-log.md` |
| NVDA walkthrough | Optional but recommended; script created | Manual | Windows/NVDA access and tester time | `docs/compliance/accessibility/ua-manual-qa-script.md` |
| 200% zoom/reflow check | Automated 640px reflow proxy passed; human browser-zoom walkthrough not claimed | Evidence done with limitation | Human walkthrough only if we want to claim completed manual zoom QA | `docs/work/ua-manual-qa-evidence-log.md`; `services/web-app/e2e/tests/accessibility.ua-manual-evidence.spec.ts` |
| Teacher's Lounge captions/transcripts | Implemented, generated, uploaded, and UI follow-up merged to `main` | Done | None | `docs/compliance/accessibility/teacher-lounge-caption-generation-log.md`; `a4f1fe6` |
| Teacher Lounge visual-content remediation | Active production videos sampled; 10 production transcript resources expanded with visual notes; public resource endpoint verified | Done | None | `docs/work/ua-manual-qa-evidence-log.md`; `docs/compliance/accessibility/teacher-lounge-media-accessibility.md` |
| Accessible output/PDF claim | Conservative no-tagged-PDF wording approved by Bryant | Done | None | `docs/work/ua-wcag-2-1-aa-self-evaluation-draft.md` |
| Accessibility issue-reporting process | Approved by Bryant using `yawp@theconnellschool.com` | Operational readiness | Confirm inbox owner/escalation before external launch | `/accessibility`; draft emails |
| UA evaluator accounts | Direction approved; specific accounts/links not generated yet | Operational | Named UA reviewer email addresses; send-ready environment | `docs/work/ua-evaluator-access-instructions-draft.md`; `docs/work/ua-accessibility-email-draft.md` |
| UA evaluator instructions | Secure delivery plan approved: YAWP invite links primary, 1Password view-once shares only for unavoidable preset credentials | Operational | Generate exact links at send time | `docs/work/ua-evaluator-access-instructions-draft.md`; `docs/work/ua-accessibility-email-draft.md` |
| AI/data handling mini-policy | Drafted conservatively | Manual sign-off | Confirm production config and vendor contractual data-use terms | `docs/work/ua-ai-functionality-email-draft.md` |
| Privacy/terms pages | Not required for current accessibility packet; privacy/data-security one-pager drafted for vendor-security lane | Done for this packet | Public legal pages only if UA/legal specifically asks | `docs/work/ua-privacy-data-security-one-pager-draft.md` |
| Post-QA remediation | Unknown | Engineering | Depends on manual keyboard/screen-reader/zoom findings | To be created if findings appear |

## Current send-readiness holds

1. Accessibility email content is approved; confirm send-readiness after deploy,
   current manual-status wording, and reviewer link generation.
2. AI functionality email content is approved; confirm production config and
   send target/thread at send time.
3. Accessibility support intake address is approved as
   `yawp@theconnellschool.com`; confirm inbox owner/escalation before external
   launch.
4. Public `/accessibility` page draft is verified; update public wording to the
   evidence completed so far, then deploy and smoke on production.
5. WCAG-self-evaluation approach is approved; keyboard smoke, reflow proxy, and
   VoiceOver smoke evidence are complete with limitations. Do not claim full
   screen-reader support unless dynamic tutor-chat announcements and broader AT
   coverage are tested.
6. Confirm the production AI provider/model wording and contractual data-use
   claims at send time.
7. UA evaluator access direction is approved; collect named UA reviewer email
   addresses from Rachel's team at send time and generate invite/share links.
8. Teacher Lounge videos are in UA scope; visual-content remediation is done
   for the active production videos sampled on 2026-06-27. Re-run the check if
   Teacher Lounge videos change.
9. Privacy/terms decision made: do not block the accessibility packet on public
   legal pages. Use `docs/work/ua-privacy-data-security-one-pager-draft.md` if
   UA moves into broader vendor-security questions.
