import { BaseAppError } from '../base.error';
import { ErrorCode } from '@fintech/shared-types';

/**
 * HTTP 429 Too Many Requests — Rate Limit Exceeded.
 *
 * Thrown by the rate limiter middleware when a client surpasses the configured
 * request threshold within the active sliding time window.
 *
 * The `retryAfterSeconds` value MUST be sent as the `Retry-After` response header
 * so clients know when to back off. Both the error class and the middleware that
 * throws it share responsibility for setting this header.
 *
 * CLIENT HANDLING:
 * Well-behaved API clients (and the frontend) should:
 * 1. Read the `Retry-After` response header
 * 2. Wait that many seconds before retrying
 * 3. Use exponential backoff for repeated 429s
 * 4. Show a "please wait" UI state, NOT a generic error
 *
 * MONITORING:
 * High 429 rates on auth routes = brute force attack → trigger alert
 * High 429 rates on transfer routes = potential fraud loop → trigger alert
 */
export class RateLimitError extends BaseAppError {
  /** Enforced HTTP compliance status code mapping */
  public readonly statusCode = 429;

  constructor(
    /**
     * Number of seconds the client should wait before retrying.
     * This value should be set as the `Retry-After` response header
     * by the middleware that catches and throws this error.
     */
    public readonly retryAfterSeconds: number,
    message = 'Too many requests. Please slow down and try again later.',
  ) {
    super(ErrorCode.RATE_LIMIT_EXCEEDED, message, []);
  }
}
