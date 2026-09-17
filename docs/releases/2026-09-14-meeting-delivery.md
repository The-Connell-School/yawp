# September 14 meeting delivery: release and rollback

Scope: revised Daily Pages engagement scoring/private notes, earned/possible points, teacher paste report, and scoped ungraded navigation. Source findings F01–F08/F10/F11 are recorded in Record's September15 handoff. General teacher-note criteria and in-class essay remain blocked on Brian; Internal has separate proof/credential gates.

## Before release

- Required Record backend proof (unit, typecheck, production build), independent grading/paste/navigation reviews and local browser/privacy/migration proof must pass on the integrated tree.
- Required GitHub checks: Preview tooling, Prisma migrations, TypeScript, and E2E Tests (Playwright). Use Record PR create/wait/merge gates.
- Navigation no longer has an organization rollout gate. The follow-up migration drops Organization.gradingQueueNavEnabled; local browser proof covers teacher-only access and global teacher availability. Lock timeout5s and statement timeout30s fail rather than holding a prolonged lock.
- The production main workflow runs migrations/build/push and uses mutable latest with App Runner autoDeploy. Check exact deployed revision before claiming release. Demo dispatch must use reset_data=false. Do not use partial Terraform overlays.

## Activation boundaries

- Navigation is globally available to teachers from scoped work lists. Students still receive no grading queue.
- Deploying the canonical Daily Pages source can repair protected Rubric.schemaJson when admin assignment-type pages seed the library. Pinned/current immutable rubric revisions and unlinked inline assignment configurations are not replaced. Establish the live library identity, current revision and assignment links/pins before claiming Daily Pages activation. Generic Internal publish rejects this protected starter name.
- Preserve old pins, historical grading snapshots and teacher overrides. The revised configuration explicitly opts into proportional whole-number bands. Existing submissions are not automatically regraded.
- Teacher note confidentiality must remain true before any rubric requests private notes. Do not enable generalized criteria until Brian supplies them.
- Record production QA requires a human isolation attestation for record-qa. Agents cannot attest their own tenant. No customer-data QA is authorized by local fixture proof.

## Post-release checks

Record the merge SHA, workflow/deployment IDs and actual running revision. Under the attested tenant, verify points/zero, fresh10/90 bands, teacher-private note boundaries, paste current/frozen report and highlight behavior, comment preservation and global teacher-only queue navigation. Keep each result incomplete until its intended-environment evidence exists.

## Rollback

Restore the previously verified application image/revision through the existing release workflow if queue navigation must be rolled back. Do not rewrite historical grades, remove paste events, or erase audit history. Preserve prior rubric revision pins; reverse an explicit promotion/link only through its supported authorized path. Verify running revision and affected behavior after rollback.
