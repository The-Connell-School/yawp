import { describe, expect, mock, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { storeRenderedFilesOnDisk } from './storage';
import type { RenderedFile } from './render';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'storage-test-'));
}

function renderedFile(dir: string, name: string): RenderedFile {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, `content of ${name}`);
  return {
    path: filePath,
    kind: name.endsWith('.mp4') ? 'VIDEO' : 'IMAGE',
    label: name,
    contentType: name.endsWith('.mp4') ? 'video/mp4' : 'image/png',
  };
}

describe('storeRenderedFilesOnDisk', () => {
  test('copies outputs under the job prefix and reports byte-accurate outputs', () => {
    const src = tempDir();
    const mediaDir = tempDir();
    const files = [
      renderedFile(src, '01-shot.png'),
      renderedFile(src, 'clip.mp4'),
    ];

    const outputs = storeRenderedFilesOnDisk({
      mediaDir,
      jobId: 'job-1',
      files,
    });

    expect(outputs).toHaveLength(2);
    expect(outputs[0].key).toBe('marketing-media/job-1/01-shot.png');
    expect(outputs[1].kind).toBe('VIDEO');
    for (const output of outputs) {
      const stored = path.join(mediaDir, output.key);
      expect(fs.existsSync(stored)).toBe(true);
      expect(fs.statSync(stored).size).toBe(output.bytes);
    }
  });

  test('sanitizes file names into safe keys', () => {
    const src = tempDir();
    const mediaDir = tempDir();
    const file = renderedFile(src, 'weird name.png');

    const [output] = storeRenderedFilesOnDisk({
      mediaDir,
      jobId: 'job-2',
      files: [file],
    });

    expect(output.key).toBe('marketing-media/job-2/weird-name.png');
  });
});
