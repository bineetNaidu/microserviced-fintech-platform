import { BaseAppError } from '../base.error';
import { ErrorCode } from '@fintech/shared-types';

export class UnauthorizedError extends BaseAppError {
  public readonly statusCode = 401;

  constructor(message = 'Authentication credentials are missing or invalid') {
    super(ErrorCode.UNAUTHORIZED, message);
  }
}
