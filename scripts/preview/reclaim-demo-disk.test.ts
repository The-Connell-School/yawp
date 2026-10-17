import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const directories: string[] = [];
const image = (digit: string) => `sha256:${digit.repeat(64)}`;
const runningImage = image('1');
const stoppedImage = image('2');
const unusedImage = image('3');

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function run(scenario = 'mixed') {
  // GitHub provides RUNNER_TEMP; local lane runs must supply TMPDIR.
  process.env.TMPDIR ??= process.env.RUNNER_TEMP;
  if (!process.env.TMPDIR) throw new Error('TMPDIR must point to lane-private fixtures');
  const directory = mkdtempSync(join(process.env.TMPDIR, 'demo-disk-test-'));
  directories.push(directory);
  const log = join(directory, 'commands.jsonl');
  writeFileSync(log, '');
  // Only this allowlist can succeed; no command can reach the real Docker daemon.
  writeFileSync(join(directory, 'docker'), `#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ['COMMAND_LOG'], 'a') as log:
    log.write(json.dumps(args) + '\\n')
scenario = os.environ['SCENARIO']
images = ['sha256:' + digit * 64 for digit in '123']
if args == ['ps', '-a', '--quiet', '--no-trunc']:
    if scenario == 'enumeration-failure': sys.exit(1)
    if scenario not in ['empty', 'no-containers']: print('running\\nstopped')
elif args[:4] == ['container', 'inspect', '--format', '{{.Image}}'] and len(args) == 5:
    if scenario == 'container-inspection-failure' and args[4] == 'stopped': sys.exit(1)
    print(images[0 if args[4] == 'running' else 1])
elif args[:4] == ['image', 'inspect', '--format', '{{.Id}}'] and len(args) == 5:
    if scenario == 'image-inspection-failure' and args[4] == images[1]: sys.exit(1)
    print('' if scenario == 'empty-inspection' else args[4])
elif args == ['image', 'ls', '--all', '--quiet', '--no-trunc']:
    if scenario == 'listing-failure': sys.exit(1)
    if scenario == 'invalid-candidate': print('unexpected'); sys.exit(0)
    if scenario == 'empty': sys.exit(0)
    print('\\n'.join(images[:2] if scenario == 'protected-only' else images + [images[2]]))
elif args[:2] == ['image', 'rm'] and len(args) == 3 and args[2] in (images if scenario == 'no-containers' else [images[2]]):
    # Multiple tags or a new container can prevent a non-forced removal.
    if scenario == 'removal-conflict': sys.exit(1)
elif args == ['builder', 'prune', '-af', '--keep-storage', '2GB']:
    if scenario == 'cache-failure': sys.exit(1)
else:
    print('Unexpected or destructive Docker command', file=sys.stderr)
    sys.exit(90)
`);
  chmodSync(join(directory, 'docker'), 0o755);
  const result = Bun.spawnSync({
    cmd: ['bash', resolve('scripts/preview/reclaim-demo-disk.sh')],
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      COMMAND_LOG: log,
      SCENARIO: scenario,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const commands: string[][] = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const removals = commands.filter((args) => args[0] === 'image' && args[1] === 'rm');
  expect(commands.length).toBeGreaterThan(0);
  for (const args of commands) {
    expect(args).not.toContain('--force');
    expect(args).not.toContain('volume');
    expect(args).not.toContain('system');
    if (args[0] === 'container') expect(args[1]).toBe('inspect');
  }
  const stdout = new TextDecoder().decode(result.stdout);
  if (commands.length) {
    expect(stdout).toContain('Demo disk free before cleanup');
    expect(stdout).toContain('Demo disk free after cleanup');
    expect(stdout.match(/Filesystem/g)?.length).toBe(2);
  }
  return { result, commands, removals, stdout };
}

describe('demo disk reclamation with fake Docker', () => {
  test('protects running and stopped container images and deduplicates multiple tags', () => {
    const { result, commands, removals } = run();
    expect(result.exitCode).toBe(0);
    expect(commands).toContainEqual(['image', 'inspect', '--format', '{{.Id}}', runningImage]);
    expect(commands).toContainEqual(['image', 'inspect', '--format', '{{.Id}}', stoppedImage]);
    expect(removals).toEqual([['image', 'rm', unusedImage]]);
    const firstRemoval = commands.findIndex((args) => args[1] === 'rm');
    expect(commands.findLastIndex((args) => args[1] === 'inspect')).toBeLessThan(firstRemoval);
    expect(commands.at(-1)).toEqual(['builder', 'prune', '-af', '--keep-storage', '2GB']);
  });

  test('can remove unused images when the host has no containers', () => {
    const { result, removals } = run('no-containers');
    expect(result.exitCode).toBe(0);
    expect(removals.map((args) => args[2]).sort()).toEqual([runningImage, stoppedImage, unusedImage]);
  });

  for (const scenario of ['protected-only', 'empty']) {
    test(`logs disk and bounds cache when there are no candidates: ${scenario}`, () => {
      const { result, commands, removals, stdout } = run(scenario);
      expect(result.exitCode).toBe(0);
      expect(removals).toEqual([]);
      expect(stdout).toContain('No unused Docker images');
      expect(commands.at(-1)).toEqual(['builder', 'prune', '-af', '--keep-storage', '2GB']);
    });
  }

  for (const scenario of ['enumeration-failure', 'container-inspection-failure', 'image-inspection-failure', 'empty-inspection', 'listing-failure', 'invalid-candidate']) {
    test(`fails closed before any deletion: ${scenario}`, () => {
      const { result, commands, removals } = run(scenario);
      expect(result.exitCode).not.toBe(0);
      expect(commands.length).toBeGreaterThan(0);
      expect(removals).toEqual([]);
      expect(commands.some((args) => args.includes('prune'))).toBe(false);
    });
  }

  test('retains an image Docker refuses to remove without retrying with force', () => {
    const { result, removals } = run('removal-conflict');
    expect(result.exitCode).toBe(0);
    expect(removals).toEqual([['image', 'rm', unusedImage]]);
    expect(new TextDecoder().decode(result.stderr)).toContain('Retaining image');
  });

  test('reports failed cache pruning and still logs disk free afterwards', () => {
    expect(run('cache-failure').result.exitCode).not.toBe(0);
  });
});
