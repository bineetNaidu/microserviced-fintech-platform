import { BaseAppError } from '../base.error';
import { ErrorCode, type ErrorCodeType } from '@fintech/shared-types';

/**
 * HTTP 403 Forbidden Exception.
 * Thrown when an authenticated client tries to access an administrative boundary
 * or perform an operation outside their authorized role permissions.
 */
export class ForbiddenError extends BaseAppError {
  /** Enforced HTTP compliance status code mapping */
  public readonly statusCode = 403;

  constructor(
    message = 'Access privilege validation failed',
    /** Defaults cleanly to FORBIDDEN but permits narrow authorization overrides */
    code: ErrorCodeType = ErrorCode.FORBIDDEN,
  ) {
    super(code, message, []);
  }
}
