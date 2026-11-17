import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE } from '~/domain/free-tier/site-license-how-to-teach';

const webAppRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const SAMPLE_FILE = '/courses/thesis-driven-essay/02-pre-writing.pptx';

const gate = { block: true };

mock.module('~/domain/free-tier/site-license-how-to-teach.server', () => ({
  shouldBlockSiteLicenseCourseAsset: async () => gate.block,
}));

const { siteLicenseCourseAssetExpressMiddleware } = await import(
  './site-license-course-asset-express.middleware.server'
);

describe('siteLicenseCourseAssetExpressMiddleware', () => {
  let baseUrl = '';
  let server: ReturnType<express.Express['listen']>;

  beforeAll(() => {
    const app = express();
  app.use(siteLicenseCourseAssetExpressMiddleware);
  app.use(express.static(path.join(webAppRoot, 'public'), { maxAge: 0 }));
  server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  test('returns 403 for a real thesis course file when the gate blocks', async () => {
    gate.block = true;
    const response = await fetch(`${baseUrl}${SAMPLE_FILE}`);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe(SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE);
  });

  test('serves the file when the gate allows', async () => {
    gate.block = false;
    const response = await fetch(`${baseUrl}${SAMPLE_FILE}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/officedocument|octet-stream/i);
  });
});