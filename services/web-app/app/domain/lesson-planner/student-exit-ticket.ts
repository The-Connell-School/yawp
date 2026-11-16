import { plainPreview } from './plain-preview';

// Generated tickets can carry the teacher's sorting guidance after the prompt,
// even though answer keys are meant to be separate materials. Read old tickets
// safely without changing the teacher's stored copy.
const TEACHER_SECTION = /^(?:answer[ -]key|what to look for|sorting notes?|teacher(?:[’']s)?(?:-only)? notes?|what to do with (?:each|the) pile)\b/i;
const PROMPT_LABEL = /^(?:exit[ -]ticket|(?:student )?(?:prompt|question|directions?))\s*(?::\s*|$)/i;

/** The question students receive, as plain text for prompts and handouts. */
export function studentExitTicket(content: string): string {
  const lines: string[] = [];
  let teacherSection = false;
  // A key emitted in its own material fence is never student text.
  const withoutMaterials = content.replace(/```yawp-material\b[^\n]*\n[\s\S]*?```/g, '');
  for (const line of withoutMaterials.split('\n')) {
    const plain = plainPreview(line);
    if (TEACHER_SECTION.test(plain)) {
      teacherSection = true;
      continue;
    }
    const label = PROMPT_LABEL.exec(plain);
    if (label) teacherSection = false;
    if (!teacherSection) lines.push(label ? plain.slice(label[0].length) : plain);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
