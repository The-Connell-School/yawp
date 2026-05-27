import type { Detector } from './detector-framework';

export const apLitDetectors: Detector[] = [
  {
    id: 'paraphrase-not-analysis',
    name: 'Paraphrase instead of analysis',
    appliesTo: ['poetry-analysis', 'prose-fiction-analysis'],
    detect(essay) {
      const paraphrasePhrases = [
        'the poem is about',
        'the poem talks about',
        'the poet says',
        'the poet writes about',
        'the passage is about',
        'the passage talks about',
        'the author says',
        'the author tells us',
        'the story is about',
        'the narrator says',
        'in the poem,',
        'in the passage,',
        'then the character',
        'next the character',
        'after that',
      ];
      const lower = essay.toLowerCase();
      const found = paraphrasePhrases.filter((p) => lower.includes(p));
      if (found.length >= 3) {
        return [
          {
            detectorId: 'paraphrase-not-analysis',
            severity: 'flag',
            message:
              'The essay appears to paraphrase or retell rather than analyze. Focus on how literary elements create meaning, not what happens.',
            suggestedFix:
              'Replace "the poet says..." with "the poet\'s use of [element] creates..."',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'plot-summary',
    name: 'Plot summary instead of analysis',
    appliesTo: ['prose-fiction-analysis', 'literary-argument'],
    detect(essay) {
      const narrativePhrases = [
        'and then',
        'after that',
        'next,',
        'finally,',
        'in the end,',
        'the story begins',
        'the story ends',
        'at the beginning',
        'at the end of the story',
        'the character then',
        'he then',
        'she then',
      ];
      const lower = essay.toLowerCase();
      const found = narrativePhrases.filter((p) => lower.includes(p));
      if (found.length >= 4) {
        return [
          {
            detectorId: 'plot-summary',
            severity: 'flag',
            message:
              'Body paragraphs may be summarizing plot events rather than building a literary argument. Analyze craft, not plot.',
            suggestedFix:
              'Instead of narrating what happens, explain how the author\'s choices (diction, structure, imagery) create meaning.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'device-without-meaning',
    name: 'Literary device without meaning',
    appliesTo: 'all',
    detect(essay) {
      const deviceMentions = [
        'uses imagery',
        'uses symbolism',
        'uses metaphor',
        'uses irony',
        'uses tone',
        'uses diction',
        'uses alliteration',
        'employs imagery',
        'employs symbolism',
        'employs metaphor',
      ];
      const lower = essay.toLowerCase();
      const found = deviceMentions.filter((d) => lower.includes(d));
      if (found.length === 0) return [];

      const meaningPhrases = [
        'to convey',
        'to suggest',
        'to emphasize',
        'to illustrate',
        'to highlight',
        'which reveals',
        'which suggests',
        'which conveys',
        'this creates',
        'this reveals',
        'this suggests',
        'creating a sense',
        'evoking',
        'reinforcing',
        'underscoring',
      ];
      const hasMeaning = meaningPhrases.some((m) => lower.includes(m));
      if (!hasMeaning) {
        return [
          {
            detectorId: 'device-without-meaning',
            severity: 'flag',
            message:
              'Literary devices are named but not connected to meaning or interpretation. Explain what each device does for the poem or passage\'s meaning.',
            suggestedFix:
              'After identifying a device, add: "This [device] conveys/reveals/creates..."',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'surface-level-thesis',
    name: 'Surface-level thesis',
    appliesTo: 'all',
    detect(essay) {
      const paragraphs = essay.split(/\n\n+/).filter((p) => p.trim());
      if (paragraphs.length === 0) return [];
      const intro = paragraphs[0].toLowerCase();

      const surfacePatterns = [
        'uses literary elements to convey',
        'uses literary techniques to',
        'uses literary devices to',
        'uses many literary elements',
        'uses various techniques',
        'uses several devices',
        'develops the theme',
        'develops the character',
        'conveys the theme of',
      ];
      const isSurface = surfacePatterns.some((p) => intro.includes(p));

      const specificPatterns = [
        'through',
        'by using',
        'via',
        'particularly',
        'specifically',
        'such as',
        'including',
      ];
      const hasSpecificity = specificPatterns.some((p) => intro.includes(p));

      if (isSurface && !hasSpecificity) {
        return [
          {
            detectorId: 'surface-level-thesis',
            severity: 'warning',
            message:
              'The thesis names "literary elements" or "techniques" generically without specifying which ones or what they achieve.',
            suggestedFix:
              'Name the specific elements (e.g., "Through shifting point of view and stark imagery, [author] reveals...")',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'missing-textual-evidence',
    name: 'Missing textual evidence',
    appliesTo: 'all',
    detect(essay) {
      const hasQuotes = (essay.match(/"/g) || []).length >= 4;
      const hasLineRefs = /line\s+\d/i.test(essay);
      const hasPageRefs = /page\s+\d/i.test(essay);
      const hasParagraphRefs = /paragraph\s+\d/i.test(essay);

      if (!hasQuotes && !hasLineRefs && !hasPageRefs && !hasParagraphRefs) {
        return [
          {
            detectorId: 'missing-textual-evidence',
            severity: 'flag',
            message:
              'The essay appears to lack specific textual evidence (quotes or direct references). Claims about the work need specific textual support.',
            suggestedFix:
              'Quote specific words, phrases, or lines from the text to support each claim.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'ignoring-form',
    name: 'Ignoring poetic form',
    appliesTo: ['poetry-analysis'],
    detect(essay) {
      const formTerms = [
        'stanza',
        'line break',
        'enjambment',
        'caesura',
        'rhyme',
        'meter',
        'rhythm',
        'sonnet',
        'couplet',
        'volta',
        'form',
        'structure',
        'free verse',
        'iambic',
        'syllable',
      ];
      const lower = essay.toLowerCase();
      const hasFormDiscussion = formTerms.some((t) => lower.includes(t));
      if (!hasFormDiscussion) {
        return [
          {
            detectorId: 'ignoring-form',
            severity: 'warning',
            message:
              'The essay discusses the poem\'s content but not its form, structure, or sound. Poetry analysis should address how the poem is built, not just what it says.',
            suggestedFix:
              'Consider: stanza breaks, line breaks, rhyme scheme, meter, or how the poem\'s structure mirrors its meaning.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'single-scene-argument',
    name: 'Single-scene argument',
    appliesTo: ['literary-argument'],
    detect(essay) {
      const paragraphs = essay.split(/\n\n+/).filter((p) => p.trim());
      const body = paragraphs.slice(1, -1);
      if (body.length < 2) return [];

      const workAsWhole = [
        'throughout the novel',
        'throughout the work',
        'throughout the play',
        'throughout the book',
        'across the novel',
        'over the course of',
        'by the end of',
        'from the beginning',
        'in the final',
        'in the opening',
        'in contrast to the earlier',
        'later in the novel',
        'early in the novel',
      ];
      const lower = essay.toLowerCase();
      const hasScope = workAsWhole.filter((w) => lower.includes(w)).length;
      if (hasScope < 2) {
        return [
          {
            detectorId: 'single-scene-argument',
            severity: 'warning',
            message:
              'The essay may focus on a single scene rather than the work as a whole. The Literary Argument prompt requires analysis across the full work.',
            suggestedFix:
              'Reference at least 2–3 different moments from the work to show how the literary element operates across it.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'sophistication-missing',
    name: 'No sophistication moves',
    appliesTo: 'all',
    detect(essay) {
      const sophMoves = [
        'ambiguity',
        'tension',
        'complexity',
        'paradox',
        'irony',
        'although',
        'while it is true',
        'complicates',
        'challenges',
        'nuance',
        'broader',
        'literary tradition',
        'literary context',
      ];
      const lower = essay.toLowerCase();
      const found = sophMoves.filter((s) => lower.includes(s));
      if (found.length === 0) {
        return [
          {
            detectorId: 'sophistication-missing',
            severity: 'warning',
            message:
              'The essay does not address ambiguity, tension, or complexity — moves needed for the Sophistication point.',
          },
        ];
      }
      return [];
    },
  },
];
