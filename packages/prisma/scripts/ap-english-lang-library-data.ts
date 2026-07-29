// AP English Language and Composition free-response library.
//
// Coverage mirrors the exam's three free-response questions:
//   - synthesis ............ Q1, six sources including one visual; the student
//                            argues a position using at least three of them
//   - rhetorical_analysis .. Q2, one nonfiction passage; the student analyzes
//                            the writer's rhetorical choices
//   - argument ............. Q3, no provided text; the student argues from
//                            their own reading, observation, and experience
//
// SOURCING POLICY
//
// Rhetorical analysis passages are genuine public-domain texts, quoted from the
// historical record and carrying a provenance URL. Argument prompts quote only
// public-domain writers or state an unattributed claim.
//
// Synthesis sources are DIFFERENT. Real exam packets excerpt contemporary,
// copyrighted journalism and research, and inventing realistic-looking
// quotations attributed to real outlets or researchers would put fabricated
// statements into students' hands. Every synthesis source here is therefore
// composed for this exercise and labeled as such in its attribution. The
// positions they take are representative of the real debate; the wording,
// figures, and speakers are not quotations from anyone.
//
// Visual sources currently carry their data as a described table in `body`
// with `imageAlt` naming what the chart shows. Swapping in real chart assets
// is a follow-up; the snapshot schema already carries `imageUrl` for it.
//
// PASSAGE LENGTH (Q2). The exam hands the student a complete, self-contained
// passage of roughly 500-750 words. Entries whose passage comes from
// ./ap-english-lang-passages meet that bar verbatim. The remaining entries still
// ship the short excerpts this library launched with; they are listed in
// SHORT_EXCERPT_PASSAGE_KEYS so the gap is visible and enforced rather than
// silently shipped, and each needs a full text before it is exam-usable.

import {
  KENNEDY_INAUGURAL_OPENING,
  LINCOLN_SECOND_INAUGURAL,
  ROOSEVELT_FIRST_INAUGURAL_OPENING,
} from './ap-english-lang-passages';

type LibrarySource = {
  externalKey: string;
  position: number;
  title: string;
  attribution: string;
  body: string;
  caption: string | null;
  mediaType: 'text' | 'image';
  imageUrl: string | null;
  imageAlt: string | null;
  provenanceUrl: string | null;
};

type LibraryEntry = {
  externalKey: string;
  frqType: 'synthesis' | 'rhetorical_analysis' | 'argument';
  title: string;
  prompt: string;
  focusSkill: string;
  difficulty: 'entry' | 'developing' | 'exam-ready';
  skillEmphasis: 'thesis' | 'evidence-commentary' | 'sophistication';
  defaultTimeMode: 'untimed' | 'timed';
  defaultDurationMinutes: number;
  suggestedEvidence: string | null;
  provenanceUrl: string | null;
  sources: LibrarySource[];
};

const PRACTICE_ATTRIBUTION = 'Practice source composed for this exercise';

/**
 * Builds the standard AP synthesis prompt wrapper so all twelve packets share
 * the exam's phrasing, including the "at least three sources" requirement that
 * drives the Row B ceiling.
 */
function synthesisPrompt(context: string, question: string): string {
  return [
    context,
    '',
    'Carefully read the following six sources, including the introductory information for each source.',
    `Then synthesize material from at least three of the sources and incorporate it into a coherent, well-developed essay that argues a clear position on ${question}`,
    '',
    'Your argument should be central; the sources should support the argument. Avoid merely summarizing the sources. Cite each source you use by its letter (Source A, Source B, and so on).',
  ].join('\n');
}

function synthesisSources(
  entryKey: string,
  sources: Array<{
    title: string;
    body: string;
    caption?: string | null;
    visual?: boolean;
    imageAlt?: string;
  }>,
): LibrarySource[] {
  return sources.map((source, index) => {
    const letter = String.fromCharCode(65 + index);
    return {
      externalKey: `${entryKey}-source-${letter.toLowerCase()}`,
      position: index + 1,
      title: `Source ${letter} — ${source.title}`,
      attribution: PRACTICE_ATTRIBUTION,
      body: source.body,
      caption: source.caption ?? null,
      mediaType: source.visual ? 'image' : 'text',
      imageUrl: null,
      imageAlt: source.visual ? (source.imageAlt ?? null) : null,
      provenanceUrl: null,
    };
  });
}

