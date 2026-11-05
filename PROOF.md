# Tutor back-nav Welcome injection — root cause proof

## Root cause (one paragraph)

Forward tutor step navigation resolves the next module by **current module id** inside the assignment type’s `assignmentModules` list (`getNextAssignmentModuleId` in `assignment-module-navigation.ts`), so from Pre-writing it correctly lands on Thesis statement even when a soft-deleted **Welcome to Yawp!** row still exists at `position: 0`. Back navigation does **not** use that same list logic: `activateCmsIdx` in `tutor.tsx` treats `cmsIdx` (an index into the document’s **ordered module sessions**, which omit deleted modules for new work) as an index into the **unfiltered** `assignmentModules` array loaded on the CMS (`assignment-module-navigation.ts` is only used for forward). On Thesis at `cmsIdx=1`, back sets `prevCmsIdx=0` and POSTs `assignmentModules[0].id` — the deleted Welcome module — while the URL/session index `0` still means Pre-writing in the session list. That is why forward skips Welcome and backward briefly surfaces it.

## Evidence

| What | Where |
|------|--------|
| Welcome module soft-deleted for Thesis-Driven Essay but kept at `position: 0` | `packages/prisma/fixtures/prod-fidelity/assignment-modules.json` (`deletedAt` on id `cm1s5o51o001ilvfj1non1jms`) |
| New documents only create sessions for `deletedAt: null` modules (no Welcome session) | `services/web-app/app/domain/documents.server.ts` (`createDocumentForAssignmentType`, `ensureAssignmentModuleSessionsForDocument`) |
| Tutor loader includes **all** type modules (no `deletedAt` filter) | `services/web-app/app/routes/app_.documents_.$id/route.tsx` → `assignmentModuleSessionsInclude.assignmentModule.include.assignmentType.select.assignmentModules` |
| Same unfiltered list on CMS API responses | `services/web-app/app/routes/api.model.assignment-module-session/route.ts` → `cmsInclude()` |
| Forward: id-based next in full ordered list | `getNextAssignmentModuleId` — `assignment-module-navigation.ts` |
| Back: `cmsIdx - 1` → `assignmentModules[targetIdx].id` | `tutor.tsx` `activateCmsIdx` (~L123–155) vs `prevCmsIdx` (~L101) |
| `cmsIdx` indexes ordered **sessions** | `resolveCurrentAssignmentModuleSession` in `assignment-module-session-resume.ts`; loader sets `hasPreviousCms: currentCmsIdx > 0` |

## Minimal unit repro (no browser)

1. Build `assignmentModules`: `[welcomeDeleted@0, prewriting@1, thesis@2]` (welcome has `deletedAt` set).
2. Build sessions order `[prewriting, thesis]` only (matches post–soft-delete documents).
3. Student on Pre-writing: `cmsIdx=0`, `getNextAssignmentModuleId(current=prewriting)` → `thesis`.
4. Student on Thesis: `cmsIdx=1`, back computes `prevCmsIdx=0`, `activateCmsIdx` logic `assignmentModules[0].id` → **welcome** (bug).
5. Expected after fix: back from thesis resolves **prewriting** via the same navigable module set forward uses.

## Symptom video

`/home/ubuntu/.cursor/projects/workspace/uploads/tutor-welcome-backnav-bug_4abb.mov` — Pre-writing → Thesis forward; Thesis → Welcome → Pre-writing backward.
