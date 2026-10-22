import { AssignmentTypeTileImage } from '~/components/assignment-type-tile-image';
import {
  assignmentTypeTileCardClassName,
  assignmentTypeTileFooterClassName,
  assignmentTypeTileImageClassName,
  assignmentTypeTileImageWrapClassName,
  assignmentTypeTileNameClassName,
  assignmentTypeTileNameTestId,
  assignmentTypeTileTrailingIconClassName,
  dashboardAssignmentTileClassName,
  DashboardAssignmentTileFooter,
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
        dashboardAssignmentTileClassName(
          'cursor-not-allowed text-muted-foreground opacity-80'
        ),
        className
      )}
    >
      <DashboardAssignmentTileFooter
        label={label}
        trailing={
          <SiteLicenseLockButton
            className={assignmentTypeTileTrailingIconClassName()}
          />
        }
      />
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
      <div className={assignmentTypeTileFooterClassName('text-sm font-medium')}>
        <span
          className={assignmentTypeTileNameClassName()}
          data-testid={assignmentTypeTileNameTestId}
        >
          {label}
        </span>
        <SiteLicenseLockButton
          className={assignmentTypeTileTrailingIconClassName('ml-auto')}
        />
      </div>
    </div>
  );
}
