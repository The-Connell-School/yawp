import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_FILE = path.join(ROOT, ".worktree-local", "config.env");
const DEV_PID_FILE = path.join(ROOT, ".worktree-local", "dev.pid");
const DEV_LOG_FILE = path.join(ROOT, ".worktree-local", "dev.log");
const MIN_NODE_MAJOR = 22;
const MIN_BUN_VERSION = [1, 3, 1];
const MAX_CAPTURE_BYTES = 64 * 1024;

function cleanVersion(value) {
  const match = String(value || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

export function selectCompatibleNode(candidates, versionReader = readNodeVersion) {
  for (const executable of candidates) {
    const version = cleanVersion(versionReader(executable));
    if (version && Number(version.split(".")[0]) >= MIN_NODE_MAJOR) return { executable, version };
  }
  return null;
}

function versionAtLeast(value, minimum) {
  const cleaned = cleanVersion(value);
  if (!cleaned) return false;
  const parts = cleaned.split('.').map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if (parts[index] > minimum[index]) return true;
    if (parts[index] < minimum[index]) return false;
  }
  return true;
}

export function selectCompatibleBun(candidates, versionReader = readNodeVersion) {
  for (const executable of candidates) {
    const version = cleanVersion(versionReader(executable));
    if (version && versionAtLeast(version, MIN_BUN_VERSION)) return { executable, version };
  }
  return null;
}

function readNodeVersion(executable) {
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 5000 });
  return result.status === 0 ? result.stdout : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function nodeCandidates() {
  const candidates = ["node"];
  if (process.env.VOLTA_HOME) candidates.push(path.join(process.env.VOLTA_HOME, "bin", "node"));
  if (process.env.NVM_BIN) candidates.push(path.join(process.env.NVM_BIN, "node"));
  if (process.env.NVM_DIR) {
    const versions = path.join(process.env.NVM_DIR, "versions", "node");
    if (fs.existsSync(versions)) {
      fs.readdirSync(versions).sort().reverse().forEach((version) => candidates.push(path.join(versions, version, "bin", "node")));
    }
  }
  if (process.env.HOME) {
    candidates.push(path.join(process.env.HOME, ".volta", "bin", "node"));
    const versions = path.join(process.env.HOME, ".nvm", "versions", "node");
    if (fs.existsSync(versions)) {
      fs.readdirSync(versions).sort().reverse().forEach((version) => candidates.push(path.join(versions, version, "bin", "node")));
    }
  }
  candidates.push("/opt/homebrew/bin/node", "/usr/local/bin/node");
  return unique(candidates);
}

function bunExecutable() {
  const candidates = [
    process.env.BUN_INSTALL && path.join(process.env.BUN_INSTALL, "bin", "bun"),
    process.env.HOME && path.join(process.env.HOME, ".bun", "bin", "bun"),
    process.env.VOLTA_HOME && path.join(process.env.VOLTA_HOME, "bin", "bun"),
    process.env.HOME && path.join(process.env.HOME, ".volta", "bin", "bun"),
    "bun",
  ];
  const selected = selectCompatibleBun(unique(candidates));
  return selected ? selected.executable : null;
}

function runtime() {
  const node = selectCompatibleNode(nodeCandidates());
  const bun = bunExecutable();
  const pathEntries = [];
  if (bun && bun.includes(path.sep)) pathEntries.push(path.dirname(bun));
  if (node && node.executable.includes(path.sep)) pathEntries.push(path.dirname(node.executable));
  return {
    node,
    bun,
    env: {
      ...process.env,
      PATH: unique([...pathEntries, ...(process.env.PATH || "").split(path.delimiter)]).join(path.delimiter),
    },
  };
}

export function parseEnvFile(text) {
  const result = {};
  String(text || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (/^[A-Z][A-Z0-9_]*$/.test(key)) result[key] = value;
  });
  return result;
}

function config() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  return parseEnvFile(fs.readFileSync(CONFIG_FILE, "utf8"));
}

function bounded(value) {
  const text = String(value || "")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+):[^\s@/]+@/gi, "$1:[REDACTED]@")
    .replace(/["']?(password|secret|token|api[_-]?key)["']?\s*[=:]\s*["']?[^\s,"'}]+/gi, "$1=[REDACTED]");
  return text.length <= MAX_CAPTURE_BYTES ? text : text.slice(-MAX_CAPTURE_BYTES);
}

function execute(command, args, { json = false, env = runtime().env, timeout = 15 * 60 * 1000, cwd = ROOT } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    stdio: json ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error || result.status !== 0) {
    const error = new Error(`${path.basename(command)} ${args.join(" ")} failed${result.error ? `: ${result.error.message}` : ` with exit ${result.status}`}`);
    error.code = "project_command_failed";
    error.stdout = bounded(result.stdout);
    error.stderr = bounded(result.stderr);
    throw error;
  }
  return { exitCode: result.status, stdout: bounded(result.stdout), stderr: bounded(result.stderr) };
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout: 5000 });
  return { pass: !result.error && result.status === 0, detail: bounded(result.stdout || result.stderr).trim().split("\n")[0] || null };
}

