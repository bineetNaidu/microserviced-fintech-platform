import { type ErrorCodeType, type ApiErrorDetail } from '@fintech/shared-types';

export abstract class BaseAppError extends Error {
  public abstract readonly statusCode: number;

  constructor(
    public readonly code: ErrorCodeType,
    message: string,
    public readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);

    // Explicitly restore native prototype chain for correct 'instanceof' lookups
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture V8 stack trace excluding this constructor call
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
