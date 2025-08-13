import { useState } from 'react';

export function useMultipartUpload() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadFile({
    file,
    teacherCourseId,
    moduleId,
    partSize = 8 * 1024 * 1024, // 8MB parts
    concurrency = 4,
  }: {
    file: File;
    teacherCourseId: string;
    moduleId: string;
    partSize?: number;
    concurrency?: number;
  }): Promise<{ key: string }> {
    setIsUploading(true);
    setProgress(0);

    try {
      // 1) Start upload
      const startForm = new FormData();
      startForm.append('teacherCourseId', teacherCourseId);
      startForm.append('moduleId', moduleId);
      startForm.append('fileName', file.name);
      startForm.append('contentType', file.type || 'application/octet-stream');
      const startRes = await fetch('/api/video-upload/start', {
        method: 'POST',
        body: startForm,
      });
      if (!startRes.ok) throw new Error('Failed to start upload');
      const { key, uploadId } = await startRes.json();

      // 2) Upload parts in parallel with limited concurrency
      const totalParts = Math.ceil(file.size / partSize);
      let uploadedBytes = 0;
      const etags: { ETag: string; PartNumber: number }[] = [];
      const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
      let nextIndex = 0;

      async function uploadNext(): Promise<void> {
        const partNumber = partNumbers[nextIndex++];
        if (!partNumber) return;
        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, file.size);
        const blob = file.slice(start, end);

        const signUrlRes = await fetch(
          `/api/video-upload/sign-part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`
        );
        if (!signUrlRes.ok) throw new Error('Failed to sign part');
        const { url } = await signUrlRes.json();

        const putRes = await fetch(url, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!putRes.ok) throw new Error('Failed to upload part');
        const etag = putRes.headers.get('ETag') || '';
        etags.push({ ETag: etag.replaceAll('"', ''), PartNumber: partNumber });
        uploadedBytes += blob.size;
        setProgress(Math.round((uploadedBytes / file.size) * 100));

        await uploadNext();
      }

      const workers = Array.from(
        { length: Math.min(concurrency, totalParts) },
        () => uploadNext()
      );
      await Promise.all(workers);

      // 3) Complete upload
      const completeForm = new FormData();
      completeForm.append('key', key);
      completeForm.append('uploadId', uploadId);
      completeForm.append('parts', JSON.stringify(etags));
      const completeRes = await fetch('/api/video-upload/complete', {
        method: 'POST',
        body: completeForm,
      });
      if (!completeRes.ok) throw new Error('Failed to complete upload');

      setProgress(100);
      setIsUploading(false);
      return { key };
    } catch (error) {
      setIsUploading(false);
      throw error;
    }
  }

  return { uploadFile, progress, isUploading };
}
