# Disposable preview sign-on fixtures

Task: `di-signon-preview-fixtures`; source dependency:
`shots/di-signon-hosted-qa/RESULTS.md` missing-fixtures inventory. See the
[complete 30-row inventory and reset/prerequisite runbook](../../../runbooks/unified-signon-preview-fixtures.md).

This PR adds seed data and operator/test tooling only. No UI, auth handler,
feature-flag setting, production migration, Google credential, email or hosted
preview operation changed. Sign-on remains OFF by default.

Local browser evidence uses real handlers at 1280×1000 and 390×844, one worker,
with normal captured email proof. All ten before-seed checks and ten after-seed
checks pass: activation, membership selection, expired invitation, full class and
multiple class choices at both widths. The after-seed run used a clean disposable
lane database. Separate expired-invitation recipients avoid normal cross-viewport
mail cooldown. No code-filled input, raw signed URL, cookie or credential appears
in the screenshots. Early harness runs required a hydration wait/correct headings;
a handler test also disturbed an overlapping local browser flag, and repeated
mail attempts reached the real throttle. Those interrupted runs are not claimed
as product failures or passing journeys. Final browser execution was isolated.

| State | Desktop v2 / implementation | Mobile v2 / implementation |
| --- | --- | --- |
| Activation | [comparison](signon-23-activation-1280-side-by-side.png) | [comparison](signon-23-activation-390-side-by-side.png) |
| Membership | [comparison](signon-27-membership-1280-side-by-side.png) | [comparison](signon-27-membership-390-side-by-side.png) |

Each comparison has adjacent `-design.png` and `-impl.png` files. Supplied v2 PNGs
and exact mobile crop coordinates/hashes are in `reference-provenance.json`.
Reference mobile broken logo/frame are retained reference artifacts. The current
merged UI's local font metrics, fixture identifiers, generic passwordless copy
and two membership choices differ from the reference fixture's copy/three choices;
this fixture PR changes no presentation. Lane-local `before/`, `after/` and ten
`*-before-after.png` files retain all five states. The shared shots directory is
outside writable roots, so fresh originals are under this lane's
`shots/di-signon-preview-fixtures/`.

**The membership image is ungated local evidence only.** A separate real-handler
check enables the deployed preview gate, enters its master code through the real
access action, chooses the fixture organization and signs in normally. It proves
ordinary access works, the multi account is filtered to one membership, and an
inactive account is rejected. Hosted rows 21/22 remain blocked by existing seat
policy; UA needs supported deployment host/code/Stripe configuration; live Google
needs human login. The private approval link helper uses the existing signer and
real loader, reserves its private output before minting and sends no email.
None of this changes the historical hosted matrix or claims #565 was refreshed.

TDD evidence: guard/deployment tests initially failed because implementation and
wiring were absent; real-database test initially failed for missing admin approval;
exclusive-output regression initially showed an extra signed-link row, then passed
with reservation before minting. Final targeted profile, CLI tests and project
typecheck results are in `validation-summary.json`. Exact-head CI and independent
Ship Review are recorded in the lane handoff; the driver owns merge.
