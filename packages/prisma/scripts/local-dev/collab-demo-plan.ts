import * as Y from 'yjs';
import { COLLAB_FRAGMENT_FIELD } from '../../../../services/web-app/app/domain/collaboration/fragment';

/**
 * The demo's collaborative GBA 300 work, as data.
 *
 * Split from the writes in `seed-collaboration.ts` so the interesting part — the
 * Yjs room, which is the one thing here that can be silently wrong — is a pure
 * function with tests. A room seeded incorrectly does not fail loudly: the page
 * opens, the draft is blank, and the first keystroke dual-writes that blankness
 * over the HTML the seed put in the database.
 *
 * It reaches into the web app for exactly one thing — the fragment name the
 * editor binds to — and that constant has its own import-free module so this can.
 * The obvious alternative, calling the web app's `yDocToSnapshot` for the HTML,
 * would pull TipTap and every editor extension into a workspace whose job is the
 * database; the preview toolbox does not have them, so the seed would die on
 * import. The HTML is built here instead, and a test holds it to what the real
 * converter produces so the two cannot drift apart quietly.
 */

/**
 * What the ProseMirror serializer does to a run of text, and no more.
 *
 * Written out rather than inferred: `Maple & Co.` in the demo copy is
 * `Maple &amp; Co.` once it has been through a room, and a seed that stored the
 * unescaped form would put a different document in `Document.html` than the one
 * the group sees. The test compares this against the real converter over every
 * paragraph the demo contains, so a case missing here fails loudly.
 */
function escapeText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** One member's writing, in the order they added it to the shared draft. */
export type RoomContribution = {
  /** A key within the plan; resolved to a real membership id when seeding. */
  author: string;
  paragraphs: string[];
  /**
   * An edit to a paragraph an earlier contribution wrote, attributed to this
   * contribution's own author and client id rather than the paragraph's
   * original one.
   *
   * This is the one thing the append-only shape above cannot produce on its
   * own, and it matters: without it, every demo author's `charsDeleted` stays
   * zero and the panel's "Removed" column — the one that keeps a student who
   * tightened a partner's paragraph from reading as a freeloader — never has
   * anything to show.
   *
   * `paragraph` identifies the target by its exact current text rather than by
   * position, so a copy edit to an earlier contribution fails this loudly
   * instead of silently revising the wrong sentence.
   */
  revise?: {
    paragraph: string;
    /** Must occur exactly once in `paragraph`; asserted at build time. */
    removeSubstring: string;
    /** Replacement text inserted where `removeSubstring` was, if any. */
    insertText?: string;
  };
};

export type RoomAuthorStat = {
  author: string;
  /** Yjs client id, as text: Yjs mints uint32 values past Postgres `integer`. */
  clientId: string;
  charsInserted: number;
  charsDeleted: number;
  updateCount: number;
};

export type BuiltRoom = {
  /** Append-only log rows, in the order they must be stored. */
  updates: { author: string; update: Uint8Array }[];
  authors: RoomAuthorStat[];
  /** What the dual-write would have persisted for grading, search and submission. */
  html: string;
  text: string;
};

/**
 * Builds a shared draft the way one actually gets written: each member's text
 * arrives as its own Yjs update, from its own client id, on top of what was there
 * before.
 *
 * One merged update from a single client would look identical on the page and be
 * useless for everything the teacher views are for — the contribution breakdown
 * would show one anonymous author having written the entire document.
 */
