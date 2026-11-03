/**
 * The standards a teacher named for a lesson (Oct 21 review: "only make
 * claims the product can substantiate"). Read from the teacher's own
 * messages and never inferred: a Common Core code they typed
 * ("RL.9-10.1", "CCSS.ELA-LITERACY.W.11-12.2b"), or text they gave as a
 * standard ("Standard: Cite strong and thorough textual evidence…").
 * These fill the plan's Standards section and the admin page; a lesson
 * whose teacher named none shows none.
 */

const CODE = /\b(?:CCSS\.ELA-LITERACY\.)?(RL|RI|RF|RH|RST|WHST|W|SL|L)\.(K|\d{1,2})(?:-(\d{1,2}))?\.(\d{1,2})([a-e])?\b/gi;
const HAS_CODE = new RegExp(CODE.source, 'i');
/** "standard" then, within a few words, a colon or a quote, then its text. */
const NAMED = /\bstandards?\b([^:"“\n?]{0,40})[:"“]\s*["“]?([^"”\n]{20,500})/gi;

function normalizedCode(match: RegExpMatchArray): string {
  const [, strand, grade, upTo, number, letter] = match;
  return `${strand!.toUpperCase()}.${grade!.toUpperCase()}${upTo ? `-${upTo}` : ''}.${number}${letter ? letter.toLowerCase() : ''}`;
}

export function teacherStandards(messages: string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (standard: string) => {
    const key = standard.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(standard);
  };

  for (const message of messages) {
    const usedCodes = new Set<string>();
    for (const named of message.matchAll(NAMED)) {
      const prefixCode = [...named[1]!.matchAll(CODE)][0];
      const text = named[2]!.trim().replace(/["”]+$/, '').trim();
      // A code alone after "standard is": the code pass below has it.
      if (HAS_CODE.test(text) && text.replace(CODE, '').trim().length < 20) continue;
      if (prefixCode) {
        const code = normalizedCode(prefixCode);
        usedCodes.add(code);
        add(`${code}: ${text}`);
      } else {
        add(text);
      }
    }
    for (const match of message.matchAll(CODE)) {
      const code = normalizedCode(match);
      if (!usedCodes.has(code)) add(code);
    }
  }
  return found;
}

/** "RL.9-10.1: Cite strong…" → "RL.9-10.1"; a standard given as text, its opening words. */
export function shortStandard(standard: string): string {
  const code = /^([A-Z]+\.[0-9K][0-9-]*\.\d+[a-e]?)(?::|$)/.exec(standard)?.[1];
  if (code) return code;
  if (standard.length <= 48) return standard;
  const cut = standard.slice(0, 47);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`;
}
