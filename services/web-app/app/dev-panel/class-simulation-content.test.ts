import { describe, expect, test } from 'bun:test';
import {
  buildSimulationDocumentContent,
  countSentences,
  countParagraphs,
} from './class-simulation-content';
import { CLASS_STARTER_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/class-starter-rubric';
import { PREWRITING_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/prewriting-assignment-type';
import { THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/thesis-statement-assignment-type';
import { DAILY_PAGES_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/daily-pages-rubric';

describe('buildSimulationDocumentContent', () => {
  test('submitted thesis-driven work is a multi-paragraph essay', () => {
    const { text } = buildSimulationDocumentContent({
      assignmentTypeKind: 'essay',
      state: 'submitted',
      studentIndex: 4,
      assignmentIndex: 0,
    });
    expect(countParagraphs(text)).toBeGreaterThanOrEqual(4);
  });

  test('submitted daily pages are at least five sentences', () => {
    const { text } = buildSimulationDocumentContent({
      assignmentTypeKind: DAILY_PAGES_ASSIGNMENT_TYPE_KIND,
      state: 'submitted',
      studentIndex: 2,
      assignmentIndex: 1,
    });
    expect(countSentences(text)).toBeGreaterThanOrEqual(5);
  });

  test('submitted free-tier types include a complete response', () => {
    for (const kind of [
      CLASS_STARTER_ASSIGNMENT_TYPE_KIND,
      PREWRITING_ASSIGNMENT_TYPE_KIND,
      THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND,
    ]) {
      const { text } = buildSimulationDocumentContent({
        assignmentTypeKind: kind,
        state: 'submitted',
        studentIndex: 3,
        assignmentIndex: 0,
      });
      expect(text.trim().length).toBeGreaterThan(80);
      expect(countSentences(text)).toBeGreaterThanOrEqual(2);
    }
  });

  test('in-progress work can be very short or off-topic', () => {
    const short = buildSimulationDocumentContent({
      assignmentTypeKind: 'essay',
      state: 'in_progress',
      studentIndex: 5,
      assignmentIndex: 0,
    });
    expect(short.text.length).toBeLessThan(120);

    const offTopic = buildSimulationDocumentContent({
      assignmentTypeKind: 'essay',
      state: 'in_progress',
      studentIndex: 7,
      assignmentIndex: 0,
    });
    expect(offTopic.text.toLowerCase()).toMatch(/video game|weekend|soccer|music/);
  });

  test('quality varies within submitted complete work', () => {
    const strong = buildSimulationDocumentContent({
      assignmentTypeKind: 'essay',
      state: 'submitted',
      studentIndex: 3,
      assignmentIndex: 0,
    });
    const weak = buildSimulationDocumentContent({
      assignmentTypeKind: 'essay',
      state: 'submitted',
      studentIndex: 5,
      assignmentIndex: 0,
    });
    expect(strong.text.length).toBeGreaterThan(weak.text.length);
  });
});
