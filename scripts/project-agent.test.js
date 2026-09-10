import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  capabilities,
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

  test("worktree setup preserves Record-reserved ports from existing config", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yawp-worktree-setup-"));
    const fakeBin = path.join(tempRoot, "fake-bin");
    const scriptsDir = path.join(tempRoot, "scripts");
    const configDir = path.join(tempRoot, ".worktree-local");
    fs.mkdirSync(fakeBin);
    fs.mkdirSync(scriptsDir);
    fs.mkdirSync(configDir);
    fs.mkdirSync(path.join(tempRoot, "packages", "prisma"), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "services", "web-app"), { recursive: true });
    fs.copyFileSync(
      path.join(root, "scripts", "worktree-local-setup.sh"),
      path.join(scriptsDir, "worktree-local-setup.sh")
    );
    fs.chmodSync(path.join(scriptsDir, "worktree-local-setup.sh"), 0o755);
    fs.writeFileSync(
      path.join(configDir, "config.env"),
      [
        "SLUG=record-capsule",
        "PG_PORT=47330",
        "DEV_PORT=48185",
        "LTI_MOCK_PORT=46386",
        "CONTAINER_NAME=yawp-record-capsule-postgres",
        "VOLUME_NAME=yawp-record-capsule-postgres-data",
        "DB_NAME=yawp_record_capsule",
        "PG_USER=postgres",
        "PG_PASSWORD=password",
        "DATABASE_URL=postgresql://postgres:password@127.0.0.1:47330/yawp_record_capsule",
        "",
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(fakeBin, "docker"),
      `#!/usr/bin/env bash
case "$1" in
  ps) exit 0 ;;
  inspect)
    if [[ "$2" == "-f" ]]; then echo true; fi
    exit 0
    ;;
  exec)
    if [[ "$3" == "pg_isready" ]]; then exit 0; fi
    if [[ "$5" == "postgres" ]]; then exit 0; fi
    echo 1
    exit 0
    ;;
  port)
    echo "127.0.0.1:47330"
    exit 0
    ;;
  *) exit 0 ;;
esac
`
    );
    fs.writeFileSync(path.join(fakeBin, "bun"), "#!/usr/bin/env bash\nexit 0\n");
    fs.writeFileSync(path.join(fakeBin, "curl"), "#!/usr/bin/env bash\nexit 22\n");
    fs.chmodSync(path.join(fakeBin, "docker"), 0o755);
    fs.chmodSync(path.join(fakeBin, "bun"), 0o755);
    fs.chmodSync(path.join(fakeBin, "curl"), 0o755);

    const result = spawnSync("bash", [path.join(scriptsDir, "worktree-local-setup.sh"), "--no-dev"], {
      cwd: tempRoot,
      encoding: "utf8",
      env: {
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
        HOME: tempRoot,
      },
    });
    expect(result.status).toBe(0);

    const slug = path.basename(tempRoot);
    const config = fs.readFileSync(path.join(configDir, "config.env"), "utf8");
    expect(parseEnvFile(config)).toMatchObject({
      PG_PORT: "47330",
      DEV_PORT: "48185",
      LTI_MOCK_PORT: "46386",
      DATABASE_URL: `postgresql://postgres:password@127.0.0.1:47330/yawp_${slug}`,
    });
  });
});
