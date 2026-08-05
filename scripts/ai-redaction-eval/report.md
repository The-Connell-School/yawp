# AI PII Redaction — Quality Regression Eval Report

Generated: 2026-08-05T13:51:25.958Z
Model: claude-sonnet-4-5
Paired cases executed: 13 (1 case(s) failed to complete — see "Execution failures")

## Aggregate verdict

**FAIL — PII leak detected. See "Leak failures" below before drawing any quality conclusion.**

## What was measured

For each essay, the real grading prompt/response flow from `api.domain.grade-essay-ai/route.ts` (thesis-default rubric path) was run twice against the live Anthropic API with identical essay text and rubric:

- **Control** — redaction disabled: the real first name is sent straight into the prompt (current production behavior).
- **Treatment** — redaction enabled: the real `buildRedactionMapping`/`redact` replace the first name with a pseudonym before the prompt is built, then the real `rehydrate` restores the real name in every returned comment (this branch's behavior).

## Score delta distribution (treatment − control, weighted total %)

| mean | median | stdev | min | max | n |
|---|---|---|---|---|---|
| -1.46 | 0 | 13.77 | -37 | 32 | 13 |

## Name correctness

12/13 cases passed all name-correctness checks (control overallComment addresses the student by real name; treatment overallComment addresses the student by real name post-rehydration; no real-name leak into the treatment outbound prompt or raw response; no stray pseudonym left in the treatment final output).

## Blind judge (tone/warmth/specificity, order-randomized)

Control wins: 3 | Treatment wins: 5 | Ties: 5 (of 13)

## Shared-first-name determinism check (Maya Thompson / Maya O'Brien)

PASS — both students named "Maya" mapped to the same pseudonym ("Rowan"), confirming `buildRedactionMapping`'s shared-name → shared-pseudonym behavior across two separate live requests.

## Per-case table

| id | band | control % | treatment % | Δ | name-correct | judge winner | groundedness note |
|---|---|---|---|---|---|---|---|
| E01-strong-tech-optimism | strong | 96 | 96 | +0 | PASS | tie | Highly grounded—references the mirror metaphor, printing press example, and quotes 'found the seam in our attention' from the essay. / Highly grounded—references the mirror/ladder metaphor, printing press example, and quotes 'found the seam in our attention' from the essay. |
| E03-mid-climate-policy | mid | 53 | 53 | +0 | PASS | tie | Comment A directly references the essay's thesis on carbon taxation, the counterargument structure in body paragraphs, and specifically cites the vague phrases 'several economists' and 'studies' from the text. / Comment B references the carbon tax argument, the counterargument anticipation, and specifically identifies the same vague references to 'economists' and 'studies' as problematic sourcing. |
| E04-strong-name-in-body | strong | 96 | 59 | -37 | FAIL | control | Highly grounded—references 'twenty words,' the letters, the 'late' vs 'brave' reframing, and specific structural choices from the essay. |
| E05-mid-shared-name-maya-thompson | mid | 50 | 82 | +32 | PASS | treatment | Comment B directly references the essay's central claim about 'translation gaps teach careful listening' and the student's own examples of reading literature and having arguments, making it more grounded in actual content. |
| E06-strong-shared-name-maya-obrien | strong | 82 | 77 | -5 | PASS | tie | Highly grounded—explicitly references the hiring algorithm example, the 'audit problem' thesis, and Maya's confident voice with specific textual awareness. / Highly grounded—directly cites the 'audit problem' reframing, the hiring algorithm example, and the essay's argumentative structure with concrete detail. |
| E07-mid-pseudonym-pool-collision | mid | 96 | 96 | +0 | PASS | control | References the essay's specific argumentative move (acknowledging imperfection while advocating transparency) and quotes the phrase 'transparency over elimination' directly from the conclusion. |
| E08-strong-gatsby-symbolism | strong | 100 | 100 | +0 | PASS | treatment | Comment A quotes the essay directly ('does not stay still') and references specific argumentative moves like the progression from private gesture to national diagnosis and the final receding light image. |
| E09-weak-short-off-topic | weak | 22 | 22 | +0 | PASS | tie | Does not cite specific essay content; stays at the generic level of identifying the topic and general weaknesses. / Does not cite specific essay content; stays at the generic level of identifying the topic and general weaknesses. |
| E10-mid-renewable-subsidies | mid | 69 | 64 | -5 | PASS | control | Comment B directly references the essay's core argument about correcting for fossil fuel externalities, showing engagement with the actual content presented. |
| E11-strong-beloved-quotes | strong | 100 | 96 | -4 | PASS | treatment | Comment A quotes specific phrases from Naomi's essay ('a rememory made flesh,' 'the past refuses to stay past') and references the Sethe quotation used, showing engagement with actual essay content. |
| E12-weak-grammar-heavy | weak | 20 | 20 | +0 | PASS | treatment | References the essay's informal tone, the basic claim about part-time jobs, and the pervasive technical errors, showing engagement with the actual text. |
| E13-mid-overcoming-failure | mid | 59 | 55 | -4 | PASS | tie | Generic; does not cite specific essay content like the bathroom scene, the three-week delay, or particular phrases from the student's reflection. / Generic; acknowledges the topic of 'pride and asking for help' but does not reference concrete details, quotes, or specific moments from the essay. |
| E14-strong-ubi-counterargument | strong | 82 | 86 | +4 | PASS | treatment | Grounded: references the essay's treatment of the UBI objection, its use of evidence, and its restrained claim-making. |

## Failures and anomalies

### PII leak failures (automatic FAIL)

- **E04-strong-name-in-body**:
  - Real name "Sophia" found in treatment outbound prompt: userPrompt

### Individual score anomalies (|Δ| ≥ 10 points)

- **E04-strong-name-in-body**: total delta -37 points (control 96% → treatment 59%). Category deltas: thesis_and_content -3, organization_and_structure -2, evidence_and_support -3, voice_and_style +0, grammar_and_mechanics +0
- **E05-mid-shared-name-maya-thompson**: total delta +32 points (control 50% → treatment 82%). Category deltas: thesis_and_content +2, organization_and_structure +2, evidence_and_support +2, voice_and_style +1, grammar_and_mechanics +0

### Execution failures

- **E02-weak-social-media**: Malformed grading assistant response for "Marcus" even after repair. Raw: ```json
{
  "categories": [
    {
      "key": "thesis_and_content",
      "score": 2,
      "comment": "The thesis ('Social media is bad for teenagers') is present but overly simplistic and lacks analytical depth. The essay offers familiar observations (addiction, self-esteem, cyberbullying) without original insight or critical thinking. Body paragraphs list problems rather than exploring complexity or making meaningful deductions. To improve, develop a more nuanced argument that moves beyond o

## Full per-case detail

### E01-strong-tech-optimism (strong) — Strong writing: sharp thesis, sustained analysis, original conclusion.

Real name: Amelia | Pseudonym used in treatment prompt: Taylor

**Control overallComment:**

> Amelia, you've written an essay that does exactly what the best writing should do: it makes readers think differently. Your central metaphor—technology as mirror rather than ladder—is the kind of original insight that reframes an entire conversation, and you sustain that intellectual courage throughout. The printing press example is particularly effective because it complicates rather than simplifies your argument, showing genuine engagement with historical nuance. Your voice is confident and precise, taking creative risks ('found the seam in our attention') that pay off beautifully. The one area for growth is evidence: while your examples are well-chosen, adding one more researched, concrete instance would deepen your authority and give readers an even richer foundation for your claims. This is sophisticated, compelling work that demonstrates real discovery through writing.

**Treatment overallComment (post-rehydrate):**

> Amelia, this essay does exactly what the best writing should do: it makes readers think differently. Your mirror metaphor is not just clever—it's a genuinely original framework that reframes the entire technology debate, and you sustain that insight with intellectual courage throughout. The printing press example is particularly brilliant because it complicates your argument rather than simply supporting it, showing real critical thinking at work. Your voice is confident without being showy, and your conclusion earns its authority by offering a deduction that feels both surprising and inevitable. The only opportunity for growth would be to add one more piece of concrete, contemporary evidence to balance the historical example and give readers an additional anchor point. But this is sophisticated, risk-taking work that demonstrates what happens when a writer trusts their own thinking.

Judge: winner=tie (raw tie, A=treatment) — These comments are nearly identical in quality, structure, and content. Both open with the same phrase ('does exactly what the best writing should do: it makes readers think differently'), praise the mirror metaphor as 'original,' highlight the printing press example for 'complicating' the argument, commend the voice as 'confident,' cite the same specific phrase ('found the seam in our attention' vs 'seam in our attention'), and offer virtually the same suggestion about adding contemporary/concrete evidence. Comment A mentions 'risk-taking work' while B says 'taking creative risks,' but these are trivial variations. Both demonstrate warmth, specificity to the essay's actual content, and useful guidance. The differences are cosmetic rather than substantive.

### E03-mid-climate-policy (mid) — Mid-range writing: competent five-paragraph structure, adequate but unremarkable analysis.

Real name: Priya | Pseudonym used in treatment prompt: Shay

**Control overallComment:**

> Priya, you've written a technically competent essay that takes a clear position on carbon taxation, and your grammar and sentence-level clarity are strong. However, the essay doesn't yet demonstrate the intellectual depth and originality this rubric prioritizes. Your thesis states a position but doesn't offer the multi-layered analysis or genuine discovery that comes from deep engagement with the subject. The argument feels familiar—these are points readers have encountered before, presented without new insight or unexpected connections. Your body paragraphs acknowledge counterarguments, which shows awareness of complexity, but they don't build ideas or evolve your thinking; instead, they offer standard rebuttals. Most critically, your evidence is too vague to be persuasive. References to 'several economists' and 'studies' without specific sources or data weaken your authority significantly. To move this essay toward excellence, dig deeper into the research: find precise evidence, engage with it critically, and let that engagement lead you to more sophisticated conclusions. Push yourself to discover something new about this topic rather than confirming what's already widely accepted. Your technical skills are solid—now challenge yourself to take intellectual risks that make readers think differently.

**Treatment overallComment (post-rehydrate):**

> Priya, you've written a clear, competent argument that demonstrates your ability to structure a position and anticipate counterarguments—those are real strengths. However, this rubric prioritizes intellectual courage and original thinking, and your essay plays it safe. The carbon tax argument, while reasonable, doesn't take you anywhere unexpected. You're explaining a position rather than discovering something through your writing. To move toward exemplary work, push yourself during pre-writing: What surprising connection could you make? What tension exists within your own position? What would make a reader reconsider their assumptions rather than simply nod along? Your technical skills are strong enough to support bolder thinking—now take the intellectual risks that transform competent writing into compelling writing. Consider also that vague references to 'economists' and 'studies' weaken your authority; precise, integrated evidence would give your claims the weight they need.

Judge: winner=tie (raw tie, A=control) — Both comments are nearly identical in quality, structure, and content. Each opens with praise for technical competence, identifies the same core weakness (lack of intellectual depth/originality), references the same specific vagueness issue ('several economists' and 'studies'), and closes with similar encouragement to take intellectual risks. Comment A is slightly more verbose ('multi-layered analysis,' 'genuine discovery,' 'evolve your thinking') while Comment B is more concise ('plays it safe,' 'explaining a position rather than discovering'), but both deliver essentially the same message with equal warmth and specificity. Both ground their feedback in concrete essay details (the carbon tax thesis, the counterargument structure, the vague sourcing). Neither offers a meaningfully different perspective or additional value to the student.

### E04-strong-name-in-body (strong) — Key edge case: the essay text names the author directly and closes with a signature -- tests whether redaction leaks or garbles the essay body itself.

Real name: Sophia | Pseudonym used in treatment prompt: Teagan

**Control overallComment:**

> Sophia, this essay demonstrates the kind of intellectual courage and genuine discovery that defines exemplary writing. Your thesis—that writing is your argument against inherited silence—emerges from real reflection rather than formula, and every paragraph deepens that central claim with precision and insight. The structural choices feel purposeful: opening with your grandmother's twenty words, moving through the discovery of her letters, and arriving at the realization that honesty makes you 'late' rather than 'brave.' That final reframing is exactly the kind of earned deduction that makes readers think differently. Your voice is confident without being performative, vulnerable without losing authority. The only area for growth is in evidence—while your personal examples are vivid and well-chosen, adding one more layer of specific detail (perhaps a line from those letters, or a concrete moment from an essay where you practiced this new honesty) would deepen the analysis further. This is writing that does what the best essays do: it names something true that was previously unsaid.

**Treatment overallComment (post-rehydrate):**

> Sophia, you've written something deeply personal and stylistically compelling, but it doesn't yet meet the requirements of a thesis-driven essay. What's here is a reflective narrative—beautiful in its honesty and precision—but without an argument, evidence, or critical analysis. The rubric prioritizes original thinking and intellectual risk, which means taking a position and defending it with outside sources, not just lived experience. Your voice is a real asset: you write with clarity, rhythm, and emotional intelligence. Now the challenge is to harness that voice in service of an argument. Ask yourself: what claim can I make about silence, honesty, family narratives, or the ethics of storytelling that a reader might doubt or disagree with? Then build your case with evidence and analysis. You have the tools—you just need to reframe the task.

Judge: winner=control (raw A, A=control) — Comment A engages deeply with the specific content of Sophia's essay, citing concrete details like 'twenty words,' the grandmother's letters, and the 'late' vs 'brave' distinction, while offering substantive praise grounded in what's actually on the page. Comment B, while thoughtful, makes a critical assumption that this is meant to be a 'thesis-driven essay' with 'outside sources'—requirements never mentioned in the prompt or visible rubric. Without knowing the actual assignment, Comment B's criticism may be entirely misplaced. Comment A meets the student where she is, acknowledges the essay's strengths with specificity, and offers targeted, actionable feedback (adding concrete details from the letters). It's warmer, more grounded in the actual text, and more useful regardless of the assignment context.

### E05-mid-shared-name-maya-thompson (mid) — Shared-first-name pair (A): tests that two students named Maya map to the same pseudonym.

Real name: Maya | Pseudonym used in treatment prompt: Rowan

**Control overallComment:**

> Maya, your writing has a reflective grace and authenticity that's genuinely compelling—your voice is clear, confident, and memorable. The challenge here is that this reads as a personal essay or memoir rather than the thesis-driven analytical essay the assignment requires. You've offered a meaningful personal insight about careful listening and intellectual humility, but you haven't yet built that insight into a defensible argument supported by evidence, developed through body paragraphs, and extended through critical thinking. A thesis-driven essay needs you to take that beautiful observation about translation and discipline and ask: What does this reveal about how we construct meaning in literature, navigate cultural difference, or approach complex texts? Then build an argument with outside sources and sustained analysis. Your prose style is already strong enough to carry sophisticated ideas—now channel that clarity toward analytical depth and structured argumentation.

**Treatment overallComment (post-rehydrate):**

> Maya, this essay demonstrates real intellectual promise. You've taken a personal experience and transformed it into a broader claim about interpretive discipline, and your voice throughout is confident and engaging. The writing is polished, and your central insight—that translation gaps teach careful listening—feels genuinely discovered rather than prescribed. What would push this into exemplary territory is more evidence and development in the body. Right now, the essay moves quickly from anecdote to thesis to conclusion, but it would benefit from a middle section that tests your claim against a concrete example: a specific text you've read, a real argument you've had, or a moment when the discipline you describe either succeeded or failed. That additional layer would give your conclusion more weight and allow your analysis to build and evolve. You're already writing with clarity and purpose—now deepen the exploration and let your ideas complicate themselves.

Judge: winner=treatment (raw B, A=control) — Comment B is more grounded in the actual essay content and provides warmer, more constructive feedback. While both comments correctly identify that the essay lacks traditional analytical structure, Comment B acknowledges what the student has actually accomplished ('transformed it into a broader claim about interpretive discipline,' 'your central insight—that translation gaps teach careful listening—feels genuinely discovered') by referencing specific content from the essay. Comment A is more generic in its critique, using phrases like 'reflective grace' and 'beautiful observation' without anchoring them to particular moments in the text. Comment B also offers more actionable guidance ('test your claim against a concrete example: a specific text you've read, a real argument you've had') that directly responds to the essay's own examples (reading literature, arguing with people). Both comments are professionally written, but B strikes a better balance between validation and direction, making it more useful to the student.

### E06-strong-shared-name-maya-obrien (strong) — Shared-first-name pair (B): second student named Maya, different essay/topic, tests deterministic shared pseudonym across two separate requests.

Real name: Maya | Pseudonym used in treatment prompt: Rowan

**Control overallComment:**

> Maya, you've written an essay with a genuinely fresh perspective that challenges how we typically frame AI ethics. Your reframing of the issue as an audit problem rather than a future policy concern shows the kind of intellectual courage this rubric values. The voice is confident and engaging throughout, and your writing is technically strong. The central weakness is in evidence depth—one example, however well-analyzed, isn't quite enough to fully support the weight of your argument. Adding one or two more precise examples or engaging with existing scholarship on algorithmic bias would strengthen your authority considerably. Additionally, your conclusion restates your position powerfully but doesn't quite extend your thinking into new territory. What would it look like if institutions actually took up this audit obligation tomorrow? What resistance would emerge, and why? Push yourself to that next level of deduction, and you'll move from a strong argument to a truly compelling one.

**Treatment overallComment (post-rehydrate):**

> Maya, you've written an intellectually bold and stylistically excellent piece that reframes AI ethics in a genuinely fresh way. Your voice is confident and engaging, your language is precise, and your central insight—that AI ethics is an audit problem, not a future technology problem—is the kind of claim that makes readers think differently. The hiring algorithm example is well-executed and effectively grounds your argument. Where the essay needs development is in scope and structure. Right now, it reads more like a powerful introduction to a longer argument than a complete essay. To reach the full potential of your thesis, build out the body with additional evidence, explore complications or counterarguments, and ensure each paragraph advances a distinct element of your claim. Your conclusion should offer earned deductions that extend beyond restating your position—perhaps implications for how institutions should act now, or what resistance to the 'audit' reveals about our relationship to historical bias. The thinking here is sharp and the writing is compelling; now give yourself the space to fully develop what you've started.

Judge: winner=tie (raw tie, A=treatment) — Both comments are exceptionally strong and nearly indistinguishable in quality. Each opens with warm, specific praise that references Maya's actual thesis (the 'audit problem' reframing), acknowledges the hiring algorithm example explicitly, and identifies the same core weaknesses: insufficient evidence/scope and a conclusion that restates rather than extends. Both use encouraging, constructive language and offer concrete guidance for revision. Comment A phrases the scope issue as 'reads more like a powerful introduction,' while Comment B frames it as 'one example...isn't quite enough'—slightly different angles on the same diagnosis. Comment A's suggestion to 'explore complications or counterarguments' is marginally more specific about structural development, while Comment B's question 'What would it look like if institutions actually took up this audit obligation tomorrow?' provides a slightly more concrete prompt for extending the conclusion. These differences are too minor to constitute a meaningful quality gap. Both comments demonstrate excellent grounding in the essay's actual content and provide equally useful feedback.

### E07-mid-pseudonym-pool-collision (mid) — Edge case: the student's real first name (Logan) is itself an entry in PSEUDONYM_FIRST_NAME_POOL -- exercises the never-reuse-a-real-name-as-a-pseudonym collision guard in mapping.server.ts.

Real name: Logan | Pseudonym used in treatment prompt: Alex

**Control overallComment:**

> Logan, this essay exemplifies what intellectual risk-taking looks like in academic writing. You've taken a well-worn debate and found an angle that actually advances the conversation rather than rehearsing familiar positions. Your willingness to sit in the discomfort of 'there's no perfect answer' while still offering a principled direction (transparency over elimination) shows real maturity of thought. The writing itself is controlled and confident—you guide readers through complexity without losing them, and your voice never wavers into either oversimplification or unnecessary jargon. This is the kind of essay that makes readers think differently about a subject they thought they'd already figured out. The one area for growth would be integrating more concrete evidence or brief source references to build even greater authority, but the analytical framework you've built here is genuinely impressive. Keep writing with this kind of courage.

**Treatment overallComment (post-rehydrate):**

> Logan, you've written an essay that genuinely makes readers think differently about college admissions reform. What distinguishes this work is your intellectual courage—you resist the comfortable position and instead offer a nuanced argument about transparency versus obscured bias that feels discovered rather than rehearsed. Your thesis combines sharp observation with sophisticated analysis, and every paragraph delivers on that promise with depth and precision. The structure guides readers through complex terrain with organic transitions, and your voice is both authentic and commanding. To push this even further, consider anchoring one of your claims about portfolio or holistic review bias with a specific example or study—this would deepen the dialogue with sources and add another layer of authority to an already compelling argument. This is exemplary work that demonstrates sustained critical thinking and genuine discovery.

Judge: winner=control (raw A, A=control) — Both comments are warm and encouraging, but Comment A edges ahead through slightly more specific grounding in the essay's actual content. Comment A explicitly references the essay's core tension ('there's no perfect answer'), quotes the specific solution offered ('transparency over elimination'), and names the essay's rhetorical achievement ('sit in the discomfort'). Comment B uses more generic praise language ('intellectual courage,' 'nuanced argument,' 'sharp observation') that could apply to many strong essays on controversial topics. Both suggest adding concrete evidence, but Comment A's feedback feels marginally more tailored to what Logan actually wrote, while Comment B relies more on formulaic compliments about 'voice' and 'structure' without citing specific structural choices or voice qualities from the text.

### E08-strong-gatsby-symbolism (strong) — Strong literary analysis with textual specificity.

Real name: Ethan | Pseudonym used in treatment prompt: Devon

**Control overallComment:**

> Ethan, this essay exemplifies what thesis-driven writing should be: you take an intellectual risk by arguing that the green light's meaning evolves from private symbol to national diagnosis, and you sustain that argument with precision and sophistication. Your close reading moves beyond surface interpretation to reveal how Fitzgerald connects individual longing to the American myth of self-reinvention. The structure guides readers through genuine discovery, transitions feel organic, and your voice is both confident and engaging. Evidence is selected with care and integrated seamlessly, always in service of your larger claim. This is the kind of writing that makes readers reconsider a text they thought they understood—exactly what literary analysis should accomplish.

**Treatment overallComment (post-rehydrate):**

> Ethan, this essay is exceptional. You've taken a familiar symbol and made it unfamiliar again through genuinely original thinking. What distinguishes this work is your willingness to complicate the easy reading—to insist that the green light 'does not stay still'—and then to follow that insight to its logical, devastating conclusion about American mythology itself. The progression from private gesture to national diagnosis is earned through precise evidence and confident prose. Your final image of the receding light captures both Fitzgerald's vision and your own analytical discovery. This is exactly the kind of writing that makes readers think differently about a text they thought they understood. Truly impressive work.

Judge: winner=treatment (raw A, A=treatment) — Comment A is more grounded in the specific essay content and demonstrates closer engagement with Ethan's actual language and ideas. It directly quotes the essay's phrase 'does not stay still,' references the 'progression from private gesture to national diagnosis,' and engages with the 'final image of the receding light'—all concrete elements from the essay. Comment B, while praising the same general thesis, remains more abstract and generic in its praise ('thesis-driven writing,' 'structure guides readers,' 'transitions feel organic'), offering observations that could apply to many strong essays. Comment A's specificity ('made it unfamiliar again,' 'earned through precise evidence') feels more tailored to what Ethan actually accomplished, while Comment B relies more on standard evaluative language for good literary analysis.

### E09-weak-short-off-topic (weak) — Weak/short: barely on-topic, minimal development, tests the low end of the scoring band.

Real name: Destiny | Pseudonym used in treatment prompt: Morgan

**Control overallComment:**

> Destiny, this draft needs significant development to meet the expectations of thesis-driven academic writing. Right now, the essay reads as an informal opinion piece rather than a structured argument. To improve, start by crafting a specific, defensible thesis that combines observation with analysis—something like exploring how uniform policies intersect with identity formation, economic equity, or school culture. Then, build body paragraphs that each develop a distinct part of that thesis using concrete evidence from credible sources. Work on integrating research seamlessly and letting your analysis lead. Pay attention to academic tone and voice—aim for confident and precise language that invites the reader into your thinking. Finally, proofread carefully for grammar and mechanics so that technical errors don't distract from your ideas. You have the beginning of a position here; now it's time to deepen, support, and refine it into a compelling essay.

**Treatment overallComment (post-rehydrate):**

> Destiny, this draft needs significant development before it can function as a thesis-driven essay. Right now, it reads more like an informal opinion piece than an academic argument. To move forward, start by crafting a formal, defensible thesis that goes beyond 'uniforms are dumb'—what specific, complex claim can you make about school uniforms that requires real analysis? Then, build body paragraphs that each explore one element of that thesis with depth, using concrete evidence from credible sources (studies, expert opinions, real-world examples). Work on organizing your ideas into a clear structure with an introduction that builds to your thesis, body paragraphs with smooth transitions, and a conclusion that offers new insight rather than restatement. Finally, revise for academic tone and technical correctness—this means eliminating casual language, fixing grammar and punctuation errors, and polishing your presentation. You have the seed of an argument here, but it needs substantial expansion, evidence, and formal development to meet the expectations of thesis-driven writing.

Judge: winner=tie (raw tie, A=treatment) — Both comments are nearly identical in quality, structure, and approach. Each correctly identifies the essay's informal tone, lack of thesis, absence of evidence, and mechanical errors. Both offer similar developmental advice (craft a formal thesis, use evidence, improve organization, adopt academic tone). Neither comment references specific content from the essay beyond the general topic of uniforms—neither quotes Destiny's actual claims about self-expression, cost concerns, or the bullying counterargument. Comment B provides slightly more concrete thesis examples ('identity formation, economic equity, or school culture'), while Comment A offers slightly more structural guidance ('introduction that builds to your thesis... conclusion that offers new insight'). However, these minor differences don't create a meaningful quality gap. Both are professionally written, appropriately warm yet direct, and equally useful (or equally generic) to the student.

### E10-mid-renewable-subsidies (mid) — Mid-range persuasive essay, adequate structure and evidence.

Real name: Omar | Pseudonym used in treatment prompt: Quinn

**Control overallComment:**

> Omar, you've written a clear, well-reasoned argument with a strong central insight—that renewable subsidies correct for fossil fuel externalities rather than distort the market. Your voice is confident and your technical execution is excellent. However, the essay feels more like a well-structured opinion than a fully developed thesis-driven argument. The biggest gap is evidence: your claims need data, sources, and concrete examples to build authority and deepen analysis. Additionally, your structure, while logical, follows a predictable template rather than creating a compelling progression that builds toward discovery. To move this essay into exemplary territory, ground your argument in specific evidence, complicate your thesis by exploring tensions or limitations in your own position, and craft transitions that make each idea feel inevitable rather than merely next in line. You're demonstrating solid critical thinking—now show me the research and intellectual risk that will make your argument undeniable.

**Treatment overallComment (post-rehydrate):**

> Omar, you've built a clear, confident argument with a strong grasp of structure and style. Your voice is engaging, and your technical execution is excellent. The core weakness here is evidentiary support—your claims need grounding in data, examples, or scholarship to carry the weight they deserve. Right now, the essay reads more like a well-reasoned opinion than a researched argument. Additionally, push your thesis and conclusion further: don't just restate a defensible position, but guide your reader toward a new way of seeing the issue. You're capable of sharper analysis and deeper discovery—let the essay reflect that.

Judge: winner=control (raw B, A=treatment) — Comment B is more grounded in the specific content of the essay and provides more actionable, detailed feedback. While both comments correctly identify the lack of evidence as the main weakness, Comment B explicitly references the essay's 'central insight—that renewable subsidies correct for fossil fuel externalities rather than distort the market,' demonstrating engagement with the actual argument made. Comment B also provides more specific guidance on what's needed: it distinguishes between 'well-structured opinion' and 'thesis-driven argument,' calls for exploring 'tensions or limitations' in the position, and addresses the predictability of the structure with concrete advice about making ideas 'feel inevitable rather than merely next in line.' Comment A covers similar ground but remains more generic, using phrases like 'guide your reader toward a new way of seeing the issue' without the same level of specificity. Both are warm and encouraging, but B offers more useful, essay-specific direction.

### E11-strong-beloved-quotes (strong) — Strong essay with heavy, well-integrated textual evidence -- tests groundedness/specificity retention.

Real name: Naomi | Pseudonym used in treatment prompt: Rowan

**Control overallComment:**

> Naomi, this essay is exemplary in every dimension. Your central insight—that Morrison constructs memory as spatial rather than psychological—is the kind of original, defensible claim that transforms how we read the novel. What makes this work so compelling is not just the thesis itself, but how rigorously you follow its implications: into narrative structure, into characterization, into the novel's resolution. You demonstrate that close reading and bold thinking are not opposites but partners. The writing is confident and precise, with a voice that feels both authentic and intellectually mature. This is exactly the kind of essay that makes readers—and teachers—reconsider a text they thought they understood. Exceptional work.

**Treatment overallComment (post-rehydrate):**

> Naomi, this essay demonstrates exactly the kind of intellectual courage and originality we're looking for. Your spatial reading of rememory is genuinely fresh—it reframes Morrison's entire narrative project in a way that feels discovered rather than borrowed. The argument builds with precision: you move from concept to structure to embodiment to exorcism, and each step feels necessary and earned. Your voice is confident and engaging, with moments ('a rememory made flesh,' 'the past refuses to stay past') that linger in the reader's mind. The one area for growth is evidence density—while your Sethe quotation is expertly chosen and integrated, adding one or two more precise textual moments would deepen the middle sections and give readers even more grounding in Morrison's language. But this is minor. You're writing with sophistication, clarity, and real insight. Keep taking these kinds of intellectual risks.

Judge: winner=treatment (raw A, A=treatment) — Comment A provides more actionable, specific feedback while maintaining warmth and praise. It identifies a concrete area for improvement ('evidence density') and points to specific phrases from the essay that work well ('a rememory made flesh,' 'the past refuses to stay past'). Comment B, while enthusiastic and well-written, offers only praise without any developmental feedback or specific textual references from the essay itself. For a student's growth, Comment A's balance of affirmation and constructive guidance is more useful than Comment B's unqualified praise.

### E12-weak-grammar-heavy (weak) — Weak, heavy grammar/mechanics errors; tests whether the grammar-heavy signal stays consistent across control and treatment.

Real name: Tyler | Pseudonym used in treatment prompt: Wren

**Control overallComment:**

> Tyler, this draft needs significant development before it can function as a thesis-driven essay. Right now, it reads more like an informal opinion piece than an academic argument. You're missing the foundational elements: a defensible, multi-layered thesis; body paragraphs that build and deepen analysis; evidence from credible sources; and technical correctness in grammar and mechanics. Start by crafting a precise thesis that goes beyond 'part-time jobs are good'—what specific, non-obvious insight can you offer? Then, support that thesis with concrete evidence and sustained critical thinking. Finally, revise carefully for grammar, spelling, and sentence structure. This topic has potential, but the essay needs to be rebuilt from the ground up to meet academic standards.

**Treatment overallComment (post-rehydrate):**

> Tyler, this draft needs substantial development before it can function as a thesis-driven essay. Right now, it reads more like an informal reflection than an academic argument. You'll need to craft a specific, defensible thesis that goes beyond 'part-time jobs are good'—dig into *why* they matter, *what* complexities arise, and *how* your thinking has evolved through exploration of the topic. Build body paragraphs that each tackle a distinct element of that thesis with depth and evidence. Integrate research or concrete examples to support your claims and give your argument authority. Pay close attention to grammar, punctuation, and sentence structure; the technical errors here are pervasive enough to distract from your ideas. Finally, develop an authentic academic voice that balances clarity with intellectual engagement. This rubric rewards bold thinking and genuine discovery—challenge yourself to move past obvious observations and truly wrestle with the subject.

Judge: winner=treatment (raw A, A=treatment) — Comment A is more specific and grounded in the actual essay content. It directly references the essay's current state ('reads more like an informal reflection'), acknowledges what the student is attempting ('part-time jobs are good'), and provides concrete guidance tied to the rubric's emphasis on 'bold thinking and genuine discovery.' Comment A also specifically mentions issues present in the essay like 'technical errors,' 'grammar, punctuation, and sentence structure,' and the need to move 'past obvious observations.' Comment B, while covering similar territory, is more generic and formulaic—it lists standard essay requirements without engaging as directly with what this particular student wrote. The phrase 'rebuilt from the ground up' in B is harsher without being more helpful. Comment A's closing encouragement to 'truly wrestle with the subject' shows more warmth and investment in the student's growth.

### E13-mid-overcoming-failure (mid) — Mid-range personal narrative, reflective but somewhat generic conclusion.

Real name: Ava | Pseudonym used in treatment prompt: Teagan

**Control overallComment:**

> Ava, you've written a clear, honest, and well-crafted personal narrative with a strong voice and polished mechanics—but this assignment asks for thesis-driven analytical writing, and your essay doesn't yet meet that standard. The difference is crucial: instead of narrating an experience and reflecting on what you learned, a thesis-driven essay makes an argument that requires evidence, analysis, and intellectual risk. Your insight about pride and asking for help is a starting point, but it needs to be developed into a complex, defensible claim supported by evidence beyond personal anecdote. Think about what larger question your experience helps answer, what sources could deepen your analysis, and how you might structure body paragraphs around distinct analytical claims rather than chronological storytelling. Your writing skills are strong—now channel them toward building an argument that makes your reader think differently about the subject.

**Treatment overallComment (post-rehydrate):**

> Ava, you've written a thoughtful and well-crafted personal reflection with an authentic voice and strong technical control. The narrative about learning to ask for help is clear and relatable, and your writing demonstrates real skill in pacing and precision. However, this assignment requires a thesis-driven essay—one that makes an arguable claim, engages with outside sources, and sustains critical analysis throughout. What you've submitted is a personal narrative without a defensible thesis, analytical framework, or textual evidence. To meet the assignment expectations, you'll need to develop a complex argument that requires proof, integrate researched sources that build authority, and structure body paragraphs around analytical claims rather than chronological events. Your writing ability is evident; now channel that skill toward making an intellectual argument that challenges readers to think differently about a subject. Consider what larger question about pride, failure, or growth you could explore through research and analysis, using your personal insight as a starting point rather than the entire essay.

Judge: winner=tie (raw tie, A=treatment) — Both comments are nearly identical in content, structure, and quality. Each opens with the same compliment about the student's writing ability, identifies the same core problem (personal narrative vs. thesis-driven essay), provides similar guidance about what's needed (arguable claim, outside sources, analytical structure), and closes with the same encouragement to redirect existing skills. Comment A is slightly more detailed in places (mentioning 'textual evidence,' 'researched sources,' and 'chronological events'), while Comment B uses phrases like 'intellectual risk' and 'evidence beyond personal anecdote.' However, these are stylistic variations rather than meaningful quality differences. Neither comment references specific details from the essay itself—both could apply to virtually any personal narrative submitted for an analytical assignment. The warmth, specificity, and usefulness are essentially equivalent.

### E14-strong-ubi-counterargument (strong) — Strong argumentative essay that explicitly engages and rebuts a counterargument.

Real name: Diego | Pseudonym used in treatment prompt: Wren

**Control overallComment:**

> Diego, you've written a thoughtful, well-reasoned essay that takes on a genuinely difficult question without oversimplifying it. Your willingness to engage the strongest objection head-on, rather than strawmanning the opposition, is a real strength—it shows intellectual honesty and maturity. The structure is logical, the evidence is relevant, and your voice is clear and credible throughout. What would take this essay to the next level is *depth*. You present the data and complicate the objection, but you stop just short of the deeper insight: if people work for structure, status, and purpose, what does that mean for how we design UBI or think about work itself? Push your analysis one layer further. Also, consider your opening—right now, you dive straight into the argument, but a more compelling introduction could draw your reader in and set up the stakes more vividly. Your conclusion gestures toward new thinking, but it could be bolder. You're doing strong, honest work here—now take the intellectual risk of going deeper.

**Treatment overallComment (post-rehydrate):**

> Diego, this is a model of how to engage a contentious issue with intellectual honesty and precision. You don't dismiss the objection to UBI—you take it seriously, test it against evidence, and show where it falters. Your voice is confident without being dogmatic, and your reasoning is clear and compelling. The essay's greatest strength is its restraint: you make exactly the claim your evidence supports, no more and no less. To push this into truly exemplary territory, consider what your argument *opens* rather than what it closes. If the incentive-to-work objection is weaker than assumed, what does that suggest about how we should think about work, meaning, or policy design going forward? That move—from rebuttal to implication—would transform a strong argument into one that lingers with readers long after they finish.

Judge: winner=treatment (raw A, A=treatment) — Both comments are warm, substantive, and constructive, but Comment A is more focused and precise. It identifies the essay's core strength ('restraint: you make exactly the claim your evidence supports') with sharp specificity, and offers a single, clear developmental suggestion about moving 'from rebuttal to implication.' Comment B covers similar ground but dilutes its impact by listing multiple suggestions (deeper analysis, stronger opening, bolder conclusion) without the same laser focus. Comment A's conciseness and singular forward-looking question ('what does that suggest about how we should think about work, meaning, or policy design?') makes it more actionable and memorable. Both are grounded in the essay's actual content, but A's economy and clarity give it the edge.
