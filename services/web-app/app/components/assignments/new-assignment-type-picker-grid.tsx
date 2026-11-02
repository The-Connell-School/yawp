import { Check } from 'lucide-react';
import { AssignmentTypeTileImage } from '~/components/assignment-type-tile-image';
import {
  assignmentTypeTileCardClassName,
  assignmentTypeTileFooterClassName,
  assignmentTypeTileImageClassName,
  assignmentTypeTileImageWrapClassName,
  assignmentTypeTileMetaClassName,
  assignmentTypeTileMetaTestId,
  assignmentTypeTileNameClassName,
  assignmentTypeTileNameTestId,
} from '~/components/assignment-type-tile-layout';
import { SiteLicenseLockedAssignmentGridTile } from '~/components/site-license-locked-assignment-tile';
import type { SiteLicenseLockedAssignmentTile } from '~/domain/free-tier/site-license-locked-assignment-tiles';
import {
  FREE_TIER_UNLIMITED_TILE_LABEL,
  SITE_LICENSE_ONLY_TILE_LABEL,
} from '~/domain/free-tier/locked-dashboard-copy';
import { cn } from '~/utils/misc';

export type NewAssignmentSelectableType = {
  id: string;
  label: string;
  meta: string;
  imageId?: string | null;
  imageTitle?: string | null;
  disabled?: boolean;
};

type NewAssignmentTypePickerGridProps = {
  selectableTypes: NewAssignmentSelectableType[];
  lockedTiles: SiteLicenseLockedAssignmentTile[];
  selectedTypeId: string;
  onSelectTypeId: (typeId: string) => void;
  name?: string;
};

export function NewAssignmentTypePickerGrid({
  selectableTypes,
  lockedTiles,
  selectedTypeId,
  onSelectTypeId,
  name = 'assignmentTypeId',
}: NewAssignmentTypePickerGridProps) {
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selectedTypeId} />
      <p className="text-sm font-medium">Assignment type</p>
      <div
        className="grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        data-testid="new-assignment-type-grid"
      >
        {selectableTypes.map((type) => {
          const selected = type.id === selectedTypeId;
          return (
            <button
              key={type.id}
              type="button"
              disabled={type.disabled}
              aria-pressed={selected}
              data-testid={`new-assignment-type-${type.id}`}
              onClick={() => onSelectTypeId(type.id)}
              className={cn(
                assignmentTypeTileCardClassName(
                  'bg-popover outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'
                ),
                selected
                  ? 'border-2 border-foreground'
                  : 'border border-border'
              )}
            >
              <div className={assignmentTypeTileImageWrapClassName()}>
                <AssignmentTypeTileImage
                  imageId={type.imageId}
                  imageTitle={type.imageTitle}
                  className={assignmentTypeTileImageClassName}
                />
              </div>
              <div
                className={assignmentTypeTileFooterClassName(
                  'text-sm font-medium'
                )}
              >
                <span
                  className={assignmentTypeTileNameClassName()}
                  data-testid={assignmentTypeTileNameTestId}
                >
                  {type.label}
                </span>
                <span
                  className={assignmentTypeTileMetaClassName()}
                  data-testid={assignmentTypeTileMetaTestId}
                >
                  {type.meta}
                </span>
                {selected ? (
                  <Check className="ml-auto h-4 w-4 shrink-0" aria-hidden />
                ) : null}
              </div>
            </button>
          );
        })}
        {lockedTiles.map((tile) => (
          <SiteLicenseLockedAssignmentGridTile
            key={tile.key}
            label={tile.label}
            imageId={tile.imageId}
            imageTitle={null}
            tabIndex={-1}
          />
        ))}
      </div>
      {lockedTiles.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {SITE_LICENSE_ONLY_TILE_LABEL} types require a site license.
        </p>
      ) : null}
    </div>
  );
}

export function metaLabelForFreeAssignmentTile(params: {
  unlimitedFreeAssignmentTiles: boolean;
  remaining: number;
  total: number;
}) {
  if (params.unlimitedFreeAssignmentTiles) {
    return FREE_TIER_UNLIMITED_TILE_LABEL;
  }
  if (params.remaining > 0) {
    return `${params.remaining} of ${params.total} left`;
  }
  return 'None left';
}
