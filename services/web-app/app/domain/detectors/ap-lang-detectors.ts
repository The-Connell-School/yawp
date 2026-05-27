import type { Detector } from './detector-framework';

export const apLangDetectors: Detector[] = [
  {
    id: 'thesis-restates-prompt',
    name: 'Thesis restates prompt',
    appliesTo: 'all',
    detect(essay) {
      const paragraphs = essay.split(/\n\n+/).filter((p) => p.trim());
      if (paragraphs.length === 0) return [];
      const intro = paragraphs[0].toLowerCase();
      const hasThesisLanguage =
        intro.includes('because') ||
        intro.includes('although') ||
        intro.includes('while') ||
        intro.includes('however') ||
        intro.includes('in order to') ||
        intro.includes('by ');
      if (!hasThesisLanguage && intro.length < 300) {
        return [
          {
            detectorId: 'thesis-restates-prompt',
            severity: 'warning',
            message:
              'The introduction may restate the prompt without establishing a line of reasoning. Look for a "because" clause or analytic categories.',
            suggestedFix:
              'Add a "because" clause that names the reasons your body paragraphs will develop.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'walking-through-sources',
    name: 'Walking through sources',
    appliesTo: ['synthesis'],
    detect(essay) {
      const paragraphs = essay.split(/\n\n+/).filter((p) => p.trim());
      const body = paragraphs.slice(1, -1);
      if (body.length < 3) return [];

      let singleSourceParagraphs = 0;
      for (const para of body) {
        const sourceRefs = para.match(/source\s+[a-g\d]/gi) || [];
        const uniqueSources = new Set(
          sourceRefs.map((r) => r.toLowerCase())
        );
        if (uniqueSources.size === 1) singleSourceParagraphs++;
      }

      if (singleSourceParagraphs >= 2) {
        return [
          {
            detectorId: 'walking-through-sources',
            severity: 'flag',
            message:
              'Multiple body paragraphs reference only one source each. Group sources by argument, not one per paragraph.',
            suggestedFix:
              'Reorganize body paragraphs around your reasons, weaving 2–3 sources into each.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'source-summary-not-synthesis',
    name: 'Source summary instead of synthesis',
    appliesTo: ['synthesis'],
    detect(essay) {
      const summaryPhrases = [
        'the source states',
        'the source says',
        'the source explains',
        'the source argues',
        'according to source',
        'source a states',
        'source b states',
        'source c states',
      ];
      const lower = essay.toLowerCase();
      const matches = summaryPhrases.filter((p) => lower.includes(p));
      if (matches.length >= 3) {
        return [
          {
            detectorId: 'source-summary-not-synthesis',
            severity: 'warning',
            message:
              'The essay may be summarizing sources rather than synthesizing them as evidence. Sources should support your argument, not be described.',
            suggestedFix:
              'After citing a source, explain what it does for your argument — not just what it says.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'device-without-effect',
    name: 'Rhetorical device without effect',
    appliesTo: ['rhetorical-analysis'],
    detect(essay) {
      const deviceMentions = [
        'uses metaphor',
        'uses imagery',
        'uses repetition',
        'uses alliteration',
        'uses parallelism',
        'uses anaphora',
        'uses juxtaposition',
        'employs metaphor',
        'employs imagery',
        'employs repetition',
      ];
      const lower = essay.toLowerCase();
      const found = deviceMentions.filter((d) => lower.includes(d));
      if (found.length === 0) return [];

      const effectPhrases = [
        'which creates',
        'which emphasizes',
        'this creates',
        'this emphasizes',
        'this highlights',
        'to convey',
        'to emphasize',
        'to create',
        'the effect',
        'the reader feels',
        'the audience',
        'this makes the reader',
        'this causes',
        'resulting in',
      ];
      const hasEffect = effectPhrases.some((e) => lower.includes(e));
      if (!hasEffect) {
        return [
          {
            detectorId: 'device-without-effect',
            severity: 'flag',
            message:
              'Rhetorical devices are identified but their effect on the audience is not explained. Naming a device without explaining what it does earns limited evidence credit.',
            suggestedFix:
              'After naming each device, add a sentence explaining its effect: "This metaphor creates a sense of..."',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'catalog-not-argument',
    name: 'Catalog structure instead of argument',
    appliesTo: ['rhetorical-analysis'],
    detect(essay) {
      const deviceWords = [
        'metaphor',
        'simile',
        'imagery',
        'diction',
        'tone',
        'alliteration',
        'repetition',
        'parallelism',
        'anaphora',
        'juxtaposition',
        'ethos',
        'pathos',
        'logos',
        'rhetorical question',
        'hyperbole',
      ];
      const lower = essay.toLowerCase();
      const uniqueDevices = deviceWords.filter((d) => lower.includes(d));
      if (uniqueDevices.length >= 6) {
        return [
          {
            detectorId: 'catalog-not-argument',
            severity: 'warning',
            message:
              'The essay lists many rhetorical devices. A strong analysis builds an argument about how a few key choices work together, rather than cataloging every device.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'vague-evidence',
    name: 'Vague evidence',
    appliesTo: ['argument'],
    detect(essay) {
      const vaguePhrases = [
        'many people believe',
        'many people think',
        'studies show',
        'studies have shown',
        'research shows',
        'research has shown',
        'it is well known',
        'everyone knows',
        'throughout history',
        'since the beginning of time',
        'in today\'s society',
      ];
      const lower = essay.toLowerCase();
      const found = vaguePhrases.filter((p) => lower.includes(p));
      if (found.length >= 2) {
        return [
          {
            detectorId: 'vague-evidence',
            severity: 'flag',
            message:
              'The essay uses vague evidence phrases instead of specific examples. Name a specific person, event, book, or experience.',
            suggestedFix:
              'Replace "many people believe" with a named example: a specific historical event, a book, a personal experience.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'missing-counterargument',
    name: 'Missing counterargument',
    appliesTo: ['argument'],
    detect(essay) {
      const counterPhrases = [
        'however',
        'on the other hand',
        'some may argue',
        'critics',
        'opponents',
        'counterargument',
        'counter-argument',
        'although',
        'while some',
        'admittedly',
        'granted',
        'to be fair',
        'one might object',
      ];
      const lower = essay.toLowerCase();
      const hasCounter = counterPhrases.some((p) => lower.includes(p));
      if (!hasCounter) {
        return [
          {
            detectorId: 'missing-counterargument',
            severity: 'warning',
            message:
              'The essay does not appear to acknowledge an opposing view. Addressing counterarguments strengthens the argument and is key to the Sophistication point.',
            suggestedFix:
              'Add a paragraph or sentence that acknowledges what someone who disagrees would say, then explain why your position still holds.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'no-line-of-reasoning',
    name: 'No line of reasoning',
    appliesTo: 'all',
    detect(essay) {
      const paragraphs = essay.split(/\n\n+/).filter((p) => p.trim());
      const body = paragraphs.slice(1, -1);
      if (body.length < 2) return [];

      const reasoningConnectors = [
        'therefore',
        'thus',
        'consequently',
        'as a result',
        'this demonstrates',
        'this shows',
        'this reveals',
        'this proves',
        'this suggests',
        'this illustrates',
        'which means',
        'which suggests',
      ];
      const lower = essay.toLowerCase();
      const connectorCount = reasoningConnectors.filter((c) =>
        lower.includes(c)
      ).length;

      if (connectorCount === 0) {
        return [
          {
            detectorId: 'no-line-of-reasoning',
            severity: 'warning',
            message:
              'Body paragraphs may not connect back to a through-line from the thesis. Each paragraph should advance a distinct reason that ties to the thesis.',
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
        'although',
        'while it is true',
        'however',
        'nevertheless',
        'nuance',
        'complexity',
        'on the other hand',
        'to be sure',
        'admittedly',
        'broader context',
        'broader implication',
        'this complicates',
        'this challenges',
      ];
      const lower = essay.toLowerCase();
      const found = sophMoves.filter((s) => lower.includes(s));
      if (found.length === 0) {
        return [
          {
            detectorId: 'sophistication-missing',
            severity: 'warning',
            message:
              'The essay does not appear to qualify, complicate, or contextualize the argument — moves needed for the Sophistication point.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'block-quote-dump',
    name: 'Block quote without commentary',
    appliesTo: ['synthesis', 'rhetorical-analysis'],
    detect(essay) {
      const longQuotes = essay.match(/"[^"]{150,}"/g) || [];
      if (longQuotes.length >= 1) {
        return [
          {
            detectorId: 'block-quote-dump',
            severity: 'warning',
            message:
              'A long quoted passage appears without surrounding commentary. Integrate quotes into your own sentences and explain their significance.',
          },
        ];
      }
      return [];
    },
  },
];
