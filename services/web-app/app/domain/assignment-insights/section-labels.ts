/**
 * Display labels for the sections an assignment runs in.
 *
 * A section's label is built from grade and period, both nullable, so two
 * real sections can render the same string — two Grade 9 classes with no
 * period set both read "Grade 9". Identity in the combined view is the
 * ClassAssignment id, never the label (see combine-section-insights.ts), so a
 * collision is never a correctness problem; it is a readability one. This
 * makes colliding labels distinguishable to the teacher without touching the
 * labels that were already unique.
 */

export type SectionLabelInput = {
  grade: string | null;
  period: string | null;
  title: string | null;
};

/** The label a single section reads as, before any disambiguation. */
export function sectionLabel(klass: SectionLabelInput): string {
  const parts = [
    klass.grade ? `Grade ${klass.grade}` : null,
    klass.period ? `Period ${klass.period}` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return klass.title?.trim() || 'Untitled class';
}

/**
 * Labels for a set of sections, in the order given, with any repeated label
 * qualified by the class title — and, if the titles repeat too, numbered, so
 * the returned labels are always distinct.
 */
export function sectionLabels(classes: SectionLabelInput[]): string[] {
  const base = classes.map(sectionLabel);

  const baseCounts = new Map<string, number>();
  for (const label of base) {
    baseCounts.set(label, (baseCounts.get(label) ?? 0) + 1);
  }

  const qualified = base.map((label, index) => {
    if ((baseCounts.get(label) ?? 0) < 2) return label;
    const title = classes[index].title?.trim();
    return title && title !== label ? `${label} · ${title}` : label;
  });

  const seen = new Map<string, number>();
  const qualifiedCounts = new Map<string, number>();
  for (const label of qualified) {
    qualifiedCounts.set(label, (qualifiedCounts.get(label) ?? 0) + 1);
  }

  return qualified.map((label) => {
    if ((qualifiedCounts.get(label) ?? 0) < 2) return label;
    const next = (seen.get(label) ?? 0) + 1;
    seen.set(label, next);
    return `${label} (${next})`;
  });
}
