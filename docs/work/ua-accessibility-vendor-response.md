# University of Alabama accessibility vendor response packet

Date: 2026-06-26

Update, 2026-06-27: the engineering pass has advanced since this packet was
first drafted. Teacher's Lounge captions/transcripts are now implemented,
generated, uploaded, and the media accessibility links have been moved below
primary resources. A public `/accessibility` page has also been implemented in
the app and is pending deployment/sign-off.

## Executive summary

The University of Alabama needs accessibility documentation before it can approve the YAWP contract. Rachel Thompson from UA OIT asked for either a VPAT/ACR or a WCAG 2.1 AA self-evaluation, plus vendor-question answers covering keyboard access, assistive technology testing, media accessibility, accessible outputs, user documentation, implementation options, known issues, issue reporting, and the accessibility concern process.

YAWP should not claim full WCAG 2.1 AA conformance yet. The truthful posture is:

- We do not currently have a completed VPAT/ACR.
- We can provide a WCAG 2.1 AA self-evaluation focused on the product version UA will use.
- The app has meaningful accessibility foundations: native links/buttons in many flows, Radix UI primitives for several complex controls, visible focus styles in shared controls, label/error patterns in form components, and browser-native editing/media primitives.
- Several items still need evidence or sign-off before a strong final UA response: Teacher Lounge visual-only content remediation, accessible output wording, support-process ownership, AI/data-use wording, and approval of the final public accessibility claims. Automated keyboard-smoke, reflow-proxy, and representative macOS VoiceOver smoke evidence now exists for UA flows.

Recommended operating target: complete the audit, low-risk fixes, public docs, and WCAG self-evaluation by Friday, 2026-07-03. That creates a buffer before Bryant's 2026-07-06 through 2026-07-11 offline window and the mid-July GBA 300 demo.

## Source context

- Gmail, 2026-06-18 and 2026-06-25: Rachel Thompson, Director of Digital Accessibility at UA OIT, requested vendor accessibility answers and said UA needs responses before contract approval. She also said platform access would help UA evaluate accessibility and accommodations.
- Gmail, 2026-06-19: Brian Connell distilled Rachel's request into 17 concrete WCAG 2.1 AA self-evaluation questions.
- Gmail, 2026-06-25: Brian asked how the questions are looking, how much work is required for a good review, and said he will complete the WCAG self-evaluation once feasible work is in place.
- Gmail, 2026-06-25: Mary Anne Canant in UA OIT Compliance & Risk Assessment separately asked for information about the AI functionality, including the name of the AI tool.
- Granola, 2026-06-22 meeting "Assignment builder and grading assistant - tutor alignment and strictness levels": mid-July demo for about 12 GBA 300 teachers; accessibility audit/supporting documentation required before the demo; keyboard navigation is believed to be largely working; speaker/audio was removed; VPAT-style doc is in progress.
- Central Station search did not find a clean active UA accessibility ticket/source record from the broad search terms used in this pass.

Relevant public references:

- UA vendor information: https://accessibility.ua.edu/vendorinformation/
- UA web and digital materials accessibility policy: https://ua-public.policystat.com/policy/14663821/latest
- WCAG 2.1: https://www.w3.org/TR/WCAG21/
- ITI VPAT/ACR resources: https://www.itic.org/policy/accessibility/vpat

## UA's questions and YAWP's current answers

### 1. Vendor accessibility webpage

Current answer: Implemented in app, pending deployment/sign-off. A public
`/accessibility` route now describes YAWP's accessibility target, current
status, known limitations, media accessibility posture, and reporting contact.

Response posture: "We have prepared a public accessibility page that describes YAWP's accessibility commitments, support channel, current conformance posture, and update process. We can provide the URL once it is deployed and approved for external review."

Required work:

- Deploy the page to yawp.school.
- Bryant/Brian sign off on support contact and public claims.

### 2. Product accessibility webpage

Current answer: Partially ready. The new `/accessibility` page currently covers
the YAWP Writing Program product scope. If UA requires separate vendor and
product pages, this can be split later.

Response posture: "The product-specific accessibility documentation is being prepared alongside the WCAG 2.1 AA self-evaluation for the version UA will evaluate."

