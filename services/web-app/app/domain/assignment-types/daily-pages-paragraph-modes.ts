/**
 * The kinds of paragraph a teacher can ask for in a Daily Pages entry.
 *
 * Daily Pages is short academic paragraph practice, and a teacher chooses the
 * move the class practices: analyzing, arguing a position, comparing, defining
 * a term, interpreting, evaluating, synthesizing. Each move wants its own
 * coaching and its own reading from the grader — a generic tutor supports the
 * student but will not steer them toward the skill the teacher picked.
 *
 * A type layers on top of what is already there rather than replacing it:
 *
 * - Grading keeps the one Daily Pages rubric and adds the type's guidance
 *   beside the writing time, just ahead of the essay. No new rubric, no new
 *   grading assistant to build.
 * - Tutoring keeps the module's own tutor instructions and adds the type's
 *   coaching after them.
 *
 * Rollout is one type at a time. A type is `enabled` only once its guidance is
 * written and checked against the calibration suite; until then a teacher does
 * not see it and the server refuses it. Analyze shipped first, then Argue a
 * position, then Compare, then Define a term, Interpret, Evaluate and
 * Synthesize. All seven are now on.
 *
 * The choice lives on the Assignment (`paragraphMode`), not the assignment
 * type, so the same teacher can run an analysis on Monday and an argument on
 * Thursday. Null means no type was chosen — every assignment written before
 * this existed — and then both layers are empty and nothing changes.
 */

export const PARAGRAPH_MODE_FIELD = 'paragraphMode';

export type ParagraphModeKey =
  | 'analyze'
  | 'argue'
  | 'compare'
  | 'define'
  | 'interpret'
  | 'evaluate'
  | 'synthesize';

export type ParagraphMode = {
  key: ParagraphModeKey;
  label: string;
  /** One line for the teacher choosing it. */
  description: string;
  /** Whether teachers can choose it yet. */
  enabled: boolean;
  /** Added to the grading prompt. Required once enabled. */
  gradingInstructions?: string;
  /** Added to the tutor's system prompt. Required once enabled. */
  tutorInstructions?: string;
};

const ANALYZE_GRADING_INSTRUCTIONS = [
  'The teacher asked for an analysis paragraph. The student should make a claim about how the text works, point to the specific words that show it, and explain how those words do what the student says they do.',
  'The model the student has been taught is Claim-Evidence-Analysis: a claim about the text, the evidence (a quotation or a precise reference), and the analysis that connects them. It is not the only acceptable form — a paragraph may open on the quotation, or weave evidence and analysis together — but a reader should find all three.',
  'The analysis is where this paragraph is won or lost. Explaining what a word or image does, and why it matters to the claim, is analysis. Restating the quotation in other words, summarizing the plot around it, or announcing that the quote "shows" the claim without saying how is not. Weigh this in Development of Thought: a paragraph whose evidence is never explained does not rise above Developing there, however apt the quotation.',
  'Depth of Thought reads the claim about the text: a claim that notices something the passage does not hand over scores higher than one any reader would reach first.',
].join('\n');

const ANALYZE_TUTOR_INSTRUCTIONS = [
  'Today the student is writing an analysis paragraph. Guide them toward the Claim-Evidence-Analysis model, one part at a time, and never write any part of it for them:',
  '',
  '1. Claim. Ask what they are saying about how the text works — not what happens in it. "Nick admires Gatsby" is a summary; "Nick\'s praise lets him keep his distance from Gatsby" is a claim about the text.',
  '',
  '2. Evidence. Ask for the exact words that show it: a short quotation, or the precise moment. If they have quoted a whole passage, ask which few words are doing the work.',
  '',
  '3. Analysis. This is the part students skip. Ask how those words show the claim: what does this word, image, or choice do that another would not? If the student restates the quotation in other words, point that out and ask the question again.',
  '',
  'If the student already has a shape that holds all three — opening on the quotation, say — do not make them rebuild it into this order. The model is a guide to what a reader needs, not a template.',
].join('\n');

