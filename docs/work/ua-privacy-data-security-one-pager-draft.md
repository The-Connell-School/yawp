# UA Privacy and Data Security One-Pager Draft

Date: 2026-06-27

Status: Draft vendor-security artifact. This is not a public privacy policy, not
terms of service, and not legal advice. Use it to answer UA security/compliance
review questions or to prepare contract-review responses.

## Operator decision

Public privacy/terms pages are not a blocker for the UA accessibility packet.
The right next artifact is this privacy/data-security one-pager for UA's
software vendor review lane.

Rationale:

- UA's accessibility review asks for accessibility evidence, support process,
  media alternatives, known limitations, and remediation posture.
- UA's broader software contract process separately routes software, cloud,
  hosting, AI, and data tools through security/compliance review.
- Therefore, do not delay the accessibility response for public legal pages.
  Prepare concise data-security answers instead.

Relevant UA sources:

- UA Compliance Contract Review Portal:
  `https://compliance.ua.edu/privacy/compliance-contract-review-portal/`
- UA software contract review guide:
  `https://compliance.ua.edu/wp-content/uploads/2024/04/Compliance-Software-Contract-Review-Portal-Guide-2.pdf`
- UA contract submittal forms:
  `https://procurementcontracts.ua.edu/contract-submittal-forms/`

## Short answer for UA

YAWP! is a hosted classroom writing platform. Student and teacher data is stored
inside YAWP!'s application database and supporting AWS-hosted services. AI
features are integrated into server-side YAWP! workflows; students and teachers
interact with YAWP!, not with a standalone public chatbot.

Current production configuration uses Anthropic Claude Sonnet
`claude-sonnet-4-6` as the primary large language model. OpenAI is configured as
an outage fallback provider when fallback is enabled and credentials are
available.

YAWP! controls authentication, authorization, product workflow, and product data
storage. Vendor security review should be handled through UA's contract/security
review process; YAWP! can provide additional security answers as requested.

## Data handled

YAWP! may process:

- teacher account information;
- student account information;
- class, school, and organization membership data;
- student writing/document content;
- teacher feedback, grades, rubrics, and comments;
- Teacher's Lounge video/resource metadata and media resources;
- application logs, audit records, analytics events, and error telemetry.

Do not claim a narrower data scope unless the production configuration and UA
implementation scope are rechecked.

## Authentication and authorization

Evidence in code:

- Session cookies are HTTP-only, same-site `lax`, and secure when the runtime
  should use secure cookies:
  `services/web-app/app/cookie-session-storages/authentication.server.ts`
- Route guards require an authenticated user before app access:
  `services/web-app/app/utils/auth.server.ts`
- Membership checks scope users to organization membership:
  `services/web-app/app/utils/auth.server.ts`
- Admin routes require admin authorization:
  `services/web-app/app/utils/auth.server.ts`
- Read-only impersonation and student-preview mutation blocking exist:
  `services/web-app/app/utils/auth.server.ts`

Claim:

YAWP! uses authenticated sessions and role/membership checks to control access
to app workflows. Admin, teacher, and student access should be represented based
on actual configured roles and memberships.

## Hosting, database, and secrets

Evidence in infrastructure:

- Web app runs on AWS App Runner from ECR:
  `infra/main.tf`
- Database is AWS RDS Postgres, not publicly accessible, with encrypted storage
  and seven-day backup retention:
  `infra/main.tf`
- Database URL and application secrets are injected through AWS Secrets Manager:
  `infra/main.tf`
- App environment includes separate secrets for session, database, internal
  command token, Anthropic API key, OpenAI API key, and telemetry keys:
  `infra/main.tf`

Claim:

YAWP! production infrastructure uses AWS-hosted application, database, object
storage, and secrets-management services. Database credentials and third-party
API keys are not hard-coded into application source.

## Media storage

Evidence in infrastructure/code:

- Teacher Lounge videos/resources use an AWS S3 bucket configured with public
  access blocked, bucket versioning enabled, and AES256 server-side encryption:
  `infra/main.tf`
- The app uses signed S3 URLs for video/resource access:
  `services/web-app/app/services/s3.server.ts`

Claim:

Teacher Lounge media resources are stored in AWS S3 with private bucket access
controls and are served through application-controlled signed URLs.

## AI processing

Evidence in infrastructure/code:

- Production infrastructure sets `AI_MODEL = "claude-sonnet-4-6"`:
  `infra/main.tf`
- Tutor workflows call the server-side LLM completion path:
  `services/web-app/app/routes/api.domain.tutor-response/route.ts`
- Grading workflows default to `process.env.AI_MODEL ?? "claude-sonnet-4-6"`:
  `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
- OpenAI fallback defaults to `gpt-4o-mini` when fallback is used and no
  override is set:
  `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts`

Claim:

AI calls are made server-side as part of YAWP! tutoring, grading, and setup
workflows. YAWP!'s current infrastructure identifies Anthropic Claude Sonnet as
the primary model, with OpenAI configured as a fallback path.

Do not claim provider data-use/training terms until the applicable Anthropic and
OpenAI account terms/contracts are confirmed.

## Analytics and telemetry

Evidence in code:

- PostHog is configured for analytics when keys are present:
  `services/web-app/app/root.tsx`
- Session recording masks all inputs and masks password inputs:
  `services/web-app/app/root.tsx`
- Server-side PostHog error capture is enabled only in production when keys are
  configured:
  `services/web-app/app/services/posthog.server.ts`

Claim:

YAWP! uses analytics/error telemetry where configured. Input masking is enabled
for session recording. Confirm production telemetry configuration before making
any more specific retention or data-sharing claim.

## Claims not ready yet

Do not claim any of the following without separate confirmation:

- SOC 2 compliance.
- FERPA-specific contractual terms beyond what the contract says.
- HIPAA applicability or compliance.
- A public privacy policy or terms page already exists.
- Anthropic/OpenAI never use submitted data for training.
- Specific log retention periods.
- Data residency beyond the deployed AWS region and services actually used.
- A formal incident-response SLA.

## Recommended next step

Keep the UA accessibility packet focused on accessibility. If UA asks broader
security/privacy questions, use this one-pager as the base response and answer
their exact questionnaire through the contract/security review process.
