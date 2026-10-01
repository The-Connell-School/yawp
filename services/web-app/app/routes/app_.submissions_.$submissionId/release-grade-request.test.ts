import { describe, expect, test } from 'bun:test';
import {
  requestGradeRelease,
  RELEASE_GRADE_FALLBACK_MESSAGE,
} from './release-grade-request';

describe('requestGradeRelease', () => {
  test('POSTs FormData and returns ok:true when server returns success true', async () => {
    const submissionId = 'sub-1';
    let calledUrl: string | null = null;
    let calledOptions: any = null;
    const mockFetch = async (url: string, options?: any) => {
      calledUrl = url;
      calledOptions = options ?? null;
      return {
        ok: true,
        async json() {
          return { success: true };
        },
      } as const;
    };

    const result = await requestGradeRelease(submissionId, mockFetch as any);

    expect(result).toEqual({ ok: true });
    expect(calledUrl).toBe('/api/domain/release-grades');
    expect(calledOptions?.method).toBe('POST');
    expect(calledOptions?.body instanceof FormData).toBe(true);
    const body = calledOptions?.body as FormData;
    expect(body.getAll('submissionIds')).toEqual([submissionId]);
  });

  test('on non-OK returns ok:false with server-provided message', async () => {
    const mockFetch = async () =>
      ({
        ok: false,
        async json() {
          return { message: 'Not authorized to release' };
        },
      }) as const;

    const result = await requestGradeRelease('sub-nope', mockFetch as any);
    expect(result).toEqual({
      ok: false,
      message: 'Not authorized to release',
    });
  });

  test('falls back to default message when non-OK has no message field', async () => {
    const mockFetch = async () =>
      ({
        ok: false,
        async json() {
          return {}; // no message
        },
      }) as const;

    const result = await requestGradeRelease('sub-missing', mockFetch as any);
    expect(result).toEqual({
      ok: false,
      message: RELEASE_GRADE_FALLBACK_MESSAGE,
    });
  });

  test('falls back to default message when non-OK body is not JSON', async () => {
    const mockFetch = async () =>
      ({
        ok: false,
        async json() {
          throw new Error('invalid json');
        },
      }) as const;

    const result = await requestGradeRelease('sub-badjson', mockFetch as any);
    expect(result).toEqual({
      ok: false,
      message: RELEASE_GRADE_FALLBACK_MESSAGE,
    });
  });

  test('treats success:false on 200 as failure with fallback message', async () => {
    const mockFetch = async () =>
      ({
        ok: true,
        async json() {
          return { success: false };
        },
      }) as const;

    const result = await requestGradeRelease('sub-false', mockFetch as any);
    expect(result).toEqual({
      ok: false,
      message: RELEASE_GRADE_FALLBACK_MESSAGE,
    });
  });

  test('treats thrown fetch as failure with fallback message', async () => {
    const mockFetch = async () => {
      throw new Error('network down');
    };

    const result = await requestGradeRelease('sub-err', mockFetch as any);
    expect(result).toEqual({
      ok: false,
      message: RELEASE_GRADE_FALLBACK_MESSAGE,
    });
  });
});