const ARGUE_GRADING_INSTRUCTIONS = [
  'The teacher asked the student to argue a position. The student should take a position a reasonable reader could disagree with, give the strongest reason for it, and test it against a specific case: a situation, an example, or a moment in the text where the position might fail and does not, or holds only once it is narrowed.',
  'The model the student has been taught is Position-Reason-Test: the position, the reason that carries it, and the case that tests it. It is not the only acceptable form — a paragraph may open on the case, or let the test sharpen the position at the end — but a reader should find all three. A formal counterargument and rebuttal is not required in a paragraph written this quickly; facing the one case that tests the position is the move.',
  'Depth of Thought reads the position. A position no reader would dispute, or one that settles on "both sides have a point" without choosing, has not taken a position: it does not rise above Developing there, however even-handed it sounds. A position that names the condition under which it holds scores higher than one asserted without limits.',
  'Development of Thought reads the reason and the test. One reason developed well is worth more than three listed. A reason that only restates the position in other words is circular, not support. A position held up only by generalities — "people", "society", "in many situations" — and never tested against a specific case does not rise above Developing there.',
].join('\n');

const ARGUE_TUTOR_INSTRUCTIONS = [
  'Today the student is arguing a position. Guide them toward the Position-Reason-Test model, one part at a time, and never write any part of it for them:',
  '',
  '1. Position. Ask what they would say to someone who disagrees. If no one would disagree, it is not yet a position; if they are saying both sides have a point, ask which side they would choose if they had to.',
  '',
  '2. Reason. Ask for the strongest reason, not the most reasons. If they have listed several, ask which one they would keep if they could only keep one, and why that one.',
  '',
  '3. Test. Ask for one specific case — a situation, an example, or a moment in the text — where the position could fail. Does it hold there? If it only holds once it is narrowed, help them see that the narrower position is the stronger one.',
  '',
  'If the student already has a shape that holds all three — opening on the case, say — do not make them rebuild it into this order. The model is a guide to what a reader needs, not a template.',
].join('\n');

const COMPARE_GRADING_INSTRUCTIONS = [
  'The teacher asked for a comparison paragraph. The student should name what the two things share that makes comparing them worth doing, narrow to the one difference that matters most, show that difference in both of them, and say what it reveals that neither shows alone.',
  'The model the student has been taught is Basis-Difference-Significance: the basis of the comparison, the difference, and its significance. It is not the only acceptable form — a paragraph may open on the difference, or let the significance arrive in the last sentence — but a reader should find all three. A comparison may turn on a likeness instead of a difference when the prompt allows it; what matters is that it narrows to one point and says why that point matters.',
  'Depth of Thought reads the difference chosen and its significance. A paragraph that lists likenesses and then differences without choosing one to matter is a list, not a comparison: it does not rise above Developing there, however many points it collects. A difference any reader would notice first — one is older, one is a woman — scores lower than one that changes how the two are read, and a difference whose significance is never stated has not been compared yet.',
  'Development of Thought reads the evidence on both sides. The difference should be shown in each of the two things, with a quotation, a precise moment, or a concrete detail from each, and the two held side by side rather than described in turn. Two separate summaries, one for each thing, joined by "similarly" or "on the other hand", are not a comparison; a paragraph whose evidence comes from only one side does not rise above Developing there.',
].join('\n');

const COMPARE_TUTOR_INSTRUCTIONS = [
  'Today the student is writing a comparison paragraph. Guide them toward the Basis-Difference-Significance model, one part at a time, and never write any part of it for them:',
  '',
  '1. Basis. Ask what the two things have in common that makes comparing them worthwhile — the same want, the same situation, the same kind of moment. Without that ground, the difference has nothing to stand out against.',
  '',
  '2. Difference. Ask for the one difference that matters most, not every difference they can find. If they have listed several, ask which one they would keep if they could only keep one. Then ask them to show it in both: where in each does that difference appear?',
  '',
  '3. Significance. This is the part students skip. Ask what the difference reveals: what can a reader see by holding the two together that they could not see in either alone? If the student says the two are "different but similar", ask them what the difference changes.',
  '',
  'If the student already has a shape that holds all three — opening on the difference, say — do not make them rebuild it into this order. The model is a guide to what a reader needs, not a template.',
].join('\n');

