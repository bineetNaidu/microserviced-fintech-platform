import { BadRequestError } from '@fintech/shared-errors';

/**
 * Custom ValidationError class extending BadRequestError (which maps to 400 Bad Request).
 * Used for strict type matching in tests and explicit validation error handling.
 */
export class ValidationError extends BadRequestError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
