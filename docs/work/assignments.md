# Assignments

**Status:** Planned (behind feature flag, not QA'd)
**Priority:** High — but blocked by submission model work
**Feature flag:** `assignments`

## Current State

Assignments exist in the codebase behind a feature flag. The implementation is rough:
- Not QA'd or tested thoroughly
- UI needs significant cleanup
- Not clear if current implementation matches what we actually want
- Multi-class assignment creation exists but needs review

## What Needs to Happen

1. **Submission model consolidation must land first** — assignments depend on a clean submission flow
2. **Teacher dashboard cleanup** (`app/my-classes`) — organize how teachers see and manage assignments
3. **Student dashboard cleanup** (home page / student courses) — organize how students see and interact with assignments
4. **Domain model refactor** — see [domain model notes](../domain/assignment-model.md)

## Key Domain Insight

The current `StudentCourse` model is essentially an "assignment type" + "assignment" merged into one. After client discussions, we want to separate these:

- **Assignment Type** — configured by admins. Has AI tutor instructions, grading rubric, general settings. Think of it as a template.
- **Assignment** — created by teachers from an assignment type. The specific instance students interact with.

This will likely require renaming `StudentCourse` → `AssignmentType` (or similar) and creating a clearer relationship chain.

## Blocked By

- [Submission model consolidation](./submission-model.md) — must be done first
- Domain model clarity — need finalized ubiquitous language (see [domain notes](../domain/assignment-model.md))