const DEFINE_GRADING_INSTRUCTIONS = [
  'The teacher asked the student to define a term. The student should draw a boundary around the term — say what it takes in and what it leaves out — give one case that plainly falls inside it, and test the boundary against a hard case: one that sits near the line, looks like it belongs and does not, or does not look like it belongs and does.',
  'The model the student has been taught is Boundary-Example-Hard Case: the boundary, the example that clearly fits it, and the hard case that tests where it falls. It is not the only acceptable form — a paragraph may open on the hard case and build the boundary from it, or define the term against its nearest neighbor — but a reader should find all three.',
  'Depth of Thought reads the boundary. A dictionary definition, or one so broad that nothing falls outside it, has not drawn a boundary: it does not rise above Developing there, however accurate. A boundary that separates the term from its nearest neighbor (courage from recklessness, a mistake from a failure) scores higher than one that only lists what the term is like.',
  'Development of Thought reads the example and the hard case. Examples that fit easily illustrate a definition; they do not test it. A definition never tested against a hard case does not rise above Developing there, however many easy examples it gives. A hard case that makes the student sharpen the boundary is the strongest development, not a weakness.',
].join('\n');

const DEFINE_TUTOR_INSTRUCTIONS = [
  'Today the student is defining a term. Guide them toward the Boundary-Example-Hard Case model, one part at a time, and never write any part of it for them:',
  '',
  "1. Boundary. Ask what the term takes in and what it leaves out. If they have given a dictionary definition, ask what would almost count and not quite. The term's nearest neighbor helps: what separates courage from recklessness?",
  '',
  '2. Example. Ask for one case that clearly falls inside the boundary — a specific one, not "when someone is brave".',
  '',
  '3. Hard case. This is the part students skip. Ask for a case near the line: one that looks like it belongs and does not, or the other way round. Which side does their boundary put it on? If the case makes the boundary move, help them see that the sharper definition is the stronger one.',
  '',
  'If the student already has a shape that holds all three — opening on the hard case, say — do not make them rebuild it into this order. The model is a guide to what a reader needs, not a template.',
].join('\n');

const INTERPRET_GRADING_INSTRUCTIONS = [
  'The teacher asked for an interpretation. The student should offer a reading of what the passage means — beyond what it literally says — point to the words that support it, and defend the reading: show why those words point to this meaning rather than the obvious one, or another a careful reader might reach.',
  'The model the student has been taught is Reading-Evidence-Defense: the reading, the words that support it, and the defense of it against the obvious reading. It is not the only acceptable form — a paragraph may start from the plain reading and turn against it, or let the defense come first — but a reader should find all three.',
  'Depth of Thought reads the reading. Paraphrasing what the passage says, or naming a theme that would fit any text ("it shows that love is powerful"), is not an interpretation: it does not rise above Developing there. A reading that another careful reader could dispute, and that the passage still supports, scores higher than one any reader would reach first.',
  "Development of Thought reads the evidence and the defense. A reading asserted without the passage's own words does not rise above Developing there, however interesting. Weigh whether the student shows how the words support this reading over the obvious one: evidence that would fit any reading equally well has not defended it.",
].join('\n');

const INTERPRET_TUTOR_INSTRUCTIONS = [
  'Today the student is interpreting a passage. Guide them toward the Reading-Evidence-Defense model, one part at a time, and never write any part of it for them:',
  '',
  '1. Reading. Ask what the passage means, not what it says. If they have paraphrased it, ask what a reader comes to understand that the words never state outright. A theme that would fit any book ("love is powerful") is not yet a reading of this passage.',
  '',
  '2. Evidence. Ask for the exact words that support the reading: a short quotation, or the precise moment. If the words they chose would fit any reading, ask which words only make sense under theirs.',
  '',
  '3. Defense. This is the part students skip. Ask what the obvious reading is, and why the words point to theirs instead. If they cannot say, the reading may need to change; help them see that.',
  '',
  'If the student already has a shape that holds all three — starting from the obvious reading and turning against it, say — do not make them rebuild it into this order. The model is a guide to what a reader needs, not a template.',
].join('\n');

