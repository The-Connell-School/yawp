# Named Internal preview routing

This change extends the existing shared preview ingress to the user-approved Internal platform workflow: project managers choose feature/bug ticket slugs without creating or thinking about PRs. An operator-owned registry maps a named hostname to one immutable environment UUID. Named previews support HTTP, WebSocket upgrades and TLS certificate selection; paused or unavailable named previews return 503 and are resumed through Internal instead of invoking PR wake logic. Unknown/unregistered names remain rejected. Runtime configuration is opt-in.

Existing PR, UA and Blackboard behavior must remain unchanged. The WebSocket test was parameterized to retain the original PR case plus a new named case: PR activity still records `[241]`; a named environment must not write a UUID into the PR activity system. Both cases retain protocol/header assertions. This is additional coverage, not removal of PR behavior requirements.

New runtime/HTTPS tests and the legacy ingress/certificate/bootstrap suite must pass. Public deployment, first-certificate triggering and authenticated application/latency proof remain separate unfinished work. No production feature behavior or existing user data is changed by this local implementation.
