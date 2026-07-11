/**
 * @fintech/shared-errors
 * Global Core Workspace Exceptions Layer.
 *
 * IMPORT ORDER MATTERS for consumers:
 * Always import the most specific error you need. Use BaseAppError only for
 * generic `instanceof` checks in the error middleware.
 *
 * HTTP STATUS MAP:
 * 400 → BadRequestError       (schema/input validation failure)
 * 401 → UnauthorizedError     (missing or invalid JWT)
 * 403 → ForbiddenError        (valid JWT, insufficient role)
 * 404 → NotFoundError         (resource does not exist)
 * 409 → ConflictError         (state collision, idempotency key mismatch)
 * 422 → InsufficientFundsError (debit would go negative)
 * 422 → UnprocessableEntityError (domain rule violation)
 * 429 → RateLimitError        (request threshold exceeded)
 */

export * from './base.error';
export * from './domain/bad-request.error';
export * from './domain/not-found.error';
export * from './domain/unauthorized.error';
export * from './domain/forbidden.error';
export * from './domain/conflict.error';
export * from './domain/insufficient-funds.error';
export * from './domain/rate-limit.error';
export * from './domain/unprocessable.error';
