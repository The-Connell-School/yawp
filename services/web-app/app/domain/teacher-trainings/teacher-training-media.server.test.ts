import { expect, mock, test } from 'bun:test';
import { S3Client } from '@aws-sdk/client-s3';
import { createMultipartUploadHelpers } from '~/services/s3.server';
import {
  createTeacherTrainingMedia,
  PART_SIZE,
} from './teacher-training-media.server';

function fixture() {
  const state = {
    length: 123,
    contentType: 'video/mp4',
    completeError: null as string | null,
    missing: false,
    body: Buffer.from('%PDF-1.7'),
  };
  const send = mock(async (command: any): Promise<any> => {
    switch (command.constructor.name) {
      case 'CreateMultipartUploadCommand':
        return { UploadId: 'upload-1' };
      case 'CompleteMultipartUploadCommand':
        if (state.missing)
          throw Object.assign(new Error(), { name: 'NoSuchUpload' });
        if (state.completeError)
          throw Object.assign(new Error(), { name: state.completeError });
        return {};
      case 'HeadObjectCommand':
        return { ContentLength: state.length, ContentType: state.contentType };
      case 'GetObjectCommand':
        return {
          Body: (async function* () {
            yield state.body;
          })(),
        };
      default:
        throw new Error('Operation is outside the existing upload permissions');
    }
  });
  const sign = mock(
    async (_client: any, _command: any, _options: any) =>
      'https://s3.example.test/signed'
  );
  const media = createTeacherTrainingMedia({
    client: { send } as never,
    bucket: 'existing-video-bucket',
    sign,
  });
  const input = {
    kind: 'video' as const,
    trainingId: 'tt-1',
    moduleId: 'm-1',
    name: 'intro.mp4',
    contentType: 'video/mp4',
    size: 123,
  };
  return { state, send, sign, media, input };
}
test('uses existing bucket, bounded multipart part sizes/count and per-part signed content length', async () => {
  const f = fixture();
  const upload = await f.media.createUpload({
    ...f.input,
    size: 2 * 1024 ** 3,
  });
  expect(upload.partSize).toBe(PART_SIZE);
  expect(upload.partCount).toBe(128);
  expect(upload.key).toStartWith('teacher-trainings/tt-1/modules/m-1/video/');
  expect(f.send.mock.calls[0]?.[0].input.Bucket).toBe('existing-video-bucket');
  const signed = await f.media.signUpload(upload);
  expect(signed.parts).toHaveLength(128);
  expect(f.sign.mock.calls[0]?.[1].input).toMatchObject({
    PartNumber: 1,
    ContentLength: PART_SIZE,
  });
  expect(f.sign.mock.calls[0]?.[2]).toMatchObject({ expiresIn: 3600 });
});
test('relies on existing complete permission for ETags and checks completed object length/type', async () => {
  const f = fixture();
  const upload = await f.media.createUpload(f.input);
  await f.media.completeUpload(upload, [{ partNumber: 1, etag: 'etag' }]);
  expect(f.send.mock.calls.map(([c]) => c.constructor.name)).toContain(
    'CompleteMultipartUploadCommand'
  );
  for (const change of [
    { length: 124 },
    { contentType: 'video/quicktime' },
    { completeError: 'InvalidPart' },
    { completeError: 'InvalidPartOrder' },
    { completeError: 'EntityTooSmall' },
  ]) {
    const g = fixture();
    Object.assign(g.state, change);
    const session = await g.media.createUpload(g.input);
    await expect(
      g.media.completeUpload(session, [{ partNumber: 1, etag: 'etag' }])
    ).rejects.toBeInstanceOf(Response);
  }
});
test('completion can retry after S3 completed and the database transaction rolled back', async () => {
  const f = fixture();
  const upload = await f.media.createUpload(f.input);
  f.state.missing = true;
  await f.media.completeUpload(upload, [{ partNumber: 1, etag: 'etag' }]);
  expect(f.send.mock.calls.map(([c]) => c.constructor.name)).toEqual([
    'CreateMultipartUploadCommand',
    'CompleteMultipartUploadCommand',
    'HeadObjectCommand',
  ]);
});
test('resources download with a byte bound and validate file signatures before existing blob storage', async () => {
  const f = fixture();
  const upload = await f.media.createUpload({
    ...f.input,
    kind: 'resource',
    contentType: 'application/pdf',
    name: 'guide.pdf',
    size: 8,
  });
  f.state.length = 8;
  f.state.contentType = 'application/pdf';
  expect(
    await f.media.completeUpload(upload, [{ partNumber: 1, etag: 'etag' }])
  ).toEqual(Buffer.from('%PDF-1.7'));
  f.state.body = Buffer.from('not-a-pdf');
  await expect(
    f.media.completeUpload(upload, [{ partNumber: 1, etag: 'etag' }])
  ).rejects.toBeInstanceOf(Response);
  f.state.body = Buffer.alloc(20 * 1024 * 1024 + 1);
  await expect(
    f.media.completeUpload(upload, [{ partNumber: 1, etag: 'etag' }])
  ).rejects.toBeInstanceOf(Response);
});

test('presigned UploadPart URLs cryptographically bind the exact content length without extra IAM permissions', async () => {
  const client = new S3Client({
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'offline-test',
      secretAccessKey: 'offline-test',
    },
  });
  try {
    const multipart = createMultipartUploadHelpers({
      client,
      bucket: 'existing-video-bucket',
    });
    const url = new URL(
      await multipart.signPart('test-key', 'test-upload', 1, PART_SIZE)
    );
    expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toContain(
      'content-length'
    );
  } finally {
    client.destroy();
  }
});

test('completion never requires ListParts or any new bucket permission', async () => {
  const f = fixture();
  const upload = await f.media.createUpload(f.input);
  await f.media.completeUpload(upload, [{ partNumber: 1, etag: 'etag' }]);
  expect(f.send.mock.calls.map(([c]) => c.constructor.name)).toEqual([
    'CreateMultipartUploadCommand',
    'CompleteMultipartUploadCommand',
    'HeadObjectCommand',
  ]);
  expect(f.send.mock.calls[1]?.[0].input.MultipartUpload.Parts).toEqual([
    { PartNumber: 1, ETag: 'etag' },
  ]);
});