Required work:

- Publish a product-specific section for YAWP Writing Program Services.
- Include what is in scope for UA: login, student editor, tutor chat, submission, teacher dashboard, grading view, admin/course setup, and Teacher's Lounge media.

### 3. VPAT or WCAG 2.1 AA evaluation

Current answer: No completed VPAT/ACR. Rachel's email explicitly permits a WCAG 2.1 AA compliance-status evaluation if a current VPAT is not available.

Response posture: "YAWP does not yet have a completed VPAT/ACR. We are completing a WCAG 2.1 AA self-evaluation for the product version UA will use and will share that evaluation, including known limitations and remediation status."

Required work:

- Build a WCAG 2.1 AA checklist mapped to product flows.
- Use status labels: Supports, Partially Supports, Does Not Support, Not Applicable, Not Evaluated.
- Include evidence and remediation notes for every "Partially Supports", "Does Not Support", and "Not Evaluated" item.

### 4. Keyboard-only operation

Current answer: Partial / needs verification.

Evidence:

- Shared button/input/textarea/select/checkbox/switch/tabs components have focus-visible styles.
- Radix UI is used for several interactive primitives.
- Playwright tests often use role-based locators.
- The editor is TipTap/ProseMirror, which supports keyboard editing at the core layer.

Current evidence:

- Automated keyboard-smoke evidence now covers public accessibility, login,
  student editor, teacher dashboard, teacher grading, Teacher Lounge, and admin
  organization/setup routes.
- The pass found a student-editor `Tab` focus trap. It was remediated in
  `cc663b0` by allowing browser focus traversal outside list indentation.

Known concerns:

- The automated pass is not a completed human keyboard walkthrough.
- Tutor chat and grading/sidebar flows still need human tab-order review before
  claiming full manual keyboard QA.

Response posture: "Core browser/editor interactions are keyboard accessible in representative UA flows based on automated keyboard-smoke evidence. A student-editor Tab focus issue found during that pass has been remediated. We will document any additional manual findings as accessibility defects and prioritize by user impact."

### 5. Assistive technology testing

Current answer: Partially complete.

Evidence:

- Many form components associate labels, invalid state, and error text.
- Some status regions exist in grading/submission UI.
- Tutor chat message updates do not currently appear to have explicit live-region semantics.

Response posture: "A representative macOS VoiceOver smoke pass has been completed for key public, login, student editor, teacher grading, and Teacher's Lounge controls. We are not claiming full screen-reader coverage across every dynamic workflow yet; dynamic tutor-chat announcements and NVDA remain outside the completed pass."

Required work:

- Extend screen reader testing to dynamic tutor chat, teacher dashboard, and admin setup if a stronger screen-reader claim is required.
- Add `aria-live`/`role="log"` semantics to tutor messages if testing confirms new messages are not announced.
- Add missing accessible names to icon-only controls.

### 6. Audio/video, transcripts, captions, audio descriptions

Current answer: Ready for active Teacher's Lounge captions/transcripts and
visual notes. Teacher's Lounge videos are in UA scope, and visually
instructional transcript resources have been expanded in production.

Evidence:

- Teacher's Lounge videos exist and use a browser-native `<video controls>` element.
- Module resources now support WebVTT captions and transcript files.
- The current video player renders `<track kind="captions">` when a caption
  resource exists.
- The module page exposes captions/transcript download links as subdued helper
  links below primary resources.
- 13/13 active Teacher's Lounge production modules were verified with caption
  and transcript resources after upload.
- Active production videos were sampled on 2026-06-27; 10 transcript resources
  were expanded with `## Visual notes` for visual-only or visual-dependent
  instructional content.
- Granola notes say the speaker/audio feature was removed and should remain off because it was buggy and unused.

Response posture: "The UA student writing workflows currently do not require audio playback. Teacher training videos in the Teacher's Lounge support captions and transcripts, and active Teacher's Lounge modules have caption/transcript resources available. We reviewed the active production videos and expanded the transcripts for visually instructional modules with visual notes."

Required work:

