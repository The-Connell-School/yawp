import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

export async function captureLocalEmail(email: unknown) {
  const directory = process.env.SIGNON_MAIL_CAPTURE_DIR;
  const tmp = process.env.TMPDIR;
  const url = new URL(process.env.DATABASE_URL!);
  if (
    process.env.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !directory ||
    !tmp ||
    !path.resolve(directory).startsWith(path.resolve(tmp) + path.sep)
  )
    throw new Error(
      'Local email capture requires an isolated local database and lane-private temporary directory.'
    );
  await mkdir(directory, { mode: 0o700, recursive: true });
  await writeFile(
    path.join(directory, randomBytes(24).toString('hex') + '.json'),
    JSON.stringify(email),
    { mode: 0o600 }
  );
}
