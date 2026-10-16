Free classroom status uses persisted state, not a trial clock.

- The authenticated user's application comes from `loadFreeTierGateApplication`.
  Pending/onboarding states retain `enforceFreeTierTeacherGate` redirects on
  independent data requests as well as document requests. Missing applications
  and unexpected pre-access states are unavailable, never assumed expired.
- `REJECTED` and `EXPIRED` take precedence over budget checks. An expired
  application with a provisioned organization is an ended trial; without one it
  is an expired invitation. There is no application expiry timestamp. Organization
  `accessExpiresAt` and `planExpiresAt` are currently admin metadata, not inputs to
  the existing free-classroom gate. Approval and account age do not imply a timed
  expiry. This route adds no date boundary, timer, policy or status mutation.
- Provisioned classroom status requires the current active TEACHER membership,
  FREE_CLASSROOM plan and the application's matching organization. No query
  parameter selects state or identity. Responses are private/no-store.
- For an APPROVED application in that organization (the same approval predicate
  used by `isAiUnlocked`), the existing free-tier spending flag and
  `assertFreeTierSpendAllowed` determine budget pause. No budget totals or other
  teachers' records leave the loader. This is an environment pause, not a personal
  quota. The guard's existing unit-cost/headroom, equality and zero-cost rules
  remain authoritative. Other failures propagate rather than becoming available
  or expired; status flag reads opt into propagating storage failures.
- Terminal state wins when expiry and budget pause coexist. For an approved
  teacher, reloading reads the guard again, so recovered budget is immediately
  reflected. Nothing redirects permitted classroom/report/packet reads to this
  screen. My Classes provides a status entry alongside its report/packet links.
  The existing spending APIs keep their denials, status codes and side effects.
