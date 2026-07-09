import type { ActPracticeQuestion } from './act-practice.shared';

/**
 * Hand-authored ACT English–style multiple-choice items, keyed by lesson slug.
 *
 * This is the offline source of truth: the self-serve practice panel shows
 * these instantly and falls back to them whenever AI generation is unavailable
 * (no API key, an error, or an empty batch) — including in E2E, which runs with
 * no ANTHROPIC_API_KEY. Each item is expository/academic in the ACT register,
 * targets one skill, and has exactly one correct choice with `choices[0]` being
 * the original underlined text (rendered as "NO CHANGE").
 */
type ActQuestionSeed = Omit<ActPracticeQuestion, 'id'>;

const ACT_PRACTICE_BANK: Record<string, ActQuestionSeed[]> = {
  'fixing-comma-splices': [
    {
      sentence:
        'The library extended its hours during finals week, students packed every table by noon.',
      underline: 'week, students',
      choices: [
        'week, students',
        'week; students',
        'week students',
        'week, and, students',
      ],
      correctChoiceIndex: 1,
      explanation:
        'Two complete sentences joined by only a comma is a comma splice. A semicolon correctly links the closely related independent clauses.',
    },
    {
      sentence:
        'Marie Curie conducted her experiments in a converted shed, the conditions were far from ideal.',
      underline: 'shed, the',
      choices: ['shed, the', 'shed. The', 'shed the', 'shed, the,'],
      correctChoiceIndex: 1,
      explanation:
        'The clause before and after the comma can each stand alone, so a period (or semicolon) is needed—not a comma.',
    },
    {
      sentence:
        'The robotics team tested the design all weekend, they still missed the deadline.',
      underline: 'weekend, they',
      choices: [
        'weekend, they',
        'weekend, but they',
        'weekend they',
        'weekend, but, they',
      ],
      correctChoiceIndex: 1,
      explanation:
        'A comma alone cannot join two independent clauses. Adding the conjunction "but" fixes the splice and signals the contrast.',
    },
  ],
  'revising-for-wordiness': [
    {
      sentence:
        'At this point in time, the committee has not reached a decision.',
      underline: 'At this point in time,',
      choices: [
        'At this point in time,',
        'At this point in time',
        'During this period of time,',
        'Currently,',
      ],
      correctChoiceIndex: 3,
      explanation:
        '"At this point in time" is padded. "Currently" carries the same meaning in a single word.',
    },
    {
      sentence:
        'The scientist made a discovery that was completely and totally unexpected.',
      underline: 'completely and totally unexpected',
      choices: [
        'completely and totally unexpected',
        'unexpected',
        'totally, completely unexpected',
        'unexpected in a way that was not expected',
      ],
      correctChoiceIndex: 1,
      explanation:
        '"Completely" and "totally" are redundant, and "unexpected" already means not expected. One word says it all.',
    },
    {
      sentence:
        'Due to the fact that it rained, the outdoor concert was postponed.',
      underline: 'Due to the fact that',
      choices: [
        'Due to the fact that',
        'Because',
        'Due to the fact',
        'Owing to the fact that',
      ],
      correctChoiceIndex: 1,
      explanation:
        '"Because" replaces the bloated "due to the fact that" with no loss of meaning.',
    },
  ],
  'transition-sentences': [
    {
      sentence:
        'The new policy reduced costs. Therefore, it was unpopular with employees.',
      underline: 'Therefore,',
      choices: ['Therefore,', 'However,', 'In addition,', 'For example,'],
      correctChoiceIndex: 1,
      explanation:
        'The two ideas contrast—costs dropped, yet the policy was disliked—so a contrast transition like "However" fits, not the cause-effect "Therefore."',
    },
    {
      sentence:
        'The recipe calls for three cups of flour. For example, it also needs two eggs.',
      underline: 'For example,',
      choices: [
        'For example,',
        'In addition,',
        'Nevertheless,',
        'On the contrary,',
      ],
      correctChoiceIndex: 1,
      explanation:
        'The second sentence adds another ingredient rather than giving an example, so an additive transition ("In addition") is correct.',
    },
    {
      sentence:
        'Rehearsals ran late every night. Consequently, the cast was exhausted by opening day.',
      underline: 'Consequently,',
      choices: ['Consequently,', 'However,', 'For instance,', 'Meanwhile,'],
      correctChoiceIndex: 0,
      explanation:
        'Exhaustion is the result of the late rehearsals, so the cause-effect transition "Consequently" is right—NO CHANGE.',
    },
  ],
  'the-oxford-comma': [
    {
      sentence: 'For the trip we packed sandwiches, water and a first-aid kit.',
      underline: 'water and a first-aid kit',
      choices: [
        'water and a first-aid kit',
        'water, and a first-aid kit',
        'water and, a first-aid kit',
        'water and a first-aid, kit',
      ],
      correctChoiceIndex: 1,
      explanation:
        'In a list of three or more items, the Oxford comma goes before "and": "sandwiches, water, and a first-aid kit."',
    },
    {
      sentence:
        'She thanked her parents, the president, and her coach in the speech.',
      underline: 'parents, the president, and her coach',
      choices: [
        'parents, the president, and her coach',
        'parents, the president and her coach',
        'parents the president and her coach',
        'parents, the president, and, her coach',
      ],
      correctChoiceIndex: 0,
      explanation:
        'The list already places the serial comma before "and," keeping the three people distinct—NO CHANGE.',
    },
    {
      sentence: 'The lab studied bacteria, fungi and viruses over the summer.',
      underline: 'fungi and viruses',
      choices: [
        'fungi and viruses',
        'fungi, and viruses',
        'fungi, and, viruses',
        'fungi and, viruses',
      ],
      correctChoiceIndex: 1,
      explanation:
        'Add the serial comma before "and" in this three-item list: "bacteria, fungi, and viruses."',
    },
  ],
  'commas-independent-dependent-clauses': [
    {
      sentence:
        'Although the forecast predicted rain the festival organizers kept the stage uncovered.',
      underline: 'rain the festival',
      choices: [
        'rain the festival',
        'rain, the festival',
        'rain; the festival',
        'rain the festival,',
      ],
      correctChoiceIndex: 1,
      explanation:
        'A dependent clause that opens a sentence ("Although … rain") is followed by a comma before the main clause.',
    },
    {
      sentence: 'The team celebrated, after they won the championship.',
      underline: 'celebrated, after',
      choices: [
        'celebrated, after',
        'celebrated after',
        'celebrated; after',
        'celebrated: after',
      ],
      correctChoiceIndex: 1,
      explanation:
        'When the dependent clause follows the main clause, no comma is needed: "celebrated after they won."',
    },
    {
      sentence:
        'Because the bridge was closed, commuters took the ferry instead.',
      underline: 'closed, commuters',
      choices: [
        'closed, commuters',
        'closed commuters',
        'closed; commuters',
        'closed, so commuters',
      ],
      correctChoiceIndex: 0,
      explanation:
        'The introductory dependent clause is correctly set off with a comma before the main clause—NO CHANGE.',
    },
  ],
  'passive-voice': [
    {
      sentence:
        'The committee reviewed the proposal, and a decision was made by them within a week.',
      underline: 'a decision was made by them',
      choices: [
        'a decision was made by them',
        'they made a decision',
        'a decision was made',
        'a decision, was made by them',
      ],
      correctChoiceIndex: 1,
      explanation:
        '"They made a decision" is active and direct; the passive "a decision was made by them" is wordier and hides the doer.',
    },
    {
      sentence:
        'The mural that was painted by the seniors brightened the hallway.',
      underline: 'that was painted by the seniors',
      choices: [
        'that was painted by the seniors',
        'the seniors painted',
        'that was painted',
        'that, was painted by the seniors',
      ],
      correctChoiceIndex: 1,
      explanation:
        '"The mural the seniors painted" puts the actors up front in the active voice, tightening the sentence.',
    },
    {
      sentence: 'The volunteers planted two hundred trees along the river.',
      underline: 'planted',
      choices: ['planted', 'were planted', 'was planted', 'planting'],
      correctChoiceIndex: 0,
      explanation:
        'The subject (volunteers) performs the action, so the active "planted" is correct—NO CHANGE.',
    },
  ],
  'parallel-construction': [
    {
      sentence:
        'The internship taught her to code, to analyze data, and managing a team.',
      underline: 'managing a team',
      choices: [
        'managing a team',
        'to manage a team',
        'managed a team',
        'the management of a team',
      ],
      correctChoiceIndex: 1,
      explanation:
        'Items in a series must share a form. To match "to code" and "to analyze," use "to manage a team."',
    },
    {
      sentence:
        'Volunteers spent the day cleaning trails, planting trees, and they collected litter.',
      underline: 'they collected litter',
      choices: [
        'they collected litter',
        'collecting litter',
        'collected litter',
        'the collection of litter',
      ],
      correctChoiceIndex: 1,
      explanation:
        'The list uses "-ing" forms ("cleaning," "planting"), so "collecting litter" keeps the structure parallel.',
    },
    {
      sentence:
        'The coach valued discipline, teamwork, and persistence above raw talent.',
      underline: 'discipline, teamwork, and persistence',
      choices: [
        'discipline, teamwork, and persistence',
        'discipline, teamwork, and being persistent',
        'disciplined, teamwork, and persistence',
        'discipline, working as a team, and persistence',
      ],
      correctChoiceIndex: 0,
      explanation:
        'All three items are nouns of the same form, so the series is already parallel—NO CHANGE.',
    },
  ],
  'subject-verb-agreement': [
    {
      sentence: 'The box of old photographs were found in the attic.',
      underline: 'were',
      choices: ['were', 'was', 'have been', 'are'],
      correctChoiceIndex: 1,
      explanation:
        'The subject is "box" (singular), not "photographs," so it takes the singular verb "was."',
    },
    {
      sentence: 'Each of the students have submitted the final essay.',
      underline: 'have',
      choices: ['have', 'has', 'were', 'are having'],
      correctChoiceIndex: 1,
      explanation:
        '"Each" is singular and takes a singular verb: "Each … has submitted."',
    },
    {
      sentence: 'The committee meets every Thursday to review new proposals.',
      underline: 'meets',
      choices: ['meets', 'meet', 'are meeting', 'have met'],
      correctChoiceIndex: 0,
      explanation:
        '"Committee" acts as a single unit here, so the singular "meets" agrees—NO CHANGE.',
    },
  ],
  'pronoun-agreement': [
    {
      sentence:
        'The company expanded their operations into three new countries.',
      underline: 'their',
      choices: ['their', 'its', "it's", "they're"],
      correctChoiceIndex: 1,
      explanation:
        '"Company" is singular, so the singular possessive "its" agrees with it; "their" is plural.',
    },
    {
      sentence:
        'Neither of the actresses remembered their lines during the dress rehearsal.',
      underline: 'their',
      choices: ['their', 'her', 'them', "they're"],
      correctChoiceIndex: 1,
      explanation:
        '"Neither" is singular, so a singular pronoun ("her") agrees with it.',
    },
    {
      sentence: 'The players collected their medals after the ceremony.',
      underline: 'their',
      choices: ['their', 'his', 'its', 'there'],
      correctChoiceIndex: 0,
      explanation:
        '"Players" is plural, so the plural possessive "their" agrees—NO CHANGE.',
    },
  ],
  'commas-introductory-phrases': [
    {
      sentence: 'After the storm passed the crew inspected the damaged roof.',
      underline: 'passed the crew',
      choices: [
        'passed the crew',
        'passed, the crew',
        'passed; the crew',
        'passed the crew,',
      ],
      correctChoiceIndex: 1,
      explanation:
        'The introductory phrase "After the storm passed" is followed by a comma before the main clause.',
    },
    {
      sentence: 'In 1969, humans first walked on the moon.',
      underline: '1969,',
      choices: ['1969,', '1969', '1969;', '1969:'],
      correctChoiceIndex: 0,
      explanation:
        'A short introductory element is correctly set off with a comma—NO CHANGE.',
    },
    {
      sentence:
        'Determined to finish the race he pushed through the final mile.',
      underline: 'race he',
      choices: ['race he', 'race, he', 'race; he', 'race: he'],
      correctChoiceIndex: 1,
      explanation:
        'The opening participial phrase ("Determined to finish the race") needs a comma before the main clause.',
    },
  ],
};

/**
 * Returns the offline ACT practice bank for a lesson, each item tagged with a
 * stable id. Returns `[]` for an unknown slug.
 */
export function getActPracticeQuestions(
  slug: string | undefined
): ActPracticeQuestion[] {
  if (!slug) return [];
  const seeds = ACT_PRACTICE_BANK[slug];
  if (!seeds) return [];
  return seeds.map((seed, index) => ({
    id: `${slug}-act-${index + 1}`,
    ...seed,
  }));
}

/** Slugs that have an authored ACT bank (used by tests/tooling). */
export function actPracticeBankSlugs(): string[] {
  return Object.keys(ACT_PRACTICE_BANK);
}
