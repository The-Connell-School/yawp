import { describe, expect, test } from 'bun:test';
import {
  PREVIEW_FREE_CLASSROOM_ORG_ID,
  PREVIEW_SCHOOL_REPORTER_NAV_ORG_ID,
  buildPreviewAccessSeatRegistry,
  countProvisionedPreviewSeatOrgs,
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

describe('preview access seat registry (deploy.sh contract)', () => {
  test('demo with seat count 1 yields exactly one provisioned seat and no fixture orgs', () => {
    const seats = buildPreviewAccessSeatRegistry({
      count: 1,
      previewSlug: 'demo',
      generateCode: () => 'brave-otter-4193',
    });
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({
      organizationId: 'local-dev-org',
      label: 'Master',
    });
    expect(countProvisionedPreviewSeatOrgs(seats)).toBe(1);
    expect(
      seats.some((seat) => seat.organizationId.startsWith('preview-seat-'))
    ).toBe(false);
  });

  test('PR preview adds fixture access seats without extra preview-seat-N orgs', () => {
    const fixtureCodes = ['calm-panda-8127', 'nimble-fox-4512'];
    let index = 0;
    const seats = buildPreviewAccessSeatRegistry({
      count: 1,
      previewSlug: 'pr-414',
      generateCode: () => fixtureCodes[index++] ?? 'wise-wren-9999',
    });
    expect(seats).toHaveLength(3);
    expect(countProvisionedPreviewSeatOrgs(seats)).toBe(1);
    expect(
      seats.filter((seat) => /^preview-seat-[1-9][0-9]*$/.test(seat.organizationId))
    ).toHaveLength(0);
    expect(seats.map((seat) => seat.organizationId).sort()).toEqual(
      [
        'local-dev-org',
        PREVIEW_FREE_CLASSROOM_ORG_ID,
        PREVIEW_SCHOOL_REPORTER_NAV_ORG_ID,
      ].sort()
    );
  });

  test('fixture seats in a retained map do not inflate provisioned seat count', () => {
    const codes = [
      'brave-otter-4193',
      'calm-panda-8127',
      'nimble-fox-4512',
      'sunny-fox-2468',
      'wise-wren-9999',
    ];
    let codeIndex = 0;
    const nextCode = () => codes[codeIndex++] ?? 'happy-hawk-1001';
    const retained = buildPreviewAccessSeatRegistry({
      count: 1,
      previewSlug: 'pr-414',
      generateCode: nextCode,
    });
    const seats = buildPreviewAccessSeatRegistry({
      count: 1,
      previewSlug: 'pr-414',
      existingSeats: retained,
      generateCode: nextCode,
    });
    expect(countProvisionedPreviewSeatOrgs(seats)).toBe(1);
    expect(
      seats.filter((seat) => /^preview-seat-[2-9]/.test(seat.organizationId))
    ).toHaveLength(0);
  });
});
