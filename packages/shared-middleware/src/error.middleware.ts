import type { Request, Response, NextFunction } from 'express';
import { BaseAppError } from '@fintech/shared-errors';
import { ErrorCode } from '@fintech/shared-types';

/**
 * Global Service Catch-All Error Interception Middleware.
 *
 * This MUST be the LAST middleware registered on the Express app:
 * ```typescript
 * app.use(errorMiddleware); // Always last
 * ```
 *
 * Express identifies error-handling middleware by its 4-parameter signature
 * (err, req, res, next). If you omit any parameter, Express will NOT treat it
 * as an error handler — it will be silently skipped, and errors will go unhandled.
 *
 * ─── ERROR FLOW ───────────────────────────────────────────────────────────────
 * Any middleware or controller that calls `next(error)` or throws (in async handlers
 * using express-async-errors or manual try/catch) ends up here.
 *
 * This middleware handles three categories:
 *   1. SyntaxError    → Malformed JSON request body (from body-parser)
 *   2. BaseAppError   → Expected domain/HTTP errors (400, 401, 403, 404, 409, 422, 429)
 *   3. Unknown errors → Unexpected infrastructure failures (500)
 *
 * ─── STRUCTURED STDERR FOR CRITICAL ERRORS ───────────────────────────────────
 * For unhandled (500-class) errors, we write structured JSON to process.stderr
 * instead of using console.error.
 *
 * WHY NOT console.error?
 * In production, structured logging pipelines (Pino, Winston, Fluentd) intercept
 * stdout/stderr. `console.error` writes to stderr, but WITHOUT a structured JSON
 * format — it produces an unindexed string that log aggregators cannot parse,
 * alert on, or correlate with traces. Structured JSON to stderr ensures the aggregator
 * can index the `level`, `traceId`, and `error.message` fields for alerting.
 */
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // Express requires all 4 parameters to be declared, even if _next is unused.
  // Removing it causes Express to NOT register this as an error handler middleware.
  _next: NextFunction,
): Response {
  const correlationId = req.correlationId ?? 'system-fallback-trace';

  // ─── SyntaxError: Malformed JSON request body ─────────────────────────────
  // Express's body-parser (json middleware) throws a SyntaxError when the
  // request Content-Type is 'application/json' but the body is invalid JSON.
  // Without this handler, the error falls through to the generic 500 handler —
  // which is wrong. A malformed JSON body is a CLIENT error (400), not a server error.
  //
  // 'body' in err — body-parser attaches a 'body' property to the SyntaxError
  // to distinguish it from other SyntaxErrors (e.g., from application code bugs).
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      data: null,
      meta: null,
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message:
          'Request body contains invalid JSON. Check your payload syntax and Content-Type header.',
        details: [],
        traceId: correlationId,
      },
    });
  }

  // ─── BaseAppError: Expected domain and HTTP errors ───────────────────────
  // These are thrown intentionally by service logic and middleware.
  // They carry the correct statusCode and machine-readable error code.
  // No server-side logging needed — these are client-induced, not bugs.
  if (err instanceof BaseAppError) {
    return res.status(err.statusCode).json({
      success: false,
      data: null,
      meta: null,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        traceId: correlationId,
      },
    });
  }

  // ─── Unexpected infrastructure faults ────────────────────────────────────
  // These should NEVER reach production at high frequency.
  // Examples: DB connection drops mid-query, out-of-memory, library panics,
  //           uncaught promise rejections not handled by async error wrappers.
  //
  // We write a structured JSON line to stderr so log aggregators can:
  //   • Index the traceId and correlate with distributed traces
  //   • Alert on high frequency of UNHANDLED_EXCEPTION events
  //   • Include the stack trace for debugging without exposing it to the client
  const criticalLog = JSON.stringify({
    level: 'fatal',
    msg: 'UNHANDLED_EXCEPTION',
    traceId: correlationId,
    error: {
      name: err.name,
      message: err.message,
      // Stack trace is logged server-side ONLY — never sent to the client
      stack: err.stack,
    },
    timestamp: new Date().toISOString(),
  });

  // Write to stderr directly (not console.error) — see class-level comment for why
  process.stderr.write(criticalLog + '\n');

  return res.status(500).json({
    success: false,
    data: null,
    meta: null,
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'A critical unhandled exception occurred on the platform infrastructure.',
      // In development, expose the raw error message for faster debugging.
      // In production, hide it — raw error messages may leak DB schemas, file paths,
      // or internal system topology that helps attackers.
      details: process.env.NODE_ENV === 'development' ? [{ message: err.message }] : [],
      traceId: correlationId,
    },
  });
}
