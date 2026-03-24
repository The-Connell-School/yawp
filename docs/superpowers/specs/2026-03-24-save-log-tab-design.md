# Save Log Tab in Document History Sheet

## Summary

Add a "Save Log" tab to the existing `DocumentVersions` history sheet, surfacing `DocumentWriteJournal` records per document. Each entry shows timestamp, event type, and status, with HTML preview and restore capability for recovery.

## Motivation

The `DocumentWriteJournal` already captures every document write event (saves, title updates, restores, submissions) with full HTML/text content, status, and metadata. Exposing this in the history sheet gives users a granular audit trail and the ability to recover content from any save attempt — including rejected ones.

## Architecture

### API Changes

**File:** `services/web-app/app/routes/api.model.document.$id.versions/route.ts`

Extend the existing versions loader to handle `mode=journal`:

- Query `prisma.documentWriteJournal.findMany` where `documentId = params.id`
- Order by `createdAt: desc`
- Apply same `skip`/`take` pagination as existing modes
- Select: `id`, `createdAt`, `eventType`, `status`, `failureReason`, `title`, `html`, `text`

### UI Changes

**File:** `services/web-app/app/routes/app_.documents_.$id/_components/document-versions.tsx`

1. Add `'journal'` to the `mode` state type: `'versions' | 'snapshots' | 'journal'`
2. Add a third "Save Log" button alongside "Snapshots" and "Autosaves"
3. Update the `VersionLike` type to include optional `eventType`, `status`, `failureReason`, and `title` fields
4. Fix pre-existing stale closure: mode-switch button handlers should only call `setMode(...)` and let the existing `useEffect` on `[open, mode]` handle the reload
4. In the list, each journal entry displays:
   - Formatted timestamp (same as existing)
   - Event type badge: `save`, `title_update`, `restore`, `submit`
   - Status badge: `accepted` (green), `rejected` (red), `pending` (yellow)
   - Rejection reason shown inline below the entry when present
   - For `title_update` entries, show the `title` value since the body didn't change
5. Preview panel renders the journal entry's `html` (same as existing)
6. Restore button works identically — posts `versionId` = journal entry ID

### Restore Endpoint Changes

**File:** `services/web-app/app/routes/api.domain.restore-document-version/route.ts`

Add a third fallback after `DocumentVersion` and `DocumentSnapshot` lookups:

```
const version = await prisma.documentVersion.findFirst({ ... });
const snapshot = version ? null : await prisma.documentSnapshot.findFirst({ ... });
const journalEntry = (version || snapshot) ? null : await prisma.documentWriteJournal.findFirst({
  where: { id: data.versionId, document: { profile: { userId } } },
  include: { document: true },
});
```

Update the guard clause and source record assignment:

```
if (!version && !snapshot && !journalEntry) {
  return redirectWithToast('/app', { description: 'Document version not found.', type: 'error' });
}
const sourceRecord = version ?? snapshot ?? journalEntry;
```

Update the pre-restore backup condition to also handle the journal path:

```
if (sourceRecord && sourceRecord.document.html && sourceRecord.document.text) {
  await prisma.documentVersion.create({ ... });
}
```

Set `restoredFromType` metadata to `'journal'` when restoring from a journal entry:

```
metadata: {
  restoredFromType: version ? 'version' : snapshot ? 'snapshot' : 'journal',
}
```

## Data Flow

```
User clicks "Save Log" tab
  → GET /api/model/document/{id}/versions?mode=journal&page=1&limit=5
  → Returns DocumentWriteJournal records with id, createdAt, eventType, status, failureReason, html, text
  → UI renders list with badges + preview panel
  → User selects entry → preview shows HTML
  → User clicks "Restore and Reload"
    → POST /api/domain/restore-document-version { versionId: journalEntry.id }
    → Endpoint finds journal record, creates pre-restore DocumentVersion backup, updates document, reloads
```

## Event Type Display Mapping

| `eventType` value | Display label |
|---|---|
| `document.save` | Save |
| `document.title_update` | Title Update |
| `document.restore` | Restore |
| `document.submit` | Submit |

## Status Badge Styling

| `status` value | Color | Variant |
|---|---|---|
| `accepted` | Green | `default` or success variant |
| `rejected` | Red | `destructive` |
| `pending` | Yellow | `outline` or warning variant |

## Testing

### E2E Tests (history sheet is a UI flow)

1. **Save Log tab renders journal entries** — Create a document, trigger saves, open history sheet, click "Save Log" tab, verify entries appear with correct badges
2. **Preview works for journal entries** — Select a journal entry, verify HTML preview renders
3. **Restore from journal entry** — Select a journal entry, click restore, verify document content is updated
4. **Pagination works** — Create >5 journal entries, verify "Load More" loads additional entries

### Unit Tests (restore endpoint)

1. **Restore from journal entry** — POST with a journal entry ID, verify document is updated with journal's html/text
2. **Journal entry not found returns redirect with error** — POST with invalid ID, verify error response
3. **Pre-restore backup is created** — Verify a DocumentVersion is created with the document's current content before overwriting

## Files to Change

1. `services/web-app/app/routes/api.model.document.$id.versions/route.ts` — Add `mode=journal` query
2. `services/web-app/app/routes/app_.documents_.$id/_components/document-versions.tsx` — Add Save Log tab, badges, updated types
3. `services/web-app/app/routes/api.domain.restore-document-version/route.ts` — Add journal entry fallback lookup
4. `services/web-app/app/routes/api.domain.restore-document-version/route.test.ts` — Add journal restore test cases
5. New E2E test file for the Save Log tab flow