export function buildCollabRoom(contributions: RoomContribution[]): BuiltRoom {
  const master = new Y.Doc();
  const updates: BuiltRoom['updates'] = [];
  const authors: RoomAuthorStat[] = [];
  const paragraphs: string[] = [];

  try {
    for (const contribution of contributions) {
      if (contribution.paragraphs.length === 0 && !contribution.revise)
        continue;

      // A fresh Doc per contribution, because a Yjs client id is per document
      // instance — which is exactly what makes it stand in for a person here.
      const client = new Y.Doc();
      try {
        Y.applyUpdate(client, Y.encodeStateAsUpdate(master));

        let charsInserted = 0;
        let charsDeleted = 0;
        let updateCount = 0;

        // The revise, if any, happens first — it can only ever touch a
        // paragraph an earlier contribution wrote, never this one's own.
        if (contribution.revise) {
          const { paragraph, removeSubstring, insertText } =
            contribution.revise;
          const paragraphIndex = paragraphs.indexOf(paragraph);
          if (paragraphIndex === -1) {
            throw new Error(
              `Revise target not found among earlier paragraphs: ${JSON.stringify(paragraph)}`
            );
          }
          const at = paragraph.indexOf(removeSubstring);
          if (at === -1) {
            throw new Error(
              `Revise substring ${JSON.stringify(removeSubstring)} not found in paragraph ${JSON.stringify(paragraph)}`
            );
          }

          const before = Y.encodeStateVector(client);
          // Paragraphs are pushed one Y.XmlElement per line, each holding one
          // Y.XmlText child — the exact shape the append branch below writes.
          const target = client.getXmlFragment(COLLAB_FRAGMENT_FIELD).toArray()[
            paragraphIndex
          ] as Y.XmlElement;
          const text = target.toArray()[0] as Y.XmlText;
          text.delete(at, removeSubstring.length);
          if (insertText) text.insert(at, insertText);

          const update = Y.encodeStateAsUpdate(client, before);
          Y.applyUpdate(master, update);
          updates.push({ author: contribution.author, update });

          paragraphs[paragraphIndex] =
            paragraph.slice(0, at) +
            (insertText ?? '') +
            paragraph.slice(at + removeSubstring.length);
          charsDeleted += removeSubstring.length;
          charsInserted += insertText?.length ?? 0;
          updateCount += 1;
        }

        if (contribution.paragraphs.length > 0) {
          const before = Y.encodeStateVector(client);

          client.getXmlFragment(COLLAB_FRAGMENT_FIELD).push(
            contribution.paragraphs.map((line) => {
              const paragraph = new Y.XmlElement('paragraph');
              paragraph.insert(0, [new Y.XmlText(line)]);
              return paragraph;
            })
          );

          const update = Y.encodeStateAsUpdate(client, before);
          Y.applyUpdate(master, update);
          paragraphs.push(...contribution.paragraphs);
          updates.push({ author: contribution.author, update });

          charsInserted += contribution.paragraphs.join('').length;
          updateCount += contribution.paragraphs.length;
        }

        authors.push({
          author: contribution.author,
          clientId: String(client.clientID),
          charsInserted,
          charsDeleted,
          updateCount,
        });
      } finally {
        client.destroy();
      }
    }

    return {
      updates,
      authors,
      // What the dual-write would have persisted. Every contribution is a
      // paragraph of plain text, so this is the whole of what the converter
      // would produce for this document — and `seed-collaboration.test.ts`
      // checks that against the converter itself rather than taking it on faith.
      html: paragraphs.map((line) => `<p>${escapeText(line)}</p>`).join(''),
      text: paragraphs.join('\n'),
    };
  } finally {
    master.destroy();
  }
}

/**
 * The extra students the GBA 300 demo needs.
 *
 * Deliberately not added to `LOCAL_DEV_PERSONAS`: that list is the dev-login
 * picker, the preview seat roster and an e2e fixture all at once, and twelve more
 * names in it would cost all three to buy one demo. A preview seat lists every
 * user in its organization, so these are selectable there regardless.
 */
