/* eslint-disable no-console */
// Runs every unit test file in its own `bun test` process.
//
// bun 1.3 runs all files named on one `bun test` command line in a single
// process, and mock.module() replaces a module for the rest of that process
// (https://github.com/oven-sh/bun/issues/7823). A stub registered by one file
// therefore leaks into every file that loads after it: files failed only in
// the full run, and other files passed only because a neighbour's stub
// happened to cover a dependency they never mocked themselves. One process per
// file makes each test file's result depend on that file alone.
//
// Usage: bun scripts/test-isolated.ts [paths...] [--jobs N] [bun test flags...]
// Paths default to app/. Flags other than --jobs pass through to `bun test`.
import { availableParallelism } from 'node:os';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const TEST_FILE = /\.test\.tsx?$/;

export type FileResult = {
  file: string;
  exitCode: number;
  pass: number;
  fail: number;
  skip: number;
  output: string;
};

export function parseArgs(argv: string[]) {
  const paths: string[] = [];
  const passthrough: string[] = [];
  let jobs = Math.max(1, availableParallelism() - 1);
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--jobs') jobs = Number(argv[++index]);
    else if (arg.startsWith('--jobs=')) jobs = Number(arg.slice('--jobs='.length));
    else if (arg.startsWith('-')) passthrough.push(arg);
    else paths.push(arg);
  }
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error('--jobs must be a positive integer');
  return { paths: paths.length ? paths : ['app/'], passthrough, jobs };
}

export function collectTestFiles(paths: string[], cwd = process.cwd()): string[] {
  const files = new Set<string>();
  const visit = (target: string) => {
    const stats = statSync(target);
    if (stats.isFile()) {
      files.add(relative(cwd, target));
      return;
    }
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const child = join(target, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (TEST_FILE.test(entry.name)) files.add(relative(cwd, child));
    }
  };
  for (const path of paths) visit(resolve(cwd, path));
  return [...files].sort();
}

export function parseSummary(output: string) {
  const count = (label: string) => {
    const match = output.match(new RegExp(`^\\s*(\\d+) ${label}$`, 'm'));
    return match ? Number(match[1]) : 0;
  };
  return { pass: count('pass'), fail: count('fail'), skip: count('skip') };
}

async function runFile(file: string, passthrough: string[]): Promise<FileResult> {
  // A leading ./ keeps bun from treating the path as a name filter.
  const child = Bun.spawn(['bun', 'test', ...passthrough, `./${file}`], {
    stdout: 'pipe',
    stderr: 'pipe',
    // This runner is itself a bun process, so it has already loaded .env
    // (NODE_ENV=development locally). Handing that to the child as a real
    // environment variable stops `bun test` from setting NODE_ENV=test the way
    // it does when run directly, which flips dev-only code paths on.
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const output = `${stdout}${stderr}`;
  return { file, exitCode, output, ...parseSummary(output) };
}

async function main() {
  const { paths, passthrough, jobs } = parseArgs(process.argv.slice(2));
  const files = collectTestFiles(paths);
  if (!files.length) {
    console.error(`No test files found under ${paths.join(', ')}`);
    process.exit(1);
  }
  const started = performance.now();
  const results: FileResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(jobs, files.length) }, async () => {
      while (next < files.length) {
        const result = await runFile(files[next++], passthrough);
        results.push(result);
        if (result.exitCode !== 0) {
          console.log(`\n${result.file}:\n${result.output.trim()}\n`);
        }
      }
    })
  );

  const failed = results.filter((result) => result.exitCode !== 0).sort((a, b) => a.file.localeCompare(b.file));
  const total = (key: 'pass' | 'fail' | 'skip') => results.reduce((sum, result) => sum + result[key], 0);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `\n ${total('pass')} pass\n ${total('skip')} skip\n ${total('fail')} fail\n` +
      `Ran ${files.length} files in separate processes (${jobs} at a time) [${seconds}s]`
  );
  if (failed.length) {
    console.log(`\nFailing files (${failed.length}):`);
    for (const result of failed) console.log(`  ${result.file} (exit ${result.exitCode}, ${result.fail} fail)`);
    process.exit(1);
  }
}

if (import.meta.main) await main();
