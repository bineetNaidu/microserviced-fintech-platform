// Define the exact literal strings allowed as Error Codes
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

// Extracts the union type: 'INSUFFICIENT_FUNDS' | 'ACCOUNT_FROZEN' | ...
export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorDetail {
  field?: string; // E.g., 'amount'
  message: string; // E.g., 'Amount must be greater than zero'
}

export interface StandardErrorPayload {
  code: ErrorCodeType; // Strictly typed!
  message: string;
  details?: ApiErrorDetail[];
  traceId?: string; // For OpenTelemetry cross-service tracing
}
