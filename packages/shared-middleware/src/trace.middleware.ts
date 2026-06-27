import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

/**
 * Distributed Telemetry Correlation Identifier Interceptor Middleware.
 * Extracts an upstream trace identifier or instantiates a fresh tracking token
 * to guarantee request lineage tracking across asynchronous service boundaries.
 */
export function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract tracking header value or generate a new random UUID v4 securely via native crypto engine
  const traceId = (req.headers['x-correlation-id'] as string) || randomUUID();

  // Bind token back directly onto the execution context object framework
  req.correlationId = traceId;

  // Mirror the trace tracker onto response headers for client/frontend alignment
  res.setHeader('x-correlation-id', traceId);

  next();
}
