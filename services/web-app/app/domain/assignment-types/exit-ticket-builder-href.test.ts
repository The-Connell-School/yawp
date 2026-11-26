import { describe, expect, test } from 'bun:test';
import { exitTicketBuilderHref } from './exit-ticket-builder-href';

describe('exitTicketBuilderHref', () => {
  test('opens the Exit Ticket page with the builder open', () => {
    expect(exitTicketBuilderHref('type_1')).toBe(
      '/app/assignment-types/type_1?new=1'
    );
  });

  test('carries the class a teacher started from', () => {
    expect(exitTicketBuilderHref('type_1', 'class_9')).toBe(
      '/app/assignment-types/type_1?new=1&classId=class_9'
    );
  });
});
