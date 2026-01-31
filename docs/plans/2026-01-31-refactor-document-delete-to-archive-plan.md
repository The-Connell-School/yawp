---
title: Replace Document Delete with Archive
type: refactor
date: 2026-01-31
---

# Replace Document Delete with Archive

## Overview

Replace the "Delete" button on the DocumentLink component with "Archive" functionality. The database already has an `archivedAt` field and the UI already separates archived documents into collapsible accordions - we just need to connect the button to archive instead of soft-delete.

## Problem Statement / Motivation

Currently, the "Delete" button in the document dropdown sets `deletedAt`, performing a soft delete. However:
- The schema already has `archivedAt` for archiving (separate from deletion)
- The UI already shows archived documents in a collapsible section
- Archiving is more user-friendly than deleting for students managing their work
- There's no way for users to unarchive documents once archived via the current Delete action

## Current State

**Schema** (`packages/prisma/schema.prisma:125-146`):
```prisma
model Document {
  deletedAt   DateTime?  // Soft delete (already exists)
  archivedAt  DateTime?  // Archive (already exists, unused by UI button)
}
```

**DocumentLink Component** (`services/web-app/app/routes/app._index/route.tsx:89-102`):
- Shows "Delete" button
- Sends `DELETE` request to `/api/model/document/:id`
- API sets `deletedAt: new Date()`

**Loaders** (already properly filter):
- `app._index/route.tsx:80` - queries with `deletedAt: null, archivedAt: null`
- `app._index/route.tsx:100-106` - queries archived with `archivedAt: { not: null }`
- `app.courses.$id/route.tsx:44-52` - same pattern
- Both routes display archived docs in collapsible accordions

## Proposed Solution

Change the Delete button to Archive, with the ability to Unarchive from the archived section.

### Changes Required

1. **DocumentLink Component** (`services/web-app/app/components/document-link.tsx`)
   - Accept new prop to indicate if document is archived
   - Show "Archive" button for non-archived docs
   - Show "Unarchive" button for archived docs
   - Change HTTP method from DELETE to POST with action parameter

2. **API Endpoint** (`services/web-app/app/routes/api.model.document.$id/route.ts`)
   - Add handler for archive/unarchive actions via POST
   - Set `archivedAt: new Date()` for archive
   - Set `archivedAt: null` for unarchive

3. **Update Route Loaders** (no changes needed - already passing archived status via separate queries)

## Technical Approach

### document-link.tsx

```tsx
type Props = {
  exitTo: string;
  doc: Document & { ... };
  isArchived?: boolean;  // New prop
};

export const DocumentLink = ({ doc, exitTo, isArchived = false }: Props) => {
  const archiveFetcher = useFetcher();

  return (
    // ... existing code ...
    <DropdownMenuContent align="end">
      <archiveFetcher.Form
        method="POST"
        action={`/api/model/document/${doc.id}`}
      >
        <input
          type="hidden"
          name="action"
          value={isArchived ? 'unarchive' : 'archive'}
        />
        <DropdownMenuItem asChild>
          <Button variant="ghost" className="w-full justify-start">
            {isArchived ? 'Unarchive' : 'Archive'}
          </Button>
        </DropdownMenuItem>
      </archiveFetcher.Form>
    </DropdownMenuContent>
  );
};
```

### api.model.document.$id/route.ts

```tsx
export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  // Handle archive/unarchive
  if (request.method === 'POST') {
    const formData = await request.formData();
    const action = formData.get('action');

    if (action === 'archive' || action === 'unarchive') {
      await prisma.document.update({
        where: { id: params.id, profileId: profile.id },
        data: {
          archivedAt: action === 'archive' ? new Date() : null
        },
      });
      return new Response(null, { status: 204 });
    }
  }

  // Keep existing DELETE handler for backwards compatibility (soft delete)
  if (request.method === 'DELETE') {
    // ... existing code ...
  }

  // ... rest of existing PUT handler ...
}
```

### Update DocumentLink Usage

In `app._index/route.tsx` and `app.courses.$id/route.tsx`:

```tsx
// Regular documents
{data.documents.map((doc) => (
  <DocumentLink key={doc.id} doc={doc} exitTo="/app" />
))}

// Archived documents - pass isArchived prop
{data.archivedDocuments.map((doc) => (
  <DocumentLink key={doc.id} doc={doc} exitTo="/app" isArchived />
))}
```

## Acceptance Criteria

- [x] "Delete" button renamed to "Archive" on non-archived documents
- [x] Clicking "Archive" sets `archivedAt` timestamp (not `deletedAt`)
- [x] Document disappears from main list and appears in archived accordion
- [x] Archived documents show "Unarchive" button instead of "Archive"
- [x] Clicking "Unarchive" clears `archivedAt` and moves doc back to main list
- [x] Existing soft-delete API endpoint preserved for backwards compatibility

## Files to Modify

| File | Change |
|------|--------|
| `services/web-app/app/components/document-link.tsx` | Add `isArchived` prop, change button text and action |
| `services/web-app/app/routes/api.model.document.$id/route.ts` | Add POST handler for archive/unarchive |
| `services/web-app/app/routes/app._index/route.tsx` | Pass `isArchived` to archived DocumentLinks |
| `services/web-app/app/routes/app.courses.$id/route.tsx` | Pass `isArchived` to archived DocumentLinks |
| `services/web-app/app/routes/app.my-classes.$classId/route.tsx` | Check if uses DocumentLink with archived docs |

## References

- Schema: `packages/prisma/schema.prisma:125-146`
- Current API: `services/web-app/app/routes/api.model.document.$id/route.ts:19-29`
- DocumentLink: `services/web-app/app/components/document-link.tsx:88-102`
- Archive UI (index): `services/web-app/app/routes/app._index/route.tsx:419-436`
- Archive UI (course): `services/web-app/app/routes/app.courses.$id/route.tsx:296-317`
