# OrgMembership Profile Consolidation — Design

## Context

Yawp currently models people across four layers:

- **User** — login identity (`email`, `isAdmin`, `isSuperAdmin`)
- **Profile** — org membership and content actor (comments, documents, grading)
- **TeacherProfile** — teacher-specific extension (classes, schools, training)
- **StudentProfile** — student-specific extension (classes, grade metadata)

This creates unnecessary hops (`user → profile → teacherProfile`), redundant
document linkage (`profileId` + `studentProfileId`), scattered role checks, and
optional dual teacher/student sub-profiles on one org membership.

We are in a planned downtime window. This change ships as a **single release**
with **no feature flags**. Behavioral parity with today’s normal flows is
required; renames and small UX adjustments are acceptable.

## Goals

1. Collapse role-specific sub-profiles into one org membership record.
2. Preserve multi-org support (one user, many orgs, membership switcher).
3. Treat org owner and platform admin as capability flags, not separate entity types.
4. Remove dual teacher+student memberships in the same org; use preview mode instead.
5. Run extensive pre/post migration verification to avoid serious regressions.

## Non-goals

- Changing authentication provider or session model beyond membership cookie rename.
- Redesigning org switcher UX (behavior stays; naming may change).
- Supporting dual teacher+student membership in the same org after migration.

## Target model

### User (unchanged)

Platform identity and credentials. Keeps `isAdmin` and `isSuperAdmin`.

### OrgMembership (renamed from Profile)

One row per `(userId, organizationId)`.

```prisma
enum MembershipRole {
  TEACHER
  STUDENT
}

model OrgMembership {
  id             String           @id @default(cuid())
  createdAt      DateTime         @default(now()) @db.Timestamptz(6)
  userId         String
  user           User             @relation(fields: [userId], references: [id])
  organizationId String
  organization   Organization     @relation(fields: [organizationId], references: [id])
  role           MembershipRole
  isOrgOwner     Boolean          @default(false)

  // Former TeacherProfile fields
  isActive       Boolean          @default(true)

  // Former StudentProfile fields
  school         String?
  schoolTeacher  String?
  grade          String?
  period         String?

  // Existing Profile relations (unchanged semantics, new model name)
  documents                Document[]
  documentComments         DocumentComment[]
  documentCommentResponses DocumentCommentResponse[]
  pasteAlerts              PasteAlert[]
  submissionsGraded        Submission[]              @relation("SubmissionGradedBy")
  submissionComments       SubmissionComment[]       @relation("SubmissionCommentProfile")
  ownedAssignmentTypes     AssignmentType[]          @relation("AssignmentTypeOwner")
  gradingAssistantTemplatesCreated GradingAssistantTemplate[] @relation("GradingAssistantTemplateCreatedBy")
  gradingAssistantTemplatesUpdated GradingAssistantTemplate[] @relation("GradingAssistantTemplateUpdatedBy")

  classesAsTeacher Class[]  @relation("ClassTeachers")
  classesAsStudent Class[]  @relation("ClassStudents")
  schools          School[]
  teacherTrainingModuleSessions TeacherTrainingModuleSession[]
  assignedTeacherTrainings      TeacherTraining[] @relation("TeacherTrainingAssignments")

  @@unique([userId, organizationId])
}
```

### Dropped tables

- `TeacherProfile`
- `StudentProfile`

### Document model

- Keep a single actor/enrollment link: `membershipId` (Prisma field name).
- **DB column:** rename `profileId` → `membershipId` during migration (or keep
  `profileId` column name temporarily if rename risk is high — Prisma `@map` is
  acceptable).
- Drop `studentProfileId` after backfill confirms every document’s membership
  is the student’s org membership row.

### Class enrollment

- `Class.teachers` M2M → `OrgMembership` (was `TeacherProfile`).
- `Class.students` M2M → `OrgMembership` (was `StudentProfile`).

### Permissions matrix

| Capability | Source |
|---|---|
| Logged in | `User` + session |
| Active org context | `membership-id` cookie |
| Platform admin | `User.isAdmin` / `User.isSuperAdmin` |
| Org owner / org admin | `OrgMembership.isOrgOwner` |
| Teacher access | `OrgMembership.role === TEACHER` |
| Student access | `OrgMembership.role === STUDENT` |
| Grading | `role === TEACHER` OR `User.isAdmin` |

**`isOrgOwner` is independent of `role`.** No DB constraint requires owners to
be teachers. Application code may assume owners are usually teachers, but must
not crash if `isOrgOwner && role === STUDENT`.

## Auth & session changes

| Today | After |
|---|---|
| `requireProfile()` | `requireMembership()` |
| `profile-id` cookie | `membership-id` cookie (accept old cookie name during deploy window optional — prefer clean break during downtime) |
| `profile.teacherProfile.id` | `membership.id` for class teacher checks |
| `profile.studentProfile` | `membership.role === STUDENT` |
| `requireOwner()` | user has any membership with `isOrgOwner` (same semantics as today’s profile `isOwner`) |

Loaders return `membership` with `{ id, role, isOrgOwner, organization }`
instead of nested sub-profiles.

## Teacher “view as student” preview

Replace dual memberships with a session mode (extends existing impersonation
patterns in `auth.server.ts`):

- Auth session keys: `previewMode: 'student'`, `previewOrganizationId`
- Only available to users with `role === TEACHER` (or platform admin) in the
  active org.
