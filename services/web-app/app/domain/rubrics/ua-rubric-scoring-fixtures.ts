/** Approved exemplary Introduction for GBA 300: International Etiquette. */
export const GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY = `Japan and Brazil sit at opposite ends of how business relationships are built. Japan relies on formality, hierarchy, and indirect communication, while Brazil leans on personal warmth, flexible timing, and rapport before deal talk. That contrast makes the pairing useful for anyone preparing teams for negotiations, client visits, or cross-border partnerships. Studying both side by side helps a manager avoid reading Brazilian informality as unprofessional or Japanese reserve as disinterest.`;

/** Country 1 (Japan): two on-task topics, six sentences each, descriptive subheadings. */
export const GBA300_ETIQUETTE_COUNTRY_1_EXEMPLARY = `Hierarchy in First Meetings
In Japan, a businessperson should wait to be seated and defer to the senior person before speaking in a first meeting. Titles and family names signal respect, so using "-san" until invited to use a first name avoids sounding overly familiar. Lower-status participants often confirm decisions through their manager rather than committing on the spot. A visitor who skips the hierarchy and speaks only to the most junior contact may be seen as disrespectful even when the message is polite. For global teams, this means assigning a senior sponsor on the Japanese side before expecting final answers. Global Road Warrior, Japan.

Reading Indirect Negotiation Signals
Japanese negotiators may express hesitation through silence, vague timing, or requests to consult internally rather than saying "no" directly. A businessperson should treat "that will be difficult" as a serious objection requiring clarification, not a minor delay. Pushing for an immediate yes can damage trust because direct refusal is often avoided to preserve harmony. Written follow-ups that restate agreed points help confirm understanding without forcing public disagreement. Managers preparing teams should coach them to pause, ask clarifying questions, and allow time for internal alignment. Global Road Warrior, Japan.`;

/** Country 2 (Brazil): parallel topics that contrast with Japan for the conclusion. */
export const GBA300_ETIQUETTE_COUNTRY_2_EXEMPLARY = `Building Rapport Before Business Talk
In Brazil, initial meetings often open with personal conversation about family, sports, or city life before the agenda starts. A businessperson should accept coffee or small talk as part of the work rather than rushing to slides. Handshakes may be longer and accompanied by eye contact and warmth that signal sincerity. Skipping rapport can make a foreign visitor seem cold even when their data is strong. For global managers, scheduling extra time at the front of meetings prevents misreading Brazilian warmth as off-topic chatter. Global Road Warrior, Brazil.

Flexible Timing and Direct Feedback
Brazilian meetings may start later than scheduled and shift as relationships develop, so rigid clock-watching can frustrate partners. Once rapport exists, feedback can be more direct and expressive than in Japan, including animated disagreement that still signals engagement. A businessperson should respond to frank comments with calm clarification instead of interpreting volume as hostility. Confirming next steps in writing after a lively discussion prevents drift when schedules flex. The contrast with Japan's indirect style means teams need different briefing notes for each market. Global Road Warrior, Brazil.`;

/** Conclusion: four sentences with comparative insight for global business. */
export const GBA300_ETIQUETTE_CONCLUSION_EXEMPLARY = `Japan and Brazil both value respectful relationships, but Japan prioritizes hierarchy and indirect signals while Brazil prioritizes warmth and flexible, expressive conversation. A manager who uses one playbook in both markets will misread silence in Tokyo as agreement and misread Brazilian directness as conflict. The practical lesson is to match preparation time, meeting structure, and follow-up style to each culture's communication norms. Teams that train for both patterns negotiate more effectively across the Pacific and Latin America.`;

/** Full exemplary essay used for end-to-end grading-request validation. */
export const GBA300_ETIQUETTE_FULL_EXEMPLARY = [
  GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY,
  '',
  'Japan',
  GBA300_ETIQUETTE_COUNTRY_1_EXEMPLARY,
  '',
  'Brazil',
  GBA300_ETIQUETTE_COUNTRY_2_EXEMPLARY,
  '',
  'Conclusion',
  GBA300_ETIQUETTE_CONCLUSION_EXEMPLARY,
].join('\n');

/** Expected raw score when the Introduction earns the top band. */
export const GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY_SCORE = 5;

/** Exemplary raw-point scores for every International Etiquette category. */
export const GBA300_ETIQUETTE_EXEMPLARY_SCORES = {
  introduction: 5,
  country_1_its_two_topics: 20,
  country_2_its_two_topics: 20,
  conclusion: 5,
} as const;

/** Scores that would appear on a misconfigured generic 100-point scale. */
export const GBA300_ETIQUETTE_INVALID_GENERIC_SCORES = {
  introduction: 100,
  country_1_its_two_topics: 100,
  country_2_its_two_topics: 100,
  conclusion: 100,
} as const;

/** Sentence caps from the student rubric. */
export const GBA300_ETIQUETTE_SENTENCE_CAPS = {
  introduction: 4,
  countryTopic: 6,
  conclusion: 4,
} as const;

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function countSentences(text: string) {
  return splitSentences(text).length;
}

/** Count sentences in each Japan/Brazil topic block (text after the subheading line). */
export function countTopicBlockSentences(block: string) {
  const paragraphs = block
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.map((paragraph) => {
    const lines = paragraph.split('\n');
    const body = lines.slice(1).join(' ').trim() || lines.join(' ').trim();
    return countSentences(body);
  });
}
