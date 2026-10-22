/** Shared overlap checks for dashboard assignment tiles (Playwright page.evaluate). */
export function dashboardAssignmentTileOverlapIssues(scope: ParentNode) {
  const issues: string[] = [];
  const tiles = scope.querySelectorAll(
    '[data-testid="dashboard-assignment-tile"]'
  );
  if (tiles.length === 0) {
    issues.push('no dashboard-assignment-tile elements found');
    return issues;
  }
  for (const tile of tiles) {
    const name = tile.querySelector(
      '[data-testid="assignment-type-tile-name"]'
    ) as HTMLElement | null;
    const meta = tile.querySelector(
      '[data-testid="assignment-type-tile-meta"]'
    ) as HTMLElement | null;
    if (!name || !meta) {
      issues.push('dashboard tile missing name or meta test id');
      continue;
    }
    const a = name.getBoundingClientRect();
    const b = meta.getBoundingClientRect();
    const pad = 0.5;
    const intersect =
      a.right > b.left + pad &&
      a.left < b.right - pad &&
      a.bottom > b.top + pad &&
      a.top < b.bottom - pad;
    if (intersect) {
      issues.push(
        `overlap: "${name.textContent ?? ''}" × "${meta.textContent ?? ''}"`
      );
    }
    if (b.top < a.bottom - 1) {
      issues.push(
        `meta not below name: "${name.textContent ?? ''}" / "${meta.textContent ?? ''}"`
      );
    }
  }
  return issues;
}

/** Legacy a5a9544c tiles: entitled rows were plain buttons without dashboard-assignment-tile. */
export function legacyDashboardAssignmentTileOverlapIssues(scope: ParentNode) {
  const issues: string[] = [];
  const tiles = scope.querySelectorAll(
    '[data-testid="free-assignment-tiles"] button[aria-label]'
  );
  for (const tile of tiles) {
    const name = tile.querySelector(
      '[data-testid="assignment-type-tile-name"]'
    ) as HTMLElement | null;
    const meta = tile.querySelector(
      '[data-testid="assignment-type-tile-meta"]'
    ) as HTMLElement | null;
    if (!name || !meta) continue;
    const a = name.getBoundingClientRect();
    const b = meta.getBoundingClientRect();
    const pad = 0.5;
    const intersect =
      a.right > b.left + pad &&
      a.left < b.right - pad &&
      a.bottom > b.top + pad &&
      a.top < b.bottom - pad;
    if (intersect) {
      issues.push(
        `overlap: "${name.textContent ?? ''}" × "${meta.textContent ?? ''}"`
      );
    }
    if (b.top < a.bottom - 1) {
      issues.push(
        `meta not below name: "${name.textContent ?? ''}" / "${meta.textContent ?? ''}"`
      );
    }
  }
  return issues;
}
