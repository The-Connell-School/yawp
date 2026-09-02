/**
 * Development server entry point (`bun run dev`).
 *
 * Runs `react-router dev` with exactly the arguments it was given, and beside
 * it the Marketing Studio's embedded renderer. The renderer decides for itself
 * whether it belongs here (see services/marketing-renderer/src/embedded.ts):
 * off in e2e and CI, off unless the studio is on and stores renders on disk.
 * In a fast-mode preview and a worktree with the studio enabled it is on, and
 * queued renders complete without a separate renderer container.
 *
 * The exit code is the dev server's. The renderer stopping never stops the
 * server; the server stopping always stops the renderer.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const webAppDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(webAppDir, '..', '..');
const embeddedRenderer = path.join(
  repoRoot,
  'services',
  'marketing-renderer',
  'src',
  'embedded.ts'
);

// `bun run` puts node_modules/.bin on PATH for scripts; when this file is run
// directly it may not be there, so add both bin directories ourselves. The
// server is spawned by name so the shebang decides its runtime, exactly as
// the previous `"dev": "react-router dev"` did.
const env = {
  ...process.env,
  PATH: [
    path.join(webAppDir, 'node_modules', '.bin'),
    path.join(repoRoot, 'node_modules', '.bin'),
    process.env.PATH ?? '',
  ].join(path.delimiter),
};

const server = spawn('react-router', ['dev', ...args], {
  cwd: webAppDir,
  env,
  stdio: 'inherit',
});

const renderer: ChildProcess = spawn(process.execPath, ['run', embeddedRenderer, ...args], {
  cwd: path.dirname(path.dirname(embeddedRenderer)),
  env,
  stdio: 'inherit',
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (server.exitCode === null) server.kill(signal);
  if (renderer.exitCode === null) renderer.kill(signal);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error(`dev: failed to start react-router: ${err.message}`);
  shutdown('SIGTERM');
  process.exit(1);
});

server.on('exit', (code, signal) => {
  shutdown('SIGTERM');
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

renderer.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error(`dev: embedded renderer failed to start: ${err.message}`);
});
