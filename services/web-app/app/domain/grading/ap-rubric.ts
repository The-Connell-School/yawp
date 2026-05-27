export const apRubricRows = [
  { key: 'thesis', label: 'Thesis', maxPoints: 1 },
  { key: 'evidence_commentary', label: 'Evidence & Commentary', maxPoints: 4 },
  { key: 'sophistication', label: 'Sophistication', maxPoints: 1 },
] as const;

export type ApRubricRow = (typeof apRubricRows)[number];
export type ApRubricKey = ApRubricRow['key'];

export const apRubricKeys = apRubricRows.map((r) => r.key) as ApRubricKey[];

export const AP_MAX_SCORE = 6;

export type ApEssayType =
  | 'synthesis'
  | 'rhetorical-analysis'
  | 'argument'
  | 'poetry-analysis'
  | 'prose-fiction-analysis'
  | 'literary-argument';

export type ApAssignmentTypeKind = 'ap-lang' | 'ap-lit';

export function isApKind(kind: string): kind is ApAssignmentTypeKind {
  return kind === 'ap-lang' || kind === 'ap-lit';
}

export function isApEssayType(type: string): type is ApEssayType {
  return [
    'synthesis',
    'rhetorical-analysis',
    'argument',
    'poetry-analysis',
    'prose-fiction-analysis',
    'literary-argument',
  ].includes(type);
}

export function essayTypesForKind(kind: ApAssignmentTypeKind): ApEssayType[] {
  if (kind === 'ap-lang') {
    return ['synthesis', 'rhetorical-analysis', 'argument'];
  }
  return ['poetry-analysis', 'prose-fiction-analysis', 'literary-argument'];
}

export function essayTypeLabel(type: ApEssayType): string {
  const labels: Record<ApEssayType, string> = {
    synthesis: 'Synthesis',
    'rhetorical-analysis': 'Rhetorical Analysis',
    argument: 'Argument',
    'poetry-analysis': 'Poetry Analysis',
    'prose-fiction-analysis': 'Prose Fiction Analysis',
    'literary-argument': 'Literary Argument',
  };
  return labels[type];
}
