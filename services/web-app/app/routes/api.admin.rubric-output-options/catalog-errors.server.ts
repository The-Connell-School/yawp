import { CatalogError } from '~/domain/rubrics/rubric-catalog.server';

export function rubricCatalogErrorResponse(error: unknown) {
  if (error instanceof CatalogError) {
    if (error.statusCode === 500) {
      return { error: 'Rubric catalog unavailable', status: 503 as const };
    }
    return {
      error: error.message,
      status: error.statusCode as 403 | 409 | 422 | 404,
      ...(error.issues ? { issues: error.issues } : {}),
    };
  }
  return { error: 'Rubric catalog unavailable', status: 503 as const };
}