const EVALUATE_GRADING_INSTRUCTIONS = [
  'The teacher asked for an evaluation. The student should deliver a judgment — right or wrong, worth it or not, earned or unearned — name the standard it judges by, and measure a specific case against that standard: a decision, a moment, or a result held up to the standard and shown to meet it or fall short.',
  'The model the student has been taught is Judgment-Standard-Evidence: the verdict, the measure it is reached by, and the case measured against it. It is not the only acceptable form — a paragraph may name the standard before it delivers the verdict, or let the evidence lead — but a reader should find all three.',
  'Depth of Thought reads the judgment and its standard. A verdict whose standard is never named ("it was a bad decision") is an opinion, not an evaluation: it does not rise above Developing there, however confident. A standard the student chooses and justifies — why this measure and not another — scores higher than one assumed without thought, and a judgment that weighs a real cost against a real gain scores higher than one that finds nothing on the other side.',
  'Development of Thought reads the evidence. A judgment that has no specific case measured against its standard does not rise above Developing there. Weigh whether the student actually holds the case up to the standard they named; switching to a different standard partway through is a lapse in development, not a second reason.',
].join('\n');

const EVALUATE_TUTOR_INSTRUCTIONS = [
  'Today the student is evaluating. Guide them toward the Judgment-Standard-Evidence model, one part at a time, and never write any part of it for them:',
  '',
  '1. Judgment. Ask for the verdict: was it right, was it worth it, did it work? If they are hedging, ask which way they lean, and how far.',
  '',
  '2. Standard. This is the part students skip. Ask what they are judging by — right by what measure? A choice can be loyal and still unwise. If they cannot name a standard, ask what would have to be true for them to reach the opposite verdict.',
  '',
  '3. Evidence. Ask for the specific decision, moment, or result they are holding up to the standard, and how it measures up. If they switch to a different standard partway through, point that out.',
  '',
  'If the student already has a shape that holds all three — naming the standard before the verdict, say — do not make them rebuild it into this order. The model is a guide to what a reader needs, not a template.',
].join('\n');

const SYNTHESIZE_GRADING_INSTRUCTIONS = [
  'The teacher asked for a synthesis. The student should bring two or more sources together into one point that neither makes alone, show the specific thing each source contributes, and explain how the pieces connect to produce the point: where one source explains, limits, or answers the other, or shows what the other cannot.',
  'The model the student has been taught is Point-Sources-Connection: the point, what each source contributes to it, and how they connect. It is not the only acceptable form — a paragraph may set the sources side by side before naming the point it draws from them — but a reader should find all three.',
  'Depth of Thought reads the point. A paragraph that summarizes one source and then the other, or ends on "both sources show" something either source already says alone, has not synthesized: it does not rise above Developing there. A point that only appears when the sources are read together scores higher than one either source hands over.',
  'Development of Thought reads the sources and the connection. Each source should contribute something specific — a finding, a detail, a quotation — not a general mention. A second source that only decorates a point the first already makes does not rise above Developing there. The connection is where this paragraph is won: saying how one source changes what the other means.',
].join('\n');

const SYNTHESIZE_TUTOR_INSTRUCTIONS = [
  'Today the student is writing a synthesis paragraph. Guide them toward the Point-Sources-Connection model, one part at a time, and never write any part of it for them:',
  '',
  '1. Point. Ask what they see when they put the sources together that neither says alone. If one source already says it, it is a summary of that source, not yet a synthesis.',
  '',
  '2. Sources. Ask what each source contributes: one specific finding, detail, or quotation from each, not a summary of the whole thing.',
  '',
  '3. Connection. This is the part students skip. Ask how the pieces fit: does one explain, limit, or contradict the other? If they have written one summary and then another, ask what the second source changes about the first.',
  '',
  'If the student already has a shape that holds all three — setting the sources side by side before the point, say — do not make them rebuild it into this order. The model is a guide to what a reader needs, not a template.',
].join('\n');