- Re-run the visual-content check when Teacher's Lounge videos change.
- Keep the removed speaker/audio feature off for the UA release unless it receives its own accessibility review.

### 7. Accessible output

Current answer: Partial / needs careful wording.

Evidence:

- Student writing output is primarily HTML in the browser.
- The document print action opens a styled HTML document and invokes browser print/save-as-PDF.
- There is no evidence of tagged PDF generation or a formal accessible-export pipeline.

Response posture: "YAWP's primary output is web-based text content rendered in the browser. The print/save-as-PDF option uses browser print output and should not be represented as a guaranteed tagged PDF export until tested or enhanced."

Required work:

- Confirm what "output" UA cares about: student drafts, teacher feedback, grade reports, exported PDFs, downloadable resources.
- Avoid promising accessible tagged PDFs unless implemented and tested.
- If required, add an accessible export story: semantic HTML export first; tagged PDF later if institution requires it.

### 8. User-facing accessibility documentation

Current answer: Partially ready. A public `/accessibility` page has been
implemented in the app and needs deployment/sign-off.

Response posture: "User-facing accessibility documentation is being prepared. It will explain keyboard use, supported browsers, known limitations, media alternatives, and how to report issues."

Required work:

- Deploy public accessibility page.
- Sign off on product accessibility doc and known limitations.
- Internal support playbook for accessibility requests.

### 9. Setup and implementation adjustments UA can make

Current answer: Some adjustments are available, but no formal setup guide exists.

Practical current adjustments:

- UA can receive evaluation access before approval.
- Audio/speaker feature can remain disabled.
- Courses can include Teacher's Lounge video content with captions/transcripts;
  if videos change, new media needs caption/transcript review before inclusion.
- UA can route accommodation needs to YAWP through a named support channel.
- Browser zoom and OS-level accessibility settings should be part of the verification plan.

Required work:

- Produce a short UA implementation note with recommended browser/OS setup, media alternatives, reporting process, and known limitations.

### 10. Common accessibility-related issues

Current answer: Known and suspected issues should be disclosed after audit.

Preliminary list:

- No completed WCAG 2.1 AA self-evaluation.
- Public accessibility/product accessibility page implemented, pending deploy.
- Representative macOS VoiceOver smoke evidence exists; full dynamic
  screen-reader coverage is not complete.
- Tutor chat likely needs live-region semantics for new messages.
- Some icon-only controls likely need accessible names.
- Some clickable cards should be links/buttons for keyboard semantics.
- Teacher's Lounge captions/transcripts are available for active modules, and
  visually instructional transcripts have been expanded with visual notes.
- Browser print/save-as-PDF output is not yet validated as accessible/tagged output.
- Automated 640px reflow proxy passed on representative UA flows; a human
  browser-zoom pass is still recommended before claiming completed manual zoom
  QA.

### 11. How users report accessibility issues

Current answer: Partially ready. The new public accessibility page uses
`yawp@theconnellschool.com` as the reporting path, pending owner/process
sign-off.

Response posture: "Users can currently contact YAWP support, and we are adding an explicit accessibility issue-reporting path on the accessibility page."

Required work:

- Add a visible accessibility contact path.
- Decide intake destination, owner, triage labels, expected response time, and escalation path.

### 12. How YAWP addresses accessibility concerns

Current answer: Process needs to be formalized.

Recommended response posture:

"Accessibility issues are triaged as product defects. We assess severity, identify affected workflows and users, prioritize remediation based on user impact, verify fixes through keyboard and assistive-technology testing, and update our accessibility documentation when product behavior changes."

Required work:

- Create an internal issue workflow and public-facing wording.
- Add accessibility checks to release QA for core flows.
- Provide UA evaluator access through named YAWP invite links when possible;
  use email-restricted, view-once 1Password shares only for unavoidable preset
  fixture credentials.

## Brian's 17-question checklist: current status

