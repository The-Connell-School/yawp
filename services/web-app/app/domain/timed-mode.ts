import type { ApEssayType } from './grading/ap-rubric';

export type TimedPhase = 'reading' | 'writing' | 'done';

export interface TimedPhaseConfig {
  // Optional reading phase (editor locked, sources visible).
  readingSeconds: number;
  // Writing phase length.
  writingSeconds: number;
}

const FORTY_MIN = 40 * 60;
const FIFTEEN_MIN = 15 * 60;

// Reading + writing windows per College Board exam timing.
const configs: Record<ApEssayType, TimedPhaseConfig> = {
  synthesis: { readingSeconds: FIFTEEN_MIN, writingSeconds: FORTY_MIN },
  'rhetorical-analysis': { readingSeconds: 0, writingSeconds: FORTY_MIN },
  argument: { readingSeconds: 0, writingSeconds: FORTY_MIN },
  'poetry-analysis': { readingSeconds: 0, writingSeconds: FORTY_MIN },
  'prose-fiction-analysis': { readingSeconds: 0, writingSeconds: FORTY_MIN },
  'literary-argument': { readingSeconds: 0, writingSeconds: FORTY_MIN },
};

export function getTimedConfig(essayType: ApEssayType): TimedPhaseConfig {
  return configs[essayType];
}

export interface TimedState {
  phase: TimedPhase;
  editorLocked: boolean;
  totalSeconds: number;
  elapsedSeconds: number;
  secondsRemaining: number;
  phaseSecondsRemaining: number;
}

export function computeTimedState(
  essayType: ApEssayType,
  startedAtMs: number,
  nowMs: number
): TimedState {
  const config = getTimedConfig(essayType);
  const totalSeconds = config.readingSeconds + config.writingSeconds;
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const secondsRemaining = Math.max(0, totalSeconds - elapsedSeconds);

  if (elapsedSeconds >= totalSeconds) {
    return {
      phase: 'done',
      editorLocked: false,
      totalSeconds,
      elapsedSeconds,
      secondsRemaining: 0,
      phaseSecondsRemaining: 0,
    };
  }

  // Reading phase: editor locked, sources visible.
  if (config.readingSeconds > 0 && elapsedSeconds < config.readingSeconds) {
    return {
      phase: 'reading',
      editorLocked: true,
      totalSeconds,
      elapsedSeconds,
      secondsRemaining,
      phaseSecondsRemaining: config.readingSeconds - elapsedSeconds,
    };
  }

  // Writing phase.
  const writingElapsed = elapsedSeconds - config.readingSeconds;
  return {
    phase: 'writing',
    editorLocked: false,
    totalSeconds,
    elapsedSeconds,
    secondsRemaining,
    phaseSecondsRemaining: config.writingSeconds - writingElapsed,
  };
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
