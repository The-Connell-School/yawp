import { afterEach, describe, expect, test } from 'bun:test';
import {
  deriveLtiIdentityHash,
  parseLtiIdentityHmacKeyset,
} from './lti-identity-keyset.server';

const KEY_A = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const KEY_B = 'ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA';

describe('versioned LTI identity HMAC keys', () => {
  afterEach(() => delete process.env.LTI_IDENTITY_HMAC_KEYS);

  test('requires unique ids and at least 32 decoded bytes', () => {
    expect(parseLtiIdentityHmacKeyset(`v2=${KEY_B},v1=${KEY_A}`)).toEqual([
      { id: 'v2', encodedSecret: KEY_B },
      { id: 'v1', encodedSecret: KEY_A },
    ]);
    expect(() => parseLtiIdentityHmacKeyset('v1=c2hvcnQ')).toThrow(
      '32 random bytes'
    );
    expect(() => parseLtiIdentityHmacKeyset(`v1=${KEY_A},v1=${KEY_B}`)).toThrow(
      'invalid'
    );
  });

  test('keeps old hash material stable when a new active key is prepended', () => {
    const oldKey = parseLtiIdentityHmacKeyset(`v1=${KEY_A}`)[0];
    const rotated = parseLtiIdentityHmacKeyset(`v2=${KEY_B},v1=${KEY_A}`);
    expect(
      deriveLtiIdentityHash({
        key: oldKey,
        registrationId: 'registration-a',
        subject: 'opaque-subject',
      })
    ).toBe(
      deriveLtiIdentityHash({
        key: rotated[1],
        registrationId: 'registration-a',
        subject: 'opaque-subject',
      })
    );
  });
});
