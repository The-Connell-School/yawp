/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

const schema =
  process.env.DATABASE_SCHEMA?.trim() ||
  getSchemaFromDatabaseUrl(connectionString);

const isLocal =
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1');

const isSimpleLocal =
  !schema &&
  (connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1'));

const adapter = isSimpleLocal
  ? new PrismaPg({ connectionString, ssl: false })
  : new PrismaPg(
      {
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      },
      schema ? { schema } : undefined
    );

const prisma = new PrismaClient({ adapter });

// ──── APUSH Context Bank: Periods 2–8 ────

const contextBankEntries = [
  // Period 2: 1607–1754
  { period: 'ush', periodNumber: 2, name: 'Jamestown Settlement', category: 'event', summary: 'First permanent English settlement in North America, established 1607 in Virginia.', dateOrRange: '1607' },
  { period: 'ush', periodNumber: 2, name: 'Headright System', category: 'law', summary: 'Land grant system offering 50 acres per person transported to Virginia, encouraging indentured servitude.', dateOrRange: '1618–1699' },
  { period: 'ush', periodNumber: 2, name: 'Bacon\'s Rebellion', category: 'event', summary: 'Armed uprising of Virginia settlers led by Nathaniel Bacon against Governor Berkeley; accelerated shift from indentured servitude to African slavery.', dateOrRange: '1676' },
  { period: 'ush', periodNumber: 2, name: 'Mayflower Compact', category: 'law', summary: 'Self-governing agreement signed by Pilgrims aboard the Mayflower, establishing majority-rule governance in Plymouth Colony.', dateOrRange: '1620' },
  { period: 'ush', periodNumber: 2, name: 'Navigation Acts', category: 'law', summary: 'Series of English laws restricting colonial trade to benefit the mother country under mercantilist policy.', dateOrRange: '1651–1696' },
  { period: 'ush', periodNumber: 2, name: 'First Great Awakening', category: 'movement', summary: 'Religious revival movement emphasizing personal piety and emotional experience; challenged established church authority.', dateOrRange: '1730s–1740s' },
  { period: 'ush', periodNumber: 2, name: 'Stono Rebellion', category: 'event', summary: 'Largest slave uprising in the British colonies; led to harsher slave codes in South Carolina.', dateOrRange: '1739' },
  { period: 'ush', periodNumber: 2, name: 'Anne Hutchinson', category: 'person', summary: 'Puritan dissident banished from Massachusetts Bay Colony for challenging Puritan orthodoxy and gender norms.', dateOrRange: '1637' },
  { period: 'ush', periodNumber: 2, name: 'Pueblo Revolt', category: 'event', summary: 'Indigenous uprising against Spanish colonial rule in present-day New Mexico; temporarily drove out Spanish settlers.', dateOrRange: '1680' },
  { period: 'ush', periodNumber: 2, name: 'Triangular Trade', category: 'event', summary: 'Atlantic trade network connecting Europe, Africa, and the Americas; transported enslaved Africans, raw materials, and manufactured goods.', dateOrRange: '1600s–1800s' },

  // Period 3: 1754–1800
  { period: 'ush', periodNumber: 3, name: 'French and Indian War', category: 'event', summary: 'North American theater of the Seven Years\' War; British victory led to massive war debt and new colonial taxation.', dateOrRange: '1754–1763' },
  { period: 'ush', periodNumber: 3, name: 'Stamp Act', category: 'law', summary: 'First direct tax on the colonies; provoked widespread protest and the rallying cry "no taxation without representation."', dateOrRange: '1765' },
  { period: 'ush', periodNumber: 3, name: 'Declaration of Independence', category: 'event', summary: 'Formal statement declaring the 13 colonies independent from Britain, grounded in Enlightenment ideals of natural rights.', dateOrRange: '1776' },
  { period: 'ush', periodNumber: 3, name: 'Articles of Confederation', category: 'law', summary: 'First governing document of the United States; created a weak central government with no taxing power.', dateOrRange: '1781–1789' },
  { period: 'ush', periodNumber: 3, name: 'Constitutional Convention', category: 'event', summary: 'Philadelphia convention that produced the U.S. Constitution, including the Great Compromise and Three-Fifths Compromise.', dateOrRange: '1787' },
  { period: 'ush', periodNumber: 3, name: 'Federalist Papers', category: 'event', summary: 'Series of 85 essays by Hamilton, Madison, and Jay arguing for ratification of the Constitution.', dateOrRange: '1787–1788' },
  { period: 'ush', periodNumber: 3, name: 'Bill of Rights', category: 'law', summary: 'First ten amendments to the Constitution, guaranteeing individual liberties and limiting federal power.', dateOrRange: '1791' },
  { period: 'ush', periodNumber: 3, name: 'Shays\' Rebellion', category: 'event', summary: 'Armed uprising of Massachusetts farmers against state tax collection; exposed weaknesses of the Articles of Confederation.', dateOrRange: '1786–1787' },
  { period: 'ush', periodNumber: 3, name: 'Jay Treaty', category: 'law', summary: 'Treaty with Britain resolving leftover Revolutionary War issues; controversial for appearing to favor Britain over France.', dateOrRange: '1795' },
  { period: 'ush', periodNumber: 3, name: 'Alien and Sedition Acts', category: 'law', summary: 'Federal laws restricting immigration and criminalizing criticism of the government; prompted Virginia and Kentucky Resolutions.', dateOrRange: '1798' },

  // Period 4: 1800–1848
  { period: 'ush', periodNumber: 4, name: 'Louisiana Purchase', category: 'event', summary: 'Acquisition of French territory doubling the size of the United States; raised questions about strict vs. loose constitutional interpretation.', dateOrRange: '1803' },
  { period: 'ush', periodNumber: 4, name: 'Marbury v. Madison', category: 'court-case', summary: 'Supreme Court case establishing the principle of judicial review — the power of courts to declare laws unconstitutional.', dateOrRange: '1803' },
  { period: 'ush', periodNumber: 4, name: 'Missouri Compromise', category: 'law', summary: 'Admitted Missouri as a slave state and Maine as a free state; drew the 36°30\' line dividing future slave and free territories.', dateOrRange: '1820' },
  { period: 'ush', periodNumber: 4, name: 'Monroe Doctrine', category: 'law', summary: 'Foreign policy declaration warning European powers against further colonization or intervention in the Western Hemisphere.', dateOrRange: '1823' },
  { period: 'ush', periodNumber: 4, name: 'Indian Removal Act', category: 'law', summary: 'Authorized the president to negotiate removal treaties with Native American tribes east of the Mississippi; led to the Trail of Tears.', dateOrRange: '1830' },
  { period: 'ush', periodNumber: 4, name: 'Second Great Awakening', category: 'movement', summary: 'Religious revival movement fueling reform efforts including abolitionism, temperance, women\'s rights, and public education.', dateOrRange: '1790s–1840s' },
  { period: 'ush', periodNumber: 4, name: 'Seneca Falls Convention', category: 'event', summary: 'First women\'s rights convention in the United States; produced the Declaration of Sentiments modeled on the Declaration of Independence.', dateOrRange: '1848' },
  { period: 'ush', periodNumber: 4, name: 'Nat Turner\'s Rebellion', category: 'event', summary: 'Slave uprising in Virginia that killed approximately 60 white people; led to harsher slave codes throughout the South.', dateOrRange: '1831' },
  { period: 'ush', periodNumber: 4, name: 'Market Revolution', category: 'movement', summary: 'Economic transformation driven by canals, railroads, and factories; shifted the Northern economy from subsistence to commercial agriculture and manufacturing.', dateOrRange: '1800s–1840s' },
  { period: 'ush', periodNumber: 4, name: 'Manifest Destiny', category: 'movement', summary: 'Belief that American expansion across the continent was inevitable and divinely ordained; justified westward expansion and Mexican-American War.', dateOrRange: '1840s' },

  // Period 5: 1844–1877
  { period: 'ush', periodNumber: 5, name: 'Wilmot Proviso', category: 'law', summary: 'Proposed ban on slavery in territory acquired from Mexico; passed the House but failed in the Senate, deepening sectional tensions.', dateOrRange: '1846' },
  { period: 'ush', periodNumber: 5, name: 'Compromise of 1850', category: 'law', summary: 'Series of laws admitting California as a free state, enacting a stronger Fugitive Slave Act, and introducing popular sovereignty in new territories.', dateOrRange: '1850' },
  { period: 'ush', periodNumber: 5, name: 'Kansas-Nebraska Act', category: 'law', summary: 'Repealed the Missouri Compromise line and allowed popular sovereignty in Kansas and Nebraska territories; led to "Bleeding Kansas."', dateOrRange: '1854' },
  { period: 'ush', periodNumber: 5, name: 'Dred Scott v. Sandford', category: 'court-case', summary: 'Supreme Court ruled that African Americans were not citizens and Congress could not ban slavery in territories; inflamed sectional conflict.', dateOrRange: '1857' },
  { period: 'ush', periodNumber: 5, name: 'Emancipation Proclamation', category: 'law', summary: 'Executive order freeing enslaved people in Confederate states; transformed the Civil War into a war for freedom and allowed Black enlistment.', dateOrRange: '1863' },
  { period: 'ush', periodNumber: 5, name: '13th Amendment', category: 'law', summary: 'Constitutional amendment abolishing slavery throughout the United States.', dateOrRange: '1865' },
  { period: 'ush', periodNumber: 5, name: '14th Amendment', category: 'law', summary: 'Granted citizenship to all persons born in the U.S. and guaranteed equal protection and due process under the law.', dateOrRange: '1868' },
  { period: 'ush', periodNumber: 5, name: '15th Amendment', category: 'law', summary: 'Prohibited denying the right to vote based on race, color, or previous condition of servitude.', dateOrRange: '1870' },
  { period: 'ush', periodNumber: 5, name: 'Freedmen\'s Bureau', category: 'law', summary: 'Federal agency providing food, housing, education, and legal assistance to formerly enslaved people during Reconstruction.', dateOrRange: '1865–1872' },
  { period: 'ush', periodNumber: 5, name: 'Compromise of 1877', category: 'event', summary: 'Resolved the disputed 1876 presidential election; effectively ended Reconstruction by withdrawing federal troops from the South.', dateOrRange: '1877' },

  // Period 6: 1865–1898
  { period: 'ush', periodNumber: 6, name: 'Transcontinental Railroad', category: 'event', summary: 'First railroad connecting the eastern and western United States; accelerated western settlement, commerce, and displacement of Native peoples.', dateOrRange: '1869' },
  { period: 'ush', periodNumber: 6, name: 'Homestead Act', category: 'law', summary: 'Offered 160 acres of western land to settlers who improved it for five years; encouraged westward migration.', dateOrRange: '1862' },
  { period: 'ush', periodNumber: 6, name: 'Dawes Act', category: 'law', summary: 'Divided Native American tribal lands into individual allotments; aimed at forced assimilation and resulted in massive land loss.', dateOrRange: '1887' },
  { period: 'ush', periodNumber: 6, name: 'Chinese Exclusion Act', category: 'law', summary: 'First federal law banning immigration of a specific ethnic group; prohibited Chinese laborers from entering the United States.', dateOrRange: '1882' },
  { period: 'ush', periodNumber: 6, name: 'Plessy v. Ferguson', category: 'court-case', summary: 'Supreme Court upheld "separate but equal" doctrine, legalizing racial segregation for nearly 60 years.', dateOrRange: '1896' },
  { period: 'ush', periodNumber: 6, name: 'Sherman Antitrust Act', category: 'law', summary: 'First federal law prohibiting monopolies and anticompetitive business practices; initially used more against labor unions than corporations.', dateOrRange: '1890' },
  { period: 'ush', periodNumber: 6, name: 'Andrew Carnegie', category: 'person', summary: 'Steel industrialist who epitomized vertical integration and the "Gospel of Wealth" philosophy of philanthropic responsibility.', dateOrRange: '1835–1919' },
  { period: 'ush', periodNumber: 6, name: 'Knights of Labor / AFL', category: 'movement', summary: 'Major labor organizations of the Gilded Age; Knights organized all workers inclusively, while the AFL focused on skilled craft unions.', dateOrRange: '1869–1890s' },
  { period: 'ush', periodNumber: 6, name: 'Populist Party', category: 'movement', summary: 'Political movement of farmers and laborers advocating for free silver, railroad regulation, and a graduated income tax.', dateOrRange: '1891–1896' },
  { period: 'ush', periodNumber: 6, name: 'Settlement House Movement', category: 'movement', summary: 'Urban reform movement establishing community centers in immigrant neighborhoods; Jane Addams\' Hull House was the most prominent.', dateOrRange: '1880s–1920s' },

  // Period 7: 1890–1945
  { period: 'ush', periodNumber: 7, name: 'Spanish-American War', category: 'event', summary: 'Brief war resulting in U.S. acquisition of Puerto Rico, Guam, and the Philippines; marked the emergence of the U.S. as an imperial power.', dateOrRange: '1898' },
  { period: 'ush', periodNumber: 7, name: 'Progressive Era Reforms', category: 'movement', summary: 'Broad reform movement addressing political corruption, corporate power, and social inequality through legislation and activism.', dateOrRange: '1890s–1920s' },
  { period: 'ush', periodNumber: 7, name: '19th Amendment', category: 'law', summary: 'Constitutional amendment granting women the right to vote, culminating decades of suffrage activism.', dateOrRange: '1920' },
  { period: 'ush', periodNumber: 7, name: 'New Deal', category: 'law', summary: 'FDR\'s programs responding to the Great Depression: relief (CCC, WPA), recovery (AAA, NRA), and reform (Social Security, SEC, Wagner Act).', dateOrRange: '1933–1939' },
  { period: 'ush', periodNumber: 7, name: 'Social Security Act', category: 'law', summary: 'Created a federal safety net providing old-age pensions, unemployment insurance, and aid to dependent children.', dateOrRange: '1935' },
  { period: 'ush', periodNumber: 7, name: 'Wagner Act', category: 'law', summary: 'Guaranteed workers the right to organize and bargain collectively; established the National Labor Relations Board.', dateOrRange: '1935' },
  { period: 'ush', periodNumber: 7, name: 'Great Migration', category: 'movement', summary: 'Mass movement of African Americans from the rural South to Northern and Western cities seeking economic opportunity and escaping Jim Crow.', dateOrRange: '1910–1970' },
  { period: 'ush', periodNumber: 7, name: 'Harlem Renaissance', category: 'movement', summary: 'Cultural and intellectual flowering of African American art, literature, and music centered in Harlem, New York.', dateOrRange: '1920s–1930s' },
  { period: 'ush', periodNumber: 7, name: 'Japanese American Internment', category: 'event', summary: 'Forced relocation of approximately 120,000 Japanese Americans to internment camps during WWII under Executive Order 9066.', dateOrRange: '1942–1945' },
  { period: 'ush', periodNumber: 7, name: 'Atlantic Charter', category: 'law', summary: 'Joint declaration by FDR and Churchill outlining Allied war aims including self-determination and free trade; foreshadowed the United Nations.', dateOrRange: '1941' },

  // Period 8: 1945–1980
  { period: 'ush', periodNumber: 8, name: 'Truman Doctrine', category: 'law', summary: 'Policy of containing Soviet expansion by providing military and economic aid to countries resisting communism.', dateOrRange: '1947' },
  { period: 'ush', periodNumber: 8, name: 'Marshall Plan', category: 'law', summary: 'Massive U.S. economic aid program to rebuild Western Europe after WWII; aimed to prevent the spread of communism.', dateOrRange: '1948' },
  { period: 'ush', periodNumber: 8, name: 'Brown v. Board of Education', category: 'court-case', summary: 'Supreme Court ruled that racial segregation in public schools was unconstitutional, overturning Plessy v. Ferguson.', dateOrRange: '1954' },
  { period: 'ush', periodNumber: 8, name: 'Civil Rights Act of 1964', category: 'law', summary: 'Landmark legislation prohibiting discrimination based on race, color, religion, sex, or national origin in employment and public accommodations.', dateOrRange: '1964' },
  { period: 'ush', periodNumber: 8, name: 'Voting Rights Act', category: 'law', summary: 'Prohibited racial discrimination in voting; authorized federal oversight of elections in jurisdictions with histories of discrimination.', dateOrRange: '1965' },
  { period: 'ush', periodNumber: 8, name: 'Medicare and Medicaid', category: 'law', summary: 'Federal health insurance programs for the elderly (Medicare) and low-income Americans (Medicaid); part of LBJ\'s Great Society.', dateOrRange: '1965' },
  { period: 'ush', periodNumber: 8, name: 'GI Bill', category: 'law', summary: 'Provided veterans with college tuition, low-cost mortgages, and unemployment benefits; fueled postwar suburban growth and the middle class.', dateOrRange: '1944' },
  { period: 'ush', periodNumber: 8, name: 'Cuban Missile Crisis', category: 'event', summary: 'Thirteen-day confrontation between the U.S. and Soviet Union over nuclear missiles in Cuba; closest the Cold War came to nuclear conflict.', dateOrRange: '1962' },
  { period: 'ush', periodNumber: 8, name: 'Vietnam War', category: 'event', summary: 'Prolonged U.S. military involvement in Southeast Asia that divided the nation and eroded trust in government.', dateOrRange: '1955–1975' },
  { period: 'ush', periodNumber: 8, name: 'Roe v. Wade', category: 'court-case', summary: 'Supreme Court ruled that the Constitution protected a woman\'s right to an abortion; became a defining issue in American politics.', dateOrRange: '1973' },
];

async function seed() {
  console.log('🌱 Seeding AP History context bank...');

  const existing = await prisma.contextBankEntry.count();
  if (existing > 0) {
    console.log(`  ⏭️  Context bank already has ${existing} entries, skipping.`);
  } else {
    await prisma.contextBankEntry.createMany({ data: contextBankEntries });
    console.log(`  ✅ Created ${contextBankEntries.length} context bank entries across APUSH Periods 2–8.`);
  }

  console.log('🌱 Seeding AP History prompt library...');

  const existingPrompts = await prisma.promptLibraryEntry.count();
  if (existingPrompts > 0) {
    console.log(`  ⏭️  Prompt library already has ${existingPrompts} entries, skipping.`);
  } else {
    // LEQ prompts (no source documents needed)
    const leqPrompts = [
      {
        essayType: 'leq',
        period: 'ush',
        periodNumber: 3,
        reasoningSkill: 'causation',
        difficulty: 'exam-ready',
        promptBody: 'Evaluate the extent to which the American Revolution changed the political, economic, and social structures of the new nation in the period 1775 to 1800.',
      },
      {
        essayType: 'leq',
        period: 'ush',
        periodNumber: 5,
        reasoningSkill: 'causation',
        difficulty: 'exam-ready',
        promptBody: 'Evaluate the extent to which the Civil War was a turning point in the lives of African Americans in the United States. Support your argument with specific evidence.',
      },
      {
        essayType: 'leq',
        period: 'ush',
        periodNumber: 7,
        reasoningSkill: 'comparison',
        difficulty: 'exam-ready',
        promptBody: 'Compare and contrast the government responses to the Great Depression under Presidents Hoover and Roosevelt in the period 1929 to 1941.',
      },
      {
        essayType: 'leq',
        period: 'ush',
        periodNumber: 8,
        reasoningSkill: 'ccot',
        difficulty: 'exam-ready',
        promptBody: 'Evaluate the extent to which the federal government\'s role in the economy changed in the period 1945 to 1980.',
      },
      {
        essayType: 'leq',
        period: 'ush',
        periodNumber: 4,
        reasoningSkill: 'ccot',
        difficulty: 'mid-year',
        promptBody: 'Evaluate the extent to which the Market Revolution changed the lives of American workers in the period 1800 to 1848.',
      },
      {
        essayType: 'leq',
        period: 'ush',
        periodNumber: 6,
        reasoningSkill: 'comparison',
        difficulty: 'mid-year',
        promptBody: 'Compare and contrast the goals and strategies of TWO reform movements in the period 1880 to 1920.',
      },
    ];

    await prisma.promptLibraryEntry.createMany({ data: leqPrompts });
    console.log(`  ✅ Created ${leqPrompts.length} LEQ prompt library entries.`);

    // DBQ prompts with source documents
    const dbqPrompt1 = await prisma.promptLibraryEntry.create({
      data: {
        essayType: 'dbq',
        period: 'ush',
        periodNumber: 5,
        reasoningSkill: 'causation',
        difficulty: 'exam-ready',
        promptBody: 'Evaluate the extent to which Reconstruction was a revolution. Support your argument using the documents and your knowledge of the period 1863 to 1877.',
      },
    });

    await prisma.promptLibrarySource.createMany({
      data: [
        { promptLibraryEntryId: dbqPrompt1.id, position: 1, title: 'Document 1', attribution: 'Thirteenth Amendment to the United States Constitution, 1865', body: 'Section 1. Neither slavery nor involuntary servitude, except as a punishment for crime whereof the party shall have been duly convicted, shall exist within the United States, or any place subject to their jurisdiction.\nSection 2. Congress shall have power to enforce this article by appropriate legislation.' },
        { promptLibraryEntryId: dbqPrompt1.id, position: 2, title: 'Document 2', attribution: 'Black Codes of Mississippi, 1865', body: 'Section 1. Be it enacted... That all freedmen, free negroes and mulattoes may sue and be sued... in all the courts of law and equity of this State, and may acquire personal property... but shall not rent or lease any lands or tenements except in incorporated cities or towns.\nSection 5. Every freedman, free negro and mulatto shall, on the second Monday of January, one thousand eight hundred and sixty-six, and annually thereafter, have a lawful home or employment, and shall have written evidence thereof.' },
        { promptLibraryEntryId: dbqPrompt1.id, position: 3, title: 'Document 3', attribution: 'Freedmen\'s Bureau Report, 1866', body: 'The freedmen are willing to work, but they want fair wages. Many planters attempt to drive harder bargains than during slavery. Contracts are broken with impunity. The Bureau has adjudicated over 1,500 cases in this district alone, most involving unpaid wages or illegal evictions.' },
        { promptLibraryEntryId: dbqPrompt1.id, position: 4, title: 'Document 4', attribution: 'Fourteenth Amendment to the United States Constitution, 1868', body: 'Section 1. All persons born or naturalized in the United States, and subject to the jurisdiction thereof, are citizens of the United States and of the State wherein they reside. No State shall make or enforce any law which shall abridge the privileges or immunities of citizens of the United States; nor shall any State deprive any person of life, liberty, or property, without due process of law; nor deny to any person within its jurisdiction the equal protection of the laws.' },
        { promptLibraryEntryId: dbqPrompt1.id, position: 5, title: 'Document 5', attribution: 'Testimony of Abram Colby, formerly enslaved, to a joint Congressional committee, 1872', body: 'On the 29th of October 1869, [the Klansmen] broke my door open, took me out of bed, took me to the woods and whipped me three hours or more and left me for dead. They said to me, "Do you think you will ever vote another Radical ticket?" I said, "If there was an election tomorrow, I would vote the Radical ticket." They set in and whipped me a thousand licks more.' },
        { promptLibraryEntryId: dbqPrompt1.id, position: 6, title: 'Document 6', attribution: 'Letter from a group of freedpeople in Edisto Island, South Carolina, to the Freedmen\'s Bureau Commissioner, 1865', body: 'General, we want Homesteads; we were promised Homesteads by the government... We have been faithful and true to the government, and why should we not have land when we have worked all our lives on it? This is our home. We have made these lands what they are.' },
        { promptLibraryEntryId: dbqPrompt1.id, position: 7, title: 'Document 7', attribution: 'Rutherford B. Hayes, Inaugural Address, 1877', body: 'Let me assure my countrymen of the Southern States that it is my earnest desire to regard and promote their truest interest — the interests of the white and of the colored people both and equally... I ask the forbearance and generous cooperation of all citizens in the effort I shall make to restore harmony and good feeling.' },
        { promptLibraryEntryId: dbqPrompt1.id, position: 8, title: 'Document 8 — Photograph: Freedmen\'s school, Beaufort, SC', attribution: 'Library of Congress, c. 1866', body: 'Rows of formerly enslaved children seated at desks in a Freedmen\'s Bureau school, with two Black teachers at the front of the classroom. The image illustrates the expansion of education to formerly enslaved people during Reconstruction, one of the most significant social transformations of the era.', mediaType: 'image', imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3c00000/3c01000/3c01000/3c01005r.jpg', imageAlt: 'Black-and-white photograph showing rows of African American children at desks in a Freedmen\'s Bureau school in Beaufort, South Carolina, circa 1866.' },
      ],
    });
    console.log('  ✅ Created DBQ prompt: Reconstruction (8 sources, 1 image).');

    const dbqPrompt2 = await prisma.promptLibraryEntry.create({
      data: {
        essayType: 'dbq',
        period: 'ush',
        periodNumber: 7,
        reasoningSkill: 'ccot',
        difficulty: 'exam-ready',
        promptBody: 'Evaluate the extent to which the New Deal changed the role of the federal government in the period 1930 to 1941.',
      },
    });

    await prisma.promptLibrarySource.createMany({
      data: [
        { promptLibraryEntryId: dbqPrompt2.id, position: 1, title: 'Document 1', attribution: 'Herbert Hoover, speech on limited government, 1928', body: 'You cannot extend the mastery of the government over the daily working life of a people without at the same time making it the master of the people\'s souls and thoughts... Every step of bureaucratizing of the business of our country poisons the very roots of liberalism.' },
        { promptLibraryEntryId: dbqPrompt2.id, position: 2, title: 'Document 2', attribution: 'Franklin D. Roosevelt, First Inaugural Address, 1933', body: 'This Nation asks for action, and action now... I shall ask the Congress for the one remaining instrument to meet the crisis — broad Executive power to wage a war against the emergency, as great as the power that would be given to me if we were in fact invaded by a foreign foe.' },
        { promptLibraryEntryId: dbqPrompt2.id, position: 3, title: 'Document 3', attribution: 'National Industrial Recovery Act, 1933', body: 'A national emergency productive of widespread unemployment and disorganization of industry... is hereby declared to exist. It is hereby declared to be the policy of Congress... to provide for the general welfare by promoting the organization of industry for the purpose of cooperative action among trade groups.' },
        { promptLibraryEntryId: dbqPrompt2.id, position: 4, title: 'Document 4', attribution: 'Huey Long, "Share Our Wealth" speech, 1934', body: 'How many men ever went to a barbecue and would let one man take off the table what\'s intended for 9/10th of the people to eat? The only way you\'ll ever be able to feed the balance of the people is to make that man come back and bring back some of that grub that he ain\'t got no business with!' },
        { promptLibraryEntryId: dbqPrompt2.id, position: 5, title: 'Document 5', attribution: 'Social Security Act, 1935', body: 'An act to provide for the general welfare by establishing a system of Federal old-age benefits, and by enabling the several States to make more adequate provision for aged persons, blind persons, dependent and crippled children, maternal and child welfare, public health, and the administration of their unemployment compensation laws.' },
        { promptLibraryEntryId: dbqPrompt2.id, position: 6, title: 'Document 6', attribution: 'Letter from a Works Progress Administration (WPA) worker to Eleanor Roosevelt, 1936', body: 'Dear Mrs. Roosevelt, I am writing you because I have no one else to turn to. My husband has been working on the WPA for two years. We are thankful. Before that we nearly starved. He now earns $55 a month, and while it is not much, we can eat. Please do not let them take the WPA away.' },
        { promptLibraryEntryId: dbqPrompt2.id, position: 7, title: 'Document 7', attribution: 'American Liberty League pamphlet, 1935', body: 'The New Deal is nothing more or less than an effort to take away from the thrifty what the thrifty or their ancestors have accumulated, or may accumulate, and give it to others who have not earned it... The American Liberty League was founded to defend and uphold the Constitution.' },
        { promptLibraryEntryId: dbqPrompt2.id, position: 8, title: 'Document 8 — Political Cartoon: "Yes, You Remembered Me"', attribution: 'Clifford Berryman, cartoon published in the Washington Evening Star, 1933. Library of Congress Prints and Photographs Division.', body: 'A political cartoon depicting a ragged figure labeled "The Forgotten Man" shaking hands with President Roosevelt. The cartoon captures the public perception that FDR\'s New Deal programs were directly addressing the needs of ordinary Americans devastated by the Great Depression, in contrast to the perceived indifference of the Hoover administration.', mediaType: 'image', imageUrl: 'https://tile.loc.gov/storage-services/service/pnp/cph/3b49000/3b49000/3b49063r.jpg', imageAlt: 'Political cartoon by Clifford Berryman showing a ragged figure labeled "The Forgotten Man" shaking hands with President Roosevelt, 1933.' },
      ],
    });
    console.log('  ✅ Created DBQ prompt: New Deal (8 sources, 1 image).');
  }

  console.log('✅ AP History seed complete.');
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
