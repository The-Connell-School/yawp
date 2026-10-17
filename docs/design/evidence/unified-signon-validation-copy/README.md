# Unified sign-on validation copy

FAILURES.md slug: `di-signon-fix-handle-validation-copy`.

The gated client and real server now show `Use at least 6 characters.` and
`These passwords don't match.`. The minimum comes from the actual Zod issue;
shared schemas, policy (6–100 characters), required fields, name validation,
upper-limit errors and legacy messages are unchanged.

## Current-main scope

Merged #577 replaced editable handle signup with First name / Last name and
server-generated class handles. [The merged specification](../../../signon-classcode-flow.md)
explicitly overrides the older 37/38 artboards. There is no invalid editable
signup handle or suggestion-chip selection in current main. Reintroducing those
would change signup behavior, outside this copy-only task. The generated-handle
preview, real collision/suffix allocation, email-origin notice, class confirmation,
invalid-link and recovery protections remain intact. Legacy handle rules and
availability remain unchanged and covered by the existing narrow regressions.

## Validation

- TDD: the unit mapper failed with the old messages; a real server registration
  failed with the same old/new difference. Before implementation, the browser
  captured both widths of all three flows. Four copy cases are marked expected
  failures in the red run; two flag-OFF/rollback controls pass. The isolated
  repeated desktop report contains exactly four copy assertion failures.
- Green: 153 focused tests in the supported `signon-classcode` profile plus
  four mapper tests (157 total; 949 assertions). Project typecheck passes.
- Six real-handler Playwright cases pass with one worker at 1280px / 390px.
  They cover generated-handle signup, invitation-backed private-email proof
  signup and reset, client rejection and actual server rejection, unchanged
  account/session/enrollment/alias counts, unchanged membership relations and
  password hashes after rejection, 101-character rejection, and successful
  six-character signup/reset. Original reset password fails after valid reset;
  the new password authenticates via bcrypt verification.
- Existing regressions cover actual rate limits, proof, origin/CSRF, class
  capacity, access restrictions, collision allocation and rollback. No protection
  was disabled. The private local code capture is beneath lane-private TMPDIR;
  no provider or real email is used.
- Eight flag-OFF before/after screenshots are byte-identical: login, signup,
  reset, and the unchanged legacy `Password is too short` error at both widths.
  Hashes are in `flag-off-comparisons.json`.

See `checks/` for reports. Tested application head is recorded in
`provenance.json`; the following evidence-only commit changes no application
code. Required final-head GitHub checks and independent Ship Review are recorded
in the PR and lane BUILD_RESULT handoff.

## Screenshot index and source limits

`index.json` records width, state, source artboard and tested head. Each width /
flow directory includes `*-design.png`, `*-impl.png`, `*-side-by-side.png`, plus
`*-before.png` and `*-before-after.png`. `before/` and `after/` retain masked client
and server evidence, generated-handle success controls, and flag-OFF controls.

The supplied references are 390px artboards. Desktop comparisons center that
unmodified mobile content on a 1280px canvas; they do not invent a desktop
reference. The exported frame border is removed. Broken reference logos and
export clipping are source-render artifacts, not implementation targets.

Email signup compares the supplied signon-16 **Field errors** state; generated
signup compares signon-38 **Field errors**, with the intentional #577 name/handle
layout difference. Existing class-context differences in the invitation journey
are unchanged by this fix. The source placeholder `[8]` remains literal in reference
screenshots and resolves to the actual six-character policy in implementation.

The supplied signon-16 has no reset-with-field-errors variant. The reset reference
is its untouched **After forgot password** default state; its exact expected error
wording comes from signon-02 **New password (rules)** and signon-16 **Field errors**.
No error content has been added to the design screenshot. This is a copy comparison,
not a claim of an exact supplied reset-error artboard.

## Local setup and limits

Runtime, database, fixture checks and dev server use `./bin/project`; app 6278,
database 55578, one Playwright worker, no watchers left running. Generated Prisma /
router output, caches, SQLite files, private capture and process metadata use
lane-private TMPDIR. The initial buffered dependency install stalled and was
interrupted; retry in the same checkout completed. Redirecting Prisma output
required a local dependency-resolution link. Starting the first server during
bootstrap led to an initial connection failure; the completed fixture check,
bootstrap and isolated red/green runs above supersede that setup attempt.

No migration, hosted QA, preview action, #565 change, demo/production write,
rollout or merge was performed. Historical hosted failures remain open for the
separate hosted re-QA task. Driver performs merge.
