# AuditEvent System Removal

**Status:** Completed
**Merged:** 2026-03-30 (cherry-picked from `cf242c2`)

## What Was Done

Removed the AuditEvent model and all related code:

- Deleted `audit-browser.ts`, `audit-context.server.ts`, `audit-format.server.ts`, `audit-repository.server.ts`, `audit.server.ts`
- Removed `prisma.auditEvent` references from retention route
- Removed `queueBrowserAuditEvent` calls from document editor route
- Removed audit event API routes and tests
- DB migration to drop the table

## Context

The AuditEvent system was replaced by `DocumentWriteJournal` for document mutation tracking. The write journal provides the same audit trail with less overhead.
