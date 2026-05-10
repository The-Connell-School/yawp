// Mock data for the AP History Essay prompt library and create-assignment
// sheet. Mirrors the LibraryPrompt shape called out in the v1 spec
// (docs/plans/2026-05-09-ap-history-essay-spec-v1.md).

export const PREVIEW_ID = 'preview-ap-history-essay';

export type EssayType = 'DBQ' | 'LEQ';
export type Period = 'AP USH' | 'AP Euro' | 'AP World';
export type Reasoning =
  | 'causation'
  | 'comparison'
  | 'continuity-and-change'
  | 'periodization';
export type Difficulty = 'intro' | 'mid-year' | 'exam-ready';

export type LibraryPrompt = {
  id: string;
  type: EssayType;
  period: Period;
  prompt: string;
  era: string;
  sourceCount: number | null;
  reasoning: Reasoning;
  skillEmphasis: string[];
  difficulty: Difficulty;
};

export const REASONING_LABEL: Record<Reasoning, string> = {
  causation: 'Causation',
  comparison: 'Comparison',
  'continuity-and-change': 'Continuity & change',
  periodization: 'Periodization',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  intro: 'Intro',
  'mid-year': 'Mid-year',
  'exam-ready': 'Exam-ready',
};

export const SAMPLE_PROMPTS: LibraryPrompt[] = [
  {
    id: 'DBQ-USH-001',
    type: 'DBQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the Reconstruction era (1865–1877) marked a turning point in the lives of formerly enslaved people.',
    era: 'Reconstruction',
    sourceCount: 7,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['sourcing-heavy', 'complexity-heavy'],
    difficulty: 'mid-year',
  },
  {
    id: 'DBQ-USH-002',
    type: 'DBQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the Progressive Era reforms (1890–1920) addressed the problems of industrialization.',
    era: 'Progressive Era',
    sourceCount: 7,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['balanced'],
    difficulty: 'mid-year',
  },
  {
    id: 'DBQ-USH-003',
    type: 'DBQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the Cold War shaped American domestic policy from 1945 to 1975.',
    era: 'Cold War',
    sourceCount: 6,
    reasoning: 'causation',
    skillEmphasis: ['contextualization-heavy'],
    difficulty: 'exam-ready',
  },
  {
    id: 'LEQ-USH-001',
    type: 'LEQ',
    period: 'AP USH',
    prompt:
      'Evaluate the relative importance of causes of the American Civil War.',
    era: 'Antebellum',
    sourceCount: null,
    reasoning: 'causation',
    skillEmphasis: ['outside-evidence-heavy'],
    difficulty: 'mid-year',
  },
  {
    id: 'LEQ-USH-002',
    type: 'LEQ',
    period: 'AP USH',
    prompt:
      'Compare the goals and outcomes of Reconstruction policies in the 1860s and 1870s.',
    era: 'Reconstruction',
    sourceCount: null,
    reasoning: 'comparison',
    skillEmphasis: ['balanced'],
    difficulty: 'mid-year',
  },
  {
    id: 'LEQ-USH-003',
    type: 'LEQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the period from 1945 to 1980 represents a continuation of New Deal liberalism.',
    era: 'Postwar & Civil Rights',
    sourceCount: null,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['complexity-heavy'],
    difficulty: 'exam-ready',
  },
  {
    id: 'DBQ-EUR-001',
    type: 'DBQ',
    period: 'AP Euro',
    prompt:
      'Evaluate the extent to which the Reformation transformed European political authority in the 16th century.',
    era: 'Reformation',
    sourceCount: 7,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['complexity-heavy'],
    difficulty: 'mid-year',
  },
  {
    id: 'LEQ-EUR-001',
    type: 'LEQ',
    period: 'AP Euro',
    prompt: 'Compare the responses of European states to the French Revolution.',
    era: 'French Revolution',
    sourceCount: null,
    reasoning: 'comparison',
    skillEmphasis: ['balanced'],
    difficulty: 'mid-year',
  },
  {
    id: 'DBQ-WLD-001',
    type: 'DBQ',
    period: 'AP World',
    prompt:
      'Evaluate the extent to which trans-Saharan trade networks transformed West African societies between 1000 and 1450.',
    era: 'Post-Classical',
    sourceCount: 5,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['contextualization-heavy'],
    difficulty: 'intro',
  },
  {
    id: 'LEQ-WLD-001',
    type: 'LEQ',
    period: 'AP World',
    prompt:
      'Evaluate the relative importance of factors that drove industrialization between 1750 and 1900.',
    era: 'Industrial',
    sourceCount: null,
    reasoning: 'causation',
    skillEmphasis: ['outside-evidence-heavy'],
    difficulty: 'exam-ready',
  },
];

