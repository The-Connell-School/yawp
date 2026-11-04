import { describe, expect, test } from 'bun:test';
import {
  FIRST_ASSIGNMENT_OVERLAY_BODY_P1,
  FIRST_ASSIGNMENT_OVERLAY_BODY_P2,
  FIRST_ASSIGNMENT_OVERLAY_BODY_P3,
  FIRST_ASSIGNMENT_OVERLAY_HEADING,
} from './first-assignment-congratulations-dialog';

describe('first assignment congratulations callout copy', () => {
  test('matches Brian first-assignment overlay', () => {
    expect(FIRST_ASSIGNMENT_OVERLAY_HEADING).toBe('Start with a Class Starter');
    expect(FIRST_ASSIGNMENT_OVERLAY_BODY_P1).toBe(
      "A five-minute Class Starter is the easiest way to begin. When your students join your class, they'll see the assignment, write their response, and get their first feedback from the Yawp! tutor. It's low-stakes and fun, and it gets everyone comfortable on the platform before the bigger writing starts."
    );
    expect(FIRST_ASSIGNMENT_OVERLAY_BODY_P2).toBe(
      "When they're done, they'll submit their assignments. You'll be able to read their writing and their conversations with the tutor, comment on their documents, and use the Grading Assistant to grade it. (Don't worry, we'll walk you through that part too!)"
    );
    expect(FIRST_ASSIGNMENT_OVERLAY_BODY_P3).toBe(
      "We've written the first prompt for you. Use it as is, or make it your own."
    );
  });
});
