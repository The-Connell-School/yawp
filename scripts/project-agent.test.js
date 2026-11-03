import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  capabilities,
  parseEnvFile,
  selectCompatibleBun,
  selectCompatibleNode,
} from "./project-agent.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Yawp project agent CLI", () => {
  test("advertises each guided tour profile once in capabilities and both help pages", () => {
    const profiles = ["guided-tours-unit", "guided-tours-db", "guided-tours-browser"];
    const advertised = capabilities().proofProfiles;
    for (const profile of profiles)
      expect(advertised.filter((value) => value === profile)).toHaveLength(1);
    for (const args of [["--help"], ["test", "--help"]]) {
      const result = spawnSync(path.join(root, "bin/project"), args, {
        cwd: root, encoding: "utf8", timeout: 10000, env: { ...process.env, CI: "1" },
      });
      expect(result.status).toBe(0);
      for (const profile of profiles) expect(result.stdout).toContain(profile);
    }
  });
  test("advertises onboarding profiles in capabilities and CLI help", () => {
    const profiles = ["free-tier-approval-migration", "free-tier-locked-preview-unit", "free-tier-locked-preview-db", "free-tier-locked-preview-browser", "free-tier-class-step-unit", "free-tier-class-step-browser", "free-tier-welcome-unit", "free-tier-welcome-browser", "free-tier-welcome-live-browser", "free-tier-welcome-db"];
    const result = spawnSync(path.join(root, "bin/project"), ["test", "--help"], {
      cwd: root, encoding: "utf8", timeout: 10000, env: { ...process.env, CI: "1" },
    });
    expect(result.status).toBe(0);
    for (const profile of profiles) {
      expect(capabilities().proofProfiles).toContain(profile);
      expect(result.stdout).toContain(profile);
    }
  });
  test("class-code and sign-on browser profiles select their own specs", () => {
    const source = fs.readFileSync(path.join(root, "scripts/project-agent.mjs"), "utf8");
    for (const profile of ["signon-classcode", "classcode-unit", "classcode-db", "classcode-browser", "classcode-enter-code", "classcode-report"])
      expect(capabilities().proofProfiles).toContain(profile);
    const profileBody = (profile) => source.split(`else if (chosen === "${profile}") {`)[1].split('\n  else if')[0];
    expect(profileBody("signon-classcode")).toContain('"playwright.classcode.config.ts"');
    expect(profileBody("classcode-browser")).toContain('"--config=playwright.classcode-unique.config.ts"');
    expect(fs.readFileSync(path.join(root, "services/web-app/playwright.classcode.config.ts"), "utf8")).toContain('auth\\.unified-classcode');
    expect(fs.readFileSync(path.join(root, "services/web-app/playwright.classcode-unique.config.ts"), "utf8")).toContain("classcode-unique.spec.ts");
  });
  test("class-step mutation fixtures are discovered only by their dedicated browser runner", () => {
    const webApp = path.join(root, "services/web-app");
    const cli = path.join(webApp, "node_modules/@playwright/test/cli.js");
    for (const [config, count] of [["playwright.config.ts", 0], ["playwright.class-step.config.ts", 5]]) {
      const result = spawnSync(process.execPath, [cli, "test", "--config", config,
        "--list", "--pass-with-no-tests", "--reporter=json", "free-tier.create-class.spec.ts"], {
        cwd: webApp, encoding: "utf8", timeout: 30000,
        // Listing must never connect or start a server. The dedicated spec must
        // preserve this explicit E2E connection even without a development URL.
        env: { ...process.env, CI: "1", CLASS_STEP_PORT: count ? "5204" : undefined,
          DATABASE_URL: "",
          E2E_DATABASE_URL: "postgresql://localhost:1/discovery_must_not_connect",
          PLAYWRIGHT_HTML_OPEN: "never" },
      });
      const report = JSON.parse(result.stdout);
      expect(report.errors).toEqual([]);
      const specs = report.suites.flatMap((suite) => suite.specs);
      expect(specs).toHaveLength(count);
      expect(result.status).toBe(0);
    }
  }, 60000);
  test("welcome mutation fixtures are discovered only by their dedicated browser runner", () => {
    const webApp = path.join(root, "services/web-app");
    const cli = path.join(webApp, "node_modules/@playwright/test/cli.js");
    for (const [config, count] of [["playwright.config.ts", 0], ["playwright.free-tier-welcome-live.config.ts", 2]]) {
      const result = spawnSync(process.execPath, [cli, "test", "--config", config,
        "--list", "--pass-with-no-tests", "--reporter=json", "free-tier.welcome-live.spec.ts"], {
        cwd: webApp, encoding: "utf8", timeout: 30000,
        // Listing must never connect or start a server. The dedicated spec must
        // preserve this explicit E2E connection even without a development URL.
        env: { ...process.env, CI: "1", FREE_WELCOME_PORT: count ? "5204" : undefined,
          DATABASE_URL: "",
          E2E_DATABASE_URL: "postgresql://localhost:1/discovery_must_not_connect",
          PLAYWRIGHT_HTML_OPEN: "never" },
      });
      const report = JSON.parse(result.stdout);
      expect(report.errors).toEqual([]);
      const specs = report.suites.flatMap((suite) => suite.specs);
      expect(specs).toHaveLength(count);
      expect(result.status).toBe(0);
    }
  }, 60000);

  test("approval proof profiles isolate mutation fixtures from standard browser discovery", () => {
    expect(capabilities().proofProfiles).toContain("free-tier-approval-migration");
    expect(capabilities().proofProfiles).toContain("free-tier-approval-unit");
    expect(capabilities().proofProfiles).toContain("free-tier-approval-browser");
    const web = path.join(root, "services", "web-app");
    const bun = process.execPath;
    const env = { ...process.env, DATABASE_URL: "", E2E_DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused", APPROVAL_V2_BASE_URL: "http://localhost:5199" };
    const standard = spawnSync(bun, ["x", "playwright", "test", "--list", "--config=playwright.config.ts", "free-tier.approval-v2.spec.ts"], { cwd:web, env, encoding:"utf8", timeout:30000 });
    expect(standard.stdout).toContain("Total: 0 tests");
    const isolated = spawnSync(bun, ["x", "playwright", "test", "--list", "--config=playwright.approval-v2.config.ts"], { cwd:web, env, encoding:"utf8", timeout:30000 });
    expect(isolated.status).toBe(0);
    expect(isolated.stdout).toContain("Total: 6 tests");
  });
  test("advertises isolated fresh impersonation migration verification", () => {
    expect(capabilities().proofProfiles).toContain("internal-fresh-migrations");
    expect(capabilities().proofProfiles).toContain("internal-grade-declines");
    expect(capabilities().proofProfiles).toContain("internal-free-tier-limits");
    expect(capabilities().proofProfiles).toContain("internal-class-code-duplicates");
    expect(capabilities().proofProfiles).toContain("internal-approvals");
    expect(capabilities().proofProfiles).toContain("internal-approvals-integration");
    expect(capabilities().proofProfiles).toContain("internal-class-code-duplicates-integration");
    expect(capabilities().proofProfiles).toContain("internal-free-tier-limits-integration");
    expect(capabilities().proofProfiles).toContain("internal-grade-declines-integration");
  });
  test("sibling worktrees receive distinct database identities and honor reassigned Record ports", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "yawp-isolation-"));
    try {
      const fakeBin = path.join(fixture, "bin");
      fs.mkdirSync(fakeBin);
      fs.writeFileSync(path.join(fakeBin, "bun"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      // Stop after config generation: never contact a real Docker daemon.
      fs.writeFileSync(path.join(fakeBin, "docker"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      const configs = [];
      for (const name of ["first", "second"]) {
        const workspace = path.join(fixture, name);
        fs.mkdirSync(path.join(workspace, "scripts"), { recursive: true });
        const script = path.join(workspace, "scripts/setup.sh");
        fs.copyFileSync(path.join(root, "scripts/worktree-local-setup.sh"), script);
        for (const port of [47001, 47002]) {
          const result = spawnSync("bash", [script, "--no-dev"], {
            cwd: fixture, encoding: "utf8", timeout: 5000,
            env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, RECORD_PORT_DATABASE: String(port), RECORD_PORT_APP: "48001" },
          });
          expect(result.status).toBe(1);
          const config = parseEnvFile(fs.readFileSync(path.join(workspace, ".worktree-local/config.env"), "utf8"));
          expect(config.PG_PORT).toBe(String(port));
          if (port === 47002) configs.push(config);
        }
      }
      expect(configs[0].CONTAINER_NAME).not.toBe(configs[1].CONTAINER_NAME);
      expect(configs[0].DB_NAME).not.toBe(configs[1].DB_NAME);
      expect(configs[0].VOLUME_NAME).not.toBe(configs[1].VOLUME_NAME);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
  test("failed dependency validation does not start or reset a database", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "yawp-bootstrap-"));
    try {
      fs.mkdirSync(path.join(fixture, "scripts"));
      fs.mkdirSync(path.join(fixture, "bin"));
      fs.mkdirSync(path.join(fixture, "packages/prisma"), { recursive: true });
      fs.mkdirSync(path.join(fixture, "services/web-app"), { recursive: true });
      fs.copyFileSync(path.join(root, "scripts/worktree-local-setup.sh"), path.join(fixture, "scripts/setup.sh"));
      fs.writeFileSync(path.join(fixture, "bin/bun"), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$BOOTSTRAP_CALLS"\nexit 42\n', { mode: 0o755 });
      fs.writeFileSync(path.join(fixture, "bin/docker"), '#!/bin/sh\nprintf "docker %s\\n" "$*" >> "$BOOTSTRAP_CALLS"\nexit 0\n', { mode: 0o755 });
      const calls = path.join(fixture, "calls");
      const result = spawnSync("bash", [path.join(fixture, "scripts/setup.sh"), "--fresh", "--no-dev"], {
        cwd: os.tmpdir(), encoding: "utf8", timeout: 5000,
        env: { ...process.env, PATH: `${fixture}/bin:${process.env.PATH}`, BOOTSTRAP_CALLS: calls },
      });
      expect(result.status).toBe(42);
      expect(fs.readFileSync(calls, "utf8")).toBe("install --frozen-lockfile\n");
      expect(fs.existsSync(path.join(fixture, ".worktree-local"))).toBe(false);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
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
      old: "1.3.1",
      pinned: "1.4.4",
    })[candidate]);
    expect(selected).toEqual({ executable: "pinned", version: "1.4.4" });
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
    expect(ci).toMatch(/node-version:\s*22\.23\.4\b/);
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
    fs.mkdirSync(path.join(scriptsDir, "ci"), { recursive: true });
    fs.copyFileSync(
      path.join(root, "scripts", "ci", "release-docker-host-port.sh"),
      path.join(scriptsDir, "ci", "release-docker-host-port.sh")
    );
    fs.chmodSync(path.join(scriptsDir, "ci", "release-docker-host-port.sh"), 0o755);
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
  rm) exit 0 ;;
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

    const slug = parseEnvFile(fs.readFileSync(path.join(configDir, "config.env"), "utf8")).SLUG;
    expect(slug).toMatch(new RegExp(`^${path.basename(tempRoot).toLowerCase().slice(0,40)}-[a-f0-9]{12}$`));
    const config = fs.readFileSync(path.join(configDir, "config.env"), "utf8");
    expect(parseEnvFile(config)).toMatchObject({
      PG_PORT: "47330",
      DEV_PORT: "48185",
      LTI_MOCK_PORT: "46386",
      DATABASE_URL: `postgresql://postgres:password@127.0.0.1:47330/yawp_${slug}`,
    });
  });
});
