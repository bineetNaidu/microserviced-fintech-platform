import { BaseAppError } from '../base.error';
import { ErrorCode } from '@fintech/shared-types';

export class NotFoundError extends BaseAppError {
  public readonly statusCode = 404;

  constructor(message = 'Requested resource could not be found') {
    super(ErrorCode.ACCOUNT_NOT_FOUND, message);
  }
}
