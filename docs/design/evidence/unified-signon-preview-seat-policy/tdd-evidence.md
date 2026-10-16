# Local test-first evidence

Before implementation, the new real-DB policy file produced **1 pass / 4 failures**: ordinary restrictions passed; context issuance, positive picker/recovery, wrong-password context setup and missing-master authorization expectations failed against #573. The implementation then passed those tests.

A separate stale-membership regression first failed because `old-account-membership` survived context entry. Clearing the selected membership on QA entry made the recovery continuation pass.

The final expanded profile and supplemental real-session expiry check use real password verification, normal signed cookies issued by the real access action, real DB sessions, request middleware and handlers. Expiry/tamper tests alter only test-issued context tokens; no fabricated authentication session, auth bypass header or provider identity is used.
