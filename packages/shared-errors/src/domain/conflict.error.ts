import { BaseAppError } from '../base.error';
import { ErrorCode, type ErrorCodeType } from '@fintech/shared-types';

/**
 * HTTP 409 Conflict Exception.
 * Thrown when an operational mutation fails due to state collisions, concurrent version
 * check locks, or duplicate idempotency key reuse attempts.
 */
export class ConflictError extends BaseAppError {
  /** Enforced HTTP compliance status code mapping */
  public readonly statusCode = 409;

  constructor(
    message = 'Resource state collision or idempotency key mismatch',
    /** Allows overriding the error code token while keeping standard idempotency errors as the baseline */
    code: ErrorCodeType = ErrorCode.IDEMPOTENCY_CONFLICT,
  ) {
    super(code, message, []);
  }
}