export const DAILY_PAGES_PARAGRAPH_MODES: readonly ParagraphMode[] = [
  {
    key: 'analyze',
    label: 'Analyze',
    description:
      'A claim about how the text works, the words that show it, and an explanation of how they do it (Claim-Evidence-Analysis).',
    enabled: true,
    gradingInstructions: ANALYZE_GRADING_INSTRUCTIONS,
    tutorInstructions: ANALYZE_TUTOR_INSTRUCTIONS,
  },
  {
    key: 'argue',
    label: 'Argue a position',
    description:
      'A position someone could disagree with, its strongest reason, and a specific case that tests it (Position-Reason-Test).',
    enabled: true,
    gradingInstructions: ARGUE_GRADING_INSTRUCTIONS,
    tutorInstructions: ARGUE_TUTOR_INSTRUCTIONS,
  },
  {
    key: 'compare',
    label: 'Compare',
    description:
      'What two things share, the one difference that matters, shown in both, and what it reveals (Basis-Difference-Significance).',
    enabled: true,
    gradingInstructions: COMPARE_GRADING_INSTRUCTIONS,
    tutorInstructions: COMPARE_TUTOR_INSTRUCTIONS,
  },
  {
    key: 'define',
    label: 'Define a term',
    description:
      'A boundary drawn around a term, one case that clearly fits it, and a hard case that tests where the line falls (Boundary-Example-Hard Case).',
    enabled: true,
    gradingInstructions: DEFINE_GRADING_INSTRUCTIONS,
    tutorInstructions: DEFINE_TUTOR_INSTRUCTIONS,
  },
  {
    key: 'interpret',
    label: 'Interpret',
    description:
      'A reading of what a passage means beyond what it says, the words that support it, and a defense of it against the obvious reading (Reading-Evidence-Defense).',
    enabled: true,
    gradingInstructions: INTERPRET_GRADING_INSTRUCTIONS,
    tutorInstructions: INTERPRET_TUTOR_INSTRUCTIONS,
  },
  {
    key: 'evaluate',
    label: 'Evaluate',
    description:
      'A judgment, the standard it judges by, and a specific case measured against that standard (Judgment-Standard-Evidence).',
    enabled: true,
    gradingInstructions: EVALUATE_GRADING_INSTRUCTIONS,
    tutorInstructions: EVALUATE_TUTOR_INSTRUCTIONS,
  },
  {
    key: 'synthesize',
    label: 'Synthesize',
    description:
      'One point that two or more sources make together and neither makes alone, what each contributes, and how they connect (Point-Sources-Connection).',
    enabled: true,
    gradingInstructions: SYNTHESIZE_GRADING_INSTRUCTIONS,
    tutorInstructions: SYNTHESIZE_TUTOR_INSTRUCTIONS,
  },
];

/**
 * Whether an assignment type takes a paragraph type at all: Daily Pages does,
 * and only while at least one type is switched on.
 */
export function offersParagraphModesForKind(
  kind: string | null | undefined
): boolean {
  return kind === 'daily_pages' && enabledParagraphModes().length > 0;
}

export function enabledParagraphModes(): ParagraphMode[] {
  return DAILY_PAGES_PARAGRAPH_MODES.filter((mode) => mode.enabled);
}

/** A switched-on type by key, or null for anything else. */
export function getParagraphMode(
  key: string | null | undefined
): ParagraphMode | null {
  if (!key) return null;
  return (
    DAILY_PAGES_PARAGRAPH_MODES.find(
      (mode) => mode.key === key && mode.enabled
    ) ?? null
  );
}

/**
 * The label for any stored type, switched on or not. For showing a teacher
 * what an existing assignment was set to; choosing a type still goes through
 * `getParagraphMode`, which only returns switched-on ones.
 */
export function paragraphModeLabel(
  key: string | null | undefined
): string | null {
  if (!key) return null;
  return (
    DAILY_PAGES_PARAGRAPH_MODES.find((mode) => mode.key === key)?.label ?? null
  );
}

export type ParseParagraphModeResult =
  | { success: true; value: ParagraphModeKey | null }
  | { success: false; message: string };

