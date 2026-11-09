import { Link, useLocation, useRouteError } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { buildSafeErrorScalarsForLog } from '~/utils/error-log-scalars';
import { captureAppErrorPresentedClient } from '~/utils/app-error-presented.client';
import {
  inferHttpErrorCode,
  sanitizeMessageTemplate,
} from '~/utils/app-error-presented.shared';
import { Button } from './ui/button';

export function GeneralErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const isAppDocumentRoute = location.pathname.startsWith('/app/documents');

  useEffect(() => {
    const safe = buildSafeErrorScalarsForLog(error);
    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : 500;
    captureAppErrorPresentedClient({
      severity: status >= 500 ? 'user_blocking' : 'degraded',
      surface: 'error_boundary',
      error_code:
        status >= 500 ? 'ROUTE_ERROR' : inferHttpErrorCode(status),
      http_status: status,
      message_template: sanitizeMessageTemplate(
        safe.code ? `${safe.errorName}:${safe.code}` : safe.errorName
      ),
      route_template: location.pathname,
      is_expected: false,
    });
  }, [error, location.pathname]);

  if (typeof document !== 'undefined') {
    // eslint-disable-next-line no-console
    console.error('route_error_boundary', buildSafeErrorScalarsForLog(error));
  }

  return isAppDocumentRoute ? (
    <div className="mx-auto flex max-w-screen-sm flex-col gap-4 p-20">
      <h2>Oops! Something didn't work quite right.</h2>
      <p className="text-lg text-muted-foreground">
        Don't worry though; all your writing has been saved. Head back to the
        dashboard and then open your document again.
      </p>
      <Button asChild size="lg">
        <Link to="/app">
          Go to dashboard <ChevronRight size={18} className="ml-2" />
        </Link>
      </Button>
    </div>
  ) : (
    <div className="mx-auto flex max-w-screen-sm flex-col gap-4 p-20">
      <h2>Oops! Something didn't work quite right.</h2>
      <p className="text-lg text-muted-foreground">
        Don't worry though; all your data has been saved. Head back to the
        dashboard and try again.
      </p>
      <Button asChild size="lg">
        <Link to="/app">
          Go to dashboard <ChevronRight size={18} className="ml-2" />
        </Link>
      </Button>
    </div>
  );
}
