# Assignment & Submission Domain Model

> Based on client call (2026-03-30). Awaiting detailed call notes to finalize.

## Problem

The current data model conflates several concepts into overloaded models. `StudentCourse` acts as both a template for work and the work itself. The relationship between documents, snapshots, versions, grades, and submissions is unclear and tightly coupled.

## Proposed Domain Language

### Assignment Type (currently: StudentCourse)
- Configured by **admins** (the client, not teachers)
- Defines: AI tutor instructions, grading rubric, general settings
- Think of it as a **template** for assignments
- One assignment type can be used across many classes

### Assignment
- Created by **teachers** from an assignment type
- The specific instance that gets assigned to students in a class
- Has a due date, class association, etc.

### Submission
- Created when a student submits their document for an assignment
- Consolidates the old `DocumentSnapshot` + `Grade` into one model
- A document can have multiple submissions (resubmit flow)
- See [submission model work item](../work/submission-model.md) for implementation status

### Document
- The student's working document
- Has versions (keystroke-level history) and snapshots (periodic captures)
- Linked to assignments

## Current → Future Model Mapping

| Current | Future | Notes |
|---------|--------|-------|
| StudentCourse | AssignmentType | Admin-configured template |
| (merged into StudentCourse) | Assignment | Teacher-created instance |
| DocumentSnapshot + Grade | Submission | Single model for submitted work + grading |
| Document | Document | Unchanged |
| DocumentVersion | DocumentVersion | Unchanged (may be replaced by DocumentRevision later) |

## Open Questions

- Exact naming for AssignmentType vs Assignment — need to confirm with client
- How does the teacher dashboard organize assignment types vs assignments?
- How does the student home page surface assignments?
- What's the migration path for existing StudentCourse data?

## TODO

- [ ] Incorporate detailed client call notes (pending paste)
- [ ] Finalize ubiquitous language
- [ ] Map out full entity relationship diagram
- [ ] Plan migration strategy for StudentCourse → AssignmentType + Assignment