/** Absent or blank means no type was chosen. */
export function parseParagraphMode(
  formData: FormData
): ParseParagraphModeResult {
  const raw = formData.get(PARAGRAPH_MODE_FIELD)?.toString().trim() ?? '';
  if (!raw) return { success: true, value: null };
  const mode = getParagraphMode(raw);
  if (!mode) {
    return { success: false, message: 'Paragraph type is not available.' };
  }
  return { success: true, value: mode.key };
}

/**
 * Several types, read from a form's checkboxes (one value per ticked box).
 * None ticked is any kind of paragraph. Any type that is not switched on
 * refuses the whole choice rather than quietly dropping it.
 */
export type ParseParagraphModesResult =
  | { success: true; value: ParagraphModeKey[] }
  | { success: false; message: string };

export function parseParagraphModes(
  formData: FormData
): ParseParagraphModesResult {
  const raw = formData
    .getAll(PARAGRAPH_MODE_FIELD)
    .map((value) => value.toString().trim())
    .filter(Boolean);
  if (raw.some((key) => !getParagraphMode(key))) {
    return { success: false, message: 'Paragraph type is not available.' };
  }
  return { success: true, value: switchedOnModes(raw).map((mode) => mode.key) };
}

/**
 * The types a stored assignment or document practices. The list column wins;
 * rows written before it existed carry one type in the single column, and
 * read as that one type. Stored types are kept even if since switched off, so
 * a teacher still sees what was chosen; the prompt layers skip them.
 */
export function effectiveParagraphModes(
  row:
    | {
        paragraphModes?: readonly string[] | null;
        paragraphMode?: string | null;
      }
    | null
    | undefined
): string[] {
  if (row?.paragraphModes?.length) return [...row.paragraphModes];
  return row?.paragraphMode ? [row.paragraphMode] : [];
}

/** Labels for stored types, switched on or not. */
export function paragraphModeLabels(keys: readonly string[]): string[] {
  return keys
    .map((key) => paragraphModeLabel(key))
    .filter((label): label is string => label !== null);
}

/** Switched-on types among `keys`, in the registry's order, once each. */
function switchedOnModes(
  keys: string | readonly string[] | null | undefined
): ParagraphMode[] {
  const wanted = new Set(typeof keys === 'string' ? [keys] : (keys ?? []));
  return DAILY_PAGES_PARAGRAPH_MODES.filter(
    (mode) => mode.enabled && wanted.has(mode.key)
  );
}

function joinLabels(modes: ParagraphMode[]) {
  return modes.map((mode) => mode.label).join(' and ');
}

/**
 * The grading layer: one block per chosen type. Empty when none is chosen.
 * One type reads exactly as it always has.
 */
export function buildParagraphModeGradingBlock(
  keys: string | readonly string[] | null | undefined
): string {
  const modes = switchedOnModes(keys).filter(
    (mode) => mode.gradingInstructions
  );
  const blocks = modes.map(
    (mode) => `Paragraph type: ${mode.label}\n${mode.gradingInstructions}`
  );
  if (blocks.length <= 1) return blocks[0] ?? '';
  return [
    `This paragraph combines ${modes.length} moves: ${joinLabels(modes)}. Read for each. One paragraph can do both, and it need not do them in a set order.`,
    ...blocks,
  ].join('\n\n');
}

/** The tutor layer: one block per chosen type. Empty when none is chosen. */
export function buildParagraphModeTutorInstructions(
  keys: string | readonly string[] | null | undefined
): string {
  const modes = switchedOnModes(keys).filter((mode) => mode.tutorInstructions);
  const blocks = modes.map(
    (mode) => `PARAGRAPH TYPE: ${mode.label}\n${mode.tutorInstructions}`
  );
  if (blocks.length <= 1) return blocks[0] ?? '';
  return [
    `This paragraph combines ${modes.length} moves: ${joinLabels(modes)}. Coach whichever the draft needs most first, one part at a time, and do not make the student write two paragraphs.`,
    ...blocks,
  ].join('\n\n');
}
