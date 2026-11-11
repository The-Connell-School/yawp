import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  baseVideoContentType,
  formatVideoDuration,
  LOUNGE_RECORDING_MAX_SECONDS,
  LOUNGE_VIDEO_MAX_BYTES,
  pickRecorderMimeType,
} from '~/domain/lounge/video';

type Step =
  | { name: 'closed' }
  | { name: 'choose' }
  | { name: 'camera' }
  | { name: 'recording'; seconds: number }
  | { name: 'review'; blob: Blob; url: string; seconds: number | null }
  | { name: 'uploading'; percent: number }
  | { name: 'ready'; key: string; contentType: string; seconds: number | null }
  | { name: 'error'; message: string };

/**
 * Record a video in the browser, or pick a file, then upload it straight to
 * storage. Renders inside a form: once uploaded, hidden inputs carry the key,
 * type, and length for the server, plus an optional title.
 */
export function LoungeVideoRecorder() {
  const [step, setStep] = useState<Step>({ name: 'closed' });
  const [title, setTitle] = useState('');
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  useEffect(() => stopCamera, []);
  useEffect(() => {
    if (step.name === 'review') return () => URL.revokeObjectURL(step.url);
  }, [step]);

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setStep({ name: 'camera' });
      requestAnimationFrame(() => {
        if (liveRef.current) liveRef.current.srcObject = stream;
      });
    } catch {
      setStep({ name: 'error', message: 'Yawp could not reach your camera and microphone. Check the browser permission, or upload a video instead.' });
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType =
      typeof MediaRecorder !== 'undefined'
        ? pickRecorderMimeType((type) => MediaRecorder.isTypeSupported(type))
        : null;
    if (!mimeType) {
      setStep({ name: 'error', message: 'This browser cannot record video. Upload a video instead.' });
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    let seconds = 0;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stopCamera();
      const blob = new Blob(chunks, { type: mimeType });
      setStep({ name: 'review', blob, url: URL.createObjectURL(blob), seconds });
    };
    recorder.start(1000);
    setStep({ name: 'recording', seconds: 0 });
    timerRef.current = setInterval(() => {
      seconds += 1;
      setStep({ name: 'recording', seconds });
      if (seconds >= LOUNGE_RECORDING_MAX_SECONDS) recorder.stop();
    }, 1000);
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!baseVideoContentType(file.type)) {
      setStep({ name: 'error', message: 'Use an MP4, WebM, or QuickTime video.' });
      return;
    }
    if (file.size > LOUNGE_VIDEO_MAX_BYTES) {
      setStep({ name: 'error', message: 'That video is too large. Keep it under 500 MB.' });
      return;
    }
    const url = URL.createObjectURL(file);
    setStep({ name: 'review', blob: file, url, seconds: null });
  }

  async function upload(blob: Blob, seconds: number | null) {
    const contentType = baseVideoContentType(blob.type);
    if (!contentType) {
      setStep({ name: 'error', message: 'Use an MP4, WebM, or QuickTime video.' });
      return;
    }
    setStep({ name: 'uploading', percent: 0 });
    try {
      const response = await fetch('/api/lounge/video-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType, size: blob.size }),
      });
      const target = (await response.json()) as { key?: string; uploadUrl?: string; error?: string };
      if (!response.ok || !target.key || !target.uploadUrl) {
        throw new Error(target.error ?? 'Upload could not start.');
      }
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', target.uploadUrl!);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setStep({ name: 'uploading', percent: Math.round((event.loaded / event.total) * 100) });
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed.')));
        xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
        xhr.send(blob);
      });
      setStep({ name: 'ready', key: target.key, contentType, seconds });
    } catch (error) {
      setStep({ name: 'error', message: error instanceof Error ? error.message : 'Upload failed.' });
    }
  }

  function readDuration(event: React.SyntheticEvent<HTMLVideoElement>) {
    if (step.name !== 'review' || step.seconds !== null) return;
    const value = event.currentTarget.duration;
    if (Number.isFinite(value) && value > 0) setStep({ ...step, seconds: Math.round(value) });
  }

  function reset() {
    stopCamera();
    setStep({ name: 'closed' });
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="video/mp4,video/webm,video/quicktime"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => pickFile(event.target.files?.[0])}
    />
  );

  if (step.name === 'closed') {
    return (
      <div>
        <Button type="button" variant="outline" onClick={() => setStep({ name: 'choose' })}>
          Add a video
        </Button>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-3 rounded-lg border bg-background p-4">
      {fileInput}
      {step.name === 'choose' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={openCamera}>
            Record
          </Button>
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
            Upload a video
          </Button>
          <Button type="button" variant="ghost" onClick={reset}>
            Cancel
          </Button>
        </div>
      ) : null}

      {step.name === 'camera' || step.name === 'recording' ? (
        <>
          <video
            ref={liveRef}
            autoPlay
            muted
            playsInline
            aria-label="Camera preview"
            className="aspect-video w-full rounded-lg bg-[#2A2824]"
          />
          {step.name === 'camera' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={startRecording}>
                Start recording
              </Button>
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
              <span className="text-sm text-muted-foreground">
                Talk to them the way you would in the hallway. Under three minutes is plenty.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Button type="button" onClick={stopRecording} className="bg-foreground text-background hover:bg-foreground/90">
                Stop
              </Button>
              <span role="status" className="inline-flex items-center gap-2 text-sm font-medium tabular-nums">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-600" />
                Recording {formatVideoDuration(step.seconds) || '0:00'}
              </span>
            </div>
          )}
        </>
      ) : null}

      {step.name === 'review' ? (
        <>
          <video
            src={step.url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={readDuration}
            aria-label="Your video"
            className="aspect-video w-full rounded-lg bg-[#2A2824]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => upload(step.blob, step.seconds)}>
              Use this video
            </Button>
            <Button type="button" variant="outline" onClick={() => setStep({ name: 'choose' })}>
              Retake
            </Button>
          </div>
        </>
      ) : null}

      {step.name === 'uploading' ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="text-sm">Uploading… {step.percent}%</span>
          <div className="h-1.5 w-full overflow-hidden rounded bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${step.percent}%` }} />
          </div>
        </div>
      ) : null}

      {step.name === 'ready' ? (
        <>
          <input type="hidden" name="videoKey" value={step.key} />
          <input type="hidden" name="videoContentType" value={step.contentType} />
          <input type="hidden" name="videoDurationSeconds" value={step.seconds ?? ''} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span role="status" className="text-sm font-medium text-green-800">
              Video ready{step.seconds ? ` · ${formatVideoDuration(step.seconds)}` : ''}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Remove video
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lounge-video-title" className="text-sm text-muted-foreground">
              Title on the video (optional)
            </label>
            <Input
              id="lounge-video-title"
              name="videoTitle"
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="One lesson, two thesis shapes"
            />
          </div>
        </>
      ) : null}

      {step.name === 'error' ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-destructive">
            {step.message}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setStep({ name: 'choose' })}>
              Try again
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
