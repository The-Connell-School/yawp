export type BottomSheetDismissDecision =
  | { action: 'close' }
  | { action: 'snap-back' };

/** ~30% of sheet height or a fast downward flick closes the sheet. */
export function decideBottomSheetDismiss({
  dragOffsetPx,
  sheetHeightPx,
  lastMoveDeltaY,
  dismissFraction = 0.3,
  flickVelocityThresholdPx = 0.75,
}: {
  dragOffsetPx: number;
  sheetHeightPx: number;
  lastMoveDeltaY: number;
  dismissFraction?: number;
  flickVelocityThresholdPx?: number;
}): BottomSheetDismissDecision {
  if (sheetHeightPx <= 0) {
    return dragOffsetPx > 48 ? { action: 'close' } : { action: 'snap-back' };
  }
  if (dragOffsetPx >= sheetHeightPx * dismissFraction) {
    return { action: 'close' };
  }
  if (lastMoveDeltaY > flickVelocityThresholdPx * 16) {
    return { action: 'close' };
  }
  return { action: 'snap-back' };
}
