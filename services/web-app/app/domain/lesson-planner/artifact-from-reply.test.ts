import { describe, expect, test } from 'bun:test';
import {
  artifactFromAssistantReply,
  exitTicketAsMaterial,
} from './artifact-from-reply';
import { EXIT_TICKET_BLOCK_KEY } from './lesson-material';

describe('exitTicketAsMaterial', () => {
  test('files the student prompt as an exit-ticket handout', () => {
    const material = exitTicketAsMaterial({
      config: {
        mode: 'specific',
        focus: 'explain-concept',
        topic: 'comma splices',
        answerType: 'objective',
        lessonNotes: {
          mainPoints: 'x',
          mustMention: 'y',
          watchFor: 'z',
        },
      },
      prompt: 'Explain what a comma splice is.',
      graded: false,
      pointValue: null,
    });
    expect(material.kind).toBe('exit-ticket');
    expect(material.slot).toBe(EXIT_TICKET_BLOCK_KEY);
    expect(material.content).toContain('comma splice');
  });
});

describe('artifactFromAssistantReply', () => {
  test('reads a yawp-exit-ticket block from the reply', () => {
    const reply =
      '## Closing\n\n```yawp-exit-ticket\nmode: specific\nfocus: explain-concept\ntopic: weathering and erosion\nanswer: objective\n```';
    const material = artifactFromAssistantReply(reply, EXIT_TICKET_BLOCK_KEY);
    expect(material?.kind).toBe('exit-ticket');
    expect(material?.content).toContain('weathering and erosion');
  });
});
