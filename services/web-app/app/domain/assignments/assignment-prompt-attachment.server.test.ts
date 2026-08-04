import { beforeEach, describe, expect, mock, test } from 'bun:test';

const putSmallObject = mock();
const actualS3 = await import('~/services/s3.server');
mock.module('~/services/s3.server', () => ({ ...actualS3, putSmallObject }));

const { AssignmentPromptAttachmentError, uploadAssignmentPromptAttachment } =
  await import('./assignment-prompt-attachment.server');

describe('uploadAssignmentPromptAttachment', () => {
  beforeEach(() => {
    putSmallObject.mockReset().mockResolvedValue(undefined);
  });

  test('uploads a genuine PDF and returns persistent metadata', async () => {
    const file = new File(
      [new TextEncoder().encode('%PDF-1.4\n%%EOF')],
      'My Assignment.pdf',
      { type: 'application/pdf' }
    );

    const result = await uploadAssignmentPromptAttachment(file);

    expect(result).toMatchObject({
      promptAttachmentName: 'My Assignment.pdf',
      promptAttachmentSize: 14,
    });
    expect(result.promptAttachmentKey).toMatch(
      /^assignment-prompts\/[^/]+\/My_Assignment\.pdf$/
    );
    expect(putSmallObject).toHaveBeenCalledWith(
      result.promptAttachmentKey,
      expect.any(Buffer),
      'application/pdf'
    );
  });

  test('rejects a non-PDF renamed with a pdf extension', async () => {
    const file = new File([new TextEncoder().encode('%PDFjunk')], 'fake.pdf', {
      type: 'application/pdf',
    });

    expect(uploadAssignmentPromptAttachment(file)).rejects.toBeInstanceOf(
      AssignmentPromptAttachmentError
    );
    expect(putSmallObject).not.toHaveBeenCalled();
  });
});