| # | Question | Current status |
|---|---|---|
| 1 | Can all core flows be completed keyboard-only? | Automated keyboard-smoke evidence passed across representative UA flows; human keyboard walkthrough not yet claimed. |
| 2 | Visible focus, logical tab order, no traps? | Partial. Shared controls include focus-visible styles; full tab-order and trap audit not complete. |
| 3 | Screen reader testing? | Representative macOS VoiceOver smoke pass completed with limitations; dynamic tutor chat and NVDA not yet tested. |
| 4 | Alt text, labels, roles? | Partial. Some forms and images have labels/alt text; several dynamic/chat/editor controls need review. |
| 5 | 4.5:1 contrast? | Unknown. Needs automated and manual contrast audit. |
| 6 | 200% zoom? | Automated 640px reflow proxy passed across representative UA flows; human browser-zoom pass not yet claimed. |
| 7 | Color-only information? | Unknown/partial. Feedback/highlight states need review to ensure text or programmatic alternatives. |
| 8 | Input errors announced in text? | Partial. Shared form components render text errors and `aria-describedby`; route-specific forms need review. |
| 9 | Tutor chat usable with keyboard + screen reader? | Partial. Keyboard path exists, but new message announcement likely needs work. |
| 10 | Student editor accessible? | Partial. Editor is named for assistive tech, axe scan passes, and a keyboard `Tab` focus trap was remediated in `cc663b0`; formal screen-reader behavior still needs VoiceOver evidence. |
| 11 | Teacher's Lounge captions/transcripts? | Implemented and uploaded for active modules; production transcripts for visually instructional Teacher Lounge videos have been expanded with visual notes. |
| 12 | Accessible exports? | Partial. Web output is semantic-ish HTML; print/save-as-PDF is not validated as tagged/accessible output. |
| 13 | Vendor/product accessibility page/docs? | Page implemented at `/accessibility`, pending deploy/sign-off. |
| 14 | Report accessibility problem? | Public email path implemented, pending owner/process sign-off. |
| 15 | Third-party accessibility status? | Needs inventory: Radix UI, TipTap/ProseMirror, Recharts, auth UI, media player/browser controls. |
| 16 | School settings to improve accessibility? | Limited. Need setup guide; no dedicated font/contrast/theme settings found. |
| 17 | Known accessibility issues? | Preliminary list above; final list should come from audit. |

## Recommended work plan

### Phase 0: Immediate UA/Brian response, 2026-06-26

Send Brian a concise status:

- UA does not require a VPAT if we provide WCAG 2.1 AA self-evaluation.
- We should not claim full conformance yet.
- We can give UA a platform test account.
- We are targeting a complete self-evaluation and remediation notes by 2026-07-03.
- The AI functionality answer is separate and should be handled immediately.

Draft AI functionality answer:

"YAWP includes AI-assisted writing tutoring and grading feedback features. The current implementation uses Anthropic Claude as the primary large language model provider, with OpenAI configured as a fallback for certain outage scenarios. The AI is integrated into YAWP's product workflow; students interact with YAWP, not a standalone public chatbot."

Confirm production provider/model names before sending externally.

### Phase 1: Audit, 2026-06-29 to 2026-07-01

Use production or production-like data and accounts for these flows:

- Login and account access.
- Student document editor: open assignment, write, toolbar, save state, submit.
- Tutor chat: predefined buttons, chat input, new messages, errors/retry.
- Teacher dashboard: class list, student list, documents tab, assignment creation/editing.
- Grading view: read submission, generate/view feedback, grade/comment, release grade.
- Admin setup: assignment types, modules, teacher training if UA scope includes it.
- Teacher's Lounge media if UA scope includes it.

Audit methods:

- Keyboard-only pass: tab, shift-tab, enter, space, escape, arrow keys where expected.
- Screen reader pass: VoiceOver and NVDA if available.
- Contrast pass: automated scan plus manual review for brand colors, highlight states, disabled states.
- Zoom/reflow pass: 200% browser zoom on desktop and narrow tablet width.
- Static code pass for icon-only buttons, clickable non-controls, `aria-hidden`, missing labels, and dynamic status updates.

### Phase 2: Low-risk remediation, 2026-06-29 to 2026-07-03

Likely fixes:

