import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssignmentTypeAiHistorySection } from './assignment-type-ai-history-section';

describe('AssignmentTypeAiHistorySection', () => {
  it('renders recent AI versions with actor context and a workbench link', () => {
    const html = renderToStaticMarkup(
      <AssignmentTypeAiHistorySection
        assignmentTypeId="type-1"
        aiVersions={[
          {
            id: 'version-5',
            versionNumber: 5,
            changeSource: 'admin.assignment-type.update',
            changeSummary: 'Updated assignment type rubric and grading assistant',
            createdAt: '2026-07-03T15:30:00.000Z',
            createdByUser: {
              id: 'user-1',
              name: 'Kevin Gregorio',
              email: 'kevin@example.com',
            },
          },
        ]}
      />
    );

    expect(html).toContain('AI change history');
    expect(html).toContain('v5');
    expect(html).toContain('Updated assignment type rubric and grading assistant');
    expect(html).toContain('Kevin Gregorio');
    expect(html).toContain('/app/admin/assignment-types/type-1/ai-workbench');
    expect(html).toContain(
      '/app/admin/assignment-types/type-1/ai-workbench?versionId=version-5'
    );
  });

  it('renders an empty state before the first AI snapshot exists', () => {
    const html = renderToStaticMarkup(
      <AssignmentTypeAiHistorySection
        assignmentTypeId="type-1"
        aiVersions={[]}
      />
    );

    expect(html).toContain('No AI snapshots have been recorded yet.');
  });
});
