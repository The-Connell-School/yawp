import { describe, expect, test } from 'bun:test';
import { decideBottomSheetDismiss } from './dev-panel-bottom-sheet-dismiss';

describe('decideBottomSheetDismiss', () => {
  test('closes when dragged past 30% of sheet height', () => {
    expect(
      decideBottomSheetDismiss({
        dragOffsetPx: 260,
        sheetHeightPx: 800,
        lastMoveDeltaY: 2,
      }).action
    ).toBe('close');
  });

  test('snaps back below the dismiss threshold', () => {
    expect(
      decideBottomSheetDismiss({
        dragOffsetPx: 100,
        sheetHeightPx: 800,
        lastMoveDeltaY: 2,
      }).action
    ).toBe('snap-back');
  });

  test('closes on a fast downward flick', () => {
    expect(
      decideBottomSheetDismiss({
        dragOffsetPx: 40,
        sheetHeightPx: 800,
        lastMoveDeltaY: 20,
      }).action
    ).toBe('close');
  });
});
