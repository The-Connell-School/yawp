1. For all changes, do test driven development.
    - If it's a ui change or flow, add the e2e first and then write the correct e2e tests before implementing the change
    - If it's a backend or utility or service function change, write correct unit tests before implementing the change

2. Backward compatibility is required for every change.
    - There are active users on this app. Never break existing functionality.
    - New features that replace old features must be rolled out slowly behind feature flags.
    - Old features stay active until the new feature has been tested in production for at least a couple weeks.
    - Dual-write to old and new data models during transitions. Do not stop writing to old tables until the new flow is fully verified.
    - No bypass. Every feature follows this pattern.

## Reporting to HQ

After meaningful work (see criteria below), report status to HQ:

1. Pull the latest HQ repo:
   ```
   git -C ~/hq pull --rebase --autostash
   ```

2. Update the workstream entry in the appropriate project file at
   `~/hq/store/projects/yawp/workstreams.md`. If no entry
   exists for your workstream, create one using the format below.

3. If you are blocked or need Bryant's input, set `Agent state:` to
   `waiting-on-bryant`.

4. Commit and push:
   ```
   cd ~/hq && git add store/projects/ && git commit -m "agent: update yawp/{workstream}" && git push
   ```

**If git push fails** (network issue, conflict, etc.), save your update
locally and move on. Do not block your primary work on reporting. The next
agent session will pick it up.

### When to report

- Created or updated a PR
- Hit a blocker or decision point (set state to `waiting-on-bryant`)
- Completed a task or feature
- Tests failing and need clarification
- Finished a brainstorming/planning session

### Workstream entry format

```markdown
## [workstream-name]

- **Repo:** yawp-2.0
- **Branch:** [branch-name]
- **PR:** [#number] ([status])
- **Agent state:** working | waiting-on-bryant | completed | needs-qa | merged
- **Last check-in:** [ISO 8601 timestamp]
- **Status:** [brief description]
- **Notes:** [context, blockers, decisions]
```
