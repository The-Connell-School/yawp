# NIST CSF 2.0 Self-Assessment Draft

Prepared for the Brian Connell / Holy Family privacy follow-up.

Date: 2026-10-13

System assessed: Yawp platform production and demo web application, Terraform-managed AWS infrastructure, and supporting platform operational controls.

Status: Draft, evidence-grounded self-assessment. This is not an external audit.

## Method

This draft maps observed repository controls to selected NIST Cybersecurity Framework 2.0 functions, categories, and subcategories. NIST describes the CSF Core as a hierarchy of Functions, Categories, and Subcategories for cybersecurity outcomes, and lists the six Functions as GOVERN, IDENTIFY, PROTECT, DETECT, RESPOND, and RECOVER in the official CSF 2.0 publication: [NIST CSWP 29, The NIST Cybersecurity Framework 2.0](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf).

Evidence below comes from the platform repository only, especially application authorization paths, Prisma schema, documentation, and Terraform in `infra/`. Runtime AWS state was not queried for this draft. Terraform apply status for blocked compliance items is noted separately.

## Current Evidence Summary

### Authentication And Access Control

- User sessions are server-backed by the `Session` Prisma model and carried in a signed `en_session` cookie with `httpOnly`, `sameSite: lax`, environment-aware `secure`, and `SESSION_SECRET`-backed signing in `services/web-app/app/cookie-session-storages/authentication.server.ts` and `packages/prisma/schema.prisma`.
- Passwords are stored only as bcrypt hashes via `getPasswordHash()` and verified with `bcrypt.compare()` in `services/web-app/app/utils/auth.server.ts`.
- Route authorization is centralized through `requireUserId`, `requireMembership`, `requireAdmin`, `requireSuperAdmin`, and `requireOwner` in `services/web-app/app/utils/auth.server.ts`. Owner checks are scoped to the active membership rather than any unrelated ownership record.
- Login attempts are rate limited before password verification in `services/web-app/app/routes/auth.login/login.server.ts`, using `services/web-app/app/utils/rate-limit.server.ts`.
- Internal platform APIs support scoped HMAC authentication with key IDs, timestamps, nonces, actor identity, request-body hashing, replay protection, per-key and failed-auth rate limits, and scope checks in `services/web-app/app/utils/internal-platform-auth.server.ts`. Regression tests cover bad signatures, expired timestamps, replayed nonces, wrong scopes, and failed-auth throttling in `services/web-app/app/utils/internal-platform-auth.server.test.ts`.
- Internal read-only impersonation is constrained: mutable requests are blocked for read-only sessions except a narrow allowlist in `services/web-app/app/utils/auth.server.ts`. Durable impersonation sessions and events are modeled in `packages/prisma/schema.prisma`.

### Encryption And Data Protection

- RDS Postgres is private, not publicly accessible, and has encrypted storage enabled in `infra/main.tf`.
- The application file/video S3 bucket blocks public ACLs and public bucket policies, enables versioning, and uses SSE-S3 encryption in `infra/main.tf`.
- Production traffic is fronted by CloudFront with HTTPS redirection and ACM-managed TLS in `infra/main.tf`. The CloudFront origin connects to App Runner over HTTPS.
- Secrets such as database URL, session secret, AI provider keys, internal tokens, HMAC keys, and optional billing secrets are stored in AWS Secrets Manager and injected into App Runner as runtime secrets in `infra/main.tf`.
- AI usage logging avoids raw IP storage. `computeIpHash()` uses HMAC-SHA256 with `AI_USAGE_IP_HMAC_SECRET` and returns null when a trustworthy address or secret is unavailable in `services/web-app/app/utils/ai-usage-log.server.ts`.
- LlmLog writes are de-identified before persistence through `createDeidentifiedLlmLog()` and `deidentifyLlmLogData()` in `services/web-app/app/utils/llm-log-deidentify.server.ts`. The scrubber removes direct identifiers and feasible in-text PII while preserving prompts and responses for supportability and analysis.

### Logging, Monitoring, And Audit

