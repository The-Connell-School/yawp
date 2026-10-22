import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const designRoot = '/cursor/stores/bot/design/emails/v2';
const buildRoot =
  process.env.EMAIL_SCREENSHOT_DIR ?? '/opt/cursor/artifacts/email-screenshots';
const outDir = '/opt/cursor/artifacts/email-comparisons';

const pairs = [
  {
    label: '01-teacher-spot-ready',
    design: '14-teacher-01-spot-ready-desktop.png',
    build: '01-teacher-spot-ready-desktop-600.png',
  },
  {
    label: '05-admin-approval',
    design: '29-admin-05-teacher-would-like-to-use-yawp-desktop.png',
    build: '05-admin-approval-desktop-600.png',
  },
  {
    label: '08-sign-in-code',
    design: '41-account-08-signin-code-desktop.png',
    build: '08-sign-in-code-desktop-600.png',
  },
  {
    label: '13-school-setup',
    design: '56-account-13-school-setup-desktop.png',
    build: '13-school-setup-desktop-600.png',
  },
  {
    label: '01-dark-mode',
    design: '59-teacher-01-dark-desktop.png',
    build: '01-teacher-release-dark-600.png',
  },
  {
    label: '01-images-off',
    design: '62-teacher-01-images-off-desktop-fallback-fonts.png',
    build: '01-teacher-release-images-off-600.png',
  },
] as const;

async function montage(design: string, build: string, output: string) {
  await execFileAsync('montage', [
    design,
    build,
    '-tile',
    '2x1',
    '-geometry',
    '+0+0',
    '-label',
    '%t',
    output,
  ]);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const pair of pairs) {
    const designPath = path.join(designRoot, pair.design);
    const buildPath = path.join(buildRoot, pair.build);
    const sideBySide = path.join(outDir, `${pair.label}-design-vs-build.png`);
    await copyFile(designPath, path.join(outDir, `${pair.label}-design.png`));
    await copyFile(buildPath, path.join(outDir, `${pair.label}-build.png`));
    try {
      await montage(
        path.join(outDir, `${pair.label}-design.png`),
        path.join(outDir, `${pair.label}-build.png`),
        sideBySide
      );
    } catch {
      // montage unavailable: individual copies still land in outDir
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
