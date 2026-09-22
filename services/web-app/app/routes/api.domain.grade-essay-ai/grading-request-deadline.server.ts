export const GRADING_REQUEST_DEADLINE_MS = 100_000;

export class GradingRequestDeadlineError extends Error {
  constructor() {
    super('Grading request deadline exceeded');
    this.name = 'GradingRequestDeadlineError';
  }
}

export function isGradingRequestDeadlineError(error: unknown) {
  if (error instanceof GradingRequestDeadlineError) return true;
  if (!error || typeof error !== 'object') return false;

  const name = 'name' in error ? error.name : null;
  return name === 'GradingRequestDeadlineError' || name === 'TimeoutError';
}

export function createGradingRequestDeadlineSignal() {
  return AbortSignal.timeout(GRADING_REQUEST_DEADLINE_MS);
}

export function runWithGradingRequestDeadline<T>(
  signal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new GradingRequestDeadlineError());
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new GradingRequestDeadlineError());
    signal.addEventListener('abort', onAbort, { once: true });

    Promise.resolve()
      .then(() => operation(signal))
      .then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(
            signal.aborted || isGradingRequestDeadlineError(error)
              ? new GradingRequestDeadlineError()
              : error
          );
        }
      );
  });
}
