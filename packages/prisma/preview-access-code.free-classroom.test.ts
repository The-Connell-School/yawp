import { describe, expect, test } from 'bun:test';
import {
  PREVIEW_FREE_CLASSROOM_ORG_ID,
  PREVIEW_SCHOOL_REPORTER_NAV_ORG_ID,
  withFreeClassroomPreviewAccessSeat,
  withPreviewFixtureAccessSeats,
} from './preview-access-code';

describe('free classroom preview access seat', () => {
  test('appends a dedicated seat once', () => {
    const seats = [
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Master',
      },
    ];
    const expanded = withFreeClassroomPreviewAccessSeat(seats, () => 'calm-panda-8127');
    expect(expanded).toHaveLength(2);
    expect(expanded[1]).toMatchObject({
      organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
      label: 'Free classroom',
      code: 'calm-panda-8127',
    });
    expect(withFreeClassroomPreviewAccessSeat(expanded)).toEqual(expanded);
  });

  test('withPreviewFixtureAccessSeats adds free classroom and school reporter nav seats', () => {
    const seats = [
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Master',
      },
    ];
    const fixtureCodes = ['calm-panda-8127', 'nimble-fox-4512'];
    let fixtureCodeIndex = 0;
    const expanded = withPreviewFixtureAccessSeats(
      seats,
      () => fixtureCodes[fixtureCodeIndex++] ?? 'wise-wren-9999'
    );
    expect(expanded).toHaveLength(3);
    expect(expanded[1]).toMatchObject({
      organizationId: PREVIEW_FREE_CLASSROOM_ORG_ID,
      label: 'Free classroom',
      code: 'calm-panda-8127',
    });
    expect(expanded[2]).toMatchObject({
      organizationId: PREVIEW_SCHOOL_REPORTER_NAV_ORG_ID,
      label: 'School reporter nav',
    });
    expect(expanded[2]!.code).not.toBe(expanded[1]!.code);
  });
});
