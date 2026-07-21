# Playwright Server Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local Yawp Playwright runs fail closed on port collisions and support an isolated E2E port.

**Architecture:** Parse one validated `E2E_PORT`, derive one loopback URL, and feed both values to Playwright and its spawned React Router server. Blind server reuse is disabled so only the current checkout can satisfy the test run.

**Tech Stack:** Bun test, Playwright, React Router dev server, TypeScript.

---

### Task 1: Lock the isolation contract with a failing test

**Files:**

- Modify: `scripts/deployment-contract.test.ts`
- Test: `scripts/deployment-contract.test.ts`

- [ ] Add a test that requires `E2E_PORT`, one derived base URL, the selected
      port in the server command, and `reuseExistingServer: false`.
- [ ] Run `bun test ./scripts/deployment-contract.test.ts` with the modern Node
      runtime and capture the expected failure against the old configuration.

### Task 2: Implement the minimal Playwright configuration

**Files:**

- Modify: `services/web-app/playwright.config.ts`

- [ ] Parse `process.env.E2E_PORT ?? '5173'` as a bounded integer.
- [ ] Derive `http://127.0.0.1:${e2ePort}` once.
- [ ] Use the derived URL in `use.baseURL` and `webServer.url`.
- [ ] Interpolate the same port in `webServer.command`.
- [ ] Set `reuseExistingServer: false`.
- [ ] Rerun `bun test ./scripts/deployment-contract.test.ts` and capture green.

### Task 3: Prove isolation against the live collision

**Files:**

- Verify: `services/web-app/playwright.config.ts`
- Verify: `services/web-app/e2e/tests/public-accessibility.spec.ts`
- Verify: `services/web-app/e2e/tests/accessibility.ua-axe.spec.ts`

- [ ] Confirm the unrelated process still owns port 5173.
- [ ] Run the targeted Yawp accessibility suite with `E2E_PORT=5174` and verify
      the isolated Yawp server prepares fixture context and passes.
- [ ] Run one default-port attempt and verify it fails at startup because 5173
      is occupied, before any Yawp assertion runs.
- [ ] Commit the implementation separately from the design documents.
