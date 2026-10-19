import { expect, test } from 'bun:test';
import { routerActionStub } from '../../e2e/router-action-stub';
import { decodeRouterDataResponse } from '../../e2e/decode-router-data';

test('resource route mocks return JSON at the original endpoint', async () => {
  const payload = {
    success: true,
    reply: 'Three drafts',
    options: [{ prompt: 'Why?' }],
  };
  const response = await routerActionStub(
    '/api/domain/prompt-generator',
    payload
  );
  expect(response.contentType).toBe('application/json');
  expect(JSON.parse(response.body)).toEqual(payload);
});
test('single-fetch mocks use the router’s stream envelope and retain nested data', async () => {
  const payload = {
    success: true,
    reply: 'Three drafts',
    options: [{ title: 'One', prompt: 'Why?', facets: { gradeBands: ['9'] } }],
  };
  const response = await routerActionStub(
    '/api/domain/prompt-generator.data',
    payload
  );
  expect(response.contentType).toBe('text/x-script');
  expect(decodeRouterDataResponse(response.body.trim())).toEqual({
    data: payload,
  });
});
