1. For all changes, do test driven development.
    - If it's a ui change or flow, add the e2e first and then write the correct e2e tests before implementing the change
    - If it's a backend or utility or service function change, write correct unit tests before implementing the change

2. Backward compatibility is required for every change.
    - There are active users on this app. Never break existing functionality.
    - New features that replace old features must be rolled out slowly behind feature flags.
    - Old features stay active until the new feature has been tested in production for at least a couple weeks.
    - Dual-write to old and new data models during transitions. Do not stop writing to old tables until the new flow is fully verified.
    - No bypass. Every feature follows this pattern.

## Central Station PM Source Of Truth

Central Station is the live Yawp product-management command center. When a
request is about PM data or product state, use the Central Station MCP rather
than editing HQ, markdown status files, raw JSON, or the Central Station HTTP API
directly.

Use Central Station MCP for:

- changing ticket priority, status, owner, notes, questions, tags, or spec body
- removing/restoring tickets
- linking or unlinking tickets
- creating/updating source records from Granola, Gmail, docs, research, PRs, or notes
- adding comments or inspecting ticket activity
- reading the Now view before choosing current work

If the MCP cannot perform a normal PM action, update the Central Station MCP
with tests, deploy it if production agents need it, and then make the PM change
through MCP. Direct API/database/file edits are only for Central Station platform
development, imports, migrations, deploys, or emergency repair.

HQ should pull or summarize from Central Station when needed. Do not keep HQ
manually synchronized as a parallel PM store unless Bryant explicitly asks for a
local HQ update.
