import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientCourseDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../build/client/courses/thesis-driven-essay'
);

if (existsSync(clientCourseDir)) {
  rmSync(clientCourseDir, { recursive: true, force: true });
}