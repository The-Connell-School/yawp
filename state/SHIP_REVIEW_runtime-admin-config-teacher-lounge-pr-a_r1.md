# Ship Review — PR A: Runtime admin config (Teacher's Lounge)

**Branch:** `cursor/runtime-admin-config-teacher-lounge-3135`  
**Scope:** DB-backed access list + `teacher-lounge` feature flag + `AdminConfigAudit` (no admin UI)

## Behavior parity

| Before | After |
|--------|--------|
| `TEACHER_LOUNGE_TEMPORARILY_DISABLED = true` | `feature_flag.teacher-lounge` persisted as `{"mode":"off","orgIds":[]}` (migration seed) |
| Hardcoded three allowlist emails | `AccessListEntry` rows for `listKey = teacher_lounge` (migration seed, normalized email) |
| Sync nav guard in `sidebar-nav.tsx` | `teacherLoungeNavVisible` computed in `/app` loader, passed to `SidebarNavLinks` |
| Route redirects via sync helper | Async `redirectIfTeacherLoungeTemporarilyDisabled` (flag + access list + org targeting) |

**Re-enable path:** set `teacher-lounge` to `everyone` via Internal API / future admin UI (PR B). Access list remains for bypass while `off`.

## Migration

- `20261104120000_admin_config_access_lists`: `AccessListEntry`, `AdminConfigAudit`, seed Setting + three allowlist emails.

## Tests

```bash
cd services/web-app && bun test \
  app/domain/teacher-lounge/ \
  app/domain/access-lists/ \
  app/routes/app/sidebar-nav.teacher-lounge.test.ts \
  app/routes/app.teacher-courses._index/route.test.ts \
  app/domain/feature-flags/feature-flags.test.ts \
  app/domain/feature-flags/feature-flags.server.test.ts
```

## Out of scope (PR B)

- `/app/admin` Access & flags tab UI
