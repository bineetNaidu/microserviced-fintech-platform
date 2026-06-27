import { BaseAppError } from '../base.error';
import { ErrorCode, type ErrorCodeType } from '@fintech/shared-types';

/**
 * HTTP 401 Unauthorized Exception.
 * Thrown when an incoming HTTP request lacks a valid JSON Web Token (JWT) or session signature,
 * or when authentication verification layers fail structural criteria checks.
 */
export class UnauthorizedError extends BaseAppError {
  /** Enforced HTTP compliance status code mapping */
  public readonly statusCode = 401;

  constructor(
    message = 'Authentication credentials are missing or invalid',
    /** Defaults cleanly to UNAUTHORIZED but permits specialized security overrides */
    code: ErrorCodeType = ErrorCode.UNAUTHORIZED,
  ) {
    super(code, message, []);
  }
}
