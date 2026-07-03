# UA Accessibility Response - Send-Today Draft

Date: 2026-06-29

Purpose: response packet for Brian/Rachel today, before the public
`/accessibility` page is live on `yawp.school`.

Current production check: `https://yawp.school/accessibility` returned 404 on
2026-06-29, so do not include that URL in today's external message unless it is
deployed and smoke-tested first.

## Recommended internal note to Brian

Brian,

I think we can respond to Rachel today with a truthful, useful accessibility
packet. The key is not to overclaim full conformance or a completed VPAT yet.
Rachel explicitly allowed a WCAG 2.1 AA status evaluation if a current VPAT is
not available, so that is the right posture.

What we can say now:

- We do not yet have a completed VPAT/ACR.
- We are providing a WCAG 2.1 AA self-evaluation/status response for the YAWP
  product scope UA is reviewing.
- Automated axe testing has passed on representative UA flows after
  remediation.
- Automated keyboard smoke and reflow-proxy testing has passed; a student
  editor Tab focus issue found during the pass was fixed.
- A representative macOS VoiceOver smoke pass has been completed, with the
  limitation that we are not claiming full dynamic screen-reader coverage or
  NVDA coverage yet.
- Student writing workflows do not require audio/video.
- Teacher's Lounge videos now have captions/transcripts, and transcripts for
  visually instructional active videos have been expanded with visual notes.
- We can provide UA reviewer access once Rachel sends the reviewer email
  addresses.

The public accessibility page is implemented but not currently live on
`yawp.school`, so I would not send that URL yet. We can send the written answers
now and follow up with the public URL once it is deployed.

## Draft reply Brian can send to Rachel

Subject: Re: YAWP! accessibility status

Hi Rachel,

Thank you again for outlining UA's accessibility review questions. We do not
currently have a completed VPAT/Accessibility Conformance Report, so we are
providing a WCAG 2.1 Level AA status evaluation for the YAWP! product scope UA
is reviewing, along with answers to your vendor questions below.

The current review scope includes login, student writing and editor workflows,
tutor chat and feedback, submission, teacher dashboard workflows, teacher
grading, setup/admin workflows relevant to implementation, and Teacher's Lounge
training content if that content is included in UA's implementation.

## Accessibility webpages

We have prepared product accessibility documentation for YAWP! and are preparing
it for public posting. Until that public page is live, we are sharing the
substance of the accessibility status directly in this response and can provide
the URL once it is deployed.

## VPAT / WCAG 2.1 AA evaluation

YAWP! does not currently have a completed VPAT/ACR. Instead, we are providing a
WCAG 2.1 Level AA self-evaluation/status response for the product version UA
would use.

Current summary: YAWP! has completed automated axe testing on representative
login, student, teacher, grading, and Teacher's Lounge flows using WCAG 2.1 A
and AA checks. Issues found during that audit were remediated, including color
contrast, accessible names for controls, editor naming, and Teacher's Lounge
media/accessibility behaviors.

## Keyboard-only operation

Representative automated keyboard-smoke testing has passed across UA-scoped
flows, including public/login surfaces, student editor workflows, teacher
dashboard and grading workflows, Teacher's Lounge pages, and admin/setup routes.
A student-editor Tab focus issue found during testing was remediated so normal
Tab navigation can leave the editor while list indentation behavior remains
available where expected.

We are not representing this as a completed human keyboard-only walkthrough of
every dynamic workflow, but the current evidence supports the core review flows.
Any findings from UA's review will be tracked as accessibility defects and
prioritized by user impact.

## Assistive technology testing

We have completed automated role/name and axe testing on representative flows,
as well as a representative macOS VoiceOver smoke pass covering key public,
login, student editor, teacher grading, and Teacher's Lounge controls.

We are not yet claiming full screen-reader coverage across every dynamic
workflow. In particular, dynamic tutor-chat announcement behavior and NVDA have
not yet been fully evaluated.

## Audio/video, captions, transcripts, and audio descriptions

Student writing workflows in YAWP! do not require audio or video playback.

Teacher's Lounge training videos may be included in implementations. Those
videos now support caption and transcript resources in the product. Active
Teacher's Lounge modules have transcript resources, and the active production
videos were reviewed for important visual-only or visual-dependent instructional
content. Transcript resources for visually instructional videos were expanded
with visual notes covering important on-screen examples, prompts, diagrams, and
directions.

When Teacher's Lounge video content changes, we will re-run the caption,
transcript, and visual-content review.

## Accessible output

YAWP!'s primary student and teacher output is browser-rendered HTML. We are not
claiming that browser print/save-as-PDF output is a guaranteed tagged PDF export
unless a specific export path is separately tested or enhanced.

## User-facing accessibility documentation

We have prepared user-facing accessibility documentation covering product scope,
current support status, known limitations, media accessibility, and the issue
reporting path. We can provide the public URL once that page is live.

## Setup and implementation adjustments for UA

Recommended setup:

- use a current version of Chrome, Edge, Safari, or Firefox;
- use browser zoom and operating-system accessibility settings as needed;
- keep audio/speaker features disabled unless separately reviewed;
- include Teacher's Lounge videos only with caption and transcript resources;
- route accessibility issues or accommodation requests through the YAWP support
  path so they can be triaged as product issues.

We can also provide reviewer access so UA can evaluate the platform directly.
Please send the UA reviewer email addresses and the roles you would like to
inspect. We can provide student, teacher, and administrator reviewer access. Our
preferred path is to send YAWP invitation links to named reviewer email
addresses so reviewers set their own passwords, rather than sending plaintext
credentials in email.

## Common accessibility-related issues / known limitations

Known limitations we are not overstating:

- YAWP! does not yet have a completed VPAT/ACR.
- Full screen-reader coverage is not final; current evidence includes
  automated checks and representative macOS VoiceOver smoke testing.
- A human keyboard-only walkthrough of every dynamic workflow is not yet
  claimed, although automated keyboard-smoke evidence passed on representative
  flows and a known editor Tab issue was fixed.
- Browser print/save-as-PDF output is not represented as a guaranteed tagged
  PDF export.
- Dedicated school-level high-contrast, font-size, or theme settings are not
  currently exposed as YAWP settings; users can use browser and OS-level
  accessibility settings.

## Reporting and remediation process

Users and reviewers can report accessibility barriers through YAWP support.
Accessibility issues are triaged as product defects. We assess the affected
workflow and user impact, prioritize remediation accordingly, verify fixes with
keyboard and assistive-technology checks where applicable, and update
documentation when product behavior changes.

Please let us know if UA has a preferred format for the WCAG status evaluation
or if you would like the responses above reorganized into a specific table. We
would also be glad to provide direct platform access for your evaluation once we
have the reviewer email addresses.

Best,

Brian

## Send-time guardrails

- Do not include `https://yawp.school/accessibility` until the route is live and
  smoke-tested in production.
- Do not claim completed VPAT/ACR.
- Do not claim full WCAG 2.1 AA conformance.
- Do not claim full screen-reader support or NVDA coverage.
- Do not claim browser print/save-as-PDF output is tagged PDF output.
- Do not send plaintext reviewer passwords in email.
