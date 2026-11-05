import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { lessonPlanUploadPicture: { findMany: mock() } };
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ getLessonPlannerAccess: mock() }));

const { loadDeckPictureFiles, loadDeckPictures, pptxImageData } = await import('./deck-pictures.server');

const deck = {
  slides: [
    { layout: 'picture', title: 'Look', image: 'pic1aaaaaaaa', speakerNotes: 'n' },
    { layout: 'picture', title: 'Again', image: 'pic1aaaaaaaa', speakerNotes: 'n' },
    { layout: 'title', title: 'Hi', speakerNotes: 'n' },
  ],
} as never;

describe('loading a deck’s pictures', () => {
  beforeEach(() => {
    prisma.lessonPlanUploadPicture.findMany.mockReset().mockResolvedValue([
      { id: 'pic1aaaaaaaa', altText: 'An elephant', width: 4, height: 3, contentType: 'image/png', blob: new Uint8Array([1, 2]) },
    ]);
  });

  test('asks only for this teacher’s pictures, once each', async () => {
    const pictures = await loadDeckPictures([deck], 'teacher-1');
    expect(prisma.lessonPlanUploadPicture.findMany.mock.calls[0]?.[0].where).toEqual({
      id: { in: ['pic1aaaaaaaa'] },
      membershipId: 'teacher-1',
    });
    expect(Object.keys(pictures)).toEqual(['pic1aaaaaaaa']);
    expect(pictures.pic1aaaaaaaa?.altText).toBe('An elephant');
  });

  test('nobody signed in, or no pictures: nothing asked', async () => {
    expect(await loadDeckPictures([deck], null)).toEqual({});
    expect(await loadDeckPictures([{ slides: [] } as never], 'teacher-1')).toEqual({});
    expect(prisma.lessonPlanUploadPicture.findMany).not.toHaveBeenCalled();
  });

  test('a file renderer gets the bytes, ready for PowerPoint', async () => {
    const files = await loadDeckPictureFiles([deck], 'teacher-1');
    const elephant = files.get('pic1aaaaaaaa')!;
    expect(elephant.data).toEqual(Buffer.from([1, 2]));
    expect(pptxImageData(elephant)).toBe('image/png;base64,AQI=');
  });
});