const SYNTHESIS_ENTRIES: LibraryEntry[] = [
  {
    externalKey: 'ap-lang-synthesis-school-start-times',
    frqType: 'synthesis',
    title: 'School Start Times — Synthesis',
    prompt: synthesisPrompt(
      'Most American high schools begin the instructional day before 8:00 a.m. Sleep researchers have argued for decades that this conflicts with adolescent biology, while districts point to transportation costs, athletics, and family schedules. Several states have now legislated later start times.',
      'whether high schools should be required to start later in the morning.',
    ),
    focusSkill: 'source-integration',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-school-start-times', [
      {
        title: 'Adolescent sleep biology',
        body: 'Puberty shifts the circadian rhythm later by roughly two hours, so a teenager told to sleep at 10:00 p.m. is often biologically incapable of falling asleep before midnight. An early bell does not move that clock; it simply subtracts from the end of the night. The result is chronic partial sleep deprivation across an entire developmental stage.',
      },
      {
        title: 'A superintendent on logistics',
        body: 'Our buses run three tiers. High school first, then middle, then elementary, because the same drivers and the same vehicles have to cover all three. Pushing the high school an hour later does not shift one bell; it collapses the tier system and forces either a fleet expansion we cannot fund or elementary students waiting for buses in the dark.',
      },
      {
        title: 'Attendance and outcomes after a district change',
        body: 'A district that moved its high school bell from 7:25 to 8:35 reported reduced first-period tardiness and a modest rise in attendance the following year. Administrators cautioned that the change coincided with a new attendance policy, making it difficult to isolate the effect of the bell alone.',
      },
      {
        title: 'A student athlete objects',
        body: 'Practice already runs until six. Start school an hour later and we are on the field at seven, home at eight, eating dinner at nine, and starting homework after that. The people arguing that a later bell will give me more sleep have not looked at what happens to the other end of my day.',
      },
      {
        title: 'The equity argument',
        body: 'Later start times are sometimes framed as a benefit for all students, but the burden falls unevenly. Students who work evening shifts, or who care for younger siblings until a parent returns, may lose income or force a family to buy childcare. Any policy that ignores who absorbs the cost of the change is incomplete.',
      },
      {
        title: 'Reported nightly sleep by school start time',
        visual: true,
        imageAlt:
          'Bar chart of average reported nightly sleep among high school students grouped by school start time',
        caption:
          'Self-reported averages; the survey does not control for homework load or employment.',
        body: [
          'Average reported nightly sleep, high school students, by school start time:',
          '',
          'Before 7:30 a.m. ....... 6.4 hours',
          '7:30 to 8:00 a.m. ...... 6.9 hours',
          '8:00 to 8:30 a.m. ...... 7.5 hours',
          'After 8:30 a.m. ........ 7.9 hours',
          '',
          'Recommended range for adolescents: 8 to 10 hours.',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-ai-writing-tools',
    frqType: 'synthesis',
    title: 'AI Writing Tools in the Classroom — Synthesis',
    prompt: synthesisPrompt(
      'Generative writing tools can now draft, revise, and critique student essays. Schools have responded in incompatible ways: some ban the tools outright, some teach with them deliberately, and some have quietly left the decision to individual teachers.',
      'what role, if any, generative writing tools should play in high school writing instruction.',
    ),
    focusSkill: 'qualifying-a-position',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-ai-writing-tools', [
      {
        title: 'The case for teaching with the tools',
        body: 'Students will write alongside these systems for the rest of their lives. A school that bans them does not produce students who write without assistance; it produces students who use assistance badly and in secret. The instructional question is not whether to allow the tool but how to make its use visible, deliberate, and accountable.',
      },
      {
        title: 'A teacher on what gets lost',
        body: 'The struggle is the lesson. When a student sits with a paragraph that will not come, and stays with it, and finds the sentence — that is the moment the thinking actually happens. A tool that removes the struggle removes the learning and leaves behind a document that looks like learning.',
      },
      {
        title: 'On detection',
        body: 'Detection software returns both false positives and false negatives at rates high enough to make individual accusations unreliable. Policies that depend on catching students place teachers in the position of prosecuting cases they cannot prove, which corrodes the relationship instruction depends on.',
      },
      {
        title: 'A student describes actual use',
        body: 'Nobody I know asks it to write the essay. You ask it what your thesis is actually claiming, or whether your third paragraph supports the second one. It is closer to a study partner who has read everything and has no opinions. The teachers imagining wholesale cheating are imagining a use case that is not the common one.',
      },
      {
        title: 'The equity dimension',
        body: 'Sophisticated tools are increasingly bundled into paid tiers. A blanket ban is enforced most effectively against students who do their work at school on school devices, while students with private access face no meaningful constraint. Prohibition can widen the gap it is meant to close.',
      },
      {
        title: 'School policies on generative writing tools',
        visual: true,
        imageAlt:
          'Table showing the distribution of school policies on generative writing tools and reported enforcement confidence',
        caption:
          'Policy categories are self-reported by administrators; enforcement confidence is reported by classroom teachers.',
        body: [
          'Reported school policy on generative writing tools:',
          '',
          'Prohibited for all coursework ............. 31%',
          'Permitted with disclosure ................. 28%',
          'Permitted for planning and revision only .. 22%',
          'No stated policy .......................... 19%',
          '',
          'Teachers reporting confidence that their school\'s policy is enforceable: 24%',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-social-media-age-limits',
    frqType: 'synthesis',
    title: 'Age Limits for Social Media — Synthesis',
    prompt: synthesisPrompt(
      'Several governments have proposed or enacted minimum ages for social media accounts, and some require parental consent for minors. Supporters cite adolescent mental health; opponents raise questions about enforcement, privacy, and the value of online community for isolated young people.',
      'whether governments should set and enforce a minimum age for social media accounts.',
    ),
    focusSkill: 'counterargument',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-social-media-age-limits', [
      {
        title: 'The regulatory argument',
        body: 'We do not ask twelve-year-olds to evaluate the risks of tobacco or driving; we set an age and enforce it. Products engineered by large teams to maximize the time an adolescent spends looking at them deserve the same treatment. Framing the question as parental choice offloads onto families a burden that is structural.',
      },
      {
        title: 'On enforcement',
        body: 'Any meaningful age limit requires verifying the age of every user, not only minors. That means uploading identification or submitting to biometric estimation. A policy intended to protect children ends by building an identity infrastructure over the entire population, and the record of who said what becomes permanently attached to a legal name.',
      },
      {
        title: 'A counselor on isolated students',
        body: 'For a rural student, or a student whose identity is not safe to discuss at home, the online community is not a substitute for connection. It is the connection. I have watched a ban discussion proceed for an hour without anyone naming the students for whom these spaces are the only place they are known.',
      },
      {
        title: 'What the research supports',
        body: 'Correlations between heavy use and reported distress are consistent, but the direction of the relationship is contested: distressed adolescents may seek these platforms rather than be harmed by them. Studies that follow the same students over time report smaller effects than cross-sectional snapshots.',
      },
      {
        title: 'A parent on the collective action problem',
        body: 'I can refuse my daughter an account. What I cannot do is keep her from being the only one without one. Every plan that ends in an individual family saying no ignores that the cost of saying no falls on a child who then sits outside every conversation her friends are having.',
      },
      {
        title: 'Daily use and reported wellbeing',
        visual: true,
        imageAlt:
          'Line chart pairing average daily social media use with reported wellbeing scores across age bands',
        caption:
          'Cross-sectional data; the chart shows association and cannot establish direction.',
        body: [
          'Average daily use and mean reported wellbeing score (0-100), by age band:',
          '',
          'Ages 10-12 .... 1.9 hours .... 71',
          'Ages 13-14 .... 3.2 hours .... 63',
          'Ages 15-16 .... 4.1 hours .... 58',
          'Ages 17-18 .... 4.4 hours .... 59',
          '',
          'Adults 25-34 .. 2.6 hours .... 66',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-college-athlete-pay',
    frqType: 'synthesis',
    title: 'Paying College Athletes — Synthesis',
    prompt: synthesisPrompt(
      'Revenue from college athletics supports large institutional budgets, and athletes may now earn money from their name, image, and likeness. Whether universities themselves should pay athletes directly remains contested.',
      'whether universities should pay athletes directly for their participation in revenue sports.',
    ),
    focusSkill: 'evidence-specificity',
    difficulty: 'developing',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-college-athlete-pay', [
      {
        title: 'The labor argument',
        body: 'A football player commits forty hours a week during the season to an enterprise that sells tickets, broadcast rights, and merchandise bearing his number. Every other participant in that enterprise is compensated: the coach, the athletic director, the broadcast crew. Only the person generating the product is told that compensation would corrupt him.',
      },
      {
        title: 'An athletic director on the budget',
        body: 'Two of our twenty-one sports generate revenue. The other nineteen are funded by those two. Direct salaries in football and basketball do not come out of some reserve; they come out of wrestling, out of women\'s rowing, out of the programs that exist because a surplus exists.',
      },
      {
        title: 'On the scholarship as compensation',
        body: 'The scholarship covers tuition, housing, meals, medical care, and academic support, a package worth a substantial sum over four years. The counterargument is that its value is set by the university rather than negotiated, and that it terminates with an injury that ends a career but not a debt.',
      },
      {
        title: 'A former athlete on what the degree was worth',
        body: 'They point to the degree. The degree was real. What was also real was that I was steered into a schedule built around practice, that the major I wanted conflicted with team obligations, and that nobody in the compliance office ever framed that as a cost. I got an education. I did not get the one I chose.',
      },
      {
        title: 'The Title IX complication',
        body: 'Federal law requires equitable treatment of male and female athletes. Direct payment concentrated in football and men\'s basketball raises unresolved questions about whether compensation counts as a benefit subject to that requirement, and no proposal has fully answered them.',
      },
      {
        title: 'Athletic department revenue and expense',
        visual: true,
        imageAlt:
          'Stacked bar chart comparing athletic department revenue sources against expense categories',
        caption:
          'Figures are illustrative of a large public athletic department and are composed for this exercise.',
        body: [
          'Representative large athletic department, annual:',
          '',
          'REVENUE',
          '  Media rights ............... 42%',
          '  Ticket sales ............... 21%',
          '  Donations .................. 19%',
          '  Institutional support ...... 11%',
          '  Other ....................... 7%',
          '',
          'EXPENSE',
          '  Coaching salaries .......... 33%',
          '  Facilities and debt ........ 27%',
          '  Scholarships ............... 22%',
          '  Travel and operations ...... 18%',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-standardized-testing',
    frqType: 'synthesis',
    title: 'Standardized Testing in Admissions — Synthesis',
    prompt: synthesisPrompt(
      'Many universities suspended standardized test requirements and then split: some restored them, some went permanently test-optional, and some abandoned the tests entirely. Each camp claims the evidence supports it.',
      'what role standardized tests should play in university admissions.',
    ),
    focusSkill: 'weighing-evidence',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-standardized-testing', [
      {
        title: 'The case for restoring the test',
        body: 'Grade inflation is uneven across schools, which makes a transcript hard to read without context. A common instrument, whatever its flaws, gives an admissions officer one comparable number. Removing it does not remove subjectivity; it relocates subjectivity into essays and recommendations, which track family resources at least as closely.',
      },
      {
        title: 'The case against',
        body: 'Scores correlate strongly with family income and with access to preparation that costs thousands of dollars. A measure that reliably predicts a student\'s zip code is a poor instrument for identifying merit, and defending it as objective mistakes the consistency of the measurement for the fairness of what is measured.',
      },
      {
        title: 'An admissions officer on the practical effect',
        body: 'Test-optional did not mean test-blind. Submitted scores still helped applicants; withheld scores still raised a question we could not un-ask. What we built was a policy that felt more equitable while quietly preserving the old advantage for anyone who could afford to try twice.',
      },
      {
        title: 'On predictive validity',
        body: 'Scores predict first-year grades modestly, and the prediction weakens when high school grades are already in the model. Defenders read this as a real if small independent signal; critics read the same number as too small to justify the industry that has grown around it.',
      },
      {
        title: 'A counselor on what students experience',
        body: 'Optional is the cruelest word in the process. It transfers the decision to a seventeen-year-old who must guess whether a score helps or hurts, and who will spend a summer and money finding out. Students do not experience optional as freedom. They experience it as one more unmarked test.',
      },
      {
        title: 'Mean score by reported family income',
        visual: true,
        imageAlt:
          'Bar chart of mean standardized test score across family income brackets',
        caption:
          'Illustrative distribution composed for this exercise; the pattern, not the figures, is the point.',
        body: [
          'Mean composite score by reported family income:',
          '',
          'Under $40,000 ............. 950',
          '$40,000 to $80,000 ........ 1030',
          '$80,000 to $120,000 ....... 1100',
          '$120,000 to $200,000 ...... 1170',
          'Over $200,000 ............. 1240',
          '',
          'Share of test takers reporting paid preparation, top bracket: 63%',
          'Share of test takers reporting paid preparation, bottom bracket: 11%',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-public-libraries',
    frqType: 'synthesis',
    title: 'The Future of Public Libraries — Synthesis',
    prompt: synthesisPrompt(
      'Public libraries circulate fewer physical books than they once did while serving more people as social infrastructure: internet access, cooling centers, job assistance, and shelter from the street. Funding formulas still tend to reward circulation.',
      'how communities should define and fund the mission of the public library.',
    ),
    focusSkill: 'defining-terms',
    difficulty: 'developing',
    skillEmphasis: 'thesis',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-public-libraries', [
      {
        title: 'A librarian on what the job became',
        body: 'I was trained as a reference librarian. This morning I helped a man file for unemployment, called an ambulance, and explained to a woman how to open the email account a caseworker had told her to check. None of that appears in a circulation statistic, and all of it is the reason the building matters.',
      },
      {
        title: 'The case for the core mission',
        body: 'A library that becomes a general-purpose social agency will be funded as one and staffed as one, which means underfunded and understaffed. The institution has a distinct claim on public money precisely because it does something no other agency does. Diluting the mission is not generosity; it is how the mission gets lost.',
      },
      {
        title: 'On the digital divide',
        body: 'Assumptions about universal home broadband are wrong in both rural and urban districts. For households without a reliable connection, the library terminal is where school assignments are submitted, benefits are applied for, and job applications are completed. The building is the last public place where connectivity is free and unconditioned.',
      },
      {
        title: 'A trustee on the funding formula',
        body: 'Our allocation is driven by items circulated. The branch doing the hardest work in the poorest neighborhood posts the lowest circulation and therefore receives the smallest budget. We are measuring the one thing that has least to do with what that branch is actually for.',
      },
      {
        title: 'Third places and civic life',
        body: 'Sociologists describe a third place as somewhere a person can go that is neither home nor work and that costs nothing to enter. Nearly every such place has been privatized. The library is close to the last one standing, which is an argument about civic life rather than about books.',
      },
      {
        title: 'Library use by service category',
        visual: true,
        imageAlt:
          'Chart comparing change in library service usage across categories over a ten-year span',
        caption:
          'Index values, composed for this exercise, with the first year set to 100.',
        body: [
          'Indexed library service use over ten years (year one = 100):',
          '',
          'Physical circulation ............ 100 → 68',
          'Digital circulation ............. 100 → 214',
          'Public computer sessions ........ 100 → 131',
          'Program attendance .............. 100 → 156',
          'Social service referrals ........ 100 → 240',
          '',
          'Total visits .................... 100 → 104',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-four-day-school-week',
    frqType: 'synthesis',
    title: 'The Four-Day School Week — Synthesis',
    prompt: synthesisPrompt(
      'Hundreds of districts, concentrated in rural areas, have moved to a four-day instructional week, usually to save money or to retain teachers. Evidence on academic outcomes is mixed and the effects on families are uneven.',
      'whether districts should adopt a four-day school week.',
    ),
    focusSkill: 'cost-benefit-reasoning',
    difficulty: 'developing',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-four-day-school-week', [
      {
        title: 'A rural superintendent on why',
        body: 'We did not adopt four days because we read a study. We adopted it because we could not fill six positions and the districts that had gone to four days were filling theirs. It is a recruitment tool we can afford when a salary increase is not one.',
      },
      {
        title: 'The savings are smaller than expected',
        body: 'Transportation and hourly wages fall, but the building still requires heat, insurance, and maintenance, and most districts lengthen the four remaining days, which raises utility use on those days. Reported net savings typically land between two and four percent of an operating budget.',
      },
      {
        title: 'A parent on the fifth day',
        body: 'Everyone discussing this assumes a parent is home on Friday. I am not. Childcare for one day a week costs more than the district saves per student, and I am paying it out of a wage the district is not raising. The savings did not disappear. They moved onto my kitchen table.',
      },
      {
        title: 'On instructional time',
        body: 'Districts typically preserve total annual minutes by extending each remaining day by sixty to ninety minutes. Whether an eight-hour day for a second grader delivers the same instruction as a shorter one is an open question, and attention data suggests the added minutes are the least productive of the day.',
      },
      {
        title: 'A teacher on the tradeoff',
        body: 'The fifth day is when I plan, grade, and see a doctor. I would not go back. I also watch students arrive Monday having eaten less over a three-day weekend, and I know which of those two facts is discussed at board meetings.',
      },
      {
        title: 'Reported outcomes in districts after conversion',
        visual: true,
        imageAlt:
          'Table of reported changes in staffing, attendance, and assessment results after four-day conversion',
        caption: 'Composed for this exercise; ranges reflect the spread across districts.',
        body: [
          'Reported change after conversion to a four-day week:',
          '',
          'Teacher vacancy rate .......... down 30% to 45%',
          'Teacher retention ............. up 5% to 12%',
          'Student attendance ............ up 1% to 3%',
          'Operating cost ................ down 2% to 4%',
          'Assessment results ............ no consistent change; small declines in elementary math',
          '',
          'Districts reporting added childcare burden on families: 71%',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-car-free-city-centers',
    frqType: 'synthesis',
    title: 'Car-Free City Centers — Synthesis',
    prompt: synthesisPrompt(
      'A number of cities have closed central districts to private cars, citing air quality, safety, and street life. Merchants and residents with limited mobility have raised objections, and results have varied widely by city.',
      'whether cities should close their central districts to private automobiles.',
    ),
    focusSkill: 'stakeholder-analysis',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-car-free-city-centers', [
      {
        title: 'The urbanist case',
        body: 'A street is the largest piece of public land a city owns, and most cities give nearly all of it to the storage and movement of private vehicles carrying an average of one and a fraction people. Reclaiming that space is not anti-car; it is a question about what the most valuable land in a city is for.',
      },
      {
        title: 'A merchant association responds',
        body: 'Our customers arrive by car and leave with more than they can carry on a bus. Planners consistently overestimate how many shoppers walk in and underestimate how far a delivery has to travel once a van cannot reach the door. The pedestrian counts go up. The receipts do not always follow.',
      },
      {
        title: 'What the merchant estimates get wrong',
        body: 'Surveys repeatedly find that merchants overestimate the share of their customers arriving by car, sometimes by a factor of two or three. Where cities have measured before and after, pedestrianized streets more often show increased foot traffic and stable or rising sales, with the sharpest losses concentrated in businesses dependent on through-traffic.',
      },
      {
        title: 'A disability advocate',
        body: 'Car-free is not access-free unless someone plans for it. For a person who cannot walk four blocks from a transit stop, the private vehicle is not a lifestyle preference. Every plan I have read treats accessible drop-off as an exception to be granted rather than as a design requirement.',
      },
      {
        title: 'On displacement of traffic',
        body: 'Closing a central district does not eliminate trips; it redistributes them. Some evaporate as travelers change mode or destination, a phenomenon consistently observed but hard to predict in advance. The remainder lands on the ring road and on the residential streets just outside the boundary, where the residents had no vote in the closure.',
      },
      {
        title: 'Measured change after central pedestrianization',
        visual: true,
        imageAlt:
          'Chart of measured changes in air quality, foot traffic, retail revenue, and ring-road congestion after pedestrianization',
        caption: 'Ranges composed for this exercise across several city programs.',
        body: [
          'Measured change one year after central pedestrianization:',
          '',
          'Nitrogen dioxide, core ......... down 18% to 34%',
          'Pedestrian counts, core ........ up 20% to 61%',
          'Retail revenue, core ........... down 4% to up 17%',
          'Ring road travel time .......... up 6% to 22%',
          'Reported collisions, core ...... down 25% to 50%',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-food-waste',
    frqType: 'synthesis',
    title: 'Food Waste — Synthesis',
    prompt: synthesisPrompt(
      'A large share of food produced is never eaten, lost across farms, distribution, retail, and households. Proposed remedies range from date-label reform to donation mandates to changes in household habits.',
      'where the responsibility for reducing food waste should primarily fall.',
    ),
    focusSkill: 'assigning-responsibility',
    difficulty: 'developing',
    skillEmphasis: 'thesis',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-food-waste', [
      {
        title: 'On date labels',
        body: 'Most date labels indicate peak quality rather than safety, and the phrases are unregulated in many jurisdictions. Consumers reading "best by" as "unsafe after" discard enormous quantities of edible food. Standardizing the language is among the cheapest available interventions and requires no change in behavior beyond reading.',
      },
      {
        title: 'A grower on cosmetic standards',
        body: 'I have disked under fields of perfectly good produce because it did not meet a diameter specification written by a buyer who has never eaten one. The waste did not happen in anyone\'s kitchen. It happened in my field, to satisfy a standard the consumer never asked for and never sees.',
      },
      {
        title: 'The household share',
        body: 'Households account for the largest single share of waste by weight in wealthy countries, and household waste is also the most emissions-intensive because it has absorbed every input along the chain. This makes consumer behavior both the biggest lever and the hardest one to move.',
      },
      {
        title: 'A food bank director',
        body: 'Donation mandates sound decisive and arrive without refrigeration, trucks, or staff. We are offered more food than we can collect, and what we cannot collect in time becomes our disposal cost. Legislating the donation without funding the logistics moves the waste rather than preventing it.',
      },
      {
        title: 'Against individual responsibility framing',
        body: 'Campaigns aimed at consumer habits have been the dominant response for two decades, and the aggregate numbers have barely moved. When a problem is produced by portion sizes, package sizes, promotional pricing, and cosmetic specifications set upstream, locating responsibility with the shopper is a way of declining to address it.',
      },
      {
        title: 'Where food is lost along the chain',
        visual: true,
        imageAlt:
          'Flow chart showing the share of food lost at each stage from farm to household',
        caption: 'Shares composed for this exercise; distribution varies by country and commodity.',
        body: [
          'Share of total food loss by stage, high-income setting:',
          '',
          'Farm and harvest ............... 20%',
          'Processing ..................... 11%',
          'Distribution and transport ..... 9%',
          'Retail ......................... 13%',
          'Food service ................... 16%',
          'Household ...................... 31%',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-remote-work',
    frqType: 'synthesis',
    title: 'Remote Work and the City — Synthesis',
    prompt: synthesisPrompt(
      'Sustained remote and hybrid work has changed commuting patterns, downtown economies, and the tax bases that depend on them, while giving many workers time and flexibility they are unwilling to surrender.',
      'how employers and cities should respond to sustained remote work.',
    ),
    focusSkill: 'competing-goods',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-remote-work', [
      {
        title: 'A worker on what was gained',
        body: 'I got back ninety minutes a day. That is not a perk. That is dinner with my children, an appointment I do not have to take leave for, and a run I actually take. When an executive describes the office as essential to culture, I hear a request that I return that time without compensation.',
      },
      {
        title: 'The case for the office',
        body: 'The strongest argument is not productivity, which shows little consistent difference, but the development of junior staff. Expertise transfers through overheard conversations and unscheduled correction. Remote work is efficient for those who already know how to do the job and quietly expensive for those learning it.',
      },
      {
        title: 'A downtown business owner',
        body: 'My lunch trade was built on eleven thousand people arriving within four blocks each morning. Now it is Tuesday through Thursday. I do not need everyone back five days; I need to know which days, because a restaurant staffed for a crowd that does not come loses money faster than one that turns people away.',
      },
      {
        title: 'On municipal finance',
        body: 'Commercial property valuations and the transit fares and sales taxes tied to commuting have fallen together in many downtowns, and these revenues fund services used by residents who never commuted. Adjustment is possible but slow, and the interval is measured in budget cycles that fall on schools and transit first.',
      },
      {
        title: 'Conversion is harder than it sounds',
        body: 'Proposals to convert empty offices into housing meet an unglamorous obstacle: floor plates too deep for windowed bedrooms, plumbing stacks in the wrong places, and codes written for a different use. A minority of buildings convert economically without subsidy, which makes conversion a partial answer rather than the answer.',
      },
      {
        title: 'Weekday downtown activity',
        visual: true,
        imageAlt:
          'Bar chart of downtown weekday foot traffic by day of week compared with a pre-remote baseline',
        caption: 'Indexed to a pre-remote baseline of 100; composed for this exercise.',
        body: [
          'Downtown weekday activity index (pre-remote baseline = 100):',
          '',
          'Monday ...... 61',
          'Tuesday ..... 84',
          'Wednesday ... 89',
          'Thursday .... 81',
          'Friday ...... 48',
          '',
          'Transit fare revenue ............ 67',
          'Commercial office valuation ..... 72',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-urban-green-space',
    frqType: 'synthesis',
    title: 'Urban Green Space — Synthesis',
    prompt: synthesisPrompt(
      'Cities facing rising heat and dense development are weighing investments in parks, street trees, and green corridors against competing demands for housing and transit on the same scarce land.',
      'how cities should prioritize green space against competing land uses.',
    ),
    focusSkill: 'tradeoff-reasoning',
    difficulty: 'developing',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-urban-green-space', [
      {
        title: 'On urban heat',
        body: 'Surface temperatures in a treeless block can run substantially hotter than a shaded one a short walk away, and the difference tracks historical patterns of investment with uncomfortable precision. Canopy is not decoration in a warming city; it is the difference between a survivable afternoon and an emergency.',
      },
      {
        title: 'A housing advocate objects',
        body: 'Every parcel dedicated to a park is a parcel not dedicated to homes, in cities where the shortage of homes is the emergency people actually experience. I support trees. I do not support a politics that finds land for a lawn and cannot find land for a family.',
      },
      {
        title: 'The green gentrification problem',
        body: 'Investment in a park raises adjacent property values, which is normally counted as a benefit. In a neighborhood of renters it can mean the residents who campaigned for the park are gone before the trees mature. The amenity arrives; the intended beneficiaries do not stay to use it.',
      },
      {
        title: 'A parks commissioner on maintenance',
        body: 'Ribbon cuttings are funded. Maintenance is not. A park is a permanent operating obligation disguised as a one-time capital project, and a decade later an unmaintained park is a liability that residents ask us to fence off.',
      },
      {
        title: 'On the small-park alternative',
        body: 'The distributed alternative — a pocket park on a vacant lot, a depaved schoolyard, a planted median — delivers shade and access within a short walk for a fraction of the land cost. It generates no signature photograph, which is a substantial political disadvantage and no argument against it.',
      },
      {
        title: 'Canopy, temperature, and access by neighborhood',
        visual: true,
        imageAlt:
          'Table comparing tree canopy coverage, peak summer temperature, and park access across neighborhood income levels',
        caption: 'Composed for this exercise; the pattern is widely reported.',
        body: [
          'By neighborhood median income:',
          '',
          'Lowest quartile ..... 12% canopy .... +7.2°F vs. city mean .... 41% within a 10-minute walk of a park',
          'Second quartile ..... 19% canopy .... +4.1°F ................... 55%',
          'Third quartile ...... 27% canopy .... +1.8°F ................... 68%',
          'Highest quartile .... 38% canopy .... -1.4°F ................... 79%',
        ].join('\n'),
      },
    ]),
  },
  {
    externalKey: 'ap-lang-synthesis-autonomous-vehicles',
    frqType: 'synthesis',
    title: 'Autonomous Vehicles — Synthesis',
    prompt: synthesisPrompt(
      'Automated driving systems are operating on public roads in a growing number of cities. Proponents cite the toll of human error; critics question the evidence, the liability framework, and the effects on people who drive for a living.',
      'how quickly and under what conditions autonomous vehicles should be permitted on public roads.',
    ),
    focusSkill: 'risk-and-uncertainty',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: synthesisSources('ap-lang-synthesis-autonomous-vehicles', [
      {
        title: 'The safety argument',
        body: 'Traffic deaths are overwhelmingly caused by human error: speed, distraction, impairment, fatigue. A system that never drinks, never texts, and never grows tired at the end of a double shift addresses the actual cause of the actual deaths. Delay is not a neutral choice; it has its own body count.',
      },
      {
        title: 'On the quality of the comparison',
        body: 'Reported per-mile comparisons are not like for like. Automated miles are concentrated in mapped, well-marked, temperate, mostly daytime conditions, while the human baseline includes ice, night, rural roads, and construction. The comparison flatters the system until the operating domain is matched.',
      },
      {
        title: 'A commercial driver',
        body: 'There are millions of us. Every serious projection of this technology includes the disappearance of the job, and none of them includes a plan for the people who hold it. I have listened to a decade of promises about retraining. I have not met anyone who was retrained.',
      },
      {
        title: 'On liability',
        body: 'When a driver causes a collision, responsibility is settled law. When a system does, the question distributes across the manufacturer, the software vendor, the fleet operator, and the passenger who was told to remain attentive. No jurisdiction has fully resolved this, and the unresolved question is itself a safety problem: it determines what gets fixed.',
      },
      {
        title: 'A transit planner on induced demand',
        body: 'Comfortable, cheap, automated travel makes the marginal trip easier, and easier trips multiply. A fleet that circulates empty between passengers adds vehicle miles that no human fleet ever generated. Framing this purely as a safety question skips whether we want more driving at all.',
      },
      {
        title: 'Reported disengagements and incidents by condition',
        visual: true,
        imageAlt:
          'Table of reported automated-system disengagements and incidents per thousand miles across driving conditions',
        caption: 'Composed for this exercise to illustrate the operating-domain gap.',
        body: [
          'Reported disengagements per 1,000 automated miles:',
          '',
          'Mapped urban, clear, daytime ......... 0.4',
          'Mapped urban, night .................. 1.1',
          'Rain or wet roadway .................. 2.7',
          'Snow or ice .......................... 9.3',
          'Unmapped rural ....................... 6.8',
          'Active construction zone ............. 8.1',
          '',
          'Share of total automated test miles driven in the first condition: 68%',
        ].join('\n'),
      },
    ]),
  },
];

/**
 * Builds the single-source array a rhetorical analysis entry ships. The
 * snapshot schema requires exactly one source for this FRQ type.
 *
 * NOTE ON PROVENANCE: every passage below is a public-domain speech or essay.
 * Passages imported from ./ap-english-lang-passages are verbatim transcriptions
 * of a named corpus and carry a `provenanceUrl`; the rest are still the short
 * excerpts this library shipped first and are tracked as such in
 * SHORT_EXCERPT_PASSAGE_KEYS below.
 */
function passageSource(params: {
  key: string;
  title: string;
  attribution: string;
  body: string;
  caption?: string | null;
  provenanceUrl?: string | null;
}): LibrarySource[] {
  return [
    {
      externalKey: `${params.key}-passage`,
      position: 1,
      title: params.title,
      attribution: params.attribution,
      body: params.body,
      caption: params.caption ?? null,
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: params.provenanceUrl ?? null,
    },
  ];
}

function rhetoricalPrompt(context: string, focus: string): string {
  return [
    context,
    '',
    'Read the following passage carefully.',
    `Then write a well-developed essay that analyzes the rhetorical choices ${focus}`,
  ].join('\n');
}

const RHETORICAL_ANALYSIS_ENTRIES: LibraryEntry[] = [
  {
    externalKey: 'ap-lang-rhetorical-gettysburg-address',
    frqType: 'rhetorical_analysis',
    title: 'The Gettysburg Address — Rhetorical Analysis',
    prompt: rhetoricalPrompt(
      'In November 1863, four months after the Battle of Gettysburg, President Abraham Lincoln was invited to deliver brief remarks at the dedication of a national cemetery for the Union dead.',
      "Lincoln makes to redefine the purpose of the war and to honor the dead while calling the living to action.",
    ),
    focusSkill: 'rhetorical-situation',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: passageSource({
      key: 'ap-lang-rhetorical-gettysburg-address',
      title: 'The Gettysburg Address',
      attribution: 'Abraham Lincoln, November 19, 1863 (public domain)',
      body: [
        'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.',
        '',
        'Now we are engaged in a great civil war, testing whether that nation, or any nation so conceived and so dedicated, can long endure. We are met on a great battle-field of that war. We have come to dedicate a portion of that field, as a final resting place for those who here gave their lives that that nation might live. It is altogether fitting and proper that we should do this.',
        '',
        'But, in a larger sense, we can not dedicate—we can not consecrate—we can not hallow—this ground. The brave men, living and dead, who struggled here, have consecrated it, far above our poor power to add or detract. The world will little note, nor long remember what we say here, but it can never forget what they did here. It is for us the living, rather, to be dedicated here to the unfinished work which they who fought here have thus far so nobly advanced. It is rather for us to be here dedicated to the great task remaining before us—that from these honored dead we take increased devotion to that cause for which they gave the last full measure of devotion—that we here highly resolve that these dead shall not have died in vain—that this nation, under God, shall have a new birth of freedom—and that government of the people, by the people, for the people, shall not perish from the earth.',
      ].join('\n'),
      caption: 'The Bliss version, the text most commonly reproduced.',
    }),
  },
  {
    externalKey: 'ap-lang-rhetorical-lincoln-second-inaugural',
    frqType: 'rhetorical_analysis',
    title: "Lincoln's Second Inaugural Address — Rhetorical Analysis",
    prompt: rhetoricalPrompt(
      'In March 1865, with the Civil War nearly won and his own reelection secured, President Lincoln used his second inaugural address not to claim victory but to reflect on the shared responsibility for the war and to call for reconciliation.',
      "Lincoln makes to address a divided nation as the war draws to a close.",
    ),
    focusSkill: 'audience-and-purpose',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl:
      'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/inaugural.zip',
    sources: passageSource({
      key: 'ap-lang-rhetorical-lincoln-second-inaugural',
      title: 'Second Inaugural Address',
      attribution: 'Abraham Lincoln, March 4, 1865 (public domain)',
      body: LINCOLN_SECOND_INAUGURAL,
      caption:
        'The complete address. Lincoln moves from a near-refusal to give a speech at all, through a shared reading of the war\'s cause, to the reconciliation of the closing paragraph.',
      provenanceUrl:
        'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/inaugural.zip',
    }),
  },
  {
    externalKey: 'ap-lang-rhetorical-paine-the-crisis',
    frqType: 'rhetorical_analysis',
    title: 'The Crisis, No. 1 — Rhetorical Analysis',
    prompt: rhetoricalPrompt(
      'In December 1776, with Washington\'s army in retreat and enlistments about to expire, Thomas Paine published the first of his Crisis pamphlets to rally a discouraged public behind the revolutionary cause.',
      "Paine makes to rouse a demoralized public to continue supporting the war.",
    ),
    focusSkill: 'appeals-to-audience',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: passageSource({
      key: 'ap-lang-rhetorical-paine-the-crisis',
      title: 'The American Crisis, No. 1 (opening)',
      attribution: 'Thomas Paine, December 1776 (public domain)',
      body: [
        'These are the times that try men\'s souls. The summer soldier and the sunshine patriot will, in this crisis, shrink from the service of his country; but he that stands it now, deserves the love and thanks of man and woman. Tyranny, like hell, is not easily conquered; yet we have this consolation with us, that the harder the conflict, the more glorious the triumph. What we obtain too cheap, we esteem too lightly: it is dearness only that gives every thing its value.',
      ].join('\n'),
      caption: 'The pamphlet\'s opening paragraph.',
    }),
  },
  {
    externalKey: 'ap-lang-rhetorical-jfk-inaugural',
    frqType: 'rhetorical_analysis',
    title: "Kennedy's Inaugural Address — Rhetorical Analysis",
    prompt: rhetoricalPrompt(
      'In January 1961, at the height of the Cold War, President John F. Kennedy used his inaugural address to call a new generation of Americans to civic and international responsibility.',
      "Kennedy makes to define the responsibilities of citizenship for his audience.",
    ),
    focusSkill: 'parallelism-and-appeal',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl:
      'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/inaugural.zip',
    sources: passageSource({
      key: 'ap-lang-rhetorical-jfk-inaugural',
      title: 'Inaugural Address, opening',
      attribution: 'John F. Kennedy, January 20, 1961 (public domain, U.S. government work)',
      body: KENNEDY_INAUGURAL_OPENING,
      caption:
        'The opening of the address through the appeal to adversaries, ending on a complete movement of the argument.',
      provenanceUrl:
        'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/inaugural.zip',
    }),
  },
  {
    externalKey: 'ap-lang-rhetorical-stanton-declaration-of-sentiments',
    frqType: 'rhetorical_analysis',
    title: 'Declaration of Sentiments — Rhetorical Analysis',
    prompt: rhetoricalPrompt(
      'At the 1848 Seneca Falls Convention, Elizabeth Cady Stanton presented a declaration modeled deliberately on the Declaration of Independence, listing grievances and demanding rights for women.',
      "Stanton makes by modeling her declaration on a document her audience would immediately recognize.",
    ),
    focusSkill: 'imitation-and-allusion',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: passageSource({
      key: 'ap-lang-rhetorical-stanton-declaration-of-sentiments',
      title: 'Declaration of Sentiments (opening)',
      attribution: 'Elizabeth Cady Stanton, 1848 (public domain)',
      body: [
        'When, in the course of human events, it becomes necessary for one portion of the family of man to assume among the people of the earth a position different from that which they have hitherto occupied...',
        '',
        'We hold these truths to be self-evident: that all men and women are created equal; that they are endowed by their Creator with certain inalienable rights; that among these are life, liberty, and the pursuit of happiness...',
        '',
        'The history of mankind is a history of repeated injuries and usurpations on the part of man toward woman, having in direct object the establishment of an absolute tyranny over her.',
      ].join('\n'),
      caption: 'The declaration\'s opening, echoing the Declaration of Independence.',
    }),
  },
  {
    externalKey: 'ap-lang-rhetorical-henry-give-me-liberty',
    frqType: 'rhetorical_analysis',
    title: '"Give Me Liberty, or Give Me Death" — Rhetorical Analysis',
    prompt: rhetoricalPrompt(
      'In March 1775, before the Virginia Convention, Patrick Henry argued for arming the colony\'s militia against the possibility of war with Britain. No transcript survives from the day; the version below was reconstructed decades later from listeners\' recollections.',
      "Henry makes to move a cautious assembly toward armed resistance.",
    ),
    focusSkill: 'rhetorical-questions',
    difficulty: 'developing',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: passageSource({
      key: 'ap-lang-rhetorical-henry-give-me-liberty',
      title: 'Speech to the Virginia Convention (closing)',
      attribution: 'Patrick Henry, March 23, 1775 (public domain; reconstructed circa 1817)',
      body: [
        'Is life so dear, or peace so sweet, as to be purchased at the price of chains and slavery? Forbid it, Almighty God! I know not what course others may take; but as for me, give me liberty, or give me death!',
      ].join('\n'),
      caption:
        'The speech\'s famous closing line, as reconstructed by William Wirt from eyewitness accounts decades after the fact — treat the wording as historically reconstructed rather than verbatim.',
    }),
  },
  {
    externalKey: 'ap-lang-rhetorical-chief-joseph-surrender',
    frqType: 'rhetorical_analysis',
    title: '"I Will Fight No More Forever" — Rhetorical Analysis',
    prompt: rhetoricalPrompt(
      'In October 1877, after a months-long retreat toward the Canadian border, Chief Joseph of the Nez Perce surrendered to the U.S. Army. His words were translated and recorded by an army officer present at the surrender.',
      "Chief Joseph makes to convey the cost of the conflict to his people.",
    ),
    focusSkill: 'tone-and-restraint',
    difficulty: 'developing',
    skillEmphasis: 'sophistication',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: passageSource({
      key: 'ap-lang-rhetorical-chief-joseph-surrender',
      title: 'Surrender speech (closing lines)',
      attribution:
        'Chief Joseph, October 5, 1877, as translated and recorded by Lt. C.E.S. Wood (public domain)',
      body: [
        'I am tired of fighting. Our chiefs are killed. It is cold, and we have no blankets, no food. Hear me, my chiefs. I am tired; my heart is sick and sad. From where the sun now stands, I will fight no more forever.',
      ].join('\n'),
      caption:
        'Recorded through an interpreter and an army officer\'s notes, not a document Chief Joseph wrote himself.',
    }),
  },
  {
    externalKey: 'ap-lang-rhetorical-washington-atlanta-address',
    frqType: 'rhetorical_analysis',
    title: 'Atlanta Exposition Address — Rhetorical Analysis',
    prompt: rhetoricalPrompt(
      'In 1895, Booker T. Washington addressed a mixed-race audience at the Atlanta Cotton States Exposition, using an extended metaphor to make his case for Black economic advancement within the segregated South.',
      "Washington makes by returning three times to a single extended metaphor.",
    ),
    focusSkill: 'extended-metaphor',
    difficulty: 'developing',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl: null,
    sources: passageSource({
      key: 'ap-lang-rhetorical-washington-atlanta-address',
      title: 'Atlanta Exposition Address (excerpt)',
      attribution: 'Booker T. Washington, September 18, 1895 (public domain)',
      body: [
        'A ship lost at sea for many days suddenly sighted a friendly vessel. From the mast of the unfortunate vessel was seen a signal, "Water, water; we die of thirst!" The answer from the friendly vessel at once came back, "Cast down your bucket where you are." ... The captain of the distressed vessel, at last heeding the injunction, cast down his bucket, and it came up full of fresh, sparkling water from the mouth of the Amazon River.',
        '',
        'To those of my race who depend on bettering their condition in a foreign land ... I would say: "Cast down your bucket where you are"—cast it down in making friends in every manly way of the people of all races by whom we are surrounded.',
      ].join('\n'),
      caption: 'The speech\'s central extended metaphor, repeated across the address.',
    }),
  },
  {
    externalKey: 'ap-lang-rhetorical-fdr-first-inaugural',
    frqType: 'rhetorical_analysis',
    title: 'FDR\'s First Inaugural Address — Rhetorical Analysis',
    prompt: rhetoricalPrompt(
      'In March 1933, at the depth of the Great Depression, with roughly a quarter of American workers unemployed and the banking system closing down, Franklin D. Roosevelt took office and addressed a frightened national radio audience.',
      'Roosevelt makes to reframe an economic collapse as a crisis of confidence and values that the nation can act on.',
    ),
    focusSkill: 'diagnosis-and-reframing',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: null,
    provenanceUrl:
      'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/inaugural.zip',
    sources: passageSource({
      key: 'ap-lang-rhetorical-fdr-first-inaugural',
      title: 'First Inaugural Address, opening',
      attribution:
        'Franklin D. Roosevelt, March 4, 1933 (public domain, U.S. government work)',
      body: ROOSEVELT_FIRST_INAUGURAL_OPENING,
      caption:
        'The opening of the address, running from "the only thing we have to fear is fear itself" through the argument that recovery is a question of values rather than of substance.',
      provenanceUrl:
        'https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/inaugural.zip',
    }),
  },
];

/**
 * Q2 entries that still ship a short excerpt rather than an exam-scale passage.
 *
 * These are the passages this library launched with: real public-domain quotations,
 * but a sentence or a paragraph rather than the 500-750 word document the exam
 * provides. A student cannot trace a line of reasoning through 46 words, and Row B
 * 4 — which requires explaining how MULTIPLE rhetorical choices work together —
 * is effectively unreachable on them.
 *
 * They are enumerated here, rather than left to be noticed, so that the library
 * test can hold every OTHER Q2 passage to exam scale while this list shrinks. Add
 * the full text to ./ap-english-lang-passages and delete the key from this list.
 */
export const SHORT_EXCERPT_PASSAGE_KEYS: readonly string[] = [
  'ap-lang-rhetorical-paine-the-crisis',
  'ap-lang-rhetorical-stanton-declaration-of-sentiments',
  'ap-lang-rhetorical-henry-give-me-liberty',
  'ap-lang-rhetorical-chief-joseph-surrender',
  'ap-lang-rhetorical-washington-atlanta-address',
];

/**
 * The floor for a Q2 passage that claims to be exam-usable. The real exam runs
 * roughly 500-750 words; 400 leaves room for a genuinely short complete text
 * (the Gettysburg Address is 264 words and is assigned whole) without letting a
 * single-sentence excerpt through.
 */
export const EXAM_SCALE_PASSAGE_MIN_WORDS = 400;

/**
 * Complete short documents that clear the exam-usable bar despite falling under
 * EXAM_SCALE_PASSAGE_MIN_WORDS, because the whole document is what the exam
 * itself assigns.
 */
export const COMPLETE_SHORT_PASSAGE_KEYS: readonly string[] = [
  'ap-lang-rhetorical-gettysburg-address',
];

function argumentEntry(params: {
  key: string;
  title: string;
  prompt: string;
  focusSkill: string;
  difficulty: LibraryEntry['difficulty'];
  skillEmphasis: LibraryEntry['skillEmphasis'];
  suggestedEvidence: string[];
}): LibraryEntry {
  return {
    externalKey: params.key,
    frqType: 'argument',
    title: params.title,
    prompt: params.prompt,
    focusSkill: params.focusSkill,
    difficulty: params.difficulty,
    skillEmphasis: params.skillEmphasis,
    defaultTimeMode: 'untimed',
    defaultDurationMinutes: 40,
    suggestedEvidence: params.suggestedEvidence.join('\n'),
    provenanceUrl: null,
    sources: [],
  };
}

const ARGUMENT_ENTRIES: LibraryEntry[] = [
  argumentEntry({
    key: 'ap-lang-argument-value-of-disagreement',
    title: 'The Value of Disagreement — Argument',
    prompt:
      'A community that never disagrees is not a healthy community; it is a community where dissent has gone underground. Write a well-developed essay that argues your position on the extent to which open disagreement strengthens a community, whether that community is a family, a school, a workplace, or a nation.',
    focusSkill: 'line-of-reasoning',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    suggestedEvidence: [
      'Historical dissent movements (civil rights, labor, suffrage)',
      'Scientific peer review and the value of challenge',
      'A personal or family example of productive disagreement',
      'Deliberative bodies (juries, legislatures, editorial boards)',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-tradition-vs-innovation',
    title: 'Tradition Versus Innovation — Argument',
    prompt:
      'Every institution eventually faces a choice between preserving what has always worked and adopting something untested. Write a well-developed essay that argues your position on how much weight an institution should give to tradition when deciding whether to change.',
    focusSkill: 'qualifying-a-position',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    suggestedEvidence: [
      'A historical institution that resisted or embraced change',
      'A family or cultural tradition and what it preserves',
      'Technological adoption in a field you know well',
      'An organization you have personally observed change (or refuse to)',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-definition-of-success',
    title: 'Redefining Success — Argument',
    prompt:
      'Society often measures success by wealth, title, or visible achievement. Write a well-developed essay that argues your own position on what should count as a successful life.',
    focusSkill: 'defining-terms',
    difficulty: 'developing',
    skillEmphasis: 'thesis',
    suggestedEvidence: [
      'A person, real or literary, whose life challenges a narrow definition of success',
      'A personal experience that changed how you measure achievement',
      'A profession often undervalued despite its importance',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-role-of-failure',
    title: 'The Role of Failure — Argument',
    prompt:
      'Institutions and individuals alike often treat failure as something to be hidden rather than examined. Write a well-developed essay that argues your position on how much value failure has, and for whom.',
    focusSkill: 'counterargument',
    difficulty: 'developing',
    skillEmphasis: 'evidence-commentary',
    suggestedEvidence: [
      'A historical failure that led to a later success',
      'A personal setback and what it did or did not teach you',
      'An industry or field where failure is punished versus one where it is tolerated',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-individual-vs-collective',
    title: 'Individual Liberty and the Collective Good — Argument',
    prompt:
      'Nearly every policy debate eventually turns on the same question: how much individual liberty should be limited for the sake of the group. Write a well-developed essay that argues your position on where that line should be drawn, using a specific example to ground your argument.',
    focusSkill: 'line-of-reasoning',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    suggestedEvidence: [
      'Public health measures and individual choice',
      'Free speech and its limits',
      'Property rights versus community planning',
      'A historical case where the two values conflicted',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-memory-and-monuments',
    title: 'What a Community Chooses to Remember — Argument',
    prompt:
      'Every community must decide what to memorialize and what to leave unmarked. Write a well-developed essay that argues your position on how a community should decide what belongs in its monuments, museums, and public memory.',
    focusSkill: 'evidence-specificity',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    suggestedEvidence: [
      'A specific monument, museum, or memorial you know',
      'A historical event whose public memory has changed over time',
      'A family or community tradition of remembrance',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-value-of-boredom',
    title: 'In Praise of Boredom — Argument',
    prompt:
      'A constant stream of entertainment and information has made unstructured, unoccupied time rare. Write a well-developed essay that argues your position on whether boredom serves any valuable purpose.',
    focusSkill: 'personal-evidence',
    difficulty: 'developing',
    skillEmphasis: 'thesis',
    suggestedEvidence: [
      'A personal experience of extended unstructured time',
      'A creative or intellectual breakthrough that followed a period of boredom',
      'An observation about a sibling, friend, or student\'s relationship to downtime',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-courage-without-audience',
    title: 'Courage Without an Audience — Argument',
    prompt:
      'Some acts of courage are witnessed and celebrated; others occur where no one is watching and are never known. Write a well-developed essay that argues your position on which kind of courage matters more, or whether the distinction matters at all.',
    focusSkill: 'defining-terms',
    difficulty: 'developing',
    skillEmphasis: 'sophistication',
    suggestedEvidence: [
      'A literary or historical figure whose courage went unrecognized in their lifetime',
      'A personal or family example of quiet courage',
      'A public act of courage and what made it visible',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-limits-of-expertise',
    title: 'The Limits of Expertise — Argument',
    prompt:
      'Specialists are trusted to make decisions within their field, yet expertise in one domain does not transfer automatically to another. Write a well-developed essay that argues your position on how much deference expertise deserves outside its own domain.',
    focusSkill: 'counterargument',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    suggestedEvidence: [
      'A historical case where expert consensus was later overturned',
      'A field where public trust in expertise is currently contested',
      'A personal experience deferring to, or questioning, an expert',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-privacy-in-public-life',
    title: 'Privacy as a Public Good — Argument',
    prompt:
      'As more of daily life is observed, recorded, and shared, some argue privacy is an outdated expectation. Write a well-developed essay that argues your position on whether privacy is a right worth actively protecting.',
    focusSkill: 'stakeholder-analysis',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    suggestedEvidence: [
      'A historical argument for or against surveillance',
      'A personal experience with data collection or public exposure',
      'An institution (school, employer, government) and its access to private information',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-value-of-apology',
    title: 'What an Apology Owes — Argument',
    prompt:
      'Public apologies, from individuals and institutions alike, are often criticized as empty or insufficient. Write a well-developed essay that argues your position on what a genuine apology requires.',
    focusSkill: 'defining-terms',
    difficulty: 'developing',
    skillEmphasis: 'thesis',
    suggestedEvidence: [
      'A public apology you found convincing or unconvincing',
      'A personal experience giving or receiving an apology',
      'An institution that has had to reckon with past wrongdoing',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-competition-and-cooperation',
    title: 'Competition and Cooperation — Argument',
    prompt:
      'Institutions from schools to workplaces must decide how much to structure around competition and how much around cooperation. Write a well-developed essay that argues your position on which principle should predominate, and in what circumstances.',
    focusSkill: 'qualifying-a-position',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    suggestedEvidence: [
      'A school policy or practice built around competition or cooperation',
      'A team, workplace, or family structured around one principle',
      'A historical or economic example of either principle at scale',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-inherited-obligation',
    title: 'Obligations We Did Not Choose — Argument',
    prompt:
      'People are sometimes said to owe debts — to family, to country, to the past — that they never personally agreed to. Write a well-developed essay that argues your position on whether such inherited obligations are legitimate.',
    focusSkill: 'line-of-reasoning',
    difficulty: 'exam-ready',
    skillEmphasis: 'sophistication',
    suggestedEvidence: [
      'A family obligation passed down across generations',
      'A national or civic debt tied to a historical wrong',
      'A personal experience with an obligation you did not choose',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-risk-and-regulation',
    title: 'Who Should Bear the Risk — Argument',
    prompt:
      'New technologies and activities create risks that someone must bear: the individual who chooses them, the public who may be affected, or an institution asked to prevent them. Write a well-developed essay that argues your position on how that risk should be assigned, using a specific example.',
    focusSkill: 'evidence-specificity',
    difficulty: 'exam-ready',
    skillEmphasis: 'evidence-commentary',
    suggestedEvidence: [
      'A specific technology, sport, or activity and its regulation',
      'A historical case of an unregulated risk later restricted',
      'A personal or family decision involving risk',
    ],
  }),
  argumentEntry({
    key: 'ap-lang-argument-silence-as-response',
    title: 'When Silence Is a Choice — Argument',
    prompt:
      'Choosing not to speak — in a conversation, a controversy, or a public debate — is sometimes praised as wisdom and sometimes condemned as complicity. Write a well-developed essay that argues your position on when, if ever, silence is the right response.',
    focusSkill: 'counterargument',
    difficulty: 'developing',
    skillEmphasis: 'sophistication',
    suggestedEvidence: [
      'A historical moment where silence was notable, for better or worse',
      'A personal experience choosing whether to speak up',
      'A public figure praised or criticized for staying silent',
    ],
  }),
];

export const AP_ENGLISH_LANG_LIBRARY_ENTRIES: LibraryEntry[] = [
  ...SYNTHESIS_ENTRIES,
  ...RHETORICAL_ANALYSIS_ENTRIES,
  ...ARGUMENT_ENTRIES,
];
