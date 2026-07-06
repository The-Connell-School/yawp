import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_DOCUMENT_DOMAINS,
  DEFAULT_DOCUMENT_WORD_COUNTS,
  DEFAULT_STRATEGIES,
  buildEvalMatrix,
  buildFixtureConversation,
  buildStrategyRequests,
} from './context-strategies';
import {
  CLAUDE_PRICING,
  estimateStrategyCost,
  formatUsd,
} from './cost';

describe('AI context eval strategy planning', () => {
  test('builds the requested document-size matrix across all strategies', () => {
    const matrix = buildEvalMatrix({
      wordCounts: DEFAULT_DOCUMENT_WORD_COUNTS,
      strategies: DEFAULT_STRATEGIES,
    });

    expect(DEFAULT_DOCUMENT_WORD_COUNTS).toEqual([
      20, 50, 100, 200, 500, 750, 1000,
    ]);
    expect(matrix.strategyIds).toEqual([
      'full-document-each-turn',
      'delta-since-last-turn',
      'hybrid-summary-and-excerpts',
      'full-document-with-prompt-cache',
    ]);
    expect(matrix.documentDomainIds).toEqual([
      'school-lunch-argument',
      'literary-analysis',
      'ap-history-dbq',
      'science-claim-evidence',
      'personal-narrative',
    ]);
    expect(matrix.cases).toHaveLength(
      DEFAULT_DOCUMENT_WORD_COUNTS.length * DEFAULT_DOCUMENT_DOMAINS.length * 4
    );
    expect(matrix.cases.map((item) => item.documentWordCount)).toContain(1000);
  });

  test('builds scenario-specific cases instead of duplicating the same conversation', () => {
    const cases = buildEvalMatrix({
      wordCounts: [100],
      documentDomainIds: ['school-lunch-argument'],
    }).cases;

    expect(cases.map((evalCase) => [evalCase.scenarioId, evalCase.turns.length])).toEqual([
      ['local-revision-follow-up', 2],
      ['specific-detail-question', 3],
      ['deleted-content-trap', 4],
      ['whole-draft-review', 5],
    ]);
  });

  test('builds multiple document domains with explicit tiny-change traps', () => {
    const cases = buildEvalMatrix({ wordCounts: [100] }).cases;
    const domains = new Set(cases.map((evalCase) => evalCase.documentDomainId));
    const trapTypes = new Set(
      cases.flatMap((evalCase) =>
        evalCase.turns.flatMap((turn) => turn.trapTypes)
      )
    );

    expect(domains).toEqual(
      new Set([
        'school-lunch-argument',
        'literary-analysis',
        'ap-history-dbq',
        'science-claim-evidence',
        'personal-narrative',
      ])
    );
    for (const trapType of [
      'changed-name',
      'changed-date',
      'changed-number',
      'negation-flip',
      'deleted-paragraph',
      'reordered-claim',
    ]) {
      expect(trapTypes.has(trapType)).toBe(true);
    }
  });

  test('case ids include domain so results remain comparable across domains', () => {
    const fixture = buildFixtureConversation({
      documentWordCount: 100,
      documentDomainId: 'ap-history-dbq',
      scenarioId: 'specific-detail-question',
    });

    expect(fixture.id).toBe('ap-history-dbq__specific-detail-question-100');
    expect(fixture.documentDomainId).toBe('ap-history-dbq');
  });

  test('full-document strategy includes current canonical draft on every turn', () => {
    const fixture = buildFixtureConversation({ documentWordCount: 100 });
    const requests = buildStrategyRequests({
      evalCase: fixture,
      strategyId: 'full-document-each-turn',
    });

    expect(requests).toHaveLength(fixture.turns.length);
    for (const [index, request] of requests.entries()) {
      expect(request.messages.at(-2)?.content).toContain(
        '<student_document_context'
      );
      expect(request.messages.at(-2)?.content).toContain(
        fixture.turns[index]!.currentDocument
      );
      expect(request.contextCoverage.hasCanonicalCurrentDocument).toBe(true);
    }
  });

  test('delta strategy sends changes after the first turn without asking the model to store deleted text as current', () => {
    const fixture = buildFixtureConversation({ documentWordCount: 100 });
    const requests = buildStrategyRequests({
      evalCase: fixture,
      strategyId: 'delta-since-last-turn',
    });
    const deletionTurn = requests.find((request) =>
      request.turn.mustNotUseAnchors.includes('alligators')
    );

    expect(requests[0]!.contextCoverage.hasCanonicalCurrentDocument).toBe(true);
    expect(requests[1]!.contextCoverage.hasCanonicalCurrentDocument).toBe(false);
    expect(requests[1]!.messages.at(-2)?.content).toContain(
      '<student_document_change_context'
    );
    expect(deletionTurn?.messages.at(-2)?.content).not.toContain(
      'alligators patrol the library'
    );
    expect(deletionTurn?.contextCoverage.includesRemovedContent).toBe(false);
  });

  test('hybrid strategy escalates to full document when the student asks for whole-draft review', () => {
    const fixture = buildFixtureConversation({ documentWordCount: 200 });
    const requests = buildStrategyRequests({
      evalCase: fixture,
      strategyId: 'hybrid-summary-and-excerpts',
    });
    const globalReviewTurn = requests.find((request) =>
      request.turn.expectedBehavior.includes('whole draft')
    );

    expect(requests[1]!.messages.at(-2)?.content).toContain(
      '<student_document_summary'
    );
    expect(globalReviewTurn?.contextCoverage.hasCanonicalCurrentDocument).toBe(
      true
    );
  });

  test('cost estimates can compare strategies without making live API calls', () => {
    const fixture = buildFixtureConversation({ documentWordCount: 500 });
    const fullCost = estimateStrategyCost({
      requests: buildStrategyRequests({
        evalCase: fixture,
        strategyId: 'full-document-each-turn',
      }),
      pricing: CLAUDE_PRICING['claude-sonnet-4-6'],
      assumedOutputTokensPerTurn: 220,
    });
    const deltaCost = estimateStrategyCost({
      requests: buildStrategyRequests({
        evalCase: fixture,
        strategyId: 'delta-since-last-turn',
      }),
      pricing: CLAUDE_PRICING['claude-sonnet-4-6'],
      assumedOutputTokensPerTurn: 220,
    });

    expect(fullCost.totalInputTokens).toBeGreaterThan(
      deltaCost.totalInputTokens
    );
    expect(fullCost.totalUsd).toBeGreaterThan(deltaCost.totalUsd);
    expect(formatUsd(fullCost.totalUsd)).toMatch(/^\$0\.\d{4}$/);
  });
});
