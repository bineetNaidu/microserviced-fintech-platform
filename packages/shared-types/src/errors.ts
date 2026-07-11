/**
 * Global Machine-Readable System Error Codes.
 *
 * These string constants are the contract between the backend and frontend.
 * Every error response includes one of these codes so the client can branch
 * its UI logic without parsing human-readable messages (which can change).
 *
 * ADDING A NEW CODE:
 * 1. Add it here with a clear, SCREAMING_SNAKE_CASE name
 * 2. Add a corresponding error class in @fintech/shared-errors if it has a specific HTTP status
 * 3. Document what service throws it and under what condition
 *
 * DO NOT REMOVE OR RENAME existing codes without a migration plan.
 * Clients (web, mobile, partner integrations) may be hard-coded against these strings.
 */
export const ErrorCode = {
  // ─── Funds & Balance ────────────────────────────────────────────────────────
  /** Thrown by Transfer/Ledger service when a debit would push balance below zero */
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',

  // ─── Account State ───────────────────────────────────────────────────────────
  /** Thrown when the target account has status = 'FROZEN' — mutations are blocked */
  ACCOUNT_FROZEN: 'ACCOUNT_FROZEN',

  /** Thrown when no account row exists with the given ID in the Account Service */
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',

  /**
   * Thrown when the target account has status = 'CLOSED'.
   * Distinct from ACCOUNT_NOT_FOUND: the account exists but is permanently decommissioned.
   */
  ACCOUNT_CLOSED: 'ACCOUNT_CLOSED',

  // ─── Validation ─────────────────────────────────────────────────────────────
  /** Thrown when request body/query/params fail Zod schema validation */
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // ─── Idempotency & Transfer ──────────────────────────────────────────────────
  /**
   * Thrown when the same idempotency key is reused with DIFFERENT request parameters.
   * If the key is reused with IDENTICAL parameters, the original response is returned (no error).
   */
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',

  /**
   * Thrown when a transfer submission is detected as a duplicate within the deduplication window.
   * More specific than IDEMPOTENCY_CONFLICT — used for transfer-specific deduplication logic.
   */
  DUPLICATE_TRANSFER: 'DUPLICATE_TRANSFER',

  /** Thrown when fetching a transfer by ID that does not exist in the Transfer Service */
  TRANSFER_NOT_FOUND: 'TRANSFER_NOT_FOUND',

  /** Thrown when a single transfer amount exceeds the configured per-transfer limit */
  TRANSFER_LIMIT_EXCEEDED: 'TRANSFER_LIMIT_EXCEEDED',

  // ─── KYC ────────────────────────────────────────────────────────────────────
  /**
   * Thrown when a high-value transfer is attempted by a user whose KYC status is not APPROVED.
   * Clients should redirect to the KYC submission flow.
   */
  KYC_NOT_APPROVED: 'KYC_NOT_APPROVED',

  // ─── Authentication & Authorization ─────────────────────────────────────────
  /** Thrown when JWT is missing, malformed, expired, or signature verification fails */
  UNAUTHORIZED: 'UNAUTHORIZED',

  /** Thrown when the authenticated user's role does not permit the requested operation */
  FORBIDDEN: 'FORBIDDEN',

  // ─── Rate Limiting ───────────────────────────────────────────────────────────
  /** Thrown by the rate limiter middleware when a client exceeds the request threshold */
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // ─── Infrastructure ──────────────────────────────────────────────────────────
  /** Catch-all for unhandled exceptions — should never reach production at high frequency */
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

/** Extracts the strict string literal union type from the global ErrorCode configuration map */
export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Detailed error context payload block, utilized primarily to break down structural request validation problems.
 */
export interface ApiErrorDetail {
  /** The explicit property path violating schema constraints (e.g., 'amountPaise') */
  field?: string;

  /** Human-readable explanation of why the specific parameter failed validation rules */
  message: string;
}

/**
 * Unified error data packet embedded directly into the global ApiErrorResponse structure.
 */
export interface StandardErrorPayload {
  /** Strictly typed machine-readable identification token used for client-side routing and localization */
  code: ErrorCodeType;

  /** Descriptive top-level summary message detailing the transaction or application exception */
  message: string;

  /** Optional collection of targeted array objects detailing sub-field schema violations */
  details?: ApiErrorDetail[];

  /** Distributed correlation identifier tracking string pulled directly from OpenTelemetry headers */
  traceId?: string;
}
