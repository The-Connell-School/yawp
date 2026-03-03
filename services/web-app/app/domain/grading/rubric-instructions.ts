export const gradingAssistantRubricInstructions = `
Philosophy Note
This rubric prioritizes what makes writing truly excellent: original thinking, intellectual courage, genuine discovery, and the ability to guide a reader through complex ideas with clarity and style.
Technical perfection without compelling content earns a lower grade than bold thinking with minor technical flaws.
We are looking for essays that make readers think differently, not just essays that follow the rules.

Category Weights
- Thesis/Content: 25%
- Organization/Structure: 25%
- Evidence/Support: 20%
- Voice/Style: 20%
- Grammar/Syntax/Formatting: 10%

Detailed Rubric
1. THESIS/CONTENT (25%)
Exemplary (90-100%)
THESIS: Combines sharp observation with sophisticated, multi-layered analysis; takes intellectual risks; demonstrates genuine discovery through pre-writing; language is precise and concise; each element is complex enough to require thoughtful exploration.
CONTENT: Body paragraphs deliver on the thesis promise with depth and originality; ideas build and evolve; sustained critical thinking appears throughout; deep engagement with source material is evident; insights feel discovered; connections are sophisticated and unexpected; conclusions offer earned deductions that make readers reconsider the subject.
Proficient (80-89%)
THESIS: Clearly combines observation with analysis; position is defensible and thoughtful; language is mostly concise; elements provide clear essay direction.
CONTENT: Body paragraphs develop thesis elements; ideas are coherent and support the argument; analysis usually goes beyond surface-level; conclusion offers reasonable deductions.
Developing (70-79%)
THESIS: Present but simplistic or obvious; analysis can be predictable; language may be wordy; position lacks complexity.
CONTENT: Support is inconsistent; some paragraphs repeat or drift; analysis mixes depth with obvious claims; conclusion tends to restate rather than deduce.
Struggling (Below 70%)
THESIS: Absent, unclear, descriptive, or summary-based; no clear argument.
CONTENT: Paragraphs do not develop a clear thesis; little critical thinking; essay wanders; conclusion is absent or repetitive.

2. ORGANIZATION/STRUCTURE (25%)
Exemplary (90-100%)
Introduction builds compellingly to thesis; opening strategy enhances discussion; body paragraphs directly support distinct thesis elements; transitions are organic; conclusion adds new insight and deductions; progression feels purposeful.
Proficient (80-89%)
Introduction prepares the reader; opening strategy is clear; body paragraphs connect to thesis; organization is logical; conclusion draws reasonable deductions.
Developing (70-79%)
Introduction may be abrupt or generic; opening strategy can feel forced; paragraphs may drift or repeat; transitions can feel mechanical; conclusion mostly restates.
Struggling (Below 70%)
Introduction missing/confusing/generic; no clear opening strategy; paragraphs wander; progression is hard to follow; conclusion is absent or repetitive.

3. EVIDENCE/SUPPORT (20%)
Exemplary (90-100%)
Evidence is selected precisely and integrated seamlessly; sources build authority; evidence illuminates claims; writer creates dialogue with sources; analysis remains primary.
Proficient (80-89%)
Evidence supports main points, is integrated and cited correctly, and generally balances with analysis.
Developing (70-79%)
Evidence is present but loosely connected; integration may be mechanical; quote choice may be weak; analysis is thin or uneven.
Struggling (Below 70%)
Little/no relevant evidence; weak or inaccurate quoting; weak argument connection; citation/plagiarism concerns may appear.

4. VOICE/STYLE (20%)
Exemplary (90-100%)
Voice is authentic, confident, engaging, and memorable; language takes creative risks while staying academically credible; wording is precise and economical; rhythm and flow are compelling.
Proficient (80-89%)
Voice is clear and appropriate; tone is consistent; language is mostly precise and readable.
Developing (70-79%)
Voice is inconsistent or generic; phrasing may be awkward; filler or repetition appears.
Struggling (Below 70%)
Voice is unclear or robotic; tone is inappropriate or inconsistent; language is confusing and difficult to read.

5. GRAMMAR/SYNTAX/FORMATTING (10%)
Exemplary (90-100%)
Grammar/syntax errors are rare and non-distracting; sentence variety and punctuation enhance clarity.
Formatting/presentation is polished and consistent; title is thoughtful; no draft artifacts remain; style guidelines are followed.
Proficient (80-89%)
Few grammar/syntax errors; formatting is clean and consistent; title is appropriate; only minor style inconsistencies.
Developing (70-79%)
Multiple grammar/syntax errors with mostly clear meaning; formatting inconsistencies or minor draft artifacts; title may be generic/missing.
Struggling (Below 70%)
Frequent grammar/syntax errors that interfere with meaning; sloppy formatting; visible draft artifacts; missing/generic title; style guidelines ignored.

Grade Calculation
To calculate final grade, multiply each category score by its weight and sum the results.
Category | Weight | Score | Weighted Score
Thesis/Content | 25% | ___ | ___ x 0.25 = ___
Organization/Structure | 25% | ___ | ___ x 0.25 = ___
Evidence/Support | 20% | ___ | ___ x 0.20 = ___
Voice/Style | 20% | ___ | ___ x 0.20 = ___
Grammar/Syntax/Formatting | 10% | ___ | ___ x 0.10 = ___
FINAL GRADE: ________%
`.trim();

export const gradingAssistantScoreScaleInstructions = `
Score mapping for the JSON schema in this app:
- 5 = Exemplary (90-100%)
- 4 = Proficient (80-89%)
- 3 = Developing (70-79%)
- 2 = Struggling (below 70%, closer to developing)
- 1 = Struggling (below 70%, severe gaps)
`.trim();
