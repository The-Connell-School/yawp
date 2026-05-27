import type { ApEssayType } from './ap-rubric';

export const apScoringPhilosophy = `
AP Scoring Philosophy
- The rubric is ADDITIVE: each point is earned independently. Errors do not subtract.
- Be generous on grammar and prose quality. It does not cost points unless it obscures meaning.
- Be generous on minor factual errors that do not undermine the argument.
- Do not reward length. A short, tightly argued essay can earn every point.
- Thesis (Row 1): 0 or 1. Defensible claim with a line of reasoning, not a restatement.
- Evidence & Commentary (Row 2): 0–4. Scored on a ladder from references → explanation → integration into a line of reasoning.
- Sophistication (Row 3): 0 or 1. The hardest point. Only award when genuinely present.
`.trim();

const descriptors: Record<ApEssayType, string> = {
  synthesis: `
Essay Type: Synthesis
Row 1 — Thesis (0–1):
  1: Defensible position responding to the prompt with a line of reasoning. Not a summary of sources.
  0: Restates the prompt, summarizes sources, or offers no defensible position.

Row 2 — Evidence & Commentary (0–4):
  1: References or quotes from sources.
  2: Cites at least 3 sources, mostly relevant.
  3: Cites and explains how sources support the argument.
  4: Sources integrated into a line of reasoning; commentary explains significance.
  0: No evidence from sources or evidence unrelated to the prompt.

Row 3 — Sophistication (0–1):
  1: Demonstrates sophistication — vivid prose, effective counterargument, nuanced understanding of sources' limitations, or broader context.
  0: Competent but does not rise to sophistication.

Be strict on summary-vs-synthesis. A paragraph that summarizes a source without using it as evidence for the student's argument earns at most Row 2 = 2.
Flag "walking through sources" (one source per paragraph) as a structural weakness.
`.trim(),

  'rhetorical-analysis': `
Essay Type: Rhetorical Analysis
Row 1 — Thesis (0–1):
  1: Defensible claim about rhetorical choices the author makes. Not "the author uses rhetoric."
  0: Restates the prompt or names the text without a claim about how rhetoric works.

Row 2 — Evidence & Commentary (0–4):
  1: References rhetorical choices in the text.
  2: Identifies choices and connects them to the author's purpose.
  3: Explains how choices build the author's argument or achieve the purpose.
  4: Rhetorical choices woven into a line of reasoning with nuanced commentary on effect.
  0: No references to rhetorical choices.

Row 3 — Sophistication (0–1):
  1: Accounts for rhetorical complexity, explains limitations or tensions, uses vivid analytical prose.
  0: Competent but does not rise to sophistication.

Be strict on identify-vs-explain. Naming a device ("the author uses metaphor") without explaining its effect on the audience earns at most Row 2 = 2.
Flag "catalog" structure (listing devices without building an argument about how they work together).
`.trim(),

  argument: `
Essay Type: Argument
Row 1 — Thesis (0–1):
  1: Defensible claim responding to the prompt with a line of reasoning. Not a restatement.
  0: Restates the prompt or offers no defensible position.

Row 2 — Evidence & Commentary (0–4):
  1: Provides evidence (examples, reasoning).
  2: Relevant evidence with some reasoning connecting it to the claim.
  3: Explains how evidence supports the claim.
  4: Evidence integrated into a cohesive line of reasoning with insightful commentary.
  0: No evidence or evidence unrelated to the prompt.

Row 3 — Sophistication (0–1):
  1: Qualifies or complicates the argument, uses counterargument effectively, vivid prose.
  0: Competent but does not rise to sophistication.

Be strict on evidence specificity. "Many people believe..." or "Studies show..." without naming a specific example earns at most Row 2 = 2.
Flag missing counterargument — the strongest Argument essays acknowledge the other side.
`.trim(),

  'poetry-analysis': `
Essay Type: Poetry Analysis
Row 1 — Thesis (0–1):
  1: Defensible interpretation of the poem responding to the prompt. Not a summary.
  0: Summarizes the poem or offers no interpretation.

Row 2 — Evidence & Commentary (0–4):
  1: References the poem.
  2: Specific references (quotes or paraphrases) mostly relevant to the interpretation.
  3: Explains how textual evidence supports the interpretation.
  4: Evidence woven into a line of reasoning; commentary illuminates meaning through the interplay of literary elements.
  0: No references to the poem.

Row 3 — Sophistication (0–1):
  1: Situates interpretation in broader literary context, accounts for ambiguity or complexity, vivid analytical prose.
  0: Competent but does not rise to sophistication.

Be strict on paraphrase-vs-analysis. Retelling what the poem says without analyzing how literary elements create meaning earns at most Row 2 = 2.
Flag essays that discuss content but ignore form, structure, or sound.
`.trim(),

  'prose-fiction-analysis': `
Essay Type: Prose Fiction Analysis
Row 1 — Thesis (0–1):
  1: Defensible interpretation of the passage responding to the prompt. Not "the author develops the character."
  0: Summarizes the plot or offers no interpretation of how craft creates meaning.

Row 2 — Evidence & Commentary (0–4):
  1: References the passage.
  2: Specific references mostly relevant.
  3: Explains how evidence supports the interpretation.
  4: Line of reasoning with insightful commentary on how literary elements create meaning.
  0: No references to the passage.

Row 3 — Sophistication (0–1):
  1: Accounts for complexity, explains tensions or ambiguities, vivid analytical prose.
  0: Competent but does not rise to sophistication.

Be strict on plot-summary-vs-analysis. A paragraph that narrates what happens without analyzing narrative craft earns at most Row 2 = 2.
`.trim(),

  'literary-argument': `
Essay Type: Literary Argument
Row 1 — Thesis (0–1):
  1: Defensible interpretation of a work of literature responding to the prompt. Not a plot summary statement.
  0: Summarizes the plot or offers no literary interpretation.

Row 2 — Evidence & Commentary (0–4):
  1: References the work.
  2: Specific, relevant evidence from the text.
  3: Explains how evidence supports the interpretation.
  4: Evidence woven into a cohesive argument about the work as a whole.
  0: No references to the work.

Row 3 — Sophistication (0–1):
  1: Illuminates the work as a whole, uses a literary-critical lens, vivid prose.
  0: Competent but does not rise to sophistication.

Be strict on textual specificity. Vague references ("in the book, the character learns a lesson") earn at most Row 2 = 2.
Flag essays that reference only one scene instead of the work as a whole.
`.trim(),
};

export function getApRubricInstructions(essayType: ApEssayType): string {
  return `${apScoringPhilosophy}\n\n${descriptors[essayType]}`;
}
