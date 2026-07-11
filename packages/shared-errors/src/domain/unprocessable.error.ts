import { BaseAppError } from '../base.error';
import { ErrorCode, type ErrorCodeType, type ApiErrorDetail } from '@fintech/shared-types';

/**
 * HTTP 422 Unprocessable Entity — Generic Business Rule Violation.
 *
 * Use this when a request is syntactically valid (passes Zod schema validation)
 * but violates a domain-level business invariant that isn't covered by a more
 * specific error class.
 *
 * WHEN TO USE THIS vs SPECIFIC ERRORS:
 * ✓ Use InsufficientFundsError when balance check fails
 * ✓ Use this class for:
 *    - Transfer to self (fromAccountId === toAccountId)
 *    - KYC not approved for high-value transfer (pass ErrorCode.KYC_NOT_APPROVED)
 *    - Account is CLOSED when only FROZEN was expected (pass ErrorCode.ACCOUNT_CLOSED)
 *    - Frozen account targeted (pass ErrorCode.ACCOUNT_FROZEN)
 *    - Attempted transfer when global halt flag is active
 *
 * WHY NOT BAD REQUEST (400)?
 * 400 is for malformed/schema-invalid requests. By the time business logic runs,
 * the request is already structurally valid. 422 signals "I understood the request
 * perfectly, but I cannot process it due to a domain rule."
 *
 * @example
 * // Account is closed
 * throw new UnprocessableEntityError(
 *   'This account has been permanently closed and cannot receive funds.',
 *   ErrorCode.ACCOUNT_CLOSED,
 * );
 *
 * @example
 * // Self-transfer attempt
 * throw new UnprocessableEntityError(
 *   'Source and destination accounts cannot be the same.',
 * );
 */
export class UnprocessableEntityError extends BaseAppError {
  /** Enforced HTTP compliance status code mapping */
  public readonly statusCode = 422;

  constructor(
    message: string,
    /**
     * Machine-readable error code for the client.
     * Defaults to VALIDATION_FAILED as a safe fallback, but you should always
     * pass the most specific code available for proper frontend handling.
     */
    code: ErrorCodeType = ErrorCode.VALIDATION_FAILED,
    details: ApiErrorDetail[] = [],
  ) {
    super(code, message, details);
  }
}
