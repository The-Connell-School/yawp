# Project Status

> Last updated: 2026-03-30

## Priorities

1. **Merge infrastructure & misc** — get PR #85 and any remaining cleanup out the door
2. **Submission model consolidation** — clean up grades/snapshots relationship, enable proper submit flow
3. **Assignments** — finalize feature behind flag, refactor domain model, clean up teacher + student dashboards
4. **Local-first persistence** — revisit with backward compat after submission/assignments land

## Active

| Item | Branch / PR | Priority | Status | Notes |
|------|-------------|----------|--------|-------|
| [Misc fixes](./work/misc-fixes.md) | `bbrock/misc-fixes` #85 | Low | Ready to merge | AI model default, paste alert |
| [Submission model](./work/submission-model.md) | `feat/submission-model-consolidation` #77 | Medium | In progress | Phase 1 dual-write. Blocks assignments. |
| [Assignments](./work/assignments.md) | behind feature flag | High | Planned | Blocked by submission model. Needs domain refactor. |

## Planned

| Item | Priority | Notes |
|------|----------|-------|
| [Domain model refactor](./domain/assignment-model.md) | High | StudentCourse → AssignmentType + Assignment. Part of assignments work. |
| [Teacher dashboard cleanup](./work/assignments.md) | High | Reorganize app/my-classes for assignments |
| [Student dashboard cleanup](./work/assignments.md) | High | Reorganize home page / student courses |
| [Local-first persistence](./work/local-first-persistence.md) | Low | Parked. Needs dual-write backward compat. |
| [Document archive refactor](./work/document-archive.md) | Low | Spec exists, low complexity |

## Recently Completed

| Item | Date |
|------|------|
| [Preview environments](./work/preview-environments.md) | 2026-03-30 |
| [CI/deploy workflow split](./work/ci-deploy-split.md) | 2026-03-30 |
| [AuditEvent removal](./work/audit-event-removal.md) | 2026-03-30 |

## Blocked

| Item | Blocked by |
|------|------------|
| Assignments | Submission model must land first |
| Local-first persistence | Needs backward compat design for old snapshot/version tables |

## Key Principles

- **Backward compatibility required** for every change (see [AGENTS.md](../AGENTS.md))
- **Slow rollouts** — new features behind flags, tested for weeks before replacing old features
- **Dual-write** during data model transitions — never stop writing to old tables until new flow is verified
