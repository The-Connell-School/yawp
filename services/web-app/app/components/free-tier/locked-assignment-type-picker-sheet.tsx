import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { AssignmentTypeTileImage } from '~/components/assignment-type-tile-image';
import {
  assignmentTypeTileCardClassName,
  assignmentTypeTileFooterClassName,
  assignmentTypeTileImageClassName,
  assignmentTypeTileImageWrapClassName,
  assignmentTypeTileMetaClassName,
  assignmentTypeTileNameClassName,
} from '~/components/assignment-type-tile-layout';
import { SiteLicenseLockedAssignmentGridTile } from '~/components/site-license-locked-assignment-tile';
import type { SiteLicenseLockedAssignmentTile } from '~/domain/free-tier/site-license-locked-assignment-tiles';
import { TEACHING_ACCESS_LOCKED_TOOLTIP } from '~/domain/free-tier/teaching-access-copy';
import { cn } from '~/utils/misc';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import { LockedTeachingControl } from './locked-teaching-control';

type FreeType = {
  id: string;
  kind?: string | null;
  imageId?: string | null;
  imageTitle?: string | null;
  title: string;
};

export function LockedAssignmentTypePickerSheet({
  open,
  onOpenChange,
  usage,
  assignmentTypes,
  lockedAssignmentTiles,
  createTriggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usage: FreeAccountUsage;
  assignmentTypes: FreeType[];
  lockedAssignmentTiles: SiteLicenseLockedAssignmentTile[];
  createTriggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) setSelectedId(undefined);
  }, [open]);

  const closeAndReturnFocus = useCallback(() => {
    onOpenChange(false);
    createTriggerRef?.current?.focus();
  }, [createTriggerRef, onOpenChange]);

  const selectable = usage.assignments
    .map((row) => {
      const type = assignmentTypes.find((t) => t.kind === row.kind);
      return type ? { row, type } : null;
    })
    .filter(Boolean) as Array<{
    row: (typeof usage.assignments)[number];
    type: FreeType;
  }>;

  const allTiles = [
    ...selectable.map(({ row, type }) => ({
      key: type.id,
      kind: 'free' as const,
      label: row.label,
      imageId: type.imageId,
      imageTitle: type.imageTitle,
      included: usage.monthly
        ? 'Unlimited'
        : `${row.total} included`,
      selected: selectedId === type.id,
      onSelect: () => setSelectedId(type.id),
    })),
    ...lockedAssignmentTiles.map((tile) => ({
      key: tile.key,
      kind: 'locked' as const,
      label: tile.label,
      imageId: tile.imageId,
      imageTitle: null as string | null,
      selected: false,
      onSelect: undefined,
    })),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-full flex-col sm:max-w-[560px]"
        overlayClassName="bg-black/35"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          tileRefs.current[0]?.focus();
        }}
      >
        <SheetHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <SheetTitle id={titleId}>New assignment</SheetTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a type.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
            onClick={closeAndReturnFocus}
          >
            <X className="h-5 w-5" />
          </button>
        </SheetHeader>
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
          <div
            role="listbox"
            aria-labelledby={titleId}
            className="grid auto-rows-min grid-cols-2 content-start items-start gap-3 sm:grid-cols-3"
            onKeyDown={(event) => {
            const focusable = tileRefs.current.filter(Boolean);
            const index = focusable.findIndex(
              (el) => el === document.activeElement
            );
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              const next = focusable[(index + 1) % focusable.length];
              next?.focus();
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              const next =
                focusable[(index - 1 + focusable.length) % focusable.length];
              next?.focus();
            }
            if (event.key === 'Enter' && index >= 0) {
              event.preventDefault();
              focusable[index]?.click();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              closeAndReturnFocus();
            }
          }}
        >
          {allTiles.map((tile, index) => {
            if (tile.kind === 'locked') {
              return (
                <SiteLicenseLockedAssignmentGridTile
                  key={tile.key}
                  label={tile.label}
                  imageId={tile.imageId}
                  imageTitle={tile.imageTitle}
                  tabIndex={0}
                  tileRef={(el) => {
                    tileRefs.current[index] = el as HTMLButtonElement | null;
                  }}
                />
              );
            }
            return (
              <button
                key={tile.key}
                type="button"
                role="option"
                aria-selected={tile.selected}
                ref={(el) => {
                  tileRefs.current[index] = el;
                }}
                onClick={tile.onSelect}
                className={cn(
                  assignmentTypeTileCardClassName(
                    'bg-popover outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  ),
                  tile.selected && 'border-primary ring-1 ring-primary'
                )}
              >
                <div className={assignmentTypeTileImageWrapClassName()}>
                  <AssignmentTypeTileImage
                    imageId={tile.imageId}
                    imageTitle={tile.imageTitle}
                    className={assignmentTypeTileImageClassName}
                  />
                </div>
                <div
                  className={assignmentTypeTileFooterClassName(
                    'text-sm font-medium'
                  )}
                >
                  <span className={assignmentTypeTileNameClassName()}>
                    {tile.label}
                  </span>
                  <span className={assignmentTypeTileMetaClassName()}>
                    {tile.included}
                  </span>
                  {tile.selected ? (
                    <Check
                      className="h-4 w-4 shrink-0 self-start text-primary"
                      aria-hidden
                    />
                  ) : null}
                </div>
              </button>
            );
          })}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {TEACHING_ACCESS_LOCKED_TOOLTIP}
          </p>
          <LockedTeachingControl locked>
            <Button type="button" aria-disabled className="opacity-60">
              Create assignment
            </Button>
          </LockedTeachingControl>
        </div>
      </SheetContent>
    </Sheet>
  );
}
