import { buildSafeErrorForLog } from './server-error-request-context.server';

/** Log script/CLI failures without echoing secrets from exception text or stacks. */
export function logScriptError(error: unknown): void {
  console.error(buildSafeErrorForLog(error));
}
