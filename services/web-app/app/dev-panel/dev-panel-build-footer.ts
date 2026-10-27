export function formatDevPanelBuildFooter(meta: {
  commit: string;
  builtAt: string;
}) {
  const sha =
    !meta.commit || meta.commit === 'unknown'
      ? 'local'
      : meta.commit.slice(0, 7);
  const built =
    meta.builtAt && meta.builtAt !== 'unknown'
      ? new Date(meta.builtAt)
      : new Date();
  const dateLabel = built.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${sha} · ${dateLabel}`;
}
