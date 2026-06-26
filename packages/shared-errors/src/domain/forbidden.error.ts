import { BaseAppError } from '../base.error';
import { ErrorCode } from '@fintech/shared-types';

export class ForbiddenError extends BaseAppError {
  public readonly statusCode = 403;

  constructor(message = 'Access privilege validation failed') {
    super(ErrorCode.FORBIDDEN, message);
  }
}
