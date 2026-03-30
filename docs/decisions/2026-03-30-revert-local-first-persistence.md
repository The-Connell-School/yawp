# Revert local-first persistence from main

**Date:** 2026-03-30

## Decision

Reverted the local-first document persistence feature from main back to `0530de2`, preserving the work on `feature/local-first-persistence` branch (PR #83).

## Reason

The new DocumentRevision flow replaced writing to `DocumentSnapshot` and `DocumentVersion` tables. Existing document history views and grading workflows depend on those tables being populated. The old history was no longer visible after the change.

## What Was Kept

- AuditEvent removal (`cf242c2`) was cherry-picked onto main — the DB table was already dropped and the code was dead
- DocumentRevision table remains in the DB (migration already ran) but Prisma schema on main does not reference it

## Path Forward

Before re-merging, the local-first persistence feature must dual-write to the old models (`DocumentSnapshot` hourly, `DocumentVersion` ~20s throttled) in addition to `DocumentRevision`, until we verify that DocumentRevision covers all use cases.
