# LTI Launch Pilot Implementation Plan

Issue: #212

1. Add failing domain tests for OIDC parameter construction, strict role
   mapping, subject HMAC scoping, one-time state/nonce handling, safe linking,
   destinations, and disablement.
2. Add Prisma models and a guarded migration with composite tenant keys,
   class/registration tenant triggers, append-only audit protection, and
   preflight/postcheck SQL.
3. Implement persisted-registration conversion, OIDC transaction service,
   bounded JWKS cache integration, launch orchestration, link/session handling,
   mapping, audit, and disablement.
4. Add `/lti/login`, `/lti/launch`, `/lti/link`, and `/lti/error` routes plus
   signed pending-link cookie storage.
5. Add admin diagnostics/mapping/disablement UI through the Claude `/ui`
   orchestration path and preserve the existing Yawp design system.
6. Extend the independent HTTP mock and deterministic seeds; add real-DB/
   real-network proof covering teacher, learner, replay, cross-tenant, key
   rotation/outage, disabled gates, and explicit account linking.
7. Run migration preflight/postcheck, focused tests, typecheck, build, broad
   suite, desktop/mobile browser proof, narrated QA video, specialist reviews,
   isolated no-context review, evidence-pack validation, and GitHub writeback.
