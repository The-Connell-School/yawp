Existing-student ordinary class-code enrollment

`Class.code` is unique per school, not globally. `/enter-code` first resolves
non-archived matches in the authenticated student's selected organization. This
preserves paid boundaries and the existing same-organization selection screen.

Only when there is no match in that organization may a code resolve to a foreign
FREE_CLASSROOM class. The existing free-tier route gate must be open (demo override
or the global flag), there must be exactly one non-archived free-classroom match,
the organization's persisted application must be APPROVED, and the class must
have an active teacher membership in that organization. Foreign collisions fail
closed without returning class choices or teacher details, even when one candidate
is ineligible. A class/organization/membership id cannot break that tie. Paid
organizations are excluded from the fallback. Organization date fields remain
administrative metadata, following the existing status policy.

The action revalidates code and target inside a transaction after locking the
class roster. It verifies the authenticated source student membership and the
target membership's identity, organization, active state, STUDENT role and lack of
ownership. It creates only a STUDENT membership when one does not exist, then
uses the existing seat-cap, budget and collaboration/roster helpers. Repeat
admission reuses the enrollment; denied attempts leave no new membership or
roster entry. The ordinary authentication session and prior memberships remain
intact. Both full-page and modal responses select the resulting membership with
the existing signed membership cookie, so reload uses the target organization.

New-student email signup is unchanged: `auth.inv.signup` stores matching class ids
in an invitation; `auth.inv.verify` puts that server-issued scope in the invitation
cookie; `auth.inv.onboard-student` resolves the chosen class's organization and
creates its STUDENT membership/session. The separate `/join` handle flow resolves
a globally unique student join token. Existing-student enrollment reuses the same
membership model without account replacement or identity transfer.

Regression coverage: route authorization tests, isolated real-PostgreSQL admission
tests (including concurrent final-seat attempts), and the smoke browser case
`student.free-class-enter-code.spec.ts`. The browser case uses disposable fixtures
and tests same-organization joining, collision denial, cross-organization joining,
independent reload/class/assignment visibility, and new-student handle registration.
