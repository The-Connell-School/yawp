# LMS Integration — Design & Knowledge Reference

**Status:** Knowledge / pre-design reference (not yet scheduled)
**Date:** 2026-07-21
**Scope:** How YAWP would integrate with third-party Learning Management Systems (Canvas, Schoology, Blackbaud, Brightspace, Google Classroom).

This document captures what we know so we don't re-derive it later. It is grounded in
the current data model (`packages/prisma/schema.prisma`) and the custom email/password
auth in `services/web-app`. No customer-specific data is included here.

---

## 1. Market context (why this ordering)

Shares are approximate; trackers differ in denominator (institutions vs. enrollment vs.
implementations) and segment definition.

**Higher education (North America)**
- Canvas ~39% by institution (~50% by enrollment) — more than the next three combined
- Blackboard ~19% (declining), Moodle ~16%, D2L Brightspace ~16% (growing)

**High schools (K–12 secondary)**
- Google Classroom ~31%, Canvas ~24%, Schoology ~19%, Moodle ~7%
- Top three ≈ 75% of the market

**Private / independent schools** are a distinct market: Blackbaud, Veracross, and
FACTS/RenWeb punch far above their small national share; smaller schools lean on Google
Classroom via Google Workspace. Whichever segment YAWP sells into should set the
priority order — confirmed against each account's actual LMS, not market averages.

Sources: ListEdTech (K–12, May 2026); Edutechnica (LMS Data, Spring 2025); Cubite (LMS
Market Share 2026); Programs.com (LMS Statistics 2026); Blackbaud (LMS product page —
LTI 1.3 / OneRoster).

### Priority (subject to confirming YAWP's target segment)
1. **Canvas** — the single highest-leverage bet; strong in HS *and* higher ed, fully LTI 1.3.
2. **Google Classroom** — widest K–12 reach, lightest build (REST + OAuth, no LTI).
3. **Blackbaud** — the credibility logo for the independent-school segment; LTI 1.3.
4. **Schoology / Brightspace** — largely "free" once the LTI 1.3 layer exists.
5. **Veracross** — defer until a specific account requires it.

---

## 2. Strategy: integrate to the standard, not to each vendor

For every LMS **except Google Classroom**, the mechanism is **LTI 1.3** (1EdTech Learning
Tools Interoperability) plus the LTI Advantage services. YAWP registers as a **Tool**; the
LMS is the **Platform**. One correct LTI implementation reaches Canvas, Schoology,
Blackbaud, and Brightspace.

The two open standards that do the work:
- **LTI 1.3 + LTI Advantage** — launch/SSO, roster, deep linking, grade passback.
- **OneRoster** — bulk rostering from the school SIS (alternative/complement to live roster pulls).

Google Classroom is a separate REST + OAuth integration (see §6).

---

## 3. LTI capabilities mapped to YAWP's model

| LTI capability | What it does | YAWP side |
|---|---|---|
| **OIDC launch** (SSO) | LMS sends a signed JWT: identity, roles, course context | Verify JWT vs. the LMS JWKS → look up/create `User` + `OrgMembership` → open a `Session`. Replaces password login for LMS users. |
| **NRPS** (Names & Role Provisioning) | Pull course members + roles | Sync into `Class.students` / `Class.teachers` (`OrgMembership`, role `TEACHER`/`STUDENT`) |
| **Deep Linking** | Teacher picks/creates a YAWP assignment inside the LMS | Create `Assignment` + `ClassAssignment`; return a resource link |
| **AGS** (Assignment & Grade Services) | Create a gradebook column (line item), POST scores | On grade release, push `Submission.numericPercentage` / `overallScore` to the line item |

**Role mapping:** LTI `Instructor` → `MembershipRole.TEACHER`; `Learner` → `STUDENT`.
Context (`context_id`) → `Class`. Tenant (issuer/deployment) → `Organization` (and `School`).

---

## 4. End-to-end flow

1. **Registration (per school/tenant).** Each school registers YAWP once, exchanging: LMS
   issuer, `client_id`, `deployment_id`, and the LMS auth/token/JWKS URLs. YAWP publishes
   its own **JWKS** and holds a private signing key. Stored per `Organization`.
