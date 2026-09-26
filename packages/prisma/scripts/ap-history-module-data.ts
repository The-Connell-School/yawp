// Canonical section (module) definitions for the AP History Essay assignment
// type, shared by the production, local-dev, and e2e seeds so every
// environment gets the same writing-process breakdown.
//
// DBQ and LEQ are genuinely different assignments, so each section's tutor
// guidance and student-facing opening message is authored separately for the
// two essay types instead of hedging with "DBQ: ... / LEQ: ..." in a single
// string. Modules still hang off the assignment type (not the essay type), so
// the DB stores one representative variant per module; the runtime selects the
// correct variant from the document's AP History snapshot (which carries the
// essay type). See:
//   - services/web-app/app/routes/api.domain.tutor-response/route.ts
//     (essay-type-specific coaching in the tutor system prompt)
//   - services/web-app/app/routes/api.model.assignment-module-session*/route.ts
//     (essay-type-specific opening chat bubble)
//
// Position 1 intentionally replaces the legacy single "AP History Essay"
// module in place: existing documents keep their position-1 session and can
// advance into the new sections, which are created on demand.

import { formatRegisterModeDirective } from './universal-tutor-block';

export type ApHistoryEssayType = 'dbq' | 'leq';

// Which register the Universal YAWP! Tutor Instructions put the student in for
// this section. The universal block defines both modes and defers the choice
// to the course-builder, per module; this is where AP History makes it.
// Mirrors TutorRegisterMode in
// services/web-app/app/domain/tutor/universal-tutor-block.ts, which renders it.
export type ApHistoryRegisterMode = 'drafting' | 'polished';

// A pair of strings, one authored for each essay type.
export type ApHistoryEssayVariants = {
  dbq: string;
  leq: string;
};

export type ApHistoryInstructionDefinition = {
  title: string;
  position: number;
  showChatButton: boolean;
  // The opening chat bubble the tutor posts when the student enters this step,
  // authored per essay type.
  prompt: ApHistoryEssayVariants;
  // Step-level guidance appended to the tutor system prompt after the
  // section-level guidance, narrowing the coach to the step at hand.
  tutorInstructions?: ApHistoryEssayVariants;
};

export type ApHistoryModuleDefinition = {
  title: string;
  position: number;
  description: string;
  // Section-level guidance appended to the tutor system prompt, authored per
  // essay type.
  tutorInstructions: ApHistoryEssayVariants;
  // DRAFTING or POLISHED for this section, per the universal tutor block.
  registerMode: ApHistoryRegisterMode;
  instructions: ApHistoryInstructionDefinition[];
};

// The essay type whose variant is written to the shared DB columns at seed
// time. It is only a fallback: AP History documents always carry a snapshot,
// so the runtime picks the correct variant per essay type. DBQ is the more
// common essay type and a safe default if a snapshot is ever missing.
export const AP_HISTORY_SEED_DEFAULT_ESSAY_TYPE: ApHistoryEssayType = 'dbq';

