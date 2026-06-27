/**
 * Global Machine-Readable System Error Codes.
 * Unified lookup dictionary utilized across all 13 services to trigger explicit, predictable frontend behaviors.
 */
export const ErrorCode = {
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  ACCOUNT_FROZEN: 'ACCOUNT_FROZEN',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TRANSFER_LIMIT_EXCEEDED: 'TRANSFER_LIMIT_EXCEEDED',
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