export function capabilities() {
  return {
    schemaVersion: "project.capabilities/v1",
    project: "yawp",
    commands: {
      doctor: "./bin/project doctor --json",
      bootstrap: "./bin/project bootstrap --fresh --json",
      dev: "./bin/project dev start --json",
      fixture: "./bin/project fixture apply local-dev --json",
      test: "./bin/project test --profile changed --json",
      qa: "./bin/project qa prepare --json",
    },
    fixtures: ["local-dev"],
    proofProfiles: ["internal-preview-auth", "internal-scenario-browser", "internal-scenario-container", "internal-scenario-integration", "internal-fresh-migrations", "internal-content-pair", "internal-rubrics-http", "internal-rubrics-integration", "internal-content-validation", "internal-qa-http", "internal-qa-integration", "internal-audit", "internal-impersonation-browser", "internal-impersonation-http", "internal-impersonation-writes", "internal-impersonation", "internal-impersonation-integration", "internal-management", "internal-directory-integration", "project-cli", "unit", "typecheck", "build", "backend", "qa-smoke", "assignment-create", "grading-queue", "grading-queue-unit", "grading-points", "grading-points-unit", "assignment-rubric-unit", "assignment-prompt-unit", "teacher-paste-unit", "teacher-paste-browser", "private-notes-unit", "private-notes-browser", "daily-pages-scaling-unit", "collaboration-presence", "ua-billing", "ua-billing-e2e", "changed"],
    nextCommands: [
      "./bin/project doctor --json",
      "./bin/project fixture verify local-dev --json",
      "./bin/project dev start --json",
      "./bin/project test --profile changed --json",
      "./bin/project qa prepare --json",
    ],
  };
}

function doctor() {
  const selected = runtime();
  const docker = commandExists("docker", ["info"]);
  const git = commandExists("git", ["rev-parse", "--show-toplevel"]);
  const checks = [
    { id: "bun", status: selected.bun ? "pass" : "fail", detail: selected.bun || "Bun not found" },
    { id: "node", status: selected.node ? "pass" : "fail", detail: selected.node ? `Node ${selected.node.version} at ${selected.node.executable}` : `Node ${MIN_NODE_MAJOR}+ not found` },
    { id: "docker", status: docker.pass ? "pass" : "fail", detail: docker.pass ? "Docker daemon reachable" : "Docker daemon unavailable" },
    { id: "git", status: git.pass ? "pass" : "fail", detail: git.pass ? "Git worktree reachable" : "Git worktree unavailable" },
  ];
  return {
    schemaVersion: "project.doctor/v1",
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks,
    suggestedCommands: checks.some((check) => check.id === "node" && check.status === "fail")
      ? ["Install or activate Node 20+, then rerun ./bin/project doctor --json"]
      : ["./bin/project bootstrap --fresh --json"],
  };
}

function bootstrap({ fresh, json }) {
  const selected = runtime();
  if (!selected.bun) throw Object.assign(new Error("Bun is unavailable; run ./bin/project doctor --json"), { code: "runtime_missing" });
  if (!selected.node) throw Object.assign(new Error(`Node ${MIN_NODE_MAJOR}+ is unavailable; run ./bin/project doctor --json`), { code: "runtime_missing" });
  const args = [path.join(ROOT, "scripts", "worktree-local-setup.sh")];
  if (fresh) args.push("--fresh");
  args.push("--no-dev");
  const execution = execute("bash", args, { json, env: selected.env });
  const local = config();
  return {
    schemaVersion: "project.bootstrap/v1",
    status: "ready",
    fresh: Boolean(fresh),
    ports: local ? { app: Number(local.DEV_PORT), database: Number(local.PG_PORT), e2e: Number(process.env.RECORD_PORT_E2E || process.env.E2E_PORT || 0) || null } : null,
    container: local && local.CONTAINER_NAME,
    nextCommands: ["./bin/project fixture verify local-dev --json", "./bin/project dev start --json"],
  };
}

function requireConfig() {
  const local = config();
  if (!local) throw Object.assign(new Error("worktree environment is not bootstrapped; run ./bin/project bootstrap --fresh --json"), { code: "bootstrap_required" });
  return local;
}

function dockerValue(args, environment) {
  const result = execute("docker", args, { json: true, env: environment, timeout: 30000 });
  return result.stdout.trim();
}

