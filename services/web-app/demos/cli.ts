#!/usr/bin/env bun
/**
 * Records a demo video.
 *
 *   bun demos/cli.ts --list
 *   bun demos/cli.ts self-test
 *   bun demos/cli.ts writing-practice --headed
 *
 * Demos are discovered from `demos/scripts/<name>.demo.ts`, so adding one is
 * a matter of dropping in a file — there is no registry to keep in sync.
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordDemo, type DemoDefinition } from './runtime/record';

const DEMOS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(DEMOS_DIR, 'scripts');
const DEFAULT_OUT_DIR = path.join(DEMOS_DIR, 'out');
/** Matches the port the Playwright e2e server uses. */
const DEFAULT_BASE_URL = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:5173';

type Args = {
  name?: string;
  list: boolean;
  headed: boolean;
  keepRaw: boolean;
  rate?: number;
  baseUrl: string;
  outDir: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    list: false,
    headed: false,
    keepRaw: false,
    baseUrl: DEFAULT_BASE_URL,
    outDir: DEFAULT_OUT_DIR,
  };

  for (const arg of argv) {
    if (arg === '--list') args.list = true;
    else if (arg === '--headed') args.headed = true;
    else if (arg === '--keep-raw') args.keepRaw = true;
    else if (arg.startsWith('--rate=')) args.rate = Number(arg.slice(7));
    else if (arg.startsWith('--base-url=')) args.baseUrl = arg.slice(11);
    else if (arg.startsWith('--out=')) args.outDir = path.resolve(arg.slice(6));
    else if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
    else args.name = arg;
  }

  return args;
}

async function listDemoNames(): Promise<string[]> {
  const entries = await readdir(SCRIPTS_DIR).catch(() => []);
  return entries
    .filter((file) => file.endsWith('.demo.ts'))
    .map((file) => file.replace(/\.demo\.ts$/, ''))
    .sort();
}

async function loadDemo(name: string): Promise<DemoDefinition> {
  const available = await listDemoNames();
  if (!available.includes(name)) {
    throw new Error(
      `No demo named "${name}".\nAvailable: ${available.join(', ') || '(none)'}`
    );
  }

  const module = (await import(path.join(SCRIPTS_DIR, `${name}.demo.ts`))) as {
    default?: DemoDefinition;
  };

  if (!module.default) {
    throw new Error(`${name}.demo.ts has no default export`);
  }
  return module.default;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list || !args.name) {
    const names = await listDemoNames();
    console.log('Available demos:\n');
    for (const name of names) console.log(`  ${name}`);
    console.log('\nRecord one with:  bun demos/cli.ts <name>');
    return;
  }

  const demo = await loadDemo(args.name);

  // A fixture-backed demo brings its own server; a real one expects the dev
  // server to already be running.
  const fixture = await demo.fixtureServer?.();
  const baseUrl = fixture?.url ?? args.baseUrl;

  console.log(`Recording "${demo.name}" against ${baseUrl}…`);

  try {
    const result = await recordDemo(demo, {
      baseUrl,
      outDir: args.outDir,
      headed: args.headed,
      keepRaw: args.keepRaw,
      rate: args.rate,
    });

    const size = Bun.file(result.outputPath).size;
    console.log(
      `\n  ${result.outputPath}` +
        `\n  ${formatDuration(result.durationMs)} · ${(size / 1024 / 1024).toFixed(1)} MB\n`
    );
  } finally {
    await fixture?.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    `\n${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
