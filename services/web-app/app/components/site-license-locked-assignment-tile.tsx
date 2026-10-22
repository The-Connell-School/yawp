import { AssignmentTypeTileImage } from '~/components/assignment-type-tile-image';
import {
  assignmentTypeTileCardClassName,
  assignmentTypeTileFooterClassName,
  assignmentTypeTileImageClassName,
  assignmentTypeTileImageWrapClassName,
  assignmentTypeTileMetaClassName,
  assignmentTypeTileNameClassName,
  assignmentTypeTileNameTestId,
} from '~/components/assignment-type-tile-layout';
import { SiteLicenseLockButton } from '~/components/site-license-lock-button';
import { cn } from '~/utils/misc';

type SiteLicenseLockedAssignmentTileProps = {
  label: string;
  /** `dashboard` matches FreeAssignmentTiles; `picker` matches the creation sheet list. */
  variant: 'dashboard' | 'picker';
  className?: string;
};

export function SiteLicenseLockedAssignmentTile({
  label,
  variant,
  className,
  imageId,
}: SiteLicenseLockedAssignmentTileProps & { imageId?: string | null }) {
  if (variant === 'picker') {
    return (
      <div
        role="group"
        aria-disabled="true"
        aria-label={label}
        data-testid="site-license-locked-assignment-tile"
        className={cn(
          'flex min-h-[52px] w-full cursor-not-allowed items-center gap-3 rounded-lg p-2.5 text-left text-sm text-muted-foreground opacity-70',
          className
        )}
      >
        <AssignmentTypeTileImage
          imageId={imageId}
          className="h-10 w-10 shrink-0 rounded-md sm:h-11 sm:w-11"
        />
        <span
          className={cn(
            assignmentTypeTileFooterClassName('min-w-0 flex-1 p-0'),
            'text-foreground'
          )}
        >
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
          <SiteLicenseLockButton />
        </span>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-disabled="true"
      aria-label={label}
      data-testid="site-license-locked-assignment-tile"
      className={cn(
        assignmentTypeTileCardClassName(
          'cursor-not-allowed bg-muted/20'
        ),
        className
      )}
    >
      <div
        className={cn(
          assignmentTypeTileImageWrapClassName(),
          'relative grayscale'
        )}
      >
        <AssignmentTypeTileImage
          imageId={imageId}
          className={assignmentTypeTileImageClassName}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-muted/35"
          aria-hidden
        />
      </div>
      <span
        className={cn(
          assignmentTypeTileFooterClassName('font-medium'),
          'grid-cols-[minmax(0,1fr)_auto]'
        )}
      >
        <span
          className={assignmentTypeTileNameClassName('col-start-1 row-start-1')}
          data-testid={assignmentTypeTileNameTestId}
        >
          {label}
        </span>
        <SiteLicenseLockButton className="col-start-2 row-start-1 self-start" />
      </span>
    </div>
  );
}

/** Grid tile for the locked teaching assignment-type picker sheet. */
export function SiteLicenseLockedAssignmentGridTile({
  label,
  imageId,
  imageTitle,
  tabIndex,
  tileRef,
}: {
  label: string;
  imageId?: string | null;
  imageTitle?: string | null;
  tabIndex?: number;
  tileRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={tileRef}
      role="option"
      aria-disabled="true"
      aria-label={label}
      tabIndex={tabIndex ?? 0}
      data-testid="site-license-locked-assignment-tile"
      className={cn(
        assignmentTypeTileCardClassName(
          'cursor-not-allowed bg-muted/20 outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )
      )}
    >
      <div
        className={cn(
          assignmentTypeTileImageWrapClassName(),
          'relative grayscale'
        )}
      >
        <AssignmentTypeTileImage
          imageId={imageId}
          imageTitle={imageTitle}
          className={assignmentTypeTileImageClassName}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-muted/35"
          aria-hidden
        />
      </div>
      <div
        className={cn(
          assignmentTypeTileFooterClassName('text-sm font-medium'),
          'grid-cols-[minmax(0,1fr)_auto]'
        )}
      >
        <span
          className={assignmentTypeTileNameClassName('col-start-1 row-start-1')}
          data-testid={assignmentTypeTileNameTestId}
        >
          {label}
        </span>
        <SiteLicenseLockButton className="col-start-2 row-start-1 self-start" />
      </div>
    </div>
  );
}
