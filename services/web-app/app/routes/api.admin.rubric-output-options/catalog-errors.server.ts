/** Maps rubric catalog failures to admin toggle API responses. */
import { CatalogError } from '~/domain/rubrics/rubric-catalog.server';

export function rubricCatalogErrorResponse(error: unknown) {
  if (error instanceof CatalogError) {
    if (error.statusCode === 500) {
      return {
        error: 'Rubric catalog unavailable',
        status: 503 as const,
        issues: undefined,
      };
    }
    return {
      error: error.message,
      status: error.statusCode as 403 | 409 | 422 | 404,
      issues: error.issues,
    };
  }
  return { error: 'Rubric catalog unavailable', status: 503 as const, issues: undefined };
}

export function rubricCatalogErrorBody(
  failure: ReturnType<typeof rubricCatalogErrorResponse>
) {
  return failure.issues
    ? { error: failure.error, httpStatus: failure.status, issues: failure.issues }
    : { error: failure.error, httpStatus: failure.status };
}