2. **Launch.** Student clicks YAWP in the LMS → OIDC handshake → YAWP receives a JWT with
   `sub` (stable LMS user id), roles, and `context_id`. YAWP matches `sub` → `User`
   (fallback to email), maps the role, resolves `context_id` → `Class`, and mints a
   `Session` — no password.
3. **Assignment link.** Teacher uses Deep Linking to attach a YAWP `Assignment` to an LMS
   assignment. YAWP stores `resource_link_id` ↔ `ClassAssignment` and creates an **AGS
   line item** (the gradebook column).
4. **Grade passback.** When a `Submission` is graded and `releasedAt` is set, YAWP POSTs
   the score to that line item for the student's `sub`. Existing
   `numericPercentage` / `letterGrade` / `overallScore` fields are exactly what AGS needs.

---

## 5. What YAWP has to build

### 5.1 New tables (proposed)

- **`LtiRegistration`** — per `Organization`: `issuer`, `clientId`, `deploymentId`,
  LMS `authUrl` / `tokenUrl` / `jwksUrl`.
- **`LtiUserLink`** — `sub` ↔ `userId` (stable identity across launches).
- **`LtiResourceLink`** — `resourceLinkId` ↔ `classAssignmentId`.
- **`LtiLineItem`** — AGS line-item URL ↔ `assignmentId`.
- **`LtiNonce`** — short-lived nonce/state store for launch replay protection.

(YAWP's own signing keypair can live in a `Setting` / secret store; publish the public
JWKS from a static route.)

### 5.2 New endpoints

- OIDC **login initiation** + **launch callback** (redirect_uri)
- **JWKS** publication route (YAWP public keys)
- **Deep Linking** response endpoint
- **Grade-push** job/worker (AGS score POST on grade release)

### 5.3 Auth is the biggest lift

Today: `User` has `Password` + `Session`; onboarding is invitation-code based
(`Invitation`, school-code / class-code). LTI requires:
- **JIT provisioning** — create `User` / `OrgMembership` on first launch, respecting
  `Organization.numOfStudentSeats` / `numOfTeacherSeats` and `accessExpiresAt`.
- **Passwordless sessions** — a launch mints a `Session` directly.
- **JWT verification** — signature check vs. LMS JWKS, key rotation, nonce/replay
  protection, clock-skew tolerance.

### 5.4 Backward compatibility (per `AGENTS.md`)

- Add LTI as a **parallel onboarding path behind a feature flag**.
- The existing school-code / class-code flow keeps working unchanged.
- **Dual-write** into the same `OrgMembership` / `Class` tables; no rip-and-replace.
- Keep the old flow active until LTI is verified in production for a couple of weeks.

---

## 6. Google Classroom (separate integration)

Not classic LTI (Classroom now supports add-ons via LTI, but the mature path is its REST
API). Same concepts, different SDK:

- **Identity:** Sign in with Google (OAuth 2.0)
- **Roster:** `courses.students` / `courses.teachers`
- **Assignments:** `courses.courseWork` + `studentSubmissions`
- **Grade passback:** `studentSubmissions.patch` (`assignedGrade` / `draftGrade`)

Lightest build and widest K–12 reach, but a distinct codepath from the LTI stack.

---

## 7. Suggested build order

1. **Spike LTI 1.3 launch + JIT provisioning** against one platform (Canvas has the best
   free test instance). This proves the auth model — the hard part.
2. Add **NRPS roster sync**, then **AGS grade passback**, then **Deep Linking**.
3. **Pursue 1EdTech LTI certification** — schools and the Blackbaud marketplace effectively
   require it.
4. Build **Google Classroom** separately as the low-effort, wide-reach path.

**MVP estimate:** SSO + roster + one-directional grade passback on one platform ≈ a few
engineer-weeks. Certification and multi-platform hardening is where the remaining time goes.

---

## 8. Open questions

- Which segment is the priority (public vs. private/independent)? This reorders §1.
- Do we require SIS-level OneRoster provisioning, or is live LTI/NRPS roster sync enough?
- Grade passback direction: one-way (YAWP → LMS) only, or also read LMS due dates/context?
- Identity matching policy when LMS `sub` is new but the email matches an existing `User`.