- Renders student routes/components read-only or sandboxed — no second
  `OrgMembership` row.
- Preview does not mutate student data unless explicitly allowed later.

## Migration strategy (big bang, downtime)

### Phase 0 — Pre-migration checks (production snapshot)

Run against a restored dump **before** applying migration:

1. **Row counts:** users, profiles, teacher profiles, student profiles, classes,
   documents, submissions.
2. **Dual sub-profile anomalies:** profiles with both `teacherProfile` and
   `studentProfile` — export list for manual review.
3. **Document integrity:** rows where `profileId` does not match the
   `studentProfile.profileId` parent — export and fix script.
4. **Orphan checks:** sub-profiles without parent profile; class M2M rows
   pointing at missing sub-profiles.
5. **Multi-membership users:** users with >1 profile (expected — preserve).

### Phase 1 — Schema migration SQL

1. Add columns to `Profile`: `role`, `isActive`, `school`, `schoolTeacher`,
   `grade`, `period` (nullable where appropriate).
2. Backfill `role`:
   - Has `TeacherProfile` only → `TEACHER`
   - Has `StudentProfile` only → `STUDENT`
   - Has both → `TEACHER`, log id to anomaly report
   - Has neither → fail migration with explicit error (should not exist)
3. Backfill teacher/student fields from sub-profile tables.
4. Copy `isOwner` → keep as `isOrgOwner` (rename column).
5. Rewire `_ClassToTeacherProfile` / `_ClassToStudentProfile` join tables to
   reference membership ids (new join tables or in-place update).
6. Rewire `TeacherTrainingModuleSession.teacherProfileId` → `membershipId`.
7. Fix `Document.studentProfileId` mismatches; drop `studentProfileId`.
8. Drop `TeacherProfile`, `StudentProfile`.
9. Rename `Profile` table → `OrgMembership` (and FK columns) OR keep table
   name with `@map("Profile")` on model — **prefer full rename during downtime**.
10. Add `@@unique([userId, organizationId])` after deduplicating any accidental
    duplicate memberships (should be none).

### Phase 2 — Deploy application code

Single release. All reads/writes use `OrgMembership`. No dual-write period.

### Phase 3 — Post-migration verification

Re-run Phase 0 queries; counts must match expected totals. Additional checks:

1. Every class has valid teacher/student membership links.
2. Every document has `membershipId` belonging to a student membership in the
   document’s org context.
3. Login smoke: teacher, student, org owner, platform admin.
4. Org switcher works for multi-org users.
5. Class page: roster, enrollment, assignment list.
6. Student flow: start assignment, edit doc, submit.
7. Teacher flow: grade, release grades, comment.
8. Owner flow: org students/teachers admin pages.
9. E2e suite green.

### Anomaly handling policy

| Anomaly | Resolution |
|---|---|
| Profile with both sub-profiles | `role = TEACHER`, log for manual review |
| Document profile/student mismatch | Set membership to student’s parent profile id, log |
| Duplicate user+org profiles | Fail migration; manual merge required |
| Sub-profile without classes | Migrate anyway; preserve record |

## Code surface (estimated)

~80–100 files across:

- `packages/prisma/schema.prisma` + migration
- `app/utils/auth.server.ts`, `grading-auth.server.ts`, `feature-flags.server.ts`
- Onboarding: `auth.inv.*`, `enter-code`, `app.organization.students`
- Class routes, enrollment, document/submission domain
- Sidebar/nav, admin routes
- E2e seeds, db-helpers, seed-overlay, local-dev seed scripts
- Verification script(s) in `packages/prisma/scripts/`

## Testing & backward-compat guarantees

### Automated

- Unit tests: auth, grading-auth, document scope, enrollment, feature flags
- Migration verification script (pre/post)
- Full e2e suite
- New tests for `requireMembership`, preview mode guards

### Behavioral parity checklist

These flows must work identically from a user perspective (aside from renames):

- [ ] Login / logout / password reset
- [ ] Dev login personas (local)
- [ ] Teacher invitation + onboarding
- [ ] Student invitation + class join + enter-code
- [ ] Org owner onboarding
- [ ] Multi-org user switches membership
- [ ] Teacher creates class, adds/removes/moves students
- [ ] Student starts assignment, saves doc, submits
- [ ] Teacher grades, releases grade, leaves comments
- [ ] Admin impersonation (super admin)
- [ ] Org owner manages students/teachers lists
- [ ] Feature flag targeting by membership/org still resolves
- [ ] AP history library, assignment types, grading assistant flows

### Acceptable visible changes

- Internal naming (`profile` → `membership`) in logs/debug
- Cookie name `membership-id`
- Removal of impossible dual-role edge cases in same org
- Teacher preview via explicit “View as student” instead of second profile

## Rollback plan

During downtime only:

1. Restore database from pre-migration snapshot.
2. Redeploy previous application release.

No partial rollback — schema and code move together.

## Open decisions (resolved)

| Question | Decision |
|---|---|
| Multi-org | Keep |
| Dual teacher+student same org | Remove; preview mode instead |
| Feature flags | None — single release |
| `isOrgOwner` requires teacher role | No — independent flag |
| Table rename | Yes — `OrgMembership` |

## Success criteria

1. Zero orphaned class/document/submission references after migration.
2. Pre/post row-count parity (minus dropped sub-profile tables).
3. E2e suite passes.
4. Manual smoke checklist passes on staging restore before production cutover.
5. No production need to recreate teacher/student sub-profiles.
