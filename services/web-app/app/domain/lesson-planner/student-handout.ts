/**
 * One handout instead of several.
 *
 * A lesson tends to produce three or four separate student-facing pieces — a
 * warm-up, a model text to mark up, a practice set, an exit ticket. Printed
 * one at a time that is four sheets of paper and four moments of "everybody
 * take out the other page". Printed as one numbered document it is a packet a
 * teacher can lead a class straight through.
 *
 * Nothing is merged or destroyed: this is a reading of the packet, so it stays
 * current as the teacher adds and removes material, and the pieces they do not
 * want in students' hands are simply left out.
 */
import type { LessonPacket } from './lesson-packet';

export type StudentHandoutPart = {
  /** Stable across renders so a teacher's exclusions survive a reload. */
  id: string;
  /** Position in the printed handout, counted after exclusions. */
  number: number;
  title: string;
  content: string;
};

export type StudentHandout = {
  title: string;
  className: string | null;
  parts: StudentHandoutPart[];
};

/** A piece of a kept reply is addressed through the reply it sits in. */
function nestedId(sectionId: string, materialKey: string): string {
  return `${sectionId}:${materialKey}`;
}

export function buildStudentHandout({
  packet,
  excluded = [],
}: {
  packet: LessonPacket;
  excluded?: string[];
}): StudentHandout {
  const leftOut = new Set(excluded);
  const candidates: Array<{ id: string; title: string; content: string }> = [];

  for (const section of packet.sections) {
    if (section.audience === 'student' && section.content.trim()) {
      candidates.push({
        id: section.id,
        title: section.title,
        content: section.content,
      });
    }
    // Material the teacher kept as part of a whole reply rather than filing on
    // its own still belongs in students' hands.
    for (const material of section.materials) {
      if (material.audience !== 'student') continue;
      candidates.push({
        id: nestedId(section.id, material.key),
        title: material.title,
        content: material.content,
      });
    }
  }

  return {
    title: packet.title,
    className: packet.className,
    parts: candidates
      .filter((candidate) => !leftOut.has(candidate.id))
      .map((candidate, index) => ({ ...candidate, number: index + 1 })),
  };
}

/** Every piece that could be in the handout, in order, however it is filed. */
export function studentHandoutCandidateIds(packet: LessonPacket): string[] {
  return buildStudentHandout({ packet }).parts.map((part) => part.id);
}
