import { describe, expect, it } from 'bun:test';
import { getTeacherTrainingMediaAccessibilityResources } from './teacher-training-media-accessibility';

describe('getTeacherTrainingMediaAccessibilityResources', () => {
  const resources = [
    {
      id: 'worksheet',
      name: 'worksheet.pdf',
      contentType: 'application/pdf',
    },
    {
      id: 'captions',
      name: 'module-captions.vtt',
      contentType: 'text/vtt',
    },
    {
      id: 'transcript',
      name: 'module-transcript.txt',
      contentType: 'text/plain',
    },
  ];

  it('selects VTT captions and a transcript resource', () => {
    expect(getTeacherTrainingMediaAccessibilityResources(resources)).toEqual({
      captionResource: resources[1],
      transcriptResource: resources[2],
    });
  });

  it('recognizes caption and transcript resources by file name when content type is generic', () => {
    const genericResources = [
      {
        id: 'captions',
        name: 'intro.en.vtt',
        contentType: 'application/octet-stream',
      },
      {
        id: 'transcript',
        name: 'Intro Transcript.md',
        contentType: 'application/octet-stream',
      },
    ];

    expect(getTeacherTrainingMediaAccessibilityResources(genericResources)).toEqual({
      captionResource: genericResources[0],
      transcriptResource: genericResources[1],
    });
  });
});
