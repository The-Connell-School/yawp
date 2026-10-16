# I1 signed approval adapters

1. Add failing projection and signed route tests before implementation.
2. Project approval history through an explicit allowlist; preserve existing queue/detail fields. Use accepted legacy email evidence when cadence metadata is absent. Filter persisted follow-up state before paging/counts.
3. Add a signed staff resend adapter, strict inputs, verified actor attribution and safe result mapping. Delegate delivery, locking, cadence, cooldown and durable idempotency entirely to #581.
4. Run focused backend tests and web-app typecheck using the project CLI. Verify legacy persistence with isolated local PostgreSQL. No UI change, screenshots or real email.
5. Commit, push one preview-skipped platform PR, and record dependency/review/CI gates in lane handoff.

Dependency #581 was OPEN/MERGEABLE at 8db4484517ba3f5c3437deb06403ed86da408f7c on inspection. Current main is 365660196. No dependency code or schema is copied here. Until the dependency lands, the adapter must refuse to call the legacy non-idempotent resend implementation. Final integration (including dependency race tests), green final-head CI and independent Ship Review remain mandatory before driver merge.
