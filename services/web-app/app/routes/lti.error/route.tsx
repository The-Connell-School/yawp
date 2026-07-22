import type { MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader } from '~/components/ui/card';

export function loader() {
  return Response.json(
    { supportCode: 'LTI-100' },
    { headers: { 'cache-control': 'no-store' } }
  );
}

export const meta: MetaFunction = () => [{ title: 'LMS launch issue | Yawp' }];

export default function LtiErrorRoute() {
  const { supportCode } = useLoaderData<typeof loader>();
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-12 sm:py-20">
      <Card className="mx-auto max-w-lg shadow-sm">
        <CardHeader className="space-y-4 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle aria-hidden="true" className="size-6" />
          </span>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">
            We couldn&apos;t open Yawp from your LMS
          </h1>
        </CardHeader>
        <CardContent className="space-y-5 text-center">
          <p className="text-sm leading-6 text-muted-foreground">
            Return to your course and launch Yawp again. If the problem
            continues, ask your instructor or LMS administrator to check the
            Yawp course connection.
          </p>
          <Button asChild>
            <Link to="/auth/login">Open Yawp sign in</Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Support reference: <code>{supportCode}</code>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
