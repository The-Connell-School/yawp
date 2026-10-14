import {
  useFetcher,
  type LoaderFunctionArgs,
  useLoaderData,
  type ActionFunctionArgs,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { useEffect, useRef, useState } from 'react';
import { OrganizationsLegacyNotice } from './legacy-notice';

export async function loader(args: LoaderFunctionArgs) {
  const { organizationsLoader } = await import('./route.server');
  return organizationsLoader(args);
}

export async function action(args: ActionFunctionArgs) {
  const { organizationsAction } = await import('./route.server');
  return organizationsAction(args);
}

export default function OrganizationsRoute() {
  const { previewSeatMode } = useLoaderData<typeof loader>();
  const seatFetcher = useFetcher<typeof action>();
  const [isSeatSheetOpen, setIsSeatSheetOpen] = useState(false);
  const [copiedSeatCode, setCopiedSeatCode] = useState(false);
  const seatResultRef = useRef<HTMLDivElement>(null);
  const seatActionData = seatFetcher.data as
    | {
        error?: string;
        previewSeat?: {
          organizationName: string;
          previewSeatCode: string;
        };
      }
    | undefined;
  const createdSeat = seatActionData?.previewSeat;

  useEffect(() => {
    if (!createdSeat) return;
    setCopiedSeatCode(false);
    seatResultRef.current?.focus();
  }, [createdSeat]);

  return (
    <OrganizationsLegacyNotice
      previewSeatMode={previewSeatMode}
      createPreviewSeatControl={
        previewSeatMode ? (
          <Sheet open={isSeatSheetOpen} onOpenChange={setIsSeatSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Create Preview Seat
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Create Preview Seat</SheetTitle>
              </SheetHeader>
              <p className="mt-4 text-sm text-muted-foreground">
                This creates a new isolated organization with the same
                starting demo data as the Master seat. Existing seats are left
                unchanged.
              </p>
              <seatFetcher.Form method="post" className="mt-6">
                <input
                  type="hidden"
                  name="intent"
                  value="createPreviewSeat"
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={seatFetcher.state !== 'idle'}
                >
                  {seatFetcher.state === 'idle'
                    ? 'Create and Seed Seat'
                    : 'Creating Seat...'}
                </Button>
              </seatFetcher.Form>
              {createdSeat ? (
                <div
                  ref={seatResultRef}
                  className="mt-6 rounded-lg border bg-muted p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  role="status"
                  aria-live="polite"
                  tabIndex={-1}
                >
                  <p className="text-sm font-medium">Access code</p>
                  <code
                    className="mt-2 block select-all text-lg font-semibold"
                    data-preview-seat-code
                  >
                    {createdSeat.previewSeatCode}
                  </code>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {createdSeat.organizationName}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(createdSeat.previewSeatCode)
                        .then(() => setCopiedSeatCode(true));
                    }}
                  >
                    {copiedSeatCode ? 'Copied' : 'Copy Access Code'}
                  </Button>
                </div>
              ) : seatActionData?.error ? (
                <p
                  className="mt-6 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
                  role="alert"
                >
                  {seatActionData.error}
                </p>
              ) : null}
            </SheetContent>
          </Sheet>
        ) : null
      }
      createOrganizationControl={
        <Button disabled title="Create organizations in Yawp Internal">
          <Plus className="mr-2 h-4 w-4" />
          Create Organization
        </Button>
      }
    />
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
