import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webAppRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

export function provisionFreeClassroomForE2E(applicationId: string) {
  const runner = path.join(webAppRoot, 'e2e/helpers/provision-free-classroom-runner.ts');
  const result = spawnSync('bun', [runner, applicationId], {
    cwd: webAppRoot,
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `provisionFreeClassroom failed for ${applicationId}`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}
