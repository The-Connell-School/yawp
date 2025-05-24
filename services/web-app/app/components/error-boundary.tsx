import { Link, useLocation, useRouteError } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

export function GeneralErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const isAppDocumentRoute = location.pathname.startsWith('/app/documents');

  if (typeof document !== 'undefined') {
    // eslint-disable-next-line no-console
    console.error(error);
  }

  console.log('general error boundary', error)

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
