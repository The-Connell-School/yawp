/**
 * In-app video for the Yawp team's Lounge posts and replies. Videos live in
 * storage under the uploader's own prefix; the database keeps the key, never
 * a URL, and playback URLs are signed per request.
 */
export const LOUNGE_VIDEO_TYPES = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
} as const;

export type LoungeVideoContentType = keyof typeof LOUNGE_VIDEO_TYPES;

/** Uploads above this are refused before they start. */
export const LOUNGE_VIDEO_MAX_BYTES = 500 * 1024 * 1024;
/** Recording stops by itself at this length. */
export const LOUNGE_RECORDING_MAX_SECONDS = 5 * 60;
export const LOUNGE_VIDEO_TITLE_MAX = 120;

export type LoungeVideo = {
  key: string;
  contentType: LoungeVideoContentType;
  durationSeconds: number | null;
  title: string | null;
};

export function baseVideoContentType(mime: string | null | undefined): LoungeVideoContentType | null {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  return base in LOUNGE_VIDEO_TYPES ? (base as LoungeVideoContentType) : null;
}

export function loungeVideoKey(userId: string, contentType: LoungeVideoContentType, randomId: string): string {
  return `lounge/videos/${userId}/${randomId}.${LOUNGE_VIDEO_TYPES[contentType]}`;
}

const KEY_PATTERN = /^lounge\/videos\/([A-Za-z0-9_-]{1,64})\/([a-z0-9]{16,64})\.(mp4|webm|mov)$/;

export function isOwnLoungeVideoKey(key: string, userId: string): boolean {
  const match = KEY_PATTERN.exec(key);
  return Boolean(match && match[1] === userId);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseLoungeVideoInput(
  input: Record<string, unknown>,
  { userId, isStaff }: { userId: string; isStaff: boolean }
): { ok: true; value: LoungeVideo | null } | { ok: false; errors: Record<string, string> } {
  const key = text(input.videoKey);
  if (!isStaff || !key) return { ok: true, value: null };
  const contentType = baseVideoContentType(text(input.videoContentType));
  if (!isOwnLoungeVideoKey(key, userId) || !contentType || !key.endsWith(`.${LOUNGE_VIDEO_TYPES[contentType]}`)) {
    return { ok: false, errors: { video: 'That video upload could not be found. Please record or upload it again.' } };
  }
  const seconds = Number.parseInt(text(input.videoDurationSeconds), 10);
  const title = text(input.videoTitle).slice(0, LOUNGE_VIDEO_TITLE_MAX) || null;
  return {
    ok: true,
    value: {
      key,
      contentType,
      durationSeconds: Number.isFinite(seconds) && seconds > 0 && seconds < 24 * 3600 ? seconds : null,
      title,
    },
  };
}

export function formatVideoDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const RECORDER_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** The best format this browser can record. mp4 first: it also plays on iPhones. */
export function pickRecorderMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return RECORDER_TYPES.find((type) => isTypeSupported(type)) ?? null;
}
