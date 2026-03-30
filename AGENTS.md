1. For all changes, do test driven development.
    - If it's a ui change or flow, add the e2e first and then write the correct e2e tests before implementing the change
    - If it's a backend or utility or service function change, write correct unit tests before implementing the change

2. Backward compatibility is required for every change.
    - There are active users on this app. Never break existing functionality.
    - New features that replace old features must be rolled out slowly behind feature flags.
    - Old features stay active until the new feature has been tested in production for at least a couple weeks.
    - Dual-write to old and new data models during transitions. Do not stop writing to old tables until the new flow is fully verified.
    - No bypass. Every feature follows this pattern.