export const GBA300_COHORT = [
  { key: 'ada', name: 'Ada Okonkwo' },
  { key: 'ben', name: 'Ben Alvarez' },
  { key: 'cy', name: 'Cy Nakamura' },
  { key: 'dee', name: 'Dee Whitfield' },
  { key: 'eli', name: 'Eli Barros' },
  { key: 'fen', name: 'Fen Zhao' },
  { key: 'gia', name: 'Gia Petrov' },
  { key: 'hal', name: 'Hal Mwangi' },
  // Not a current member of any group — see `removedMember` below. Ninth
  // rather than reused, so removing her from Group 4 never has to be told
  // apart from a student who is simply quiet in some other group.
  { key: 'iris', name: 'Iris Novak' },
  { key: 'jae', name: 'Jae Lindqvist' },
  { key: 'kit', name: 'Kit Abara' },
  { key: 'lou', name: 'Lou Ferreira' },
  { key: 'mia', name: 'Mia Sokolov' },
  { key: 'noa', name: 'Noa Haddad' },
  { key: 'ravi', name: 'Ravi Chandran' },
  // Group 7: the evenly-split brief. Three more names rather than reusing
  // anyone, because "nobody is in two groups at once" is what makes the
  // contribution breakdown mean anything.
  { key: 'sol', name: 'Sol Bramante' },
  { key: 'tao', name: 'Tao Nguyen' },
  { key: 'uma', name: 'Uma Beckett' },
] as const;

export type GbaCohortKey = (typeof GBA300_COHORT)[number]['key'];

/**
 * Cohort emails follow one pattern so they are obvious in a login picker.
 *
 * `suffix` is how preview seats stay apart: `User.email` is unique across the
 * whole database, so a second seat seeding the same cohort would collide with the
 * first. It matches the qualifier `preview-seats.ts` puts on persona addresses.
 */
export function cohortEmail(key: string, suffix = '') {
  return `dev.gba.${key}${suffix}@yawp.local`;
}

export type DemoGroupPlan = {
  label: string;
  ordinal: number;
  /** Plan-local author keys; cohort keys and the four student personas. */
  members: string[];
  /**
   * Someone who wrote in this draft and was then moved out of the group —
   * present in `contributions` but absent from `members`. `DocumentGroupMember`
   * still carries their row, with `removedAt` set, so the "who worked on this"
   * table and the individual-grade cards correctly leave them out while their
   * surviving text still renders in the draft below, labelled "Former student"
   * rather than tinted to a name nobody on the roster recognizes.
   */
  removedMember?: string;
  contributions: RoomContribution[];
  /**
   * Where the group is in the assignment, which decides what gets written.
   *
   * `graded` releases the grade to the group; `graded-unreleased` keeps it back,
   * which is the state a teacher is in for most of the time they are marking and
   * the one where a bug would leak a grade early.
   */
  stage: 'drafting' | 'submitted' | 'graded' | 'graded-unreleased';
  /**
   * An earlier submission the teacher sent back, kept alongside the current one.
   *
   * `unsubmittedAt` is what distinguishes it: every query for "the group's work"
   * filters on that being null, so a withdrawn submission has to exist in the
   * demo for those filters to be worth anything.
   */
  priorSubmission?: { withdrawnAfterDays: number };
  /** Teacher comment on the draft, and the group's reply to it. */
  comment?: { teacher: string; reply?: { author: string; content: string } };
  grade?: {
    /**
     * The group grade as the teacher types it: free text on the group's
     * `Submission`, which is what `readGroupGrade` reads and what every member
     * who has not been overridden inherits. The numeric and letter fields below
     * are the same judgement in the shape the solo grading surfaces expect.
     */
    score: string;
    numericPercentage: number;
    letterGrade: string;
    overallComment: string;
    /**
     * The member whose individual grade departs from the group's. Everyone else
     * follows the group grade, which is stored as following rather than copied —
     * re-grading the group has to reach them.
     */
    override?: { author: string; score: string; feedback: string };
  };
};

/**
 * Four groups at four different points, so every view has something to show:
 * a draft mid-flight with an uneven split and a teacher asking about it, a
 * submitted-and-graded group with one individual grade pulled off the group's, a
 * group waiting to be graded, and one that has barely started.
 */
