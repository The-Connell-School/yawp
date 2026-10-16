# Local rollout evidence

See [the runbook](../../../runbooks/unified-signon-rollout.md) and
[the 30-row matrix](../../../runbooks/unified-signon-local-qa.md).
`validation.json` records actual local results and limitations. `comparisons.json`
indexes all 54 fresh triplets in the permanent lane shots directory; ten selected
triplets are committed here. `retained-evidence.json` hashes 258 retained comparison
triplets and the v2 copy/style/PNG sources for signon-01..44.

Each selected comparison has its adjacent reference and implementation files.
Legacy OFF references are actual before captures, not artboards. All six fresh
legacy login/signup/reset desktop/mobile before/after pairs are pixel identical.
The teacher location selector shows the nearest name/password reference; it has
no dedicated unified artboard and retains legacy layout. Google uses a local
provider mock. Presentation-only references remain labeled in the matrix.

`checks/runbook-local-management.json` is intercepted local execution, including
signed/audited OFF and targeted restoration; the placeholder preview origin was
never contacted. Hosted single-preview QA and live-provider verification remain
pending explicit authorization. This evidence grants no hosted rollout permission.

The builder self-check is not independent Ship Review. The driver reviews,
rebases, takes the merge lock and merges after checking the final head.
