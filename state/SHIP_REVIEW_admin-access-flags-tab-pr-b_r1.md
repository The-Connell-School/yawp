# Ship Review — PR B: Admin Access & flags tab

**Scope:** `/app/admin/access-flags` UI wired to PR A domain (`setFeatureFlag`, access lists, `AdminConfigAudit`).

## Design frames

| Frame | Coverage |
|-------|----------|
| 01-default-populated | Flags table, Lounge list, audit log |
| 02-empty-access-list | Empty state + history link |
| 03-flag-editor-targeted | Edit drawer (mode + schools) |
| 04-confirm-switch-to-everyone | Alert dialog before everyone |
| 05-error-unknown-org-403 | Unknown org banner + save errors |
| 06-readonly-non-super-admin | Read-only banner, disabled controls |
| 07-impersonation-disabled | Impersonation banner, disabled edits |
| 08-audit-history-drawer | History sheet + restore from audit |

## Tests

```bash
/home/ubuntu/.bun/bin/bun test \
  services/web-app/app/domain/admin-config/admin-access-flags.presentation.test.ts \
  services/web-app/app/routes/app.admin.access-flags._index/route.test.ts \
  services/web-app/app/routes/app.admin/route.test.ts
```

## Notes

- Super admins edit; admins read-only (matches design frame 06).
- Any active impersonation session disables mutations (frame 07); read-only impersonation also blocked server-side via `requireMutableRequest`.
- Restore applies stored `before` JSON from a feature-flag audit row via `setFeatureFlag`.
- Client UI must not import `*.server` modules: audit display fields and runtime override copy are computed in `route.server.ts` loader; shared audit helpers live in `admin-config-audit.shared.ts`.