function verifyFixture() {
  const selected = runtime();
  const local = requireConfig();
  const running = dockerValue(["inspect", "-f", "{{.State.Running}}", local.CONTAINER_NAME], selected.env) === "true";
  const ready = dockerValue(["exec", local.CONTAINER_NAME, "pg_isready", "-U", local.PG_USER], selected.env).includes("accepting connections");
  const query = "SELECT COUNT(*) FROM \"User\" WHERE email IN ('dev.admin@yawp.local','dev.teacher@yawp.local','dev.student@yawp.local');";
  const seededUsers = Number(dockerValue(["exec", local.CONTAINER_NAME, "psql", "-U", local.PG_USER, "-d", local.DB_NAME, "-tAc", query], selected.env));
  const checks = [
    { id: "container-running", status: running ? "pass" : "fail" },
    { id: "postgres-ready", status: ready ? "pass" : "fail" },
    { id: "seeded-dev-users", status: seededUsers === 3 ? "pass" : "fail", observed: seededUsers, expected: 3 },
  ];
  return {
    schemaVersion: "project.fixture-proof/v1",
    fixture: "local-dev",
    status: checks.every((check) => check.status === "pass") ? "pass" : "fail",
    checks,
    ports: { app: Number(local.DEV_PORT), database: Number(local.PG_PORT) },
  };
}

function pidLive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readDevPid() {
  if (!fs.existsSync(DEV_PID_FILE)) return null;
  const text = fs.readFileSync(DEV_PID_FILE, "utf8").trim();
  try {
    const value = JSON.parse(text);
    return value && Number.isInteger(value.pid) ? value : null;
  } catch {
    return null;
  }
}

function ownedDevProcess(metadata) {
  if (!metadata || metadata.root !== ROOT || metadata.command !== "bun run web-app:dev" || !pidLive(metadata.pid)) return false;
  const result = spawnSync("ps", ["-p", String(metadata.pid), "-o", "command="], { encoding: "utf8", timeout: 5000 });
  return result.status === 0 && /bun(?:\s+run)?\s+web-app:dev/.test(result.stdout);
}

function httpReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 2000 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}

async function waitForUrl(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await httpReady(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

async function devStart({ json }) {
  if (!config()) bootstrap({ fresh: false, json });
  const local = requireConfig();
  const url = `http://localhost:${local.DEV_PORT}/`;
  if (fs.existsSync(DEV_PID_FILE)) {
    const metadata = readDevPid();
    if (ownedDevProcess(metadata) && await httpReady(url)) return { schemaVersion: "project.dev/v1", status: "ready", reused: true, pid: metadata.pid, url, log: DEV_LOG_FILE };
    if (ownedDevProcess(metadata)) {
      try { process.kill(-metadata.pid, "SIGTERM"); } catch { /* stale process group already gone */ }
    }
    fs.rmSync(DEV_PID_FILE, { force: true });
  }
  const selected = runtime();
  const logFd = fs.openSync(DEV_LOG_FILE, "a", 0o600);
  const child = spawn(selected.bun, ["run", "web-app:dev"], {
    cwd: ROOT,
    env: { ...selected.env, PORT: local.DEV_PORT, DATABASE_URL: local.DATABASE_URL, E2E_PORT: process.env.RECORD_PORT_E2E || process.env.E2E_PORT || "" },
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);
  fs.writeFileSync(DEV_PID_FILE, `${JSON.stringify({ pid: child.pid, root: ROOT, command: "bun run web-app:dev" })}\n`, { mode: 0o600 });
  if (!await waitForUrl(url)) {
    const tail = fs.existsSync(DEV_LOG_FILE) ? bounded(fs.readFileSync(DEV_LOG_FILE, "utf8")).slice(-4096) : "";
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* child already stopped */ }
    fs.rmSync(DEV_PID_FILE, { force: true });
    const error = Object.assign(new Error(`dev server did not become ready at ${url}; inspect ${DEV_LOG_FILE}`), { code: "dev_start_failed" });
    error.stderr = tail;
    throw error;
  }
  return { schemaVersion: "project.dev/v1", status: "ready", reused: false, pid: child.pid, url, log: DEV_LOG_FILE };
}

function devStatus() {
  const local = requireConfig();
  const metadata = readDevPid();
  return { schemaVersion: "project.dev/v1", status: ownedDevProcess(metadata) ? "running" : "stopped", pid: metadata?.pid || null, url: `http://localhost:${local.DEV_PORT}/`, log: DEV_LOG_FILE };
}

function devStop() {
  const status = devStatus();
  if (status.pid && pidLive(status.pid) && status.status === "running") process.kill(-status.pid, "SIGTERM");
  fs.rmSync(DEV_PID_FILE, { force: true });
  return { ...status, status: "stopped" };
}

function changedPaths() {
  const base = process.env.RECORD_PROOF_BASE_SHA || process.env.RECORD_BASE_SHA || "origin/main";
  const commands = [
    ["diff", "--name-only", `${base}..HEAD`],
    ["diff", "--name-only"],
    ["diff", "--name-only", "--cached"],
    ["ls-files", "--others", "--exclude-standard"]
  ];
  const paths = [];
  for (const args of commands) {
    const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 10000 });
    if (result.status === 0) paths.push(...result.stdout.trim().split("\n").filter(Boolean));
  }
  return unique(paths).sort();
}

