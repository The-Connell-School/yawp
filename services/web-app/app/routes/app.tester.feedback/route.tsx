import {
  Link,
  type LoaderFunctionArgs,
} from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import { Button } from '~/components/ui/button';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
}

export default function TesterFeedbackPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tester feedback</h1>
      </div>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Tester feedback review has moved to Yawp Internal. This platform page is
        kept temporarily for old links and no longer lists or exports feedback.
      </div>
      <p className="text-sm text-muted-foreground">
        Use Yawp Internal for tester feedback review and CSV export.
      </p>
      <Button asChild variant="outline">
        <Link to="/app/admin">Back to admin</Link>
      </Button>
    </main>
  );
}