- App Runner application logs are sent to a CloudWatch log group with 30-day retention in `infra/main.tf`.
- Mutating internal platform API calls can be captured in `InternalPlatformApiAudit`, including actor email, key ID, endpoint, request hash, result, and timestamp. The listing utility intentionally omits request hashes from formatted output in `services/web-app/app/utils/internal-platform-api-audit-list.server.ts`.
- Internal impersonation events are append-like operational audit rows with session, actor, target user, organization, action, resource, request, and job fields in `packages/prisma/schema.prisma`.
- AI usage decisions are recorded without prompts or bodies in `AiUsageDecisionLog`; `docs/ai-usage-log.md` documents 90-day retention intent and the no-raw-IP rule.
- LlmLog metrics work is proposal-only in `docs/llmlog-metrics-proposal.md`; it calls for aggregate metrics and explicitly avoids user, person, organization, request, class, IP hash, filename, email, username, or name dimensions.

### Backups, Retention, And Recovery

- RDS automated backups are enabled with `backup_retention_period = 7` in `infra/main.tf`.
- The document revision and write journal cleanup endpoint deletes `DocumentRevision` and `DocumentWriteJournal` rows older than 30 days, requires the `x-internal-token` header, and rejects token-in-query access in `services/web-app/app/routes/api.domain.retention/route.ts`.
- EventBridge invokes the retention endpoint daily using an API destination and header-based internal token in `infra/main.tf`.
- Current AI usage retention is documented as 90 days with a manual SQL pruning statement in `docs/ai-usage-log.md`; no scheduled cleanup is implemented there yet.
- The 90-day manual RDS snapshot and S3 database export lifecycle work is not live in the assessed branch. Platform PR #512 is the planned control and remains blocked on missing production tfvars/backend access from this NucBox.
- Multi-region CloudTrail is not live in the assessed branch. Platform PR #513 is the planned control and remains blocked on missing production tfvars/backend access from this NucBox.

### Least Privilege And Network Boundaries

- RDS ingress is restricted to the App Runner connector security group, the bastion security group, and two production-only internal/admin security groups in `infra/main.tf`.
- App Runner runs through a VPC connector using private subnets in `infra/main.tf`.
- The App Runner instance role is granted specific Secrets Manager ARNs for application secrets, plus the internal integration module output ARNs when configured, in `infra/main.tf`.
- The S3 application bucket policy is attached to the App Runner instance role and scoped to the application bucket ARN and objects in `infra/main.tf`.
- The internal integration Terraform module validates HTTPS origins and distinct Secrets Manager ARNs rather than raw credentials in `infra/modules/internal-integration/main.tf`.
- Known least-privilege gaps remain: bastion SSH ingress is currently `0.0.0.0/0`, and the App Runner instance policy includes broad `ssm:GetParameter(s)` and `ses:SendEmail`/`ses:SendRawEmail` resources in `infra/main.tf`.

## NIST CSF 2.0 Mapping