function runTestProfile(profile, { json }) {
  const selected = runtime();
  const executeBun = (args, timeout = 15 * 60 * 1000) => execute(selected.bun, args, { json, env: selected.env, timeout });
  const webAppRoot = path.join(ROOT, "services", "web-app");
  const executeWebAppBun = (args, timeout = 15 * 60 * 1000) => execute(selected.bun, args, { json, env: selected.env, timeout, cwd: webAppRoot });
  const results = [];
  const run = (id, args, timeout) => { results.push({ id, ...executeBun(args, timeout) }); };
  const runWebApp = (id, args, timeout) => { results.push({ id, ...executeWebAppBun(args, timeout) }); };
  let chosen = profile;
  let paths = [];
  if (profile === "changed") {
    paths = changedPaths();
    if (paths.length && paths.every((entry) => entry.endsWith(".md") || entry.startsWith("docs/"))) chosen = "docs";
    else if (paths.length && paths.every((entry) => ["bin/project", "scripts/project-agent.mjs", "scripts/project-agent.test.js", "scripts/worktree-local-setup.sh", "package.json"].includes(entry))) chosen = "project-cli";
    else chosen = "backend";
  }
  if (chosen === "docs") {
    const result = execute("git", ["diff", "--check", process.env.RECORD_PROOF_BASE_SHA ? `${process.env.RECORD_PROOF_BASE_SHA}..HEAD` : "HEAD"], { json, env: selected.env, timeout: 30000 });
    results.push({ id: "diff-check", ...result });
  } else if (chosen === "project-cli") run("project-cli", ["test", "./scripts/project-agent.test.js", "./scripts/deployment-contract.test.ts"], 120000);
  else if (chosen === "internal-fresh-migrations") {
    const local = requireConfig();
    results.push({id: chosen, ...execute(selected.bun, ["run", "packages/prisma/scripts/internal-fresh-migrations.ts"], {json, env: {...selected.env, INTERNAL_DIRECTORY_TEST_DATABASE_URL: local.DATABASE_URL}, timeout: 240000})});
  }
  else if (chosen === "internal-integration-infra-root") {
    results.push({id: "internal-integration-root", ...execute("terraform", ["-chdir=infra", "test", "-filter=internal-integration.tftest.hcl", "-no-color"], {json, env: selected.env, timeout: 120000})});
  }
  else if (chosen === "internal-integration-infra-validate") {
    results.push({id: "init-local", ...execute("terraform", ["-chdir=infra", "init", "-backend=false", "-input=false"], {json, env: selected.env, timeout: 600000})});
    results.push({id: "validate", ...execute("terraform", ["-chdir=infra", "validate", "-no-color"], {json, env: selected.env, timeout: 30000})});
  }
  else if (chosen === "internal-integration-infra") {
    results.push({id: "internal-integration-infra", ...execute("terraform", ["-chdir=infra/modules/internal-integration", "test", "-no-color"], {json, env: selected.env, timeout: 30000})});
  }
  else if (chosen === "internal-integration-config") run("internal-integration-config", ["test", "./scripts/internal-integration-config.test.ts"]);
  else if (chosen === "internal-preview-auth") runWebApp("internal-preview-auth", ["test", "app/routes/auth.dev-login/route.test.ts"]);
  else if (chosen === "internal-qa-http") runWebApp("internal-qa-http", ["test", "app/utils/internal-qa-http.server.test.ts"]);
  else if (chosen === "internal-audit") runWebApp("internal-audit", ["test", "app/utils/internal-audit.server.test.ts"]);
  else if (chosen === "internal-rubrics-http") runWebApp("internal-rubrics-http", ["test", "app/utils/internal-rubrics-http.server.test.ts"]);
  else if (chosen === "internal-content-validation") runWebApp("internal-content-validation", ["test", "app/domain/rubrics/rubric-promotion.test.ts"]);
  else if (chosen === "internal-management") runWebApp("internal-management", ["test", "app/utils/internal-management.server.test.ts"]);
  else if (chosen === "internal-impersonation") runWebApp("internal-impersonation", ["test", "app/utils/internal-impersonation-client.server.test.ts"]);
  else if (["internal-impersonation-browser", "internal-scenario-browser"].includes(chosen)) {
    const local = requireConfig();
    if (devStatus().status === "running") throw new Error("Stop the owned dev server before browser acceptance");
    results.push({ id: chosen, ...execute(selected.bun, ["run", chosen === "internal-scenario-browser" ? "e2e/internal-scenario.browser.ts" : "e2e/internal-impersonation.browser.ts"], {
      json, cwd: webAppRoot, timeout: 240000,
      env: { ...selected.env, DATABASE_URL: local.DATABASE_URL, DEV_PORT: local.DEV_PORT,
        INTERNAL_TEST_AUTHORITY_PORT: process.env.RECORD_PORT_E2E || process.env.E2E_PORT || String(Number(local.DEV_PORT) + 1) },
    }) });
  }
  else if (chosen === "internal-impersonation-http") runWebApp("internal-impersonation-http", ["test", "app/utils/internal-impersonation-http.server.test.ts"]);
  else if (["internal-scenario-integration", "internal-scenario-container", "internal-content-pair", "internal-rubrics-integration", "internal-directory-integration", "internal-impersonation-integration", "internal-impersonation-writes", "internal-qa-integration"].includes(chosen)) {
    if (chosen === "internal-content-pair" && !process.env.INTERNAL_PAIR_WORKSPACE) throw new Error("INTERNAL_PAIR_WORKSPACE is required for paired publication proof");
    const local = requireConfig();
    results.push({ id: chosen, ...execute(selected.bun,
      ["test", chosen === "internal-scenario-container" ? "app/utils/internal-scenario.container.test.ts" : chosen === "internal-scenario-integration" ? "app/utils/internal-scenario.integration.test.ts" : chosen === "internal-content-pair" ? "app/utils/internal-content-pair.test.ts" : chosen === "internal-rubrics-integration" ? "app/utils/internal-rubrics.integration.test.ts" : chosen === "internal-qa-integration" ? "app/utils/internal-qa.integration.test.ts" : chosen === "internal-directory-integration" ? "app/utils/internal-directory.integration.test.ts" : chosen === "internal-impersonation-writes" ? "app/utils/internal-impersonation-writes.integration.test.ts" : "app/utils/internal-impersonation.integration.test.ts"], {
        json, cwd: webAppRoot, timeout: chosen === "internal-scenario-container" ? 900000 : 60000,
        env: { ...selected.env, INTERNAL_DIRECTORY_TEST_DATABASE_URL: local.DATABASE_URL, INTERNAL_SCENARIO_TEST_CONTAINER: local.CONTAINER_NAME },
      }) });
  }
  else if (chosen === "unit") run("unit", ["run", "--cwd", "services/web-app", "test"]);
  else if (chosen === "typecheck") run("typecheck", ["run", "web-app:typecheck"]);
  else if (chosen === "build") run("build", ["run", "web-app:build"]);
  else if (chosen === "qa-smoke") run("qa-smoke", ["run", "web-app:test:e2e:smoke"], 30 * 60 * 1000);
  else if (chosen === "daily-pages-scaling-unit") {
    runWebApp("daily-pages-scaling-route", ["test", "app/routes/api.domain.grade-essay-ai/route.test.ts", "--test-name-pattern", "revised production Daily Pages"]);
    runWebApp("daily-pages-scaling-config", ["test", "app/domain/assignment-types/daily-pages-assignment-points.test.ts", "app/domain/assignment-types/assignment-type-grading-config.server.test.ts"]);
    runWebApp("daily-pages-scaling-display", ["test", "app/routes/app_.submissions_.$submissionId/submission-rubric-config.server.test.ts", "app/routes/app_.submissions_.$submissionId/route.loader.test.ts", "app/routes/app_.revise_.$submissionId/route.loader.test.ts"]);
  }
  else if (chosen === "private-notes-unit") {
    runWebApp("private-notes-generation", ["test", "app/routes/api.domain.grade-essay-ai/route.test.ts", "--test-name-pattern", "private teacher notes|revised production Daily Pages|refuses AI grading for a group owner"]);
    runWebApp("private-notes-projection", ["test", "app/routes/app_.submissions_.$submissionId/route.loader.test.ts", "app/routes/app_.revise_.$submissionId/route.loader.test.ts", "app/domain/grading/grading-assistant-invocation.test.ts", "app/domain/grading/assistant-suggestion.test.ts", "app/utils/grading-auth.server.test.ts"]);
  }
  else if (chosen === "private-notes-browser") {
    const local = requireConfig();
    if (devStatus().status === "running") throw new Error("Stop the owned dev server before browser acceptance");
    results.push({id: chosen, ...execute(selected.bun, ["run", "e2e/private-notes.browser.ts"], {json, cwd: webAppRoot, timeout: 240000,
      env: {...selected.env, DATABASE_URL: local.DATABASE_URL, DEV_PORT: local.DEV_PORT}})});
  }
  else if (chosen === "assignment-rubric-unit") runWebApp("assignment-rubric-unit", ["test", "app/routes/app.admin.assignment-types.new/route.test.ts", "app/routes/app.admin.assignment-types.$id/route.test.ts", "app/domain/assignment-types/assignment-type-grading-config.server.test.ts", "app/domain/rubrics/rubric-library.server.test.ts"]);
  else if (chosen === "assignment-prompt-unit") {
    runWebApp("prompt-library", ["test", "app/routes/app.admin.assignment-types.$id_.prompt/route.test.ts"]);
    runWebApp("evaluation-library", ["test", "app/routes/api.domain.assignment-type-evaluations/route.test.ts"]);
  }
  else if (chosen === "grading-points-unit") {
    runWebApp("grading-math", ["test", "app/domain/grading/gradeMath.test.ts", "app/domain/grading/recorded-grade.test.ts", "app/utils/teacher-document-work-utils.test.ts"]);
    runWebApp("grading-points-panel", ["test", "app/routes/app_.submissions_.$submissionId/teacher-grading/teacher-grading-panel.points-scale.test.tsx"]);
    runWebApp("grading-panel-regressions", ["test", "app/routes/app_.submissions_.$submissionId/teacher-grading/teacher-grading-panel.test.tsx"]);
    runWebApp("grading-save", ["test", "app/routes/api.domain.update-submission/route.test.ts"]);
    runWebApp("grading-view", ["test", "app/routes/app_.submissions_.$submissionId/teacher-grading/view-panel.test.tsx"]);
  }
  else if (chosen === "grading-points") {
    const local = requireConfig();
    const database = new URL(local.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('Grading points E2E requires the isolated local database');
    database.pathname = '/yawp_grading_points_e2e';
    results.push({ id: 'grading-points', ...execute(selected.bun, ['x', 'playwright', 'test', '--config=playwright.grading-points.config.ts', '--reporter=line'], {
      json, cwd: webAppRoot, timeout: 10 * 60 * 1000,
      env: { ...selected.env, E2E_DATABASE_URL: database.toString(), GRADING_POINTS_E2E_PORT: process.env.RECORD_PORT_E2E || process.env.E2E_PORT || String(Number(local.DEV_PORT) + 1), CI: 'true' },
    }) });
  }
  else if (chosen === "teacher-paste-unit") {
    for (const file of [
      "app/components/teacher-paste-report/provenance.test.ts",
      "app/routes/api.teacher-paste-report/route.test.ts",
      "app/routes/api.paste-alert/route.test.ts",
      "app/routes/app_.documents_.$id/document-editor/extensions/pasted-source.test.ts",
      "app/routes/app_.documents_.$id/document-editor/use-paste-alert.test.ts",
    ]) runWebApp(file, ["test", file]);
  }
  else if (chosen === "teacher-paste-browser") {
    const local = requireConfig();
    const database = new URL(local.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('Paste report E2E requires the isolated local database');
    database.pathname = '/yawp_teacher_paste_e2e';
    results.push({ id: chosen, ...execute(selected.bun, ['x', 'playwright', 'test', '--config=playwright.teacher-paste.config.ts', '--reporter=line', '--retries=0'], {
      json, cwd: webAppRoot, timeout: 10 * 60 * 1000,
      env: { ...selected.env, E2E_DATABASE_URL: database.toString(), E2E_PORT: process.env.RECORD_PORT_E2E || process.env.E2E_PORT || String(Number(local.DEV_PORT) + 1), CI: 'true' },
    }) });
  }
  else if (chosen === "grading-queue-unit") {
    runWebApp("grading-queue", ["test", "app/domain/grading/grading-queue.test.ts"]);
    runWebApp("grading-queue-access", ["test", "app/domain/grading/grading-queue.server.test.ts"]);
    runWebApp("grading-queue-rollout-auth", ["test", "app/utils/auth.server.test.ts"]);
    runWebApp("grading-queue-loader", ["test", "app/routes/app_.submissions_.$submissionId/route.loader.test.ts"]);
    runWebApp("grading-queue-lifecycle", ["test", "app/routes/app_.submissions_.$submissionId/teacher-grading/submission-lifecycle-panel.save-error.test.tsx"]);
  }
  else if (chosen === "grading-queue") {
    const local = requireConfig();
    const database = new URL(local.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('Grading queue E2E requires the isolated local database');
    database.pathname = '/yawp_grading_queue_e2e';
    results.push({ id: 'grading-queue', ...execute(selected.bun, ['x', 'playwright', 'test', '--config=playwright.grading-queue.config.ts', '--reporter=line'], {
      json, cwd: webAppRoot, timeout: 10 * 60 * 1000,
      env: { ...selected.env, E2E_DATABASE_URL: database.toString(), GRADING_QUEUE_E2E_PORT: process.env.RECORD_PORT_E2E || process.env.E2E_PORT || String(Number(local.DEV_PORT) + 1), CI: 'true' },
    }) });
  }
  else if (chosen === "assignment-create") {
    const local = requireConfig();
    const database = new URL(local.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('Assignment creation E2E requires the isolated local database');
    database.pathname = '/yawp_assignment_create_e2e';
    results.push({ id: 'assignment-create', ...execute(selected.bun, ['x', 'playwright', 'test', '--project=chromium', 'e2e/tests/admin.assignment-type-creator.spec.ts', 'e2e/tests/admin.assignment-types.spec.ts', 'e2e/tests/admin.rubric-library.spec.ts', 'e2e/tests/admin.rubric-category-options.spec.ts', '--reporter=line', '--retries=0'], {
      json, cwd: webAppRoot, timeout: 10 * 60 * 1000,
      env: { ...selected.env, E2E_DATABASE_URL: database.toString(), CI: 'true' },
    }) });
  }
  else if (chosen === "ua-billing") runWebApp("ua-billing", ["run", "test:ua:focused"]);
  else if (chosen === "ua-billing-e2e") {
    const local = requireConfig();
    const database = new URL(local.DATABASE_URL);
    if (!['localhost', '127.0.0.1'].includes(database.hostname)) throw new Error('UA billing E2E requires the isolated local database');
    database.pathname = '/yawp_ua_billing_e2e';
    results.push({ id: 'ua-billing-e2e', ...execute(selected.bun, ['run', 'test:ua:ship'], {
      json, cwd: webAppRoot, timeout: 30 * 60 * 1000,
      env: { ...selected.env, E2E_DATABASE_URL: database.toString(), CI: 'true' },
    }) });
  }
  else if (chosen === "collaboration-presence") {
    runWebApp("presence-contracts", [
      "test",
      "app/domain/collaboration/presence.test.ts",
      "app/domain/collaboration/presence.server.test.ts",
      "app/domain/collaboration/http-provider.test.ts",
      "app/routes/api.collab.$id.presence/route.test.ts",
      "app/routes/api.collab.$id.updates/route.test.ts",
    ], 120000);
    run("typecheck", ["run", "web-app:typecheck"]);
    run("build", ["run", "web-app:build"]);
    results.push({
      id: "two-browser-presence",
      ...execute(path.join(webAppRoot, "node_modules", ".bin", "playwright"), [
        "test",
        "--project=chromium",
        "e2e/tests/collab-carets.spec.ts",
        "--reporter=line",
      ], { json, env: selected.env, timeout: 5 * 60 * 1000, cwd: webAppRoot }),
    });
  }
  else if (chosen === "backend") {
    run("unit", ["run", "--cwd", "services/web-app", "test"]);
    run("typecheck", ["run", "web-app:typecheck"]);
    run("build", ["run", "web-app:build"]);
  } else throw Object.assign(new Error(`unknown test profile: ${profile}`), { code: "unknown_profile" });
  return {
    schemaVersion: "project.test/v1",
    status: "passed",
    requestedProfile: profile,
    selectedProfile: chosen,
    changedPaths: paths,
    steps: results.map((result) => ({ id: result.id, exitCode: result.exitCode, transcriptTail: json ? bounded(`${result.stdout || ""}\n${result.stderr || ""}`).slice(-4096) : undefined })),
  };
}

async function qaPrepare({ json, routes }) {
  bootstrap({ fresh: false, json });
  const fixture = verifyFixture();
  if (fixture.status !== "pass") throw Object.assign(new Error("local-dev fixture verification failed; run ./bin/project fixture reset local-dev --json"), { code: "fixture_invalid" });
  const dev = await devStart({ json });
  return {
    schemaVersion: "project.qa-plan/v1",
    status: "ready",
    baseUrl: dev.url,
    loginUrl: new URL('/auth/dev-login', dev.url).toString(),
    loginEmail: 'dev.admin@yawp.local',
    routes: routes || "/",
    fixture: "local-dev",
    proofProfile: "qa",
    smokeCommand: "./bin/project test --profile qa-smoke",
    dev,
    nextCommands: ["Run Record's QA orchestrator; do not install Playwright into this repository."],
  };
}

function help(topic = "root") {
  const pages = {
    root: `Yawp project agent CLI\n\nUsage:\n  ./bin/project internal-integration-config INPUT_JSON --json\n  ./bin/project capabilities [--json]\n  ./bin/project doctor [--json]\n  ./bin/project bootstrap [--fresh] [--json]\n  ./bin/project fixture <apply|reset|verify|list> [local-dev] [--json]\n  ./bin/project dev <start|status|stop> [--json]\n  ./bin/project test --profile <changed|project-cli|internal-preview-auth|internal-scenario-browser|internal-scenario-container|internal-scenario-integration|internal-fresh-migrations|internal-content-pair|internal-rubrics-http|internal-rubrics-integration|internal-content-validation|internal-management|internal-audit|internal-qa-integration|internal-qa-http|internal-directory-integration|internal-impersonation|internal-impersonation-integration|internal-impersonation-writes|internal-impersonation-http|internal-impersonation-browser|unit|typecheck|build|backend|qa-smoke|assignment-create|grading-queue|grading-queue-unit|grading-points|grading-points-unit|assignment-rubric-unit|assignment-prompt-unit|teacher-paste-unit|teacher-paste-browser|private-notes-unit|private-notes-browser|daily-pages-scaling-unit|collaboration-presence|ua-billing|ua-billing-e2e> [--json]\n  ./bin/project qa prepare [--routes /,/route] [--json]\n\nUse ./bin/project <topic> --help for contextual help.\n`,
    fixture: "Usage: ./bin/project fixture <apply|reset|verify|list> [local-dev] [--json]\n",
    dev: "Usage: ./bin/project dev <start|status|stop> [--json]\n",
    test: "Usage: ./bin/project test --profile <changed|project-cli|internal-preview-auth|internal-scenario-browser|internal-scenario-container|internal-scenario-integration|internal-fresh-migrations|internal-content-pair|internal-rubrics-http|internal-rubrics-integration|internal-content-validation|internal-management|internal-audit|internal-qa-integration|internal-qa-http|internal-directory-integration|internal-impersonation|internal-impersonation-integration|internal-impersonation-writes|internal-impersonation-http|internal-impersonation-browser|unit|typecheck|build|backend|qa-smoke|assignment-create|grading-queue|grading-queue-unit|grading-points|grading-points-unit|assignment-rubric-unit|assignment-prompt-unit|teacher-paste-unit|teacher-paste-browser|private-notes-unit|private-notes-browser|daily-pages-scaling-unit|collaboration-presence|ua-billing|ua-billing-e2e> [--json]\n",
    qa: "Usage: ./bin/project qa prepare [--routes /,/route] [--json]\n",
  };
  return pages[topic] || pages.root;
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '-h') { options.help = true; continue; }
    if (!value.startsWith("--")) { positional.push(value); continue; }
    const key = value.slice(2);
    if (index + 1 < argv.length && !argv[index + 1].startsWith("--")) options[key] = argv[++index];
    else options[key] = true;
  }
  return { positional, options };
}

function validateOptions(options, allowed) {
  Object.keys(options).forEach((key) => {
    if (!allowed.includes(key)) throw Object.assign(new Error(`unknown option: --${key}`), { code: 'unknown_option' });
  });
}

function validatePositionals(command, operation, positional) {
  const exact = { capabilities: 1, doctor: 1, bootstrap: 1, test: 1 };
  if (exact[command] && positional.length !== exact[command]) throw Object.assign(new Error(`unexpected arguments for ${command}`), { code: 'unexpected_argument' });
  if (command === 'fixture' && (!['apply', 'reset', 'verify', 'list'].includes(operation) || positional.length > 3)) {
    throw Object.assign(new Error(`invalid fixture command: ${positional.join(' ')}`), { code: 'unknown_command' });
  }
  if (command === 'dev' && (!['start', 'status', 'stop'].includes(operation) || positional.length !== 2)) {
    throw Object.assign(new Error(`invalid dev command: ${positional.join(' ')}`), { code: 'unknown_command' });
  }
  if (command === 'qa' && (operation !== 'prepare' || positional.length !== 2)) {
    throw Object.assign(new Error(`invalid QA command: ${positional.join(' ')}`), { code: 'unknown_command' });
  }
}

function output(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === "string") process.stdout.write(value);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const command = parsed.positional[0] || "help";
  const operation = parsed.positional[1];
  const json = parsed.options.json === true;
  if (command === "help" || parsed.options.help === true) return output(help(command === "help" ? operation || "root" : command), false);
  const allowedByCommand = {
    capabilities: ['json'], doctor: ['json'], bootstrap: ['json', 'fresh'], fixture: ['json'],
    dev: ['json'], test: ['json', 'profile'], qa: ['json', 'routes']
  };
  validateOptions(parsed.options, allowedByCommand[command] || ['json']);
  validatePositionals(command, operation, parsed.positional);
  if (command === "capabilities") return output(capabilities(), json);
  if (command === "doctor") {
    const result = doctor();
    output(result, json);
    if (result.status !== "pass") process.exitCode = 1;
    return;
  }
  if (command === "bootstrap") return output(bootstrap({ fresh: parsed.options.fresh === true, json }), json);
  if (command === "fixture") {
    if (operation === "list") return output({ schemaVersion: "project.fixtures/v1", fixtures: ["local-dev"] }, json);
    const name = parsed.positional[2] || "local-dev";
    if (name !== "local-dev") throw Object.assign(new Error(`unknown fixture: ${name}`), { code: "unknown_fixture" });
    if (operation === "apply" || operation === "reset") {
      bootstrap({ fresh: true, json });
      const result = verifyFixture();
      output(result, json);
      if (result.status !== 'pass') process.exitCode = 1;
      return;
    }
    if (operation === "verify") {
      const result = verifyFixture();
      output(result, json);
      if (result.status !== 'pass') process.exitCode = 1;
      return;
    }
  }
  if (command === "dev") {
    if (operation === "start") return output(await devStart({ json }), json);
    if (operation === "status") return output(devStatus(), json);
    if (operation === "stop") return output(devStop(), json);
  }
  if (command === "internal-integration-config") {
    if (!operation) throw new Error("Usage: ./bin/project internal-integration-config INPUT_JSON --json");
    const { integrationSettings } = await import('./internal-integration-config.mjs');
    return output(integrationSettings(JSON.parse(fs.readFileSync(operation, 'utf8'))), json);
  }
  if (command === "test") return output(runTestProfile(parsed.options.profile || "changed", { json }), json);
  if (command === "qa" && operation === "prepare") return output(await qaPrepare({ json, routes: parsed.options.routes }), json);
  throw Object.assign(new Error(`unknown command: ${parsed.positional.join(" ")}`), { code: "unknown_command" });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const wantsJson = process.argv.includes('--json');
    const topic = process.argv.slice(2).find((value) => !value.startsWith('-')) || 'root';
    const result = {
      status: 'error',
      code: error.code || 'project_command_failed',
      error: bounded(error.message),
      diagnostic: bounded([error.stderr, error.stdout].filter(Boolean).join('\n')).slice(-4096) || undefined,
      suggestedCommands: [`./bin/project ${topic} --help`, './bin/project doctor --json']
    };
    if (wantsJson) process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    else process.stderr.write(`project: ${result.error}\nTry: ${result.suggestedCommands.join(' | ')}\n`);
    process.exitCode = 1;
  });
}
