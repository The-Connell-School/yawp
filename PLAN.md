# qa-hosted-skip-artifact-audit

1. Reuse the existing platform branch and PR for `qa-hosted-skip-artifact-audit`.
2. Audit the durable free-tier demo suite for hosted demo mutation gates and skip artifact names.
3. Tighten any hosted demo path that could touch demo state before disposable fixture env and explicit mutation opt-in are present.
4. Add runner/helper contract coverage that proves multiple focused hosted skip artifacts coexist with the suite-level hosted skip artifact.
5. Run focused contract tests, the safe hosted-skip suite/list path, and targeted type validation; capture artifacts under the lane shots directory.