| CSF area | Current assessment | Evidence |
| --- | --- | --- |
| GV.OC-02 / GV.OC-03, stakeholder and privacy/security requirements | Partial. The draft is explicitly tied to a privacy follow-up and the repo contains privacy-oriented AI logging, LlmLog de-identification, retention, and access-control evidence. A maintained compliance profile or contractual control register is not yet present. | `docs/ai-usage-log.md`, `docs/llmlog-metrics-proposal.md`, this file |
| GV.RM-06 / ID.RA-06, risk documentation and prioritized response | Partial. The lane backlog tracks prioritized compliance work and blocked apply dependencies, but this is not a formal risk register. | Compliance lane `BACKLOG.md`; blocked PR notes for #512 and #513 |
| GV.SC-04 through GV.SC-07, supplier and third-party risk | Partial. AWS, OpenAI, Anthropic, PostHog, Resend/SES, Stripe, and Sentry are represented as configured services/secrets, but supplier inventory, review cadence, and contractual control evidence are not centralized. | `infra/main.tf`, `infra/variables.tf` |
| ID.AM-02, software/services/systems inventory | Mostly implemented for code-managed assets. Terraform defines App Runner, RDS, ECR, CloudFront, Route 53, Secrets Manager, EventBridge, S3, VPC, IAM, and supporting resources. Runtime-only or manually provisioned assets need reconciliation. | `infra/main.tf`, `infra/README.md` |
| ID.AM-07, data and metadata inventory | Partial. Prisma models identify major data stores, including sessions, documents, revisions, write journals, LlmLog, AI usage decisions, internal API nonces, and audit rows. A data classification register is still a gap. | `packages/prisma/schema.prisma` |
| ID.AM-08 / PR.PS-01, lifecycle and configuration management | Partial to mostly implemented for code-owned services. Terraform and migrations manage major platform resources and database shape. Manual AWS state and pending compliance Terraform applies remain gaps. | `infra/`, `packages/prisma/migrations/` |
| PR.AA-01 / PR.AA-03, identity and authentication | Mostly implemented for password/session authentication and internal signed APIs. Passwords are bcrypt-hashed; sessions are server-backed and cookie-protected; internal API HMAC verifies identity, timestamp, nonce, and body hash. | `services/web-app/app/utils/auth.server.ts`, `services/web-app/app/cookie-session-storages/authentication.server.ts`, `services/web-app/app/utils/internal-platform-auth.server.ts` |
| PR.AA-05, authorization and least privilege | Partial. Application route guards enforce user, membership, owner, admin, and super-admin checks. AWS IAM contains scoped secret and S3 access, but several broad AWS permissions and bastion ingress remain gaps. | `services/web-app/app/utils/auth.server.ts`, `infra/main.tf` |
| PR.DS-01, data at rest | Mostly implemented for primary AWS stores in Terraform: encrypted RDS storage and encrypted S3 objects. Secrets are in Secrets Manager. | `infra/main.tf` |
| PR.DS-02, data in transit | Mostly implemented for public production traffic through CloudFront HTTPS redirect, TLS certificate validation, and HTTPS-only origin to App Runner. | `infra/main.tf` |
| PR.DS-10, data in use | Partial. LlmLog de-identification and raw-IP avoidance reduce exposure during processing/logging, but this draft did not evaluate all in-memory handling paths. | `services/web-app/app/utils/llm-log-deidentify.server.ts`, `services/web-app/app/utils/ai-usage-log.server.ts` |
| PR.DS-11 / RC.RP-03, backups and restoration assets | Partial. RDS automated backups are configured for 7 days. Manual pre-deploy snapshot/export lifecycle and cleanup controls are planned but blocked; restore testing evidence is not present in this assessment. | `infra/main.tf`, PR #512 blocker notes |
| PR.PS-04 / DE.CM-09, logs and monitoring data | Partial. CloudWatch App Runner logs retain 30 days; internal API and impersonation audit rows exist; AI usage decisions are append-only telemetry. Organization-wide CloudTrail is not live in the assessed branch. | `infra/main.tf`, `packages/prisma/schema.prisma`, PR #513 blocker notes |
| PR.PS-06, secure development practices | Partial. The repo includes focused tests for authentication, authorization, LlmLog de-identification, AI usage logging, retention, internal API signatures, and Terraform modules. Broader secure SDLC policy evidence is not centralized. | `services/web-app/app/**/*.test.ts`, `infra/*.tftest.hcl` |
| PR.IR-01, protected network architecture | Partial to mostly implemented. RDS is private and ingress is security-group based; App Runner egress uses a VPC connector. Bastion public SSH ingress remains an explicit hardening gap. | `infra/main.tf` |
| DE.AE-03 / DE.AE-06, adverse event analysis and authorized visibility | Partial. Audit APIs and logs can support investigation, but correlation across CloudWatch, app audit rows, and AWS management events is incomplete until CloudTrail is live. | `services/web-app/app/routes/api.internal.v1.audit/route.ts`, `services/web-app/app/utils/internal-platform-api-audit-list.server.ts`, PR #513 blocker notes |
| RS.MA / RS.AN / RS.CO, incident response | Gap to partial. The repo has an emergency runbook and logging/audit evidence, but this draft did not find a complete tested incident response plan, triage workflow, stakeholder notification process, or evidence preservation policy. | `EMERGENCY_RUNBOOK.md`, audit/logging files above |
| RC.RP / RC.CO, recovery | Gap to partial. RDS backups exist and retention cleanup is scheduled, but documented recovery objectives, restore tests, backup integrity verification, and recovery communications are not evidenced here. | `infra/main.tf`, `docs/superpowers/runbooks/production-db-access.md` |

