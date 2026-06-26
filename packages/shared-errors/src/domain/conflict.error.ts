import { BaseAppError } from '../base.error';
import { ErrorCode } from '@fintech/shared-types';

export class ConflictError extends BaseAppError {
  public readonly statusCode = 409;

  constructor(message = 'Resource state collision or idempotency key mismatch') {
    super(ErrorCode.IDEMPOTENCY_CONFLICT, message);
  }
}
