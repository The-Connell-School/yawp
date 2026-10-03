// Centralized numeric limits for AI endpoints and abuse controls.
// All values derive from measured distributions (compute_limits_min_n20_2a43.md and compute_limits_output_332b.md).
// Policy: max(2x p99, 1.25x p99.9).
// Keep numbers documented here and only here.

export const RATE_LIMITS = {
  // Student tutor
  tutor: {
    // Per-student
    perMinute: 6, // B1_tutor_per_student user_per_minute
    perHour: 42, // B1_tutor_per_student user_per_hour
    perDay: 81, // B1_tutor_per_student user_per_day
    maxSessionTurns: 82, // B1_tutor_per_student session_turns
    maxMessageChars: 7202, // B1_tutor_per_student user_msg_chars
    // Global ceilings across the platform
    globalPerMinute: 26, // A2_llmlog_global_peaks per_minute
    globalPerHour: 270, // A2_llmlog_global_peaks per_hour
    // Transcript input budget sent to the model (approximate)
    transcriptCharBudget: 20000,
  },

  // Teacher grading
  grading: {
    // Per-teacher request counts
    perMinute: 6, // B2_grading_per_teacher teacher_subs_per_minute
    perTenMinutes: 22, // B2_grading_per_teacher teacher_subs_per_10min
    perHour: 41, // B2_grading_per_teacher teacher_subs_per_hour
    perDay: 117, // B2_grading_per_teacher teacher_subs_per_day
    // Within one submission processing
    maxLlmCallsPerSubmission: 11, // B2_grading_per_teacher llm_calls_per_submission
    // Global ceilings
    globalPerMinute: 6, // A2_llmlog_global_peaks per_minute
  },

  // Teacher prompt generators (no measured distributions yet; conservative headroom)
  // These are single-turn calls and lower-cost; keep generous but finite.
  promptGenerators: {
    perMinute: 6,
    perHour: 60,
    perDay: 200,
  },

  // PDF extractors (teacher-only)
  // Keep existing 10 MiB body cap and add a concurrency single-flight per user.
  pdfExtract: {
    maxBytes: 10 * 1024 * 1024, // 10 MiB
    // One in-flight per user per route (advisory lock)
    lockTtlMs: 30_000,
    perMinute: 3,
    perHour: 20,
    perDay: 60,
  },

  // Admin-only AI routes — very low fixed limits
  admin: {
    perMinute: 2,
    perHour: 10,
    perDay: 30,
  },

  // Unauthenticated email/OTP surface — throttle per-IP and per-target (email)
  // These are generous defaults; the WAF/CloudFront layer should carry most weight.
  unauth: {
    signup: {
      perIpPerMinute: 5,
      perIpPerHour: 30,
      perEmailPerHour: 6,
    },
    forgotPassword: {
      perIpPerMinute: 5,
      perIpPerHour: 30,
      perEmailPerHour: 6,
    },
    verify: {
      perIpPerMinute: 12,
      perIpPerHour: 60,
      perEmailPerHour: 20,
    },
  },
} as const;

export type RateLimitsConfig = typeof RATE_LIMITS;

