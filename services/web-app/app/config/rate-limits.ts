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
    // Chat-history budget sent to the model (approximate); newest turns win
    transcriptCharBudget: 20000,
    // The document the tutor reads is clamped, never rejected
    maxDocumentChars: 40_000,
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
    // One in-flight per user per route (single-flight lease row)
    leaseTtlMs: 90_000, // self-expiring single-flight lease (> the 30 s model timeout)
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

  // Unauthenticated email/OTP surface — throttle per-IP and per-target (email).
  // Per-IP budgets must tolerate a whole class behind one school NAT signing up
  // or verifying in the same minute (measured: up to 47 distinct people per IP
  // per day), so they are sized for ~2 classes at once. The per-email budget is
  // what actually stops mail-bombing a single address; the WAF/CloudFront layer
  // carries the volumetric weight.
  unauth: {
    signup: {
      perIpPerMinute: 60,
      perIpPerHour: 200,
      perEmailPerHour: 6,
    },
    forgotPassword: {
      perIpPerMinute: 30,
      perIpPerHour: 120,
      perEmailPerHour: 6,
    },
    verify: {
      perIpPerMinute: 120,
      perIpPerHour: 600,
      perEmailPerHour: 20,
    },
  },
} as const;

export type RateLimitsConfig = typeof RATE_LIMITS;

