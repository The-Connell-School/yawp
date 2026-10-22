import type { ReactNode } from 'react';

export const ORGANIZATIONS_READ_MOVED_MESSAGE =
  'Organization list, stats, seat counts, and detail visibility have moved to Yawp! Internal. This platform page is kept temporarily for old links and no longer lists organizations.';

export function OrganizationsLegacyNotice({
  previewSeatMode,
  createOrganizationControl,
  createPreviewSeatControl,
  previewSeatList,
}: {
  previewSeatMode: boolean;
  createOrganizationControl: ReactNode;
  createPreviewSeatControl?: ReactNode;
  previewSeatList?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Organizations</h2>
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          data-testid="organizations-read-moved"
        >
          {ORGANIZATIONS_READ_MOVED_MESSAGE}
        </div>
        <p className="text-sm text-muted-foreground">
          Use Yawp! Internal for read-only organization visibility in demo and
          production.
        </p>
      </div>

      <section className="rounded-md border bg-muted/30 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Remaining platform-only writes</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Organization create and update writes now live in Yawp! Internal.
              Preview-seat creation remains unavailable from Internal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {createPreviewSeatControl}
            {createOrganizationControl}
          </div>
        </div>
        {!previewSeatMode ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Preview-seat creation appears only in preview-capable environments.
          </p>
        ) : null}
      </section>
      {previewSeatList}
    </div>
  );
}
