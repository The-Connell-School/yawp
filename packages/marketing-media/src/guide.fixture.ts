/**
 * A guide storyboard shaped the way docs/how-to-guides.md says a guide is
 * shaped: a hero still, the range, up to three steps, an extra, will / won't,
 * and an honest footer.
 */
export function guideStoryboard(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'daily-pages-guide',
    title: 'Daily Pages guide',
    persona: 'teacher',
    guide: {
      headline: 'Get students writing every day in five minutes.',
      highlight: 'every day',
      workflowHeading: 'Run daily writing in your class',
      lede: 'Daily Pages gives your class a short prompt to write about at the start of the period.',
      canDo: [
        'Daily writing prompts for any subject',
        'Quick feedback on each entry',
        'A record of every student, every day',
      ],
      useCases: ['Bell work', 'Exit tickets', 'The first week of school'],
      will: ['Save every entry to the student’s record.'],
      wont: ['Share a student’s writing with other students.'],
      footerNote: 'Clips use demo classes.',
      startLabel: 'Open Daily Pages',
    },
    scenes: [
      {
        id: 'hero',
        goto: '/app',
        guide: { section: 'hero' },
      },
      {
        id: 'prompt-library',
        guide: {
          section: 'range',
          heading: 'Pick from a library of prompts',
        },
      },
      {
        id: 'assign',
        guide: {
          section: 'step',
          heading: 'Assign a prompt',
          body: 'Choose a prompt and send it to a class.',
        },
      },
      {
        id: 'review',
        guide: {
          section: 'step',
          heading: 'Read what they wrote',
          body: 'Every entry lands in one list, newest first.',
        },
      },
    ],
    ...overrides,
  };
}
