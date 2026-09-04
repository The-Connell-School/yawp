import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  capabilities,
  capsuleWorktree,
  parseEnvFile,
  selectCompatibleBun,
  selectCompatibleNode,
} from "./project-agent.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Yawp project agent CLI", () => {
  test("selects the first Node runtime meeting the declared minimum", () => {
    const selected = selectCompatibleNode(["old", "current", "new"], (candidate) => ({
      old: "v16.2.0",
      current: "v20.19.1",
      new: "v22.22.0",
    })[candidate]);
    expect(selected).toEqual({ executable: "new", version: "22.22.0" });
  });

  test("rejects Bun older than the package-manager contract", () => {
    const selected = selectCompatibleBun(["old", "pinned"], (candidate) => ({
      old: "1.2.2",
      pinned: "1.3.1",
    })[candidate]);
    expect(selected).toEqual({ executable: "pinned", version: "1.3.1" });
  });

  test("parses the generated worktree configuration without evaluating shell", () => {
    expect(parseEnvFile("PG_PORT=47001\nDATABASE_URL=postgresql://localhost/test\n# ignored\n")).toEqual({
      PG_PORT: "47001",
      DATABASE_URL: "postgresql://localhost/test",
    });
  });

  test("advertises stable commands, fixtures, proof profiles, and next actions", () => {
    const contract = capabilities();
    expect(contract.schemaVersion).toBe("project.capabilities/v1");
    expect(contract.commands.doctor).toBe("./bin/project doctor --json");
    expect(contract.fixtures).toContain("local-dev");
    expect(contract.proofProfiles).toContain("qa-smoke");
    expect(contract.proofProfiles).toContain("collaboration-presence");
    expect(contract.nextCommands.length).toBeGreaterThan(2);
  });

  test("extensionless bin entrypoint returns machine-readable capabilities", () => {
    const result = spawnSync(path.join(root, "bin", "project"), ["capabilities", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).schemaVersion).toBe("project.capabilities/v1");
  });

  test("command families expose help and structured recovery", () => {
    const help = spawnSync(path.join(root, "bin", "project"), ["test", "--help"], { cwd: root, encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("--profile");
    const unknown = spawnSync(path.join(root, "bin", "project"), ["invent", "--json"], { cwd: root, encoding: "utf8" });
    expect(unknown.status).not.toBe(0);
    const error = JSON.parse(unknown.stderr);
    expect(error.code).toBe("unknown_command");
    expect(error.suggestedCommands).toContain("./bin/project doctor --json");
  });

  test("rejects unknown flags instead of silently choosing a default action", () => {
    const result = spawnSync(path.join(root, "bin", "project"), ["bootstrap", "--frseh", "--json"], { cwd: root, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stderr).code).toBe("unknown_option");
  });

  test("advertises teardown so Record can record a removal path at provision time", () => {
    const contract = capabilities();
    expect(contract.commands.teardown).toBe("./bin/project teardown --json");
  });

  test("only a Record-provisioned capsule worktree is eligible for teardown", () => {
    const marker = { RECORD_EXECUTION_ID: "work-abc123" };
    expect(capsuleWorktree("/repo/.git", marker)).toBe(false);
    expect(capsuleWorktree("/repo/.git/worktrees/capsule", marker)).toBe(true);
    // Hand-managed worktrees are linked too, so the Record marker is what makes one disposable.
    expect(capsuleWorktree("/repo/.git/worktrees/my-feature", {})).toBe(false);
    expect(capsuleWorktree("/repo/.git/worktrees/my-feature", { RECORD_EXECUTION_ID: "  " })).toBe(false);
  });

  // This suite runs in a hand-managed worktree, so the guard is exercised for real here.
  test("teardown refuses any workspace Record did not provision", () => {
    const result = spawnSync(path.join(root, "bin", "project"), ["teardown", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, RECORD_EXECUTION_ID: "" },
    });
    expect(result.status).not.toBe(0);
    expect(JSON.parse(result.stderr).code).toBe("capsule_required");
  });

  test("teardown help and option validation stay bounded", () => {
    const help = spawnSync(path.join(root, "bin", "project"), ["teardown", "--help"], { cwd: root, encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("./bin/project teardown");
    const unknown = spawnSync(path.join(root, "bin", "project"), ["teardown", "--wipe-everything", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(unknown.status).not.toBe(0);
    expect(JSON.parse(unknown.stderr).code).toBe("unknown_option");
  });

  test("bootstrap uses an immutable lockfile install", () => {
    const setup = fs.readFileSync(path.join(root, "scripts", "worktree-local-setup.sh"), "utf8");
    expect(setup).toContain("bun install --frozen-lockfile");
    expect(setup).not.toMatch(/^\s*bun install\s*$/m);
    expect(setup).toContain("CLASS_INSIGHT_MOCK_MODE=fixture");
    expect(setup).not.toContain("copy_optional_env_value ANTHROPIC_API_KEY");
    const ci = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).not.toMatch(/node-version:\s*20\b/);
    expect(ci).toMatch(/node-version:\s*22\b/);
  });
});