export const INSPIRATIONAL_EXAMPLES: Array<{
  type: EssayType;
  title: string;
  blurb: string;
}> = [
  {
    type: 'DBQ',
    title: 'Reconstruction as a turning point',
    blurb:
      '7-source DBQ pushing students to argue continuity vs. change in the lives of formerly enslaved people, 1865–1877.',
  },
  {
    type: 'LEQ',
    title: 'Causes of the Civil War',
    blurb:
      'Causation LEQ — students rely entirely on outside evidence to weigh the relative importance of antebellum causes.',
  },
  {
    type: 'DBQ',
    title: 'Cold War & domestic policy',
    blurb:
      '6-source DBQ tuned for contextualization. Strong fit for late-year exam-prep practice.',
  },
];

// Mock teacher classes for the create-assignment sheet preview.
export const MOCK_TEACHER_CLASSES: Array<{ id: string; label: string }> = [
  { id: 'mock-class-apush-3', label: 'APUSH · Period 3' },
  { id: 'mock-class-apush-4', label: 'APUSH · Period 4' },
  { id: 'mock-class-apush-6', label: 'APUSH · Period 6' },
];

export function suggestedAssignmentTitle(p: LibraryPrompt): string {
  return `${p.era} ${p.type}`;
}

// ---------------------------------------------------------------------------
// Source sets
// ---------------------------------------------------------------------------
// One source set per DBQ prompt in the library. LEQ prompts have no sources.
// Content is illustrative — real corpus seeding happens during engineering
// handoff. Source bodies are abbreviated to ~1–2 sentences for the preview;
// the real library entries will carry full primary-source excerpts.

export type SourceCard = {
  id: string;
  title: string;
  attribution: string;
  body: string;
};

const SOURCES_DBQ_USH_001: SourceCard[] = [
  {
    id: 'src-1',
    title: 'Doc 1 — Petition from a Freedmen’s Convention',
    attribution: 'Black Virginia delegates, June 1865',
    body:
      'We the colored people of Virginia… demand that we be permitted the rights of citizens, the protection of the laws, and the use of the ballot…',
  },
  {
    id: 'src-2',
    title: 'Doc 2 — Black Codes, State of Mississippi',
    attribution: 'Mississippi state legislature, 1865',
    body:
      'Every freedman, free negro, and mulatto shall, on the second Monday of January, 1866, and annually thereafter, have a lawful home or employment, and shall produce a written contract showing the same to any officer who shall demand it…',
  },
  {
    id: 'src-3',
    title: 'Doc 3 — Letter from a Freedmen’s Bureau Agent',
    attribution: 'Capt. R. S. Donaldson to Gen. O. O. Howard, 1866',
    body:
      'The freedmen are eager for schools and for the means of self-improvement, but the planters in this region resist their efforts at every turn — wages withheld, contracts torn up, violence used freely against any who attempt to leave their former masters…',
  },
  {
    id: 'src-4',
    title: 'Doc 4 — Sharecropping Contract',
    attribution: 'Greene County, Georgia, 1872',
    body:
      'The said laborer shall furnish his own labor and tools… the proprietor shall furnish the land and one-half of the seed… The crop shall be divided as follows: one-half to the proprietor, one-half to the laborer, less any advances or supplies…',
  },
  {
    id: 'src-5',
    title: 'Doc 5 — Editorial on the Compromise of 1877',
    attribution: 'Atlanta Constitution, March 1877',
    body:
      'The withdrawal of federal troops from Louisiana and South Carolina marks an end to bayonet rule and a new dawn for self-government. The southern states will now resume their rightful place in the Union, governed by their own people without northern interference.',
  },
  {
    id: 'src-6',
    title: 'Doc 6 — Speech on the 15th Amendment',
    attribution: 'Frederick Douglass, 1870',
    body:
      'Slavery is not abolished until the black man has the ballot. The right to vote is the most important political right; it is the right which secures all other rights.',
  },
  {
    id: 'src-7',
    title: 'Doc 7 — Photograph: Freedmen’s school, Beaufort, SC',
    attribution: 'Library of Congress, c. 1866 (image-only)',
    body:
      '[Image-only source. Caption: rows of formerly enslaved children at a Freedmen’s Bureau school, with two Black teachers at the front.]',
  },
];

