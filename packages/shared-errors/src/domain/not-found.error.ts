import { BaseAppError } from '../base.error';
import { ErrorCode, type ErrorCodeType } from '@fintech/shared-types';

/**
 * HTTP 404 Not Found Exception.
 * Thrown when a targeted resource entity row (e.g., account, transfer saga, user profile)
 * does not exist within the persistent storage layers.
 */
export class NotFoundError extends BaseAppError {
  /** Enforced HTTP compliance status code mapping */
  public readonly statusCode = 404;

  constructor(
    message = 'Requested resource could not be found',
    /** Defaults to ACCOUNT_NOT_FOUND but allows narrow overriding across other resource entities */
    code: ErrorCodeType = ErrorCode.ACCOUNT_NOT_FOUND,
  ) {
    super(code, message, []);
  }
}
