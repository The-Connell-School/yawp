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
  /\bis in the public domain\b[^.!?]*\bso\b/i,
  /\bI['’]m using\b.*\b(?:translation|edition|text)\b/i,
  // Nov 26: "Good — both decks are solid and I can place them precisely."
  /\bI can (?:place|use|fit|slot|build) (?:them|it|these|both)\b/i,
  /\b(?:both|the|these) (?:decks?|lessons?|materials?) (?:is|are) (?:solid|strong|good|great)\b/i,
  // Nov 26: "I've used F. Storr's 1912 translation throughout (public domain), so…"
  /\bI['’]ve used\b.*\b(?:translation|edition|text)\b/i,
  /^(?:Now|And now|Next),? (?:for|here['’]s|here is) the (?:deck|handout|slides|slide deck|materials?)\b/i,
  /^(?:Now )?(?:let me|I['’]ll now|I will now|now I['’]ll)\s+(?:build|write|draft|put|make|create|pull|search|look)\b/i,
  /\b(?:nothing|no lessons?|no decks?) in the (?:Teacher['’]s )?Lounge (?:covers|matches|fits)\b/i,
  /\bthe (?:Short Response|class starter|Daily Pages|writing lesson) library (?:has|had|doesn['’]t have|does not have)\b/i,
  /\bI (?:searched|looked through|checked) (?:the )?(?:Lounge|library|Teacher['’]s Lounge|class starters?|Short Responses?)\b/i,
  // Nov 25: "The Lounge has no García Márquez–specific material, so the unit is built from scratch."
  /\b(?:the )?(?:Teacher['’]s )?(?:Lounge|library) (?:has|had) (?:no|nothing)\b/i,
  /\b(?:is|was) built from scratch\b/i,
  /\bI['’]ve (?:written|drafted|created|made|built)\b[^.!?]*\b(?:myself|from scratch)\b/i,
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

const INTRO_TO_MAP = /^(?:here['’]?s|here is|below is|this is)\b[^.!?\n]{0,80}\b(?:map|unit|days?|plan|arc)\b[^.!?\n]{0,40}:$/i;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;

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
  // A line that only introduces the map ("Here's the full eight-day map:") or a
  // bare rule says nothing once it sits under the map (Nov 25): it goes.
  const kept = moved.filter((part) => part.fenced || !(INTRO_TO_MAP.test(part.text.trim()) || RULE.test(part.text.trim())));
  if (!moved.length) return reply;
  return joinParts([{ fenced: false, text: lead }, parts[at]!, ...kept, ...parts.slice(at + 1).filter((part) => part.fenced || !RULE.test(part.text.trim()))]);
}

/**
 * A line of the class-starter cluster the planner is told to show the teacher:
 * "- **Day 1** — 'How do people gain power?'", "- Days 2 and 5: “…”",
 * "- Day 3 (FW-013): *…*". The day numbers, then the prompt in quotation marks
 * or italics.
 */
const STARTER_LINE =
  /^\s*(?:[-*+]|\d+[.)])\s+\**(Days?\s+[\d\s,&–-]+(?:and\s+\d+)?)\**\s*(?:\([^)]*\))?\**\s*[—–:-]+\s*\**\s*(?:Class starter:?\s*)?[“"‘'*_]+(.+?)[”"’'*_]+\.?\s*(?:\([^)]*\))?\s*$/i;

function dayNumbers(head: string): number[] {
  const range = head.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    return to >= from && to - from < 30 ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [];
  }
  return [...head.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/**
 * The unit's class starters on the days they open (Kevin, Nov 25: the
 * planner listed them under the map, "Day 1 — '…'" eight times over, a wall
 * of text set apart from the days). Each prompt goes onto its day's row,
 * where the board shows it, and the list and its lead-in leave the prose. A
 * day the planner already gave a starter keeps its own.
 */
export function withStartersOnDays(reply: string): string {
  const parts = partsOf(reply);
  const at = parts.findIndex((part) => part.fenced && /^\s*```yawp-unit\b/.test(part.text));
  if (at < 0) return reply;
  const fence = parts[at]!.text;
  const open = fence.indexOf('\n');
  const close = fence.lastIndexOf('```');
  let unit: { days?: Array<Record<string, unknown>> };
  try {
    unit = JSON.parse(fence.slice(open + 1, close));
  } catch {
    return reply;
  }
  if (!Array.isArray(unit.days)) return reply;

  const found = new Map<number, string>();
  const kept: Part[] = [];
  for (const part of parts) {
    if (part.fenced) {
      kept.push(part);
      continue;
    }
    const lines = part.text.split('\n');
    const matches = lines.map((line) => line.match(STARTER_LINE));
    if (matches.filter(Boolean).length < 2) {
      kept.push(part);
      continue;
    }
    matches.forEach((match) => {
      if (!match) return;
      for (const n of dayNumbers(match[1]!)) if (!found.has(n)) found.set(n, match[2]!.trim());
    });
    const rest = lines.filter((_, i) => !matches[i]);
    // "Here are the class starters across the unit:" goes with its list.
    const text = rest.length === 1 && /:\s*$/.test(rest[0]!) ? '' : rest.join('\n');
    if (!text.trim() && kept.length && !kept[kept.length - 1]!.fenced && /:\s*$/.test(kept[kept.length - 1]!.text) && splitSentences(kept[kept.length - 1]!.text.trim()).length <= 2) {
      kept.pop();
    }
    kept.push({ fenced: false, text });
  }
  if (!found.size) return reply;

  for (const day of unit.days) {
    const n = typeof day.day === 'number' ? day.day : null;
    if (n !== null && found.has(n) && !day.starter && !day.classStarter) day.starter = found.get(n);
  }
  const block = { fenced: true, text: `${fence.slice(0, open)}\n${JSON.stringify(unit, null, 2)}\n\`\`\`` };
  return joinParts(kept.map((part) => (part.text === fence && part.fenced ? block : part)));
}

/**
 * What a unit is built for is said once, on the board (Nov 26: the Gatsby
 * reply said it on the board and again in italics under it), and a card's
 * lead-in never ends on a heading with nothing under it ("One short card:
 * **Before you build:**").
 */
export function withoutRepeatedPurpose(reply: string): string {
  const parts = partsOf(reply);
  const unit = parts.find((part) => part.fenced && /^\s*```yawp-unit\b/.test(part.text));
  const asks = parts.some((part) => part.fenced && /^\s*```yawp-ask\b/.test(part.text));
  const saysPurpose = Boolean(unit && /"builtFor"\s*:/.test(unit.text));
  let changed = false;
  const kept = parts
    .map((part) => {
      if (part.fenced) return part;
      let text = part.text;
      if (saysPurpose) {
        const lines = text.split('\n').filter((line) => !/^\s*[*_]*\s*Built for:/i.test(line));
        text = lines.join('\n');
      }
      if (asks) text = text.replace(/\s*\*\*Before you build:?\*\*\s*$/i, '').replace(/\s*One short card:?\s*$/i, '');
      if (text !== part.text) changed = true;
      return { ...part, text };
    });
  return changed ? joinParts(kept) : reply;
}
