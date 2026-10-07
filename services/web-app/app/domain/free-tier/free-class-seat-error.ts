export type FreeClassSeatErrorCode = 'class_full' | 'class_not_found';

export class FreeClassSeatError extends Error {
  readonly code: FreeClassSeatErrorCode;

  constructor(code: FreeClassSeatErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'FreeClassSeatError';
  }
}

export function isFreeClassSeatError(
  error: unknown
): error is FreeClassSeatError {
  return error instanceof FreeClassSeatError;
}
