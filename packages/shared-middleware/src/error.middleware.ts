import type { Request, Response, NextFunction } from 'express';
import { BaseAppError } from '@fintech/shared-errors';
import { ErrorCode } from '@fintech/shared-types';

/**
 * Global Service Catch-All Error Interception Middleware.
 * Catches structural application domain rule violations and maps them into standardized,
 * predictable JSON envelopes while tracking the OpenTelemetry correlation token context.
 */
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // Express requires next parameter to be explicitly declared to correctly mount error hooks
  _next: NextFunction,
): Response {
  const correlationId = req.correlationId || 'system-fallback-trace';

  // Process expected strongly-typed application domain exceptions
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

  // Handle totally unhandled/unexpected system infrastructure faults (e.g., memory exhaustion, DB drops)
  console.error(`[CRITICAL UNHANDLED FAULT] Trace: ${correlationId}`, err);

  return res.status(500).json({
    success: false,
    data: null,
    meta: null,
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'A critical unhandled execution exception occurred on the platform infrastructure.',
      details: process.env.NODE_ENV === 'development' ? [{ message: err.message }] : [],
      traceId: correlationId,
    },
  });
}
