# Unified class confirmation

FAILURES.md slug: `di-signon-fix-join-confirmation`.
Base: `102241087c2aedea8c58d83f3065c62d9f12fd1b`.

Current main skips confirmation for email/password class sign-in, returning
class handles and new email accounts. Generated-handle registration already
shows its confirmation and remains covered. This change retains a server-held
receipt after authoritative enrollment, renders the joined/already-member state,
and completes the existing validated destination only after **Go to my class**.

The receipt records membership state before enrollment; posted screen, variant,
class details and destination do not select success. Rendering and continuation
recheck the current class/code and active student enrollment. Password changes,
provider linking, membership selection, preview access, safe redirects and the
existing session policy remain in force. Generated-handle registration retains
its handle disclosure and defers its first session until explicit continuation.
Other authenticated journeys retain their session across reload and continuation.
There is no migration or change to demo/production configuration.

## Local verification

Use the project CLI with a fresh isolated worktree runtime. Keep `CI=1`, private
mail capture, cache/runtime paths under lane `$TMPDIR`, and at most two workers.
No real mail or provider request is necessary.

- `./bin/project capabilities --json`, `doctor --json`, `bootstrap --fresh` and
  `fixture verify local-dev --json` establish the isolated local environment.
- With `SIGNON_LOCAL_TEST=1`, `./bin/project test --profile signon-classcode --json`
  covers the affected server handlers and policy/provider/dispatch controls.
- The `unified-signon-preview-fixtures` profile uses its supported disposable
  `yawp_pr_999565` database and `SIGNON_PREVIEW_FIXTURE_TEST=1`, as configured in CI.
  It verifies local fixture and ordinary preview access boundaries. It contacts
  no hosted preview and does not deploy or wake one.
- `NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json`.
  The first attempt exhausted Node's default heap; the project check passes with
  this limit within the lane's resource cap.
- In `services/web-app`, use the repository `playwright.unified-backend.config.ts`
  with `SIGNON_START_SERVER=1`, `--workers=1` and `auth.unified-backend.spec.ts`.
  The config owns and stops its local app/browser lifecycle.
- The separate `playwright.classcode.config.ts` New/Returning controls run against
  a CLI-owned server in the same command lifetime, with `dev stop` in an EXIT trap.

The browser assertions verify proof, cookies, class context, explicit destination,
account/enrollment/session counts, reload/back behavior, generated-handle
continuation and legacy flag-OFF behavior. Real-DB coverage includes repeated,
forged, expired, changed-code, archived and inactive continuations; forced
password change and active membership selection; private email-code proof;
linked Google class sign-in and matching-email password proof with explicit
provider linking or skipping. Google proof uses local signed provider mocks only.
Real Google and hosted QA are unexecuted and remain separate work.

## Evidence

The driver retains evidence at
`lanes/design-impl/shots/di-signon-fix-join-confirmation/`:

- `before/`: eight current-main immediate-redirect reproductions at 1280/390 and
  eight flag-OFF controls. The regression harness marks only the final missing
  confirmation assertion as an expected failure; setup/proof must succeed first.
- State/width-specific `*-design.png`, `*-impl.png`, `*-side-by-side.png` and
  `*-before-after.png`; references are on the left. `comparison-index.json`
  lists the triplets and `reference-provenance.json` records source hashes and
  declared reference extraction/placeholder adaptations.
- Original supplied signon-43/44 PNGs retained as `*-source.png`.
- `flag-off-comparison.json`: login, signup, class-link and free-trial controls at
  both widths have zero changed pixels. `screenshot-sha256.json` inventories PNGs.
- `checks/`, `validation.json`, and `SHIP_REVIEW.md`: actual execution and review.

The raw DOM references contain broken blob logos; implementation uses the real
app logo. The reference's Linux-rendered context box is about five pixels shorter
than implementation, whose explicit 20px/18px text line heights match `data-cs`.
The generated-handle disclosure intentionally extends the older confirmation
reference. No typography/layout CSS changes are included. Baseline fixtures use
the original generic teacher fallback; final fixtures add a real teacher and
fill the reference's class/context placeholders. These are local fixture changes,
not claims about hosted QA or a pixel-identical reference render.