export const AP_HISTORY_MODULES: ApHistoryModuleDefinition[] = [
  {
    title: 'Read the Documents',
    position: 1,
    description:
      'Get grounded in your materials and evidence before you write a word.',
    // Source notes and evidence inventories are thinking on paper — no
    // mechanics feedback here.
    registerMode: 'drafting',
    tutorInstructions: {
      dbq: `Current section: Reading the Documents.
HIPP stands for:
- Historical situation — what's happening in the world when this is written?
- Intended audience — who is this made for?
- Point of view — what's the author's perspective or bias?
- Purpose — why was this created?
Help the student build a working sense of each document — what it says, plus one HIPP angle (point of view, purpose, historical situation, or intended audience) — and land on 2–3 thematic groupings that could anchor body paragraphs.
Keep the focus on source work rather than thesis-writing or drafting. If the student already has a draft underway, meet them where they are — use this section to shore up their document use instead of insisting they start over.`,
      leq: `Current section: Building your evidence base.
There are no documents on an LEQ, so start by unpacking what the prompt is really asking, then help the student build an inventory of 5+ specific named pieces of evidence (laws, people, events, court cases, treaties) inside the prompt's date window.
Keep the focus on evidence gathering rather than thesis-writing or drafting. If the student already has a draft underway, meet them where they are — use this section to strengthen their evidence base instead of insisting they start over.`,
    },
    instructions: [
      {
        title: 'Analyze the sources',
        prompt: {
          dbq: "Before you write a word, let's dig into the documents. We'll work through them one by one — what each says, who's behind it, and which ones belong together — so your argument is built on the sources from the start. Tell me when you've read the prompt and the documents, and we'll get going.",
          leq: "Before you write a word, let's make sure you've got the evidence to back up an argument. There are no documents on an LEQ, so we'll unpack what the prompt is really asking and build your inventory of specific evidence — named laws, people, events, and court cases. Tell me when you've read the prompt and we'll get started.",
        },
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
    // Planning output, not submitted prose: the working thesis and context
    // sentences get their polish when they move into the introduction under
    // Drafting. Coach the argument here, never the commas.
    registerMode: 'drafting',
    tutorInstructions: {
      dbq: `Current section: Pre-Writing.
Coach the student to a historically defensible thesis with an explicit line of reasoning — a real "because" clause structured around the document groupings their body paragraphs will follow. A thesis that restates the prompt is not done.
Then push for 2–3 specific contextualization sentences that situate the prompt in a longer historical arc — specific history, not "it was a time of change."
Hold off on full body paragraphs in this section; planning here pays off in drafting. If the student already has a draft underway, meet them where they are and use this section to sharpen the thesis and context they have.`,
      leq: `Current section: Pre-Writing.
Coach the student to a historically defensible thesis with an explicit line of reasoning — a real "because" clause structured around the evidence categories their body paragraphs will follow and the reasoning skill the prompt calls for. A thesis that restates the prompt is not done.
Then push for 2–3 specific contextualization sentences that situate the prompt in a longer historical arc — specific history, not "it was a time of change."
Hold off on full body paragraphs in this section; planning here pays off in drafting. If the student already has a draft underway, meet them where they are and use this section to sharpen the thesis and context they have.`,
    },
    instructions: [
      {
        title: 'Plan your essay',
        prompt: {
          dbq: "Time to plan. Two jobs in this section: nail down your thesis — a defensible claim with a clear line of reasoning organized around your document groupings, not a restatement of the prompt — and sketch the contextualization that sets up your argument. Share your working thesis, or ask me for help getting started.",
          leq: "Time to plan. Two jobs in this section: nail down your thesis — a defensible claim with a clear line of reasoning organized around your evidence categories, not a restatement of the prompt — and sketch the contextualization that sets up your argument. Share your working thesis, or ask me for help getting started.",
        },
        position: 1,
        showChatButton: true,
      },
    ],
  },
  {
    title: 'Drafting',
    position: 3,
    description:
      'Write the essay: argument-first body paragraphs that put your evidence to work.',
    // Prose an AP reader will read.
    registerMode: 'polished',
    tutorInstructions: {
      dbq: `Current section: Drafting.
Coach body paragraphs that lead with the argument, not the evidence. Weave 2–3 documents into each paragraph as evidence for a claim (never a walk-through of documents in order), source at least 2 documents with HIPP relevance that connects back to the argument, and work in specific outside evidence from inside the prompt's date window.
Watch for the failure modes — describing instead of arguing, HIPP without relevance, generic outside evidence, period-bleed — and surface them as they appear.`,
      leq: `Current section: Drafting.
Coach body paragraphs that lead with the argument, not the evidence. Use specific named evidence as argument rather than a list of facts, and make the reasoning skill (causation, comparison, continuity and change) visible in the paragraph structure.
Watch for the failure modes — describing instead of arguing, evidence used as a list, generic evidence, narrative drift — and surface them as they appear.`,
    },
    instructions: [
      {
        title: 'Introduction',
        prompt: {
          dbq: "Let's draft — starting with your introduction. Open with the contextualization you planned, then land your thesis at the end of the paragraph; that's where AP readers look for it first. Write it in the editor and check in when it's down.",
          leq: "Let's draft — starting with your introduction. Open with the contextualization you planned, then land your thesis at the end of the paragraph; that's where AP readers look for it first. Write it in the editor and check in when it's down.",
        },
        position: 1,
        showChatButton: true,
        tutorInstructions: {
          dbq: `Step focus: the introduction. Coach the student to open with their 2–3 specific contextualization sentences and land the thesis at the end of paragraph 1 — the safest position for fast-moving AP readers. Confirm the thesis kept its line of reasoning through the move; watch for buried-thesis and generic-context.`,
          leq: `Step focus: the introduction. Coach the student to open with their 2–3 specific contextualization sentences and land the thesis at the end of paragraph 1 — the safest position for fast-moving AP readers. Confirm the thesis kept its line of reasoning through the move; watch for buried-thesis and generic-context.`,
        },
      },
      {
        title: 'Body Paragraphs',
        prompt: {
          dbq: 'Now the body paragraphs. Lead each one with a claim that supports your thesis — then bring in the documents to back it up. Weave 2–3 documents into each paragraph rather than walking through them one by one. Draft a paragraph and check in with me.',
          leq: 'Now the body paragraphs. Lead each one with a claim that supports your thesis — then bring in the evidence to back it up. Use specific named evidence, not a list of facts, and let your reasoning skill shape the paragraph. Draft a paragraph and check in with me.',
        },
        position: 2,
        showChatButton: true,
        tutorInstructions: {
          dbq: `Step focus: body paragraphs. Every paragraph leads with an argument tied to the thesis, never with a document.
Weave 2–3 documents into each paragraph as evidence for the claim — never a walk-through of documents in order. Watch walking-through-documents and description-not-argument.
Sourcing and outside evidence get their own step next — don't block a paragraph on them here.`,
          leq: `Step focus: body paragraphs. Every paragraph leads with an argument tied to the thesis, never with a bare fact.
Use specific named evidence as argument. Watch evidence-as-list and narrative-drift.
Deepening the reasoning and evidence gets its own step next — don't block a paragraph on it here.`,
        },
      },
      {
        title: 'Strengthen the Evidence',
        prompt: {
          dbq: "Your paragraphs are down — now let's pick up the analysis points. Source at least two documents (why does the author's point of view, purpose, situation, or audience matter for your argument?) and work in one specific piece of outside evidence from the period. Ask me to look at a paragraph.",
          leq: "Your paragraphs are down — now let's sharpen the analysis. Make sure your reasoning skill shows in the structure and that every piece of evidence earns its place — named laws, people, events, court cases. Ask me to look at a paragraph.",
        },
        position: 3,
        showChatButton: true,
        tutorInstructions: {
          dbq: `Step focus: analysis and evidence upgrades to the existing draft.
HIPP-source at least 2 documents with explicit "which matters because" relevance to the argument, and add at least one specific piece of outside evidence inside the prompt's date window. Watch HIPP-without-relevance, generic-outside-evidence, and period-bleed.`,
          leq: `Step focus: analysis and evidence upgrades to the existing draft.
Make the reasoning skill visible in the paragraph structure and push evidence specificity — named laws, people, events, court cases. Watch reasoning-mentioned-not-used and generic-evidence.`,
        },
      },
      {
        title: 'Conclusion',
        prompt: {
          dbq: "Last piece of the draft: the conclusion. Reinforce your argument without just repeating your thesis — and if you're chasing the complexity point, a \"while X, also Y\" move lands well here. Share it when it's drafted.",
          leq: "Last piece of the draft: the conclusion. Reinforce your argument without just repeating your thesis — and if you're chasing the complexity point, a \"while X, also Y\" move lands well here. Share it when it's drafted.",
        },
        position: 4,
        showChatButton: true,
        tutorInstructions: {
          dbq: `Step focus: the conclusion. Reinforce the thesis without merely restating it. This is a natural home for a complexity move — qualification ("while X dominated, Y persisted"), multiple causes or perspectives, or a connection across periods. Keep it tight; length is not sophistication.`,
          leq: `Step focus: the conclusion. Reinforce the thesis without merely restating it. This is a natural home for a complexity move — qualification ("while X dominated, Y persisted"), multiple causes or perspectives, or a connection across periods. Keep it tight; length is not sophistication.`,
        },
      },
    ],
  },
  {
    title: 'Revision',
    position: 4,
    description:
      'A whole-essay pass against the rubric, pushing hardest on the complexity point.',
    registerMode: 'polished',
    tutorInstructions: {
      dbq: `Current section: Revision.
Run a whole-essay pass against the rubric — thesis, contextualization, document use and sourcing, outside evidence, and complexity.
Push hardest on the complexity point: qualification ("while X dominated, Y persisted"), multiple causation or perspectives, or connection across periods. Length is not sophistication.
Never tell the student they are "ready to submit" — that is their call.`,
      leq: `Current section: Revision.
Run a whole-essay pass against the rubric — thesis, contextualization, evidence specificity, historical reasoning, and complexity.
Push hardest on the complexity point: qualification ("while X dominated, Y persisted"), multiple causation or perspectives, or connection across periods. Length is not sophistication.
Never tell the student they are "ready to submit" — that is their call.`,
    },
    instructions: [
      {
        title: 'Revise your essay',
        prompt: {
          dbq: "Last section: revision. Let's take a full pass through your draft against the rubric, with a special eye on the complexity point — the one most essays leave on the table. Ask me to review whenever you're ready.",
          leq: "Last section: revision. Let's take a full pass through your draft against the rubric, with a special eye on the complexity point — the one most essays leave on the table. Ask me to review whenever you're ready.",
        },
        position: 1,
        showChatButton: true,
      },
    ],
  },
];

// Pick the variant authored for a given essay type.
export function pickApHistoryEssayVariant(
  variants: ApHistoryEssayVariants,
  essayType: ApHistoryEssayType
): string {
  return essayType === 'leq' ? variants.leq : variants.dbq;
}

function findModule(moduleTitle: string): ApHistoryModuleDefinition | undefined {
  return AP_HISTORY_MODULES.find((module) => module.title === moduleTitle);
}

function findInstruction(
  moduleTitle: string,
  instructionTitle: string
): ApHistoryInstructionDefinition | undefined {
  return findModule(moduleTitle)?.instructions.find(
    (instruction) => instruction.title === instructionTitle
  );
}

// Section-level tutor guidance for the essay type, or null when the module is
// not one of the canonical AP History sections (e.g. the legacy single module).
//
// The section's REGISTER MODE is composed onto the end of the guidance rather
// than carried alongside it, so this string is exactly what gets seeded into
// the DB and exactly what an admin sees and can edit. Code default and stored
// value are the same text, which is what makes the DB-first read safe.
export function resolveApHistorySectionTutorInstructions(
  essayType: ApHistoryEssayType,
  moduleTitle: string
): string | null {
  const module = findModule(moduleTitle);
  if (!module) return null;
  return [
    pickApHistoryEssayVariant(module.tutorInstructions, essayType),
    formatRegisterModeDirective(module.registerMode),
  ].join('\n');
}

// The register (DRAFTING/POLISHED) for a section, or null when the module is
// not one of the canonical AP History sections — legacy single-module
// documents get no register directive, leaving their prompt unchanged.
export function resolveApHistoryRegisterMode(
  moduleTitle: string
): ApHistoryRegisterMode | null {
  return findModule(moduleTitle)?.registerMode ?? null;
}

// Step-level tutor guidance for the essay type, or null when the step has no
// step-specific guidance or is not a canonical AP History step.
export function resolveApHistoryStepTutorInstructions(
  essayType: ApHistoryEssayType,
  moduleTitle: string,
  instructionTitle: string
): string | null {
  const instruction = findInstruction(moduleTitle, instructionTitle);
  if (!instruction?.tutorInstructions) return null;
  return pickApHistoryEssayVariant(instruction.tutorInstructions, essayType);
}

// The opening chat bubble for the essay type, or null when the step is not a
// canonical AP History step (e.g. the legacy single module).
export function resolveApHistoryInstructionPrompt(
  essayType: ApHistoryEssayType,
  moduleTitle: string,
  instructionTitle: string
): string | null {
  const instruction = findInstruction(moduleTitle, instructionTitle);
  if (!instruction) return null;
  return pickApHistoryEssayVariant(instruction.prompt, essayType);
}

// The canonical sections flattened to the string-valued shape the seeds write
// to the shared DB columns. Each string is the default-essay-type variant; the
// runtime overrides it per essay type from the document snapshot. Keeping this
// shape identical to the pre-split seed input lets the seeds map it unchanged.
export const AP_HISTORY_SEED_MODULES = AP_HISTORY_MODULES.map((module) => ({
  title: module.title,
  position: module.position,
  description: module.description,
  tutorInstructions: resolveApHistorySectionTutorInstructions(
    AP_HISTORY_SEED_DEFAULT_ESSAY_TYPE,
    module.title
  )!,
  // Both essay types' guidance, written to tutorInstructionsVariantsJson so
  // admin can edit each one and the runtime can pick the right one. The
  // single-string column above stays populated for any reader that predates
  // variants.
  tutorInstructionsVariantsJson: {
    dbq: resolveApHistorySectionTutorInstructions('dbq', module.title)!,
    leq: resolveApHistorySectionTutorInstructions('leq', module.title)!,
  },
  instructions: module.instructions.map((instruction) => ({
    title: instruction.title,
    position: instruction.position,
    showChatButton: instruction.showChatButton,
    prompt: pickApHistoryEssayVariant(
      instruction.prompt,
      AP_HISTORY_SEED_DEFAULT_ESSAY_TYPE
    ),
    ...(instruction.tutorInstructions
      ? {
          tutorInstructions: pickApHistoryEssayVariant(
            instruction.tutorInstructions,
            AP_HISTORY_SEED_DEFAULT_ESSAY_TYPE
          ),
          tutorInstructionsVariantsJson: { ...instruction.tutorInstructions },
        }
      : {}),
  })),
}));
