import { MARKETING_LIBRARY, parseStoryboard } from '@app/marketing-media';
import { renderStoryboard } from './src/render';

const outRoot = process.env.OUT_DIR || '/tmp/library-out';
let failures = 0;

import fs from 'node:fs';

// Optional slug filter: `bun run render-library.ts <slug>` renders one entry,
// so a driver can put a hard per-entry timeout around a process that calls
// renderStoryboard directly (which has no worker-level attempt deadline).
const only = process.argv[2];

for (const entry of MARKETING_LIBRARY) {
  if (only && entry.slug !== only) continue;
  const done = `${outRoot}/${entry.slug}/.done`;
  if (fs.existsSync(done)) {
    console.log(entry.slug, 'SKIP (already rendered)');
    continue;
  }
  const storyboard = parseStoryboard(entry.storyboard);
  try {
    const result = await renderStoryboard({
      storyboard,
      kind: entry.kind,
      baseUrl: 'http://127.0.0.1:8123',
      outDir: `${outRoot}/${entry.slug}`,
      chromiumPath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    });
    console.log(
      entry.slug,
      'OK',
      result.files.map((f) => f.kind).join(','),
      result.warnings.length ? `warnings: ${result.warnings.join('; ')}` : ''
    );
    fs.writeFileSync(done, 'ok');
  } catch (err) {
    failures += 1;
    console.log(entry.slug, 'FAILED:', err instanceof Error ? err.message : String(err));
  }
}
console.log(failures === 0 ? 'LIBRARY_RENDER_ALL_OK' : `LIBRARY_FAILURES=${failures}`);
