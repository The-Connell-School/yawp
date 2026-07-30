// Shared contract for the AP English Language prompt generator.
//
// The generator is a third way a teacher can start AP Lang work (alongside
// "Document" and "Assignment"): instead of browsing the curated library, the
// teacher describes what they want and works with the LLM to draft a new
// prompt in the style of a College Board free-response question.
//
// SCOPE — the generator drafts Q3 ARGUMENT prompts only.
//
// Q1 synthesis needs a six-source packet and Q2 rhetorical analysis needs a
// genuine passage. This course's sourcing policy (see
// packages/prisma/scripts/ap-english-lang-library-data.ts) is explicit that
// quotations attributed to real outlets or writers must never be fabricated,
// and an LLM drafting source packets on demand is exactly how fabricated
// quotations reach students. Argument prompts carry no provided text, so they
// generate safely. Q1/Q2 stay a curated-library job.
//
// This file is framework-free (no server-only imports) so it can be unit
// tested and its types shared with the client.

import { z } from 'zod';

/** Closed vocabulary, matching ApEnglishLangFrqTypeSchema. */
export const AP_ENGLISH_LANG_FRQ_TYPES = [
  'synthesis',
  'rhetorical_analysis',
  'argument',
] as const;

/** Closed vocabulary, matching the curated library's difficulty values. */
export const AP_ENGLISH_LANG_DIFFICULTIES = [
  'entry',
  'developing',
  'exam-ready',
] as const;

/**
 * The library-vocabulary tags the generator gave a draft. Every field is
 * optional — tagging is best-effort, and a saved prompt is still useful
 * untagged.
 */
export type SavedPromptFacets = {
  frqType?: (typeof AP_ENGLISH_LANG_FRQ_TYPES)[number];
  focusSkill?: string;
  difficulty?: (typeof AP_ENGLISH_LANG_DIFFICULTIES)[number];
};

/** A prompt the teacher generated and saved, as returned by the loader. */
export type SavedApEnglishLangPrompt = {
  id: string;
  title: string;
  prompt: string;
  /** ISO timestamp of when it was saved. */
  savedAt: string;
  facets: SavedPromptFacets;
};

/** One turn in the teacher <-> LLM conversation. */
export type GeneratorMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * A finished, ready-to-assign AP Lang argument prompt the LLM has drafted.
 *
 * `title` and `prompt` are load-bearing — they are what land on the assignment.
 * The tags mirror the library's vocabulary so a draft reads like a library row;
 * when the model tags a draft with something outside the vocabulary we drop the
 * tag rather than lose the draft.
 */
export const GeneratedPromptSchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  frqType: z.enum(AP_ENGLISH_LANG_FRQ_TYPES).optional().catch(undefined),
  focusSkill: z.string().min(1).max(80).optional().catch(undefined),
  difficulty: z.enum(AP_ENGLISH_LANG_DIFFICULTIES).optional().catch(undefined),
});

export type GeneratedPrompt = z.infer<typeof GeneratedPromptSchema>;

/** How many distinct options we ask the model to draft each time. */
export const GENERATOR_OPTION_COUNT = 3;

/**
 * The model answers with this shape on every turn: a conversational `reply`
 * plus, when it has enough to draft, a set of distinct `options`. Keeping the
 * two separate lets the UI show the chat message and a pageable set of
 * assignable prompt cards. A singular `prompt` object is coerced into `options`
 * so an older-style response still works.
 */
export const GeneratorResponseSchema = z
  .object({
    reply: z.string().min(1),
    options: z.array(GeneratedPromptSchema).optional(),
    prompt: GeneratedPromptSchema.nullable().optional(),
  })
  .transform(({ reply, options, prompt }) => ({
    reply,
    options: options && options.length > 0 ? options : prompt ? [prompt] : [],
  }));

export type GeneratorResponse = z.infer<typeof GeneratorResponseSchema>;

/** How many turns of history we keep/forward to keep the request bounded. */
export const MAX_GENERATOR_MESSAGES = 24;

/**
 * Output token budget. Argument prompts are a short paragraph each, but the
 * budget must comfortably fit GENERATOR_OPTION_COUNT of them plus the reply —
 * if the model runs out of tokens mid-object the JSON is truncated and cannot
 * be parsed, which is what leaks raw JSON into the chat.
 */
export const MAX_GENERATOR_OUTPUT_TOKENS = 2500;

/** Longest single teacher message we accept, in characters. */
export const MAX_GENERATOR_MESSAGE_LENGTH = 4000;

/** Turn a saved prompt into a row the library can filter and render. */
export function savedPromptToLibraryEntry(saved: SavedApEnglishLangPrompt) {
  return {
    externalKey: `saved:${saved.id}`,
    title: saved.title,
    prompt: saved.prompt,
    // Everything the generator drafts is an argument prompt; the tag is only a
    // fallback for rows saved before the model tagged them.
    frqType: saved.facets.frqType ?? 'argument',
    focusSkill: saved.facets.focusSkill ?? 'line-of-reasoning',
    difficulty: saved.facets.difficulty ?? null,
    // A generated prompt is always Q3, which provides no source material.
    sources: [],
    collection: 'mine' as const,
    savedAt: saved.savedAt,
  };
}