## Draft Findings

1. Access control has a real implementation base. The platform uses centralized auth helpers, membership-scoped authorization, admin/super-admin gates, bcrypt password hashing, signed HTTP-only cookies, login rate limiting, and scoped signed internal API requests.
2. Data protection is stronger for managed AWS services than for governance records. RDS and S3 encryption are configured, public S3 access is blocked, production traffic is HTTPS-only at the edge, and runtime secrets are in Secrets Manager. A formal data classification and supplier-control inventory is still missing.
3. AI and LlmLog privacy controls are intentionally designed. AI usage decisions avoid prompts/bodies and raw IPs; LlmLog write paths de-identify prompts, responses, metadata, and error text before storage while preserving operationally useful content.
4. Audit coverage is useful but incomplete. App Runner logs, internal platform API audit rows, impersonation events, AI usage rows, and LlmLog metadata are available. Multi-region CloudTrail to encrypted S3 is planned in platform PR #513 but not live in this assessed branch.
5. Backup and retention coverage is uneven. RDS automated backups are enabled for 7 days and document revision/write-journal cleanup runs daily after 30 days. The 90-day manual snapshot and database export lifecycle/cleanup control is planned in platform PR #512 but not live.
6. Least privilege is partially implemented. Several resource permissions are scoped to exact Secrets Manager ARNs or specific S3 buckets, but broad SSM/SES permissions and public bastion SSH ingress should be narrowed or justified.
7. Recovery and incident response need clearer evidence. The repo has operational runbooks and some logs, but this draft does not find a complete tested incident response/recovery plan with owner roles, escalation paths, restore tests, and communication criteria.

## Gaps And Follow-Ups

- CloudTrail: merge and apply the multi-region CloudTrail Terraform work after a reviewed production plan. Current blocker: this NucBox lacks `infra/envs/production.tfvars` and production backend access, so Bryant must provide tfvars/backend access or plan/apply from his Mac.
- Snapshot/export lifecycle: merge and apply the 90-day manual snapshot and S3 database export retention work after a reviewed production plan. Current blocker: missing production tfvars/backend access from this NucBox. Purge old snapshots/exports only after the policy is live.
- Production RDS snapshots: continue requiring a confirmed RDS snapshot before any production migration or LlmLog backfill.
- Restore evidence: add a dated restore-test record for RDS backups and any database export path, including expected recovery objective and actual result.
- IAM/network hardening: review and narrow `ssm:GetParameter(s)`, SES resources, and bastion SSH ingress; if a broad grant remains necessary, document the reason and compensating controls.
- Audit correlation: once CloudTrail is live, document how App Runner logs, application audit rows, CloudTrail management events, and incident notes are correlated during an investigation.
- Data inventory: create a concise data classification register for Prisma models and S3 object classes, especially documents, submissions, LlmLog, AI usage telemetry, audit rows, sessions, and billing-related fields.
- Supplier inventory: document critical service providers, what data or credentials they process, and the owner/review cadence for each provider.
- Incident response and recovery: turn the current operational notes into a tested incident response and recovery playbook with roles, escalation criteria, evidence handling, communications, and restoration verification.

## Assessment Boundaries

- MFA is out of scope for this draft.
- No secret rotation was performed or recommended as an implementation task here.
- No hosted preview was requested for this docs-only change.
- No Terraform plan or apply was run for this docs-only change.
- No LlmLog rows were deleted or backfilled as part of this draft.
