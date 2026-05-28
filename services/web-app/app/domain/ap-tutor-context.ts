// AP assignments store essay type + source material in Assignment.tutorContext
// as a JSON string. This parses it back out. Non-AP assignments store plain
// text (or null), which parses to null here.

import { isApEssayType, type ApEssayType } from './grading/ap-rubric';

export interface ApSourcePassage {
  label: string;
  title?: string;
  attribution?: string;
  body: string;
}

export interface ApTutorContext {
  essayType: ApEssayType;
  sourcePassages: ApSourcePassage[];
  teacherNotes?: string;
}

export function parseApTutorContext(
  tutorContext: string | null | undefined
): ApTutorContext | null {
  if (!tutorContext || typeof tutorContext !== 'string') return null;

  const trimmed = tutorContext.trim();
  if (!trimmed.startsWith('{')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.essayType !== 'string' || !isApEssayType(obj.essayType)) {
    return null;
  }

  const sourcePassages: ApSourcePassage[] = Array.isArray(obj.sourcePassages)
    ? (obj.sourcePassages
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null;
          const s = raw as Record<string, unknown>;
          if (typeof s.body !== 'string' || s.body.trim() === '') return null;
          return {
            label: typeof s.label === 'string' ? s.label : 'Source',
            title: typeof s.title === 'string' && s.title ? s.title : undefined,
            attribution:
              typeof s.attribution === 'string' && s.attribution
                ? s.attribution
                : undefined,
            body: s.body,
          };
        })
        .filter(Boolean) as ApSourcePassage[])
    : [];

  return {
    essayType: obj.essayType as ApEssayType,
    sourcePassages,
    teacherNotes:
      typeof obj.teacherNotes === 'string' && obj.teacherNotes
        ? obj.teacherNotes
        : undefined,
  };
}
