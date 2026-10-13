import {
  isLoungePostKind,
  isLoungeTopic,
  type LoungePostKindKey,
  type LoungeTopicKey,
} from './topics';

export const LOUNGE_TITLE_MIN = 5;
export const LOUNGE_TITLE_MAX = 160;
export const LOUNGE_BODY_MAX = 5000;

type Input = Record<string, unknown>;
type Errors = Record<string, string>;
type Result<T> = { ok: true; value: T } | { ok: false; errors: Errors };

export type LoungePostInput = {
  kind: LoungePostKindKey;
  topic: LoungeTopicKey;
  title: string;
  body: string;
  askStaff: boolean;
  askPrivately: boolean;
};

export type LoungeReplyInput = { body: string; videoUrl: string | null };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function checked(value: unknown): boolean {
  return value === 'on' || value === 'true' || value === true;
}

function checkBody(body: string, errors: Errors) {
  if (!body) errors.body = 'Write a few words.';
  else if (body.length > LOUNGE_BODY_MAX) errors.body = 'Keep it under 5,000 characters.';
}

export function parseLoungePostInput(input: Input): Result<LoungePostInput> {
  const errors: Errors = {};
  const kind = text(input.kind);
  const topic = text(input.topic);
  const title = text(input.title);
  const body = text(input.body);
  if (!isLoungePostKind(kind)) errors.kind = 'Choose Question, Share, or Win.';
  if (!isLoungeTopic(topic)) errors.topic = 'Choose a topic.';
  if (title.length < LOUNGE_TITLE_MIN) errors.title = 'Give it a title of a few words.';
  else if (title.length > LOUNGE_TITLE_MAX) errors.title = `Keep the title under ${LOUNGE_TITLE_MAX} characters.`;
  checkBody(body, errors);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const askPrivately = checked(input.askPrivately);
  return {
    ok: true,
    value: {
      kind: kind as LoungePostKindKey,
      topic: topic as LoungeTopicKey,
      title,
      body,
      askStaff: askPrivately || checked(input.askStaff),
      askPrivately,
    },
  };
}

const VIDEO_HOSTS = new Set([
  'loom.com',
  'www.loom.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
]);

export function isAllowedVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && VIDEO_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function parseLoungeReplyInput(
  input: Input,
  { isStaff }: { isStaff: boolean }
): Result<LoungeReplyInput> {
  const errors: Errors = {};
  const body = text(input.body);
  checkBody(body, errors);
  const rawVideo = isStaff ? text(input.videoUrl) : '';
  if (rawVideo && !isAllowedVideoUrl(rawVideo)) {
    errors.videoUrl = 'Use an https link from Loom, YouTube, or Vimeo.';
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { body, videoUrl: rawVideo || null } };
}
