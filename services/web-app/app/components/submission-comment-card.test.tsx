import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SubmissionCommentCard } from './submission-comment-card';

describe('SubmissionCommentCard', () => {
  test('renders author from membership after OrgMembership cutover', () => {
    const html = renderToStaticMarkup(
      <SubmissionCommentCard
        comment={{
          id: 'comment-1',
          content: 'Great thesis.',
          membership: {
            user: {
              name: 'Brian Connell',
              email: 'brian@theconnellschool.com',
            },
          },
        }}
      />
    );

    expect(html).toContain('Brian Connell');
    expect(html).toContain('Great thesis.');
    expect(html).not.toContain('undefined');
  });

  test('still renders author from legacy profile shape', () => {
    const html = renderToStaticMarkup(
      <SubmissionCommentCard
        comment={{
          id: 'comment-2',
          content: 'Legacy comment.',
          profile: {
            user: { name: 'Legacy Teacher', email: 'legacy@example.com' },
          },
        }}
      />
    );

    expect(html).toContain('Legacy Teacher');
    expect(html).toContain('Legacy comment.');
  });
});
