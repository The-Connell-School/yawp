/**
 * The reply's own words, kept to what a teacher needs (Kevin, Nov 23: the
 * unit reply was "a wall of text"; it opened "Good — I have everything I
 * need. I'll write all the prompts myself and build the map around the
 * Socratic seminar." and put five paragraphs before the map). The planner is
 * told both rules and breaks them, so they are kept here. Nothing inside a
 * fenced block is touched.
 */

const FENCE = /^\s*(```|~~~)/;

/**
 * The planner narrating its own work: what it has, what it searched, what it
 * will write itself, what it is about to do. Each is a whole sentence of the
 * reply's prose; the sentence goes, and a paragraph left empty goes with it.
 */
const PROCESS_TALK = [
  /\bI (?:now )?have (?:everything|all|what) I need\b/i,
  /\bI['’]ll (?:write|draft|create|make|build)\b[^.!?]*\b(?:myself|from scratch)\b/i,
  /\bI['’]ll\b[^.!?]*\bbuild the (?:full |whole )?(?:lesson|unit|map|deck)\b[^.!?]*\bnow\b/i,
  /\bis in the public domain, so (?:I|all|every|the|its|it|we)\b/i,
  /\bis in the public domain\b[^.!?]*\bso (?:I|all|every|the|its|it|we)\b/i,
  /\bI['’]m using\b[^.!?]*\b(?:translation|edition|text)\b/i,
  /^(?:Now|And now|Next),? (?:for|here['’]s|here is) the (?:deck|handout|slides|slide deck|materials?)\b/i,
  /^(?:Now )?(?:let me|I['’]ll now|I will now|now I['’]ll)\s+(?:build|write|draft|put|make|create|pull|search|look)\b/i,
  /\b(?:nothing|no lessons?|no decks?) in the (?:Teacher['’]s )?Lounge (?:covers|matches|fits)\b/i,
  /\bthe (?:Short Response|class starter|Daily Pages|writing lesson) library (?:has|had|doesn['’]t have|does not have)\b/i,
  /\bI (?:searched|looked through|checked) (?:the )?(?:Lounge|library|Teacher['’]s Lounge|class starters?|Short Responses?)\b/i,
];

/** A sentence that is only "Good —", "Great!" or "Okay." on its own says nothing either. */
const BARE_OPENER = /^(?:good|great|okay|ok|alright|all right|perfect|got it)\s*[—–,.!:-]*\s*$/i;

function splitSentences(paragraph: string): string[] {
  // Not after an initial ("F. Storr", "Martin Luther King Jr." is fine): one sentence, not two.
  return paragraph.split(/(?<=[.!?:])(?<!\b[A-Z]\.)\s+(?=[A-Z“"'‘(*])/);
}

/** A paragraph with its process talk taken out; '' when nothing is left. */
function withoutTalk(paragraph: string): string {
  if (/^\s*(?:[-*+]|\d+[.)]|#{1,6}|>|\|)/.test(paragraph)) return paragraph;
  const sentences = splitSentences(paragraph.trim());
  // "Good — I have everything I need." opens with its own little word: split it off first.
  const kept = sentences
    .map((sentence) => sentence.replace(/^(?:good|great|okay|ok|alright|perfect)\s*[—–-]\s*/i, (lead) => (PROCESS_TALK.some((talk) => talk.test(sentence.slice(lead.length))) ? '' : lead)))
    .filter((sentence) => !PROCESS_TALK.some((talk) => talk.test(sentence)) && !BARE_OPENER.test(sentence.trim()));
  if (kept.length === sentences.length) return paragraph;
  return kept.join(' ').trim();
}

type Part = { fenced: boolean; text: string };

/** The reply as prose paragraphs and fenced blocks, in order. */
function partsOf(reply: string): Part[] {
  const parts: Part[] = [];
  let inFence = false;
  let current: string[] = [];
  const flush = (fenced: boolean) => {
    if (current.length) parts.push({ fenced, text: current.join('\n') });
    current = [];
  };
  for (const line of reply.split('\n')) {
    if (FENCE.test(line)) {
      if (!inFence) {
        flush(false);
        inFence = true;
        current.push(line);
      } else {
        current.push(line);
        flush(true);
        inFence = false;
      }
      continue;
    }
    if (inFence) current.push(line);
    else if (!line.trim()) {
      flush(false);
    } else current.push(line);
  }
  flush(inFence);
  return parts;
}

function joinParts(parts: Part[]): string {
  return parts
    .map((part) => part.text)
    .filter((text) => text.trim())
    .join('\n\n');
}

/** The reply without the planner narrating its own process. */
export function withoutProcessTalk(reply: string): string {
  const parts = partsOf(reply);
  let changed = false;
  const kept = parts.map((part) => {
    if (part.fenced) return part;
    const text = withoutTalk(part.text);
    if (text !== part.text) changed = true;
    return { ...part, text };
  });
  return changed ? joinParts(kept) : reply;
}

/** The most sentences before a unit map; the rest of the prose goes after it. */
const LEAD_SENTENCES = 2;

/**
 * A unit's map first (Kevin, Nov 23): at most two sentences before it, and
 * everything else the planner wrote before it (its reasons, its questions)
 * moved under it, where a teacher reads it after seeing the days.
 */
export function withUnitMapFirst(reply: string): string {
  const parts = partsOf(reply);
  const at = parts.findIndex((part) => part.fenced && /^\s*```yawp-unit\b/.test(part.text));
  if (at <= 0) return reply;
  const before = parts.slice(0, at);
  const prose = before;
  const proseText = prose.filter((part) => !part.fenced);
  const firstPlain = proseText.findIndex((part) => !/^\s*(?:[-*+]|\d+[.)]|#{1,6}|>|\|)/.test(part.text));
  if (firstPlain < 0) return reply;
  const sentences = splitSentences(proseText[firstPlain]!.text.trim());
  const lead = sentences.slice(0, LEAD_SENTENCES).join(' ');
  const restOfFirst = sentences.slice(LEAD_SENTENCES).join(' ');
  const moved = [
    ...(restOfFirst ? [{ fenced: false, text: restOfFirst }] : []),
    ...prose.filter((part) => part !== proseText[firstPlain]),
  ];
  if (!moved.length) return reply;
  return joinParts([{ fenced: false, text: lead }, parts[at]!, ...moved, ...parts.slice(at + 1)]);
}
