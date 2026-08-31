import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_FILE = path.join(ROOT, ".worktree-local", "config.env");
const DEV_PID_FILE = path.join(ROOT, ".worktree-local", "dev.pid");
const DEV_LOG_FILE = path.join(ROOT, ".worktree-local", "dev.log");
const MIN_NODE_MAJOR = 20;
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
  if (path.basename(process.execPath).startsWith("bun")) return process.execPath;
  const candidates = [
    process.env.BUN_INSTALL && path.join(process.env.BUN_INSTALL, "bin", "bun"),
    process.env.HOME && path.join(process.env.HOME, ".bun", "bin", "bun"),
    "bun",
  ];
  for (const candidate of unique(candidates)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 5000 });
    if (result.status === 0) return candidate;
  }
  return null;
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
    .replace(/\b(password|secret|token|api[_-]?key)\s*[=:]\s*[^\s]+/gi, "$1=[REDACTED]");
  return text.length <= MAX_CAPTURE_BYTES ? text : text.slice(-MAX_CAPTURE_BYTES);
}

function execute(command, args, { json = false, env = runtime().env, timeout = 15 * 60 * 1000 } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
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
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5000 });
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
    proofProfiles: ["project-cli", "unit", "typecheck", "build", "backend", "qa-smoke", "changed"],
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
    const pid = Number(fs.readFileSync(DEV_PID_FILE, "utf8").trim());
    if (pidLive(pid) && await httpReady(url)) return { schemaVersion: "project.dev/v1", status: "ready", reused: true, pid, url, log: DEV_LOG_FILE };
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
  fs.writeFileSync(DEV_PID_FILE, `${child.pid}\n`, { mode: 0o600 });
  if (!await waitForUrl(url)) {
    const tail = fs.existsSync(DEV_LOG_FILE) ? bounded(fs.readFileSync(DEV_LOG_FILE, "utf8")).slice(-4096) : "";
    throw Object.assign(new Error(`dev server did not become ready at ${url}; inspect ${DEV_LOG_FILE}\n${tail}`), { code: "dev_start_failed" });
  }
  return { schemaVersion: "project.dev/v1", status: "ready", reused: false, pid: child.pid, url, log: DEV_LOG_FILE };
}

function devStatus() {
  const local = requireConfig();
  const pid = fs.existsSync(DEV_PID_FILE) ? Number(fs.readFileSync(DEV_PID_FILE, "utf8").trim()) : null;
  return { schemaVersion: "project.dev/v1", status: pidLive(pid) ? "running" : "stopped", pid, url: `http://localhost:${local.DEV_PORT}/`, log: DEV_LOG_FILE };
}

function devStop() {
  const status = devStatus();
  if (status.pid && pidLive(status.pid)) process.kill(-status.pid, "SIGTERM");
  fs.rmSync(DEV_PID_FILE, { force: true });
  return { ...status, status: "stopped" };
}

function changedPaths() {
  const base = process.env.RECORD_PROOF_BASE_SHA || process.env.RECORD_BASE_SHA || "origin/main";
  const result = spawnSync("git", ["diff", "--name-only", `${base}..HEAD`], { cwd: ROOT, encoding: "utf8", timeout: 10000 });
  return result.status === 0 ? result.stdout.trim().split("\n").filter(Boolean) : [];
}

function runTestProfile(profile, { json }) {
  const selected = runtime();
  const executeBun = (args, timeout = 15 * 60 * 1000) => execute(selected.bun, args, { json, env: selected.env, timeout });
  const results = [];
  const run = (id, args, timeout) => { results.push({ id, ...executeBun(args, timeout) }); };
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
  } else if (chosen === "project-cli") run("project-cli", ["test", "./scripts/project-agent.test.js"], 120000);
  else if (chosen === "unit") run("unit", ["run", "--cwd", "services/web-app", "test"]);
  else if (chosen === "typecheck") run("typecheck", ["run", "web-app:typecheck"]);
  else if (chosen === "build") run("build", ["run", "web-app:build"]);
  else if (chosen === "qa-smoke") run("qa-smoke", ["run", "web-app:test:e2e:smoke"], 30 * 60 * 1000);
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
  if (!config()) bootstrap({ fresh: false, json });
  const fixture = verifyFixture();
  if (fixture.status !== "pass") throw Object.assign(new Error("local-dev fixture verification failed; run ./bin/project fixture reset local-dev --json"), { code: "fixture_invalid" });
  const dev = await devStart({ json });
  return {
    schemaVersion: "project.qa-plan/v1",
    status: "ready",
    baseUrl: dev.url,
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
    root: `Yawp project agent CLI\n\nUsage:\n  ./bin/project capabilities [--json]\n  ./bin/project doctor [--json]\n  ./bin/project bootstrap [--fresh] [--json]\n  ./bin/project fixture <apply|reset|verify|list> [local-dev] [--json]\n  ./bin/project dev <start|status|stop> [--json]\n  ./bin/project test --profile <changed|project-cli|unit|typecheck|build|backend|qa-smoke> [--json]\n  ./bin/project qa prepare [--routes /,/route] [--json]\n\nUse ./bin/project <topic> --help for contextual help.\n`,
    fixture: "Usage: ./bin/project fixture <apply|reset|verify|list> [local-dev] [--json]\n",
    dev: "Usage: ./bin/project dev <start|status|stop> [--json]\n",
    test: "Usage: ./bin/project test --profile <changed|project-cli|unit|typecheck|build|backend|qa-smoke> [--json]\n",
    qa: "Usage: ./bin/project qa prepare [--routes /,/route] [--json]\n",
  };
  return pages[topic] || pages.root;
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) { positional.push(value); continue; }
    const key = value.slice(2);
    if (index + 1 < argv.length && !argv[index + 1].startsWith("--")) options[key] = argv[++index];
    else options[key] = true;
  }
  return { positional, options };
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
  if (command === "help" || argv.includes("--help") || argv.includes("-h")) return output(help(command === "help" ? operation || "root" : command), false);
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
      return output(verifyFixture(), json);
    }
    if (operation === "verify") return output(verifyFixture(), json);
  }
  if (command === "dev") {
    if (operation === "start") return output(await devStart({ json }), json);
    if (operation === "status") return output(devStatus(), json);
    if (operation === "stop") return output(devStop(), json);
  }
  if (command === "test") return output(runTestProfile(parsed.options.profile || "changed", { json }), json);
  if (command === "qa" && operation === "prepare") return output(await qaPrepare({ json, routes: parsed.options.routes }), json);
  throw Object.assign(new Error(`unknown command: ${parsed.positional.join(" ")}`), { code: "unknown_command" });
}