export const GBA300_GROUP_PLANS: DemoGroupPlan[] = [
  {
    label: 'Group 1',
    ordinal: 0,
    // Sam Student, the persona a local run logs in as first, is deliberately in
    // this group: it is the one with the teacher's comment, the reply and the
    // lopsided split, so the interesting page is the first one they land on.
    members: ['student', 'ben', 'cy'],
    stage: 'drafting',
    contributions: [
      {
        author: 'student',
        paragraphs: [
          'Company overview: Maple & Co. is a mid-sized Canadian outdoor apparel maker with 340 employees and $58M in annual revenue, 82% of it domestic.',
          'Their growth has flattened for three straight years, which is the reason management is looking abroad rather than a reason to be confident about it.',
          'Industry analysis: technical outerwear is consolidating. Two competitors merged last year, and both now outspend Maple & Co. on marketing by roughly four to one.',
          'International location: we are recommending South Korea over Japan. The tariff position is worse, but the retail channel is far less locked up by incumbents.',
        ],
      },
      {
        author: 'ben',
        paragraphs: [
          'Consumer profile: the target buyer is 25-40, urban, and already spends on performance gear for commuting rather than for the backcountry.',
          'That matters for the advertising strategy below, because it means the mountain photography every competitor uses is aimed at the wrong person.',
        ],
      },
      {
        author: 'cy',
        paragraphs: ['Advertising strategy: TODO, I will write this tonight.'],
      },
    ],
    comment: {
      teacher:
        'Good work on the location section — the tariff trade-off is exactly the kind of reasoning I want to see. The advertising strategy is still a placeholder, and the budget and recommendation sections have not been started. Who is taking those?',
      reply: {
        author: 'ben',
        content:
          'Cy is doing advertising and budget, I am taking the recommendation, and Ada is going to write the executive summary once the rest is in.',
      },
    },
  },
  {
    label: 'Group 2',
    ordinal: 1,
    members: ['dee', 'eli', 'student-submitted'],
    stage: 'graded',
    contributions: [
      {
        author: 'dee',
        paragraphs: [
          'Company overview: Harbourline Coffee roasts and wholesales in three provinces and has never sold outside Canada.',
          'Industry analysis: specialty coffee abroad is not one market. Wholesale margins in Germany are thin and contested; the opportunity is in cafe supply, not grocery.',
          'International location: Berlin. Lower entry cost than London, an established independent cafe culture, and no dominant domestic roaster in the segment.',
        ],
      },
      {
        author: 'eli',
        paragraphs: [
          'Consumer profile: independent cafe owners buying 40-120kg a month, who choose a roaster on consistency and delivery reliability before price.',
          'Advertising strategy: trade-first. Sampling at two regional coffee festivals, then a named account manager per city rather than any consumer advertising at all.',
          'Budget breakdown: EUR 180,000 in year one — 45% logistics and warehousing, 30% the account manager, 15% festivals and samples, 10% contingency.',
        ],
      },
      {
        author: 'student-submitted',
        paragraphs: [
          'Recommendation: enter Berlin in Q3 with a single account manager and no retail presence, and revisit grocery only after twenty accounts are stable.',
        ],
      },
    ],
    comment: {
      teacher:
        'This is the strongest brief in the class. The budget is specific enough to argue with, which is the point of the exercise.',
    },
    grade: {
      score: 'A- (91)',
      numericPercentage: 91,
      letterGrade: 'A-',
      overallComment:
        'Clear-eyed about margin and honest about what it does not know. The recommendation follows from the evidence rather than being announced.',
      override: {
        author: 'student-submitted',
        score: '78',
        feedback:
          'Your recommendation section is solid, but it is the only section with your name on it. The group grade reflects the brief; this reflects your share of it.',
      },
    },
  },
  {
    label: 'Group 3',
    ordinal: 2,
    members: ['fen', 'gia', 'student-graded'],
    stage: 'submitted',
    contributions: [
      {
        author: 'fen',
        paragraphs: [
          'Company overview: Northfield Tools makes cordless power tools for trades, 210 employees, and sells almost entirely through two national hardware chains.',
          'Industry analysis: the chains are the whole business, which is the risk. Any international move that depends on finding an equivalent chain abroad inherits the same problem.',
        ],
      },
      {
        author: 'gia',
        paragraphs: [
          'International location: Australia. Shared trade standards, no language barrier for the manuals, and a trade market that buys on durability rather than price.',
          'Consumer profile: independent tradespeople who replace tools on failure, not on schedule, and who ask other tradespeople before they ask a salesperson.',
          'Advertising strategy: warranty-led. A five-year on-site warranty is the message, and the channel is trade shows and site demonstrations.',
        ],
      },
      {
        author: 'student-graded',
        paragraphs: [
          'Budget breakdown: AUD 240,000 year one, weighted to warranty reserve rather than advertising, because the warranty is the advertising.',
          'Recommendation: enter through a distributor for eighteen months before committing to a local sales force.',
          'Executive summary: Northfield should enter Australia through a distributor, lead on a five-year warranty, and hold the decision on a direct sales force until the warranty claim rate is known.',
        ],
      },
      {
        // A separate sitting, days later: Casey comes back not to write
        // something new but to tighten Gia's sentence — the exact case the
        // panel's "Removed" column and its own docstring exist for, and until
        // now nothing in the demo produced a charsDeleted greater than zero.
        author: 'student-graded',
        paragraphs: [],
        revise: {
          paragraph:
            'Consumer profile: independent tradespeople who replace tools on failure, not on schedule, and who ask other tradespeople before they ask a salesperson.',
          removeSubstring: ' not on schedule,',
        },
      },
    ],
  },
  {
    label: 'Group 4',
    ordinal: 3,
    members: ['hal', 'student-unreleased', 'ada'],
    // Iris opened the document, then the teacher moved her to a different
    // section — the group and its draft stayed behind. Her sentence is still
    // the first thing in it.
    removedMember: 'iris',
    stage: 'drafting',
    contributions: [
      {
        author: 'iris',
        paragraphs: [
          'Company overview: we are proposing Sundial Bakery, a regional chain looking at its first international location.',
        ],
      },
      {
        author: 'hal',
        paragraphs: [
          'Still deciding whether the international location should be Ireland or Portugal.',
        ],
      },
    ],
  },
  {
    label: 'Group 5',
    ordinal: 4,
    members: ['jae', 'kit', 'lou'],
    // Submitted, sent back for more work, and submitted again. The withdrawn
    // submission is still on the document.
    stage: 'submitted',
    priorSubmission: { withdrawnAfterDays: 5 },
    contributions: [
      {
        author: 'jae',
        paragraphs: [
          'Company overview: Rivet & Stone is a Canadian furniture maker selling flat-pack hardwood pieces direct to consumers.',
          'Industry analysis: direct-to-consumer furniture lives and dies on shipping cost, so the analysis has to start from freight rather than from taste.',
          'International location: the Netherlands. Central for onward EU shipping, high English fluency, and a buyer who already assembles their own furniture.',
        ],
      },
      {
        author: 'kit',
        paragraphs: [
          'Consumer profile: 28-45, renting or in a first home, buying one considered piece at a time rather than furnishing a room at once.',
          'Advertising strategy: assembly-first. The message is that it goes together in twenty minutes, shown rather than claimed, on video.',
        ],
      },
      {
        author: 'lou',
        paragraphs: [
          'Budget breakdown: EUR 210,000 in year one — 50% freight and a Rotterdam 3PL, 25% video production, 15% paid social, 10% returns reserve.',
          'Recommendation: enter the Netherlands in Q2 with four SKUs, and treat the returns rate in the first two quarters as the decision point on widening the range.',
          'Executive summary: Rivet & Stone should enter the Netherlands with a deliberately narrow range, lead on assembly, and let the returns rate decide whether to widen it.',
        ],
      },
      {
        // The revision that came out of being sent back the first time.
        author: 'jae',
        paragraphs: [],
        revise: {
          paragraph:
            'Industry analysis: direct-to-consumer furniture lives and dies on shipping cost, so the analysis has to start from freight rather than from taste.',
          removeSubstring: 'lives and dies on shipping cost',
          insertText:
            'competes on landed cost, where freight is the largest single line',
        },
      },
    ],
    comment: {
      teacher:
        'Much stronger on the resubmission — starting from freight rather than from taste is the right instinct, and the returns rate as a decision point is exactly the kind of commitment I was asking for.',
    },
  },
  {
    label: 'Group 6',
    ordinal: 5,
    members: ['mia', 'noa', 'ravi'],
    // Graded but deliberately not released: the state a teacher spends most of
    // their marking time in, and the one where a leak would be worst.
    stage: 'graded-unreleased',
    contributions: [
      {
        author: 'mia',
        paragraphs: [
          'Company overview: Two Rivers Cider presses from a single orchard and sells through restaurants and bottle shops in one province.',
          'Industry analysis: cider abroad competes with beer for the same tap, not with wine for the same shelf, which changes who we have to convince.',
        ],
      },
      {
        author: 'noa',
        paragraphs: [
          'International location: Ireland. An established cider category means we do not have to explain the product, only why ours is different.',
          'Consumer profile: pub operators choosing a second cider tap, who need a reason to displace something already selling.',
          'Advertising strategy: single-orchard provenance, argued to the operator rather than the drinker, with a tap takeover in three Dublin pubs as the proof.',
        ],
      },
      {
        author: 'ravi',
        paragraphs: [
          'Budget breakdown: EUR 95,000 year one, over half of it the tap takeovers, because that is the whole strategy rather than a marketing line.',
          'Recommendation: enter Dublin only, hold the range at one product, and judge it on repeat orders from the first three accounts.',
        ],
      },
    ],
    grade: {
      score: 'B+ (87)',
      numericPercentage: 87,
      letterGrade: 'B+',
      overallComment:
        'The competitive framing — cider against beer for the tap, not against wine for the shelf — is the best single observation in any brief this term. The executive summary is missing.',
      override: {
        author: 'ravi',
        score: '80',
        feedback:
          'Your budget follows the strategy honestly, which is more than most. The missing executive summary was your section.',
      },
    },
  },
  {
    label: 'Group 7',
    ordinal: 6,
    members: ['sol', 'tao', 'uma'],
    // A third graded brief, so the class-level views have more than two points
    // to work from. Deliberately the even one: three students who wrote roughly
    // the same amount, nobody overridden, and everyone on the group grade. It is
    // the case the individual-grade drafting should answer with "no separate
    // grade for anyone", and there was no group in the demo that looked like it.
    stage: 'graded',
    contributions: [
      {
        author: 'sol',
        paragraphs: [
          'Executive summary: Fieldnote Press prints small-run art books in one city and proposes entering Japan through specialist bookshops rather than distributors.',
          'Company overview: eleven staff, one press, and a catalogue that sells out at art fairs and almost nowhere else.',
          'Industry analysis: art book buyers abroad are reached by curation, not by shelf space. The competition is other publishers\u2019 taste, and the barrier is being carried at all.',
        ],
      },
      {
        author: 'tao',
        paragraphs: [
          'International location profile: Tokyo. The densest concentration of independent art bookshops anywhere, and buyers who already import from Europe.',
          'Consumer profile: shop buyers ordering 10-30 copies a title, who reorder on how a book photographs in their own feed as much as on how it sells.',
          'Advertising strategy: no advertising. A launch at one Tokyo art book fair, then consignment with four shops and a Japanese-language colophon in every title.',
        ],
      },
      {
        author: 'uma',
        paragraphs: [
          'Budget: JPY 4.2 million in year one, most of it freight and the fair stand, with translation costed per title rather than as a lump.',
          'Recommendation: consign with four shops for two seasons before signing any distributor, and treat the fair as the whole marketing budget.',
          'References: JETRO import guidance, the Tokyo Art Book Fair exhibitor pack, and two shop interviews recorded in the appendix.',
        ],
      },
    ],
    comment: {
      teacher:
        'The most evenly written brief in the class, and it shows \u2014 the sections read as though one person argued them, which is what a real report has to do.',
      reply: {
        author: 'tao',
        content:
          'We drafted the outline together before anyone wrote, which is probably why.',
      },
    },
    grade: {
      score: 'A (94)',
      numericPercentage: 94,
      letterGrade: 'A',
      overallComment:
        'Refuses the easy version of every question: no distributor, no advertising, no grocery. Each refusal is argued rather than asserted, and the budget is honest about what the strategy actually costs.',
      // No override. Everyone follows the group grade, which is the answer for
      // most students on most group work and the one this demo was missing.
    },
  },
];
