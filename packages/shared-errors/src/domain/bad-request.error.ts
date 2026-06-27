import { BaseAppError } from '../base.error';
import { ErrorCode, type ErrorCodeType, type ApiErrorDetail } from '@fintech/shared-types';

/**
 * HTTP 400 Bad Request Exception.
 * Thrown when incoming request payloads fail structural parsing or violate domain-level invariants.
 */
export class BadRequestError extends BaseAppError {
  /** Enforced HTTP compliance status code mapping */
  public readonly statusCode = 400;

  constructor(
    message = 'Bad Request',
    details: ApiErrorDetail[] = [],
    /** Allows specific microservices to narrow down the general validation token into precise codes */
    code: ErrorCodeType = ErrorCode.VALIDATION_FAILED,
  ) {
    super(code, message, details);
  }
}
