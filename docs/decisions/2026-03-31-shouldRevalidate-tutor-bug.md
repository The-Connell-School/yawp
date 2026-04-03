# shouldRevalidate broke tutor responses

**Date:** 2026-03-31

## Bug

After merging PR #86 (local-first persistence), the tutor stopped responding. Messages sent by the student appeared optimistically but the AI response never showed up.

## Root Cause

The `shouldRevalidate` export on the document route was too aggressive:

```typescript
if (formAction) return false;
```

This blocked loader revalidation for ALL fetcher submissions. The tutor, comments, grading, and course module advancement all use `useFetcher().submit()` which triggers parent loader revalidation to refresh data (e.g., new messages in `cms.messages`). Blocking all revalidation meant the tutor response was saved server-side but the UI never refreshed to show it.

## Fix

Narrowed `shouldRevalidate` to only block revalidation for document save endpoints:

```typescript
if (
  formAction &&
  (formAction.includes('/api/model/document/') ||
    formAction.includes('/api/document/') && formAction.includes('/save'))
) {
  return false;
}
return defaultShouldRevalidate;
```

This allows tutor, comments, grading, and all other fetcher mutations to trigger normal revalidation while still protecting the editor from stale document content after saves.

## QA Checklist

- [ ] Open a document with the tutor panel
- [ ] Send a message to the tutor
- [ ] Verify the AI response appears in the chat
- [ ] Verify the tutor instruction buttons work (Next, etc.)
- [ ] Verify document content is not lost after tutor interaction
- [ ] Verify comments can be posted and appear
- [ ] Verify grading submissions work for teachers
- [ ] Type in the editor, interact with tutor, verify no content loss