const SOURCES_DBQ_USH_002: SourceCard[] = [
  {
    id: 'src-1',
    title: 'Doc 1 — Triangle Shirtwaist Factory fire report',
    attribution: 'New York Factory Investigating Commission, 1912',
    body:
      'The investigation revealed that exit doors had been locked to prevent worker theft and unauthorized breaks. The fire claimed 146 lives, almost all young immigrant women, and exposed the human cost of unregulated factory conditions.',
  },
  {
    id: 'src-2',
    title: 'Doc 2 — The Jungle (excerpt)',
    attribution: 'Upton Sinclair, 1906',
    body:
      'There were the bones of beef carcasses on the floor, the lard buckets that had not been emptied in months, and the men who worked in the cooking-rooms whose bodies, sweating from the steam, gave the meat its only seasoning…',
  },
  {
    id: 'src-3',
    title: 'Doc 3 — The New Nationalism speech',
    attribution: 'Theodore Roosevelt, Osawatomie, Kansas, 1910',
    body:
      'I stand for the square deal. But when I say I am for the square deal, I mean not merely that I stand for fair play under the present rules of the game, but that I stand for having those rules changed so as to work for a more substantial equality of opportunity.',
  },
  {
    id: 'src-4',
    title: 'Doc 4 — The History of the Standard Oil Company',
    attribution: 'Ida Tarbell, 1904',
    body:
      'Whatever weapons came handy — the railway, the legislature, the courts — were used. The result was not industrial reform; it was a monopoly built by means that no man of fair mind could defend.',
  },
  {
    id: 'src-5',
    title: 'Doc 5 — Twenty Years at Hull-House',
    attribution: 'Jane Addams, 1910',
    body:
      'We believed that the dependence of classes on each other is reciprocal; and that as the social relation is essentially a reciprocal relation, it gives a form of expression that has peculiar value to a settlement of women working among the immigrant poor.',
  },
  {
    id: 'src-6',
    title: 'Doc 6 — Muller v. Oregon opinion',
    attribution: 'U.S. Supreme Court, 1908',
    body:
      'That woman\'s physical structure and the performance of maternal functions place her at a disadvantage in the struggle for subsistence is obvious. This is especially true when the burdens of motherhood are upon her.',
  },
  {
    id: 'src-7',
    title: 'Doc 7 — "The Trust-Buster" (political cartoon)',
    attribution: 'Puck Magazine, 1907 (image-only)',
    body:
      '[Image-only source. Caption: Theodore Roosevelt brandishing a club labeled "Public Service" at corporate trusts depicted as multi-headed serpents.]',
  },
];

const SOURCES_DBQ_USH_003: SourceCard[] = [
  {
    id: 'src-1',
    title: 'Doc 1 — The Truman Doctrine',
    attribution: 'President Harry S. Truman, address to Congress, March 12, 1947',
    body:
      'I believe that it must be the policy of the United States to support free peoples who are resisting attempted subjugation by armed minorities or by outside pressures. The future of free peoples depends on the willingness of the United States to act.',
  },
  {
    id: 'src-2',
    title: 'Doc 2 — NSC-68 (excerpt)',
    attribution: 'United States National Security Council, April 1950',
    body:
      'The integrity and vitality of our system is in greater jeopardy than ever before in our history. A defeat of free institutions anywhere is a defeat everywhere.',
  },
  {
    id: 'src-3',
    title: 'Doc 3 — Farewell Address',
    attribution: 'President Dwight D. Eisenhower, January 17, 1961',
    body:
      'In the councils of government, we must guard against the acquisition of unwarranted influence, whether sought or unsought, by the military-industrial complex.',
  },
  {
    id: 'src-4',
    title: 'Doc 4 — Inaugural Address',
    attribution: 'President John F. Kennedy, January 20, 1961',
    body:
      'Let every nation know, whether it wishes us well or ill, that we shall pay any price, bear any burden, meet any hardship, support any friend, oppose any foe, to assure the survival and the success of liberty.',
  },
  {
    id: 'src-5',
    title: 'Doc 5 — The Pentagon Papers (excerpt)',
    attribution: 'U.S. Department of Defense study, 1967 (published 1971)',
    body:
      'American policy in Vietnam consisted of acts undertaken to prevent a Communist takeover, and was carried on under public statements that did not reflect the actual military and political situation on the ground.',
  },
  {
    id: 'src-6',
    title: 'Doc 6 — The Silent Majority Speech',
    attribution: 'President Richard Nixon, November 3, 1969',
    body:
      'And so tonight — to you, the great silent majority of my fellow Americans — I ask for your support. North Vietnam cannot defeat or humiliate the United States. Only Americans can do that.',
  },
];

