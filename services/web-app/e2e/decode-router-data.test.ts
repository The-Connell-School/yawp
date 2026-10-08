import { describe, expect, test } from 'bun:test';
import { decodeRouterDataResponse, findObjectsWithId } from './decode-router-data';

describe('decodeRouterDataResponse', () => {
  test('decodes turbo single-fetch arrays with nested submission rows', () => {
    const body = JSON.stringify([
      { _1: 2 },
      'loaderData',
      { _3: 4 },
      'routes/app_.submissions_.$submissionId',
      { _5: 6 },
      'submission',
      { _7: 8, _9: 10, _11: 12 },
      'id',
      'sub-abc',
      'overallScore',
      80,
      'releasedAt',
      null,
    ]);

    const loaderData = decodeRouterDataResponse(body) as Record<string, unknown>;
    const routeData = loaderData['routes/app_.submissions_.$submissionId'] as Record<
      string,
      unknown
    >;
    const submission = routeData.submission as Record<string, unknown>;

    expect(submission.id).toBe('sub-abc');
    expect(submission.overallScore).toBe(80);
    expect(submission.releasedAt).toBeNull();
    expect(findObjectsWithId(loaderData, 'sub-abc')).toHaveLength(1);
  });

});
