import { describe, expect, test } from 'bun:test';
import {
  PREVIEW_FREE_CLASSROOM_ORG_ID,
  withFreeClassroomPreviewAccessSeat,
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
});
