# Draft Email: UA Accessibility Response

Status: Content approved by Bryant on 2026-06-27. Do not send until the public
accessibility page is deployed, manual-status wording is current, and evaluator
account readiness is confirmed.

To: Rachel Thompson <rsthompson2@ua.edu>

Subject: YAWP! accessibility documentation and evaluation access

Hi Rachel,

Thank you again for outlining UA's accessibility review questions. We have
prepared a WCAG 2.1 Level AA self-evaluation for the current YAWP! product
scope and a public accessibility page for the product:

https://yawp.school/accessibility

We do not currently have a completed VPAT/Accessibility Conformance Report.
Instead, we are providing the WCAG 2.1 Level AA status evaluation you noted as
an acceptable alternative. The evaluation covers login, student writing and
editor workflows, tutor chat, submission, teacher dashboard workflows, teacher
grading, setup/admin workflows, and Teacher's Lounge training content when that
content is included in implementation.

Current status in brief:

- YAWP! has completed automated WCAG 2.1 A/AA axe testing across representative
  login, student, teacher, grading, and Teacher's Lounge flows.
- We remediated issues found during that pass, including color contrast,
  accessible names for controls, editor naming, and several Teacher's Lounge
  media/accessibility behaviors.
- Teacher's Lounge videos now support captions and transcripts; the active
  Teacher's Lounge videos have caption and transcript resources available.
- Student writing workflows do not require audio or video playback.
- We have completed automated keyboard-smoke and reflow-proxy evidence on the
  representative UA flows, including remediation of a student-editor `Tab`
  focus issue found during that pass. We have also completed a representative
  macOS VoiceOver smoke pass covering key public, login, student editor,
  teacher grading, and Teacher's Lounge controls. We are not overstating that
  as full screen-reader coverage across every dynamic workflow. Any findings
  from these checks will be tracked as accessibility defects and prioritized by
  user impact.

We can also provide platform access for your team so you can evaluate the
product directly and identify any campus-specific accommodations. We can create
student, teacher, and administrator reviewer access for named UA reviewers. Our
preferred path is to send YAWP invitation links to the designated reviewer email
addresses so reviewers set their own passwords. If a preset student fixture
credential is unavoidable, we will send it through a one-time secure share
rather than placing a password in this email thread.

Please send the UA reviewer email addresses that should receive access.

Known limitations we are not overstating:

- We are not claiming a completed VPAT/ACR at this time.
- We are not claiming browser print/save-as-PDF output is a guaranteed tagged
  PDF export unless a specific export path is separately tested.
- We will document manual assistive-technology findings separately from the
  automated axe results.

Please let us know if UA has a preferred format for the self-evaluation table or
if you would like us to send the evaluation as a document attachment in addition
to the public page and platform access.

Best,

Brian

## Claims requiring Bryant/Brian sign-off before sending

- Bryant approved the email draft content on 2026-06-27.
- Public page URL is deployed and reachable at `https://yawp.school/accessibility`.
- Active Teacher's Lounge captions/transcripts are available in production.
- Keyboard, screen-reader, and zoom/reflow evidence status is accurately
  represented at send time.
- UA evaluator access direction is approved: YAWP invite links are primary, and
  1Password email-restricted, view-once shares are the fallback for unavoidable
  preset credentials.
- Named UA reviewer email addresses are available or requested in the outgoing
  message.
