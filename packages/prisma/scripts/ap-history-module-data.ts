// Canonical section (module) definitions for the AP History Essay assignment
// type, shared by the production, local-dev, and e2e seeds so every
// environment gets the same writing-process breakdown.
//
// Both DBQ and LEQ assignments share these modules (modules hang off the
// assignment type, not the essay type), so each section's guidance covers
// both flows. The AP tutor system prompt appends `tutorInstructions` for the
// section the student is currently in.
//
// Position 1 intentionally replaces the legacy single "AP History Essay"
// module in place: existing documents keep their position-1 session and can
// advance into the new sections, which are created on demand.

export type ApHistoryModuleDefinition = {
  title: string;
  position: number;
  description: string;
  tutorInstructions: string;
  instructions: Array<{
    title: string;
    prompt: string;
    position: number;
    showChatButton: boolean;
  }>;
};

export const AP_HISTORY_MODULES: ApHistoryModuleDefinition[] = [
  {
    title: 'Read the Documents',
    position: 1,
    description:
      'Break down the sources before writing: what each document says, who is behind it, and how they group. LEQ writers build an evidence inventory instead.',
    tutorInstructions: `Current section: Reading the Documents.
DBQ: help the student build a working sense of each document — what it says, plus one HIPP angle (point of view, purpose, historical situation, or intended audience) — and land on 2–3 thematic groupings that could anchor body paragraphs.
LEQ (no documents): unpack what the prompt is really asking, then build an inventory of 5+ specific named pieces of evidence (laws, people, events, court cases) inside the prompt's date window.
Keep the focus on source work and evidence gathering rather than thesis-writing or drafting. If the student already has a draft underway, meet them where they are — use this section to shore up their document use or evidence base instead of insisting they start over.`,
    instructions: [
      {
        title: 'Analyze the sources',
        prompt:
          "Before you write a word, let's dig into the materials. Writing a DBQ? We'll work through the documents — what each says, who's behind it, and which ones belong together. Writing an LEQ? No documents, so we'll build your inventory of specific evidence instead. Tell me when you've read the prompt and we'll get started.",
        position: 1,
        showChatButton: true,
      },
    ],
  },
  {
    title: 'Pre-Writing',
    position: 2,
    description:
      'Plan before drafting: a defensible thesis with a clear line of reasoning, plus specific contextualization.',
    tutorInstructions: `Current section: Pre-Writing.
Coach the student to a historically defensible thesis with an explicit line of reasoning — a real "because" clause structured around the categories their body paragraphs will follow (for a DBQ, the document groupings; for an LEQ, the evidence categories). A thesis that restates the prompt is not done.
Then push for 2–3 specific contextualization sentences that situate the prompt in a longer historical arc — specific history, not "it was a time of change."
Hold off on full body paragraphs in this section; planning here pays off in drafting. If the student already has a draft underway, meet them where they are and use this section to sharpen the thesis and context they have.`,
    instructions: [
      {
        title: 'Plan your essay',
        prompt:
          "Time to plan. Two jobs in this section: nail down your thesis — a defensible claim with a clear line of reasoning, not a restatement of the prompt — and sketch the contextualization that sets up your argument. Share your working thesis, or ask me for help getting started.",
        position: 1,
        showChatButton: true,
      },
    ],
  },
  {
    title: 'Drafting',
    position: 3,
    description:
      'Write the essay: argument-first body paragraphs that use documents and evidence to support claims.',
    tutorInstructions: `Current section: Drafting.
Coach body paragraphs that lead with the argument, not the evidence.
DBQ: weave 2–3 documents into each paragraph as evidence for a claim (never a walk-through of documents in order), source at least 2 documents with HIPP relevance that connects back to the argument, and work in specific outside evidence from inside the prompt's date window.
LEQ: use specific named evidence as argument rather than a list of facts, and make the reasoning skill (causation, comparison, continuity and change) visible in the paragraph structure.
Watch for the failure modes — describing instead of arguing, HIPP without relevance, generic evidence — and surface them as they appear.`,
    instructions: [
      {
        title: 'Draft your essay',
        prompt:
          "Now write your draft in the editor. Lead each body paragraph with an argument, then bring in your documents and evidence to back it up. Check in with me anytime — I can help you weave in evidence, source documents, or get unstuck on a paragraph.",
        position: 1,
        showChatButton: true,
      },
    ],
  },
  {
    title: 'Revision',
    position: 4,
    description:
      'A whole-essay pass against the rubric, pushing hardest on the complexity point.',
    tutorInstructions: `Current section: Revision.
Run a whole-essay pass against the rubric — thesis, contextualization, evidence use (DBQ: document use and sourcing; LEQ: evidence specificity and reasoning), and complexity.
Push hardest on the complexity point: qualification ("while X dominated, Y persisted"), multiple causation or perspectives, or connection across periods. Length is not sophistication.
Never tell the student they are "ready to submit" — that is their call.`,
    instructions: [
      {
        title: 'Revise your essay',
        prompt:
          "Last section: revision. Let's take a full pass through your draft against the rubric, with a special eye on the complexity point — the one most essays leave on the table. Ask me to review whenever you're ready.",
        position: 1,
        showChatButton: true,
      },
    ],
  },
];
