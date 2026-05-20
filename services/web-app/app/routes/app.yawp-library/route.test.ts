import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireProfile = mock();
const isEssayExamplesEnabledForOrganization = mock();
const listPublishedModelEssays = mock();
const getModelEssayFacets = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isEssayExamplesEnabledForOrganization,
}));
mock.module('~/domain/model-essays.server', () => ({
  listPublishedModelEssays,
  getModelEssayFacets,
}));

const { loader } = await import('./route');

describe('app.yawp-library loader', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireProfile.mockReset();
    isEssayExamplesEnabledForOrganization.mockReset();
    listPublishedModelEssays.mockReset();
    getModelEssayFacets.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1', name: 'UA' },
    });
    listPublishedModelEssays.mockResolvedValue([]);
    getModelEssayFacets.mockResolvedValue({
      essayType: [],
      part: [],
      topicCategory: [],
      gradeLevel: [],
      total: 0,
    });
  });

  test('responds 404 when the essay-examples flag is off for the org', async () => {
    isEssayExamplesEnabledForOrganization.mockResolvedValue(false);

    const req = new Request('http://test/app/yawp-library');
    let caught: Response | undefined;
    try {
      await loader({ request: req, params: {}, context: {} } as any);
    } catch (err) {
      caught = err as Response;
    }

    expect(caught).toBeInstanceOf(Response);
    expect(caught?.status).toBe(404);
  });

  test('checks the flag against the active profile organization', async () => {
    isEssayExamplesEnabledForOrganization.mockResolvedValue(true);

    const req = new Request('http://test/app/yawp-library');
    await loader({ request: req, params: {}, context: {} } as any);

    expect(isEssayExamplesEnabledForOrganization.mock.calls[0][0]).toBe('org-1');
  });

  test('parses URL filter params and passes them to the query helper', async () => {
    isEssayExamplesEnabledForOrganization.mockResolvedValue(true);

    const url =
      'http://test/app/yawp-library?q=cafeteria' +
      '&essayType=The+Reframe&essayType=The+Close+Reading' +
      '&part=Part+One%3A+School' +
      '&topicCategory=School%2FDaily+Life' +
      '&gradeLevel=11&gradeLevel=12&gradeLevel=notANumber';
    const req = new Request(url);
    await loader({ request: req, params: {}, context: {} } as any);

    const filters = listPublishedModelEssays.mock.calls[0][0];
    expect(filters.search).toBe('cafeteria');
    expect(filters.essayType).toEqual(['The Reframe', 'The Close Reading']);
    expect(filters.part).toEqual(['Part One: School']);
    expect(filters.topicCategory).toEqual(['School/Daily Life']);
    expect(filters.gradeLevel).toEqual([11, 12]);
  });
});