- Add accessible names to icon-only buttons, including tutor chat send/back/next controls where missing.
- Convert clickable cards to links/buttons or add correct keyboard semantics.
- Add live-region/log semantics to tutor messages and status announcements.
- Ensure editor surface has a clear accessible name and toolbar controls are named.
- Add or fix `aria-describedby` IDs where form error components currently point to the input ID instead of an error ID.
- Deploy public accessibility page and product accessibility documentation.
- Sign off accessibility issue-reporting owner/process.
- Re-run Teacher Lounge visual-content remediation when Teacher Lounge videos
  change.

All code fixes should follow the repo rule: write the failing unit/e2e first, implement the fix, verify, and commit atomically.

### Phase 3: WCAG self-evaluation and UA packet, target 2026-07-03

Deliverables:

- WCAG 2.1 AA self-evaluation table for the UA product scope.
- Public accessibility page URL.
- Product accessibility page URL.
- Known issues and remediation roadmap.
- Platform access instructions for Rachel/UA.
- Short implementation/accommodation note.
- Draft email for Brian/Rachel.

### Phase 4: UA validation buffer, 2026-07-06 to mid-July

- Brian sends packet and platform access.
- UA evaluates with Rachel's team.
- YAWP triages any UA findings as contract blockers unless clearly out of scope.
- Keep fixes small, tested, and backward compatible.

## Draft message Brian can send to Rachel

Hi Rachel,

Thank you for the clear accessibility questions and for offering to evaluate the platform directly. We do not currently have a completed VPAT/ACR, so we are preparing a WCAG 2.1 AA self-evaluation for the version of YAWP that UA would use, along with direct answers to each vendor question you listed.

We are completing a keyboard, assistive-technology, contrast, zoom/reflow, media, output, documentation, and issue-reporting review across the core YAWP workflows: login, student writing/editor, tutor chat, submission, teacher dashboard, grading, and setup/admin flows. We will include current support status, known limitations, and remediation notes rather than making unsupported conformance claims.

We can also provide platform access for your team so you can evaluate the product directly and identify any campus-specific accommodations. Please let us know the best account setup for your review team. Teacher's Lounge video content is in scope, and we are tracking one follow-up to add accessible text coverage for important on-screen information in the affected video module(s).

Our target is to send the WCAG 2.1 AA self-evaluation and supporting documentation by July 3, 2026.

Best,
Brian

## Draft message Bryant can send Brian now

Brian,

I found Rachel's vendor questions, your 17-question breakdown, and the separate UA OIT question about AI functionality. The truthful accessibility status is: we do not have a VPAT yet, so we should give UA a WCAG 2.1 AA self-evaluation; the app has a decent accessibility foundation, but we need to audit and likely fix a few things before making strong claims.

Likely remaining gaps: tutor chat live-announcement evidence, accessible-output wording, public accessibility/support claims sign-off, and an explicit owner/process for issue reporting. Automated keyboard-smoke and reflow-proxy evidence now passes on representative UA flows, a representative macOS VoiceOver smoke pass is recorded, and a student-editor `Tab` focus trap found during testing has been fixed. Teacher's Lounge captions/transcripts are implemented for the active modules, and transcripts for visually instructional Teacher Lounge videos have been expanded with visual notes.

I think the right plan is to finish audit + low-risk fixes + docs by July 3, then you can send Rachel the WCAG self-evaluation and platform access before the mid-July GBA 300 demo.

Separate AI functionality answer, pending production confirmation: YAWP uses Anthropic Claude as the primary LLM provider for AI-assisted tutoring/grading, with OpenAI configured as a fallback for certain outage scenarios. Students interact with YAWP's integrated tutor/grading workflows, not a standalone chatbot.

## Open items

- Who owns the public accessibility support inbox or intake path?
- Re-run Teacher Lounge visual-content remediation when videos change.
- Privacy/terms decision: public legal pages are not a current accessibility
  packet blocker; use
  `docs/work/ua-privacy-data-security-one-pager-draft.md` for broader
  vendor-security review questions.
- Should YAWP publish/deploy the accessibility page before all manual QA evidence is complete, or wait until the self-evaluation is complete?
- Which exact production AI provider/model names should be disclosed to UA?
- UA evaluator access plan is approved; collect named UA reviewer email
  addresses from Rachel's team and generate student, teacher, and admin/owner
  links at send time.
