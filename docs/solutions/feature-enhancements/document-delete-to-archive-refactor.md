---
title: Replace Delete Document with Archive functionality
slug: replace-delete-document-with-archive
category: feature-enhancements
problem_type: feature_enhancement
components:
  - DocumentLink
  - api.model.document.$id
technologies:
  - React Router v7
  - Prisma
  - TypeScript
  - useFetcher
severity: low
date_solved: 2026-01-31
search_keywords:
  - document archive
  - soft delete vs archive
  - archivedAt field
  - document management
  - unarchive document
  - useFetcher form submission
  - dropdown menu action
root_cause: Feature request to use archive functionality instead of delete for better document management UX
solution_summary: |
  Changed DocumentLink component to submit POST requests with action=archive/unarchive
  instead of DELETE requests. Added isArchived prop to toggle between Archive and Unarchive
  labels. Updated API route to handle POST method with archive/unarchive actions that
  set or clear the archivedAt timestamp field.
files_modified:
  - services/web-app/app/components/document-link.tsx
  - services/web-app/app/routes/api.model.document.$id/route.ts
  - services/web-app/app/routes/app._index/route.tsx
  - services/web-app/app/routes/app.courses.$id/route.tsx
related_patterns:
  - useFetcher for optimistic UI updates
  - Soft delete with timestamp fields
  - Conditional form actions based on state
---

# Replace Delete Document with Archive Functionality

## Problem

The `DocumentLink` component had a "Delete" button that set `deletedAt` (soft delete), but the database already had an `archivedAt` field and the UI already displayed archived documents in collapsible accordions. The user wanted Archive functionality instead of Delete for better UX.

## Investigation

1. Checked the database schema - found both `deletedAt` and `archivedAt` fields existed
2. Checked the API endpoint - DELETE method was setting `deletedAt`
3. Checked the route loaders - already querying and displaying archived documents separately
4. The infrastructure was already in place, just needed to connect the UI button

## Root Cause

The original implementation used DELETE method to set `deletedAt`, but archiving (using `archivedAt`) is more appropriate for user-facing document management. Archive is reversible and user-friendly, while delete implies permanent removal.

## Solution

### 1. DocumentLink Component (`document-link.tsx`)

Added `isArchived` prop and changed from DELETE to POST with action parameter:

```tsx
type Props = {
  exitTo: string;
  doc: Document & { /* ... */ };
  isArchived?: boolean;  // NEW PROP
};

export const DocumentLink = ({ doc, exitTo, isArchived = false }: Props) => {
  const archiveFetcher = useFetcher();  // RENAMED from deleteDocumentFetcher

  return (
    <Link /* ... */>
      {/* ... */}
      <DropdownMenuContent align="end">
        <archiveFetcher.Form
          method="POST"  // CHANGED from DELETE
          action={`/api/model/document/${doc.id}`}
        >
          <input
            type="hidden"
            name="action"
            value={isArchived ? 'unarchive' : 'archive'}  // NEW
          />
          <DropdownMenuItem asChild>
            <Button variant="ghost" className="w-full justify-start">
              {isArchived ? 'Unarchive' : 'Archive'}  // DYNAMIC TEXT
            </Button>
          </DropdownMenuItem>
        </archiveFetcher.Form>
      </DropdownMenuContent>
    </Link>
  );
};
```

### 2. API Route (`api.model.document.$id/route.ts`)

Added POST handler before existing DELETE handler:

```typescript
export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  // Handle archive/unarchive (NEW)
  if (request.method === 'POST') {
    const formData = await request.formData();
    const actionType = formData.get('action');

    if (actionType === 'archive' || actionType === 'unarchive') {
      const updated = await prisma.document.update({
        where: { id: params.id, profileId: profile.id },
        data: {
          archivedAt: actionType === 'archive' ? new Date() : null,
        },
      });

      if (!updated) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 204 });
    }
  }

  // DELETE handler preserved for backwards compatibility
  if (request.method === 'DELETE') {
    // ... existing soft-delete logic
  }
}
```

### 3. Route Updates

Pass `isArchived` prop to DocumentLink in archived sections:

```tsx
// app._index/route.tsx and app.courses.$id/route.tsx
{data.archivedDocuments.map((doc) => (
  <DocumentLink key={doc.id} doc={doc} exitTo="/app" isArchived />
))}
```

## How It Works

1. **Active documents**: Button shows "Archive" → POST with `action=archive` → sets `archivedAt`
2. **Archived documents**: Button shows "Unarchive" → POST with `action=unarchive` → clears `archivedAt`
3. **Data queries**: Routes already had separate queries for active and archived documents
4. **Backwards compatibility**: DELETE handler preserved for any existing code using soft delete

## Prevention Strategies

### Database Design

Separate archive from delete semantics:
- `archivedAt` = User action, reversible, visible in "Archived" views
- `deletedAt` = Admin/system action, potentially permanent

### API Design

Use POST with action parameter for state changes instead of overloading DELETE:
- DELETE implies permanent removal
- Archive is a state change, not deletion
- Makes code self-documenting

### Component Design

- Boolean props should default to common case (`isArchived = false`)
- Provide clear visual indicators for archived state
- Consider undo capability for archive actions

### Query Patterns

Create reusable query helpers:

```typescript
export const activeDocumentsWhere = {
  archivedAt: null,
  deletedAt: null,
} as const;

export const archivedDocumentsWhere = {
  archivedAt: { not: null },
  deletedAt: null,
} as const;
```

## Related Files

- Schema: `packages/prisma/schema.prisma:125-146`
- Component: `services/web-app/app/components/document-link.tsx`
- API: `services/web-app/app/routes/api.model.document.$id/route.ts`
- Index route: `services/web-app/app/routes/app._index/route.tsx`
- Courses route: `services/web-app/app/routes/app.courses.$id/route.tsx`