const SOURCES_DBQ_EUR_001: SourceCard[] = [
  {
    id: 'src-1',
    title: 'Doc 1 — The Ninety-Five Theses',
    attribution: 'Martin Luther, Wittenberg, 1517',
    body:
      'Christians are to be taught that he who gives to the poor or lends to the needy does a better deed than he who buys indulgences. Christians are to be taught that he who sees a needy man and passes him by, yet gives his money for indulgences, does not buy papal indulgences but God\'s wrath.',
  },
  {
    id: 'src-2',
    title: 'Doc 2 — Diet of Worms speech',
    attribution: 'Martin Luther, 1521',
    body:
      'Unless I am convinced by the testimony of Scripture or by clear reason, I am bound by the Scriptures I have quoted. My conscience is captive to the Word of God. I cannot and I will not recant anything.',
  },
  {
    id: 'src-3',
    title: 'Doc 3 — Edict of Worms',
    attribution: 'Holy Roman Emperor Charles V, 1521',
    body:
      'It is our intent that this notorious heretic be apprehended and his books burned, that his memory be utterly extirpated, and that all his followers be similarly punished.',
  },
  {
    id: 'src-4',
    title: 'Doc 4 — Institutes of the Christian Religion (excerpt)',
    attribution: 'John Calvin, 1536',
    body:
      'We call predestination God\'s eternal decree, by which he compacted with himself what he willed to become of each man. For all are not created in equal condition; rather, eternal life is foreordained for some, eternal damnation for others.',
  },
  {
    id: 'src-5',
    title: 'Doc 5 — Act of Supremacy',
    attribution: 'English Parliament, 1534',
    body:
      'The King, his heirs and successors, kings of this realm, shall be taken, accepted, and reputed the only Supreme Head in earth of the Church of England, called Anglicana Ecclesia.',
  },
  {
    id: 'src-6',
    title: 'Doc 6 — Council of Trent decrees (excerpt)',
    attribution: 'Roman Catholic Church, 1545–1563',
    body:
      'If anyone says that men are justified solely by the imputation of the righteousness of Christ, excluding grace and charity which is poured into their hearts by the Holy Spirit, let him be anathema.',
  },
  {
    id: 'src-7',
    title: 'Doc 7 — Peace of Augsburg',
    attribution: 'Holy Roman Empire treaty, 1555',
    body:
      'It is agreed that the religion of the ruler shall be the religion of the territory (cuius regio, eius religio). Subjects who do not agree with their ruler\'s confession may emigrate freely to a territory of their preferred faith.',
  },
];

const SOURCES_DBQ_WLD_001: SourceCard[] = [
  {
    id: 'src-1',
    title: 'Doc 1 — Travels in Asia and Africa',
    attribution: 'Ibn Battuta, c. 1354',
    body:
      'I arrived at the city of Niani, the capital of Mali. The sultan is generous and the kingdom is well-governed, with judges, scribes, and great libraries; salt and gold pass through every market.',
  },
  {
    id: 'src-2',
    title: 'Doc 2 — Map of West African trade routes',
    attribution: 'al-Idrisi, 12th century (with caption)',
    body:
      'Caravans of camels crossed the Sahara from Sijilmasa to Awdaghust, exchanging North African salt slabs for the gold dust of Wangara south of the Niger.',
  },
  {
    id: 'src-3',
    title: 'Doc 3 — The Catalan Atlas (excerpt)',
    attribution: 'Abraham Cresques, 1375',
    body:
      'This is the kingdom of Mali, whose lord is Mansa Musa, the richest and noblest of all kings on account of the abundance of gold which is found in his lands.',
  },
  {
    id: 'src-4',
    title: 'Doc 4 — Description of Africa',
    attribution: 'Leo Africanus, 1526',
    body:
      'In Timbuktu the merchants live in great wealth, and many books from Barbary are sold; the king pays scholars well to teach the religion of Muhammad, and the city has many judges, doctors, and clerics.',
  },
  {
    id: 'src-5',
    title: 'Doc 5 — Inscription from the Great Mosque of Djenné',
    attribution: 'c. 13th century',
    body:
      'By the grace of God this house was built that the worship of God might be made known among all peoples who come to trade in this place. May all who pass through honor the laws and the markets of this land.',
  },
];

export const SOURCES_BY_PROMPT_ID: Record<string, SourceCard[]> = {
  'DBQ-USH-001': SOURCES_DBQ_USH_001,
  'DBQ-USH-002': SOURCES_DBQ_USH_002,
  'DBQ-USH-003': SOURCES_DBQ_USH_003,
  'DBQ-EUR-001': SOURCES_DBQ_EUR_001,
  'DBQ-WLD-001': SOURCES_DBQ_WLD_001,
};

export function getSourcesForPrompt(promptId: string): SourceCard[] {
  return SOURCES_BY_PROMPT_ID[promptId] ?? [];
}

export function getPromptById(promptId: string): LibraryPrompt | null {
  return SAMPLE_PROMPTS.find((p) => p.id === promptId) ?? null;
}
