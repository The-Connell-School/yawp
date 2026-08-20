import { expect, test } from 'bun:test';
import { submissionActivityUiContract } from './submission-activity-ui-contract';

test('keeps production QA selectors and labels on the rendered activity contract', () => {
  expect(submissionActivityUiContract).toEqual({
    triggerTestId: 'submission-activity-trigger',
    panelTestId: 'submission-activity-panel',
    afterReleaseTestId: 'submission-activity-after-release',
    gradeUpdatedLabel: 'Grade or feedback changed',
  });
});
