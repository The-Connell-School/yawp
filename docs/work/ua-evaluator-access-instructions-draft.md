# UA Evaluator Access Instructions Draft

Status: Direction approved by Bryant on 2026-06-27. Operational hold only:
generate the specific reviewer accounts/links when the accessibility packet is
send-ready.

## Purpose

Give UA OIT accessibility reviewers a direct way to inspect YAWP's relevant
workflows before contract approval.

## Proposed reviewer roles

Create one account for each review role:

| Role | Purpose |
|---|---|
| Student reviewer | Inspect login, document editor, tutor chat, writing, and submission workflows. |
| Teacher reviewer | Inspect dashboard, class/document views, assignment views, grading, feedback, and Teacher's Lounge modules. |
| Admin reviewer | Inspect organization/setup workflows that UA may use for implementation. |

## Secure delivery decision

Primary path: use YAWP invitation/onboarding links sent to named UA reviewer
email addresses. The current product invite flow lets reviewers set their own
passwords, expires invite records after three days, and deletes the invite after
successful verification.

Fallback path: use 1Password one-time shares only for an unavoidable preset
student-reviewer credential, such as a fixture account created by bulk student
import. Create one share per account, restrict it to the reviewer email address,
set a short expiry, and make it view-once.

Do not send plaintext passwords in the UA email thread.

## Operator account-delivery process

1. Create dedicated UA reviewer access in production or the production-equivalent
   environment UA will inspect.
2. Prefer named invitation links for student, teacher, and admin/owner review
   access so UA reviewers set their own passwords.
3. If a preset student fixture credential is required, store it in 1Password and
   generate an email-restricted, view-once share link:
   `op item share <item> --emails <reviewer@ua.edu> --expiry 24h --view-once`.
4. Send the normal instruction email with role, environment, scope, and support
   contact. Include invite links only when they are sent to the intended named
   reviewer, and include 1Password share links only for preset credentials.
5. Record the environment, roles, reviewer emails, expiration window, and share
   method in the send-readiness notes.
6. Archive or disable review access after the review window closes unless UA
   confirms the accounts should remain active for implementation.

## Suggested scope note for UA

The reviewer accounts are intended to inspect:

- login and account access;
- student writing/editor workflows;
- tutor chat and feedback workflows;
- student submission;
- teacher dashboard and class/document views;
- teacher grading and feedback;
- Teacher's Lounge training videos, captions, transcripts, and resources;
- setup/admin workflows relevant to UA implementation.

## Remaining external dependency

Rachel's team needs to provide the named UA reviewer email addresses before
send-ready links can be generated.

Teacher's Lounge video content is part of the initial approval scope; visual
content remediation is tracked in Central Station
`YPM-UA-TEACHER-LOUNGE-VISUAL-CONTENT-A11Y`.
