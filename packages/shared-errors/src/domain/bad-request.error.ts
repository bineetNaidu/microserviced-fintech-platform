import { BaseAppError } from '../base.error';
import { ErrorCode, type ApiErrorDetail } from '@fintech/shared-types';

export class BadRequestError extends BaseAppError {
  public readonly statusCode = 400;

  constructor(message = 'Bad Request', details: ApiErrorDetail[] = []) {
    super(ErrorCode.VALIDATION_FAILED, message, details);
  }
}
