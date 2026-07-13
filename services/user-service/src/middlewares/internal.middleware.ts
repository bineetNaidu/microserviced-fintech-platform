import { UnauthorizedError } from '@fintech/shared-errors';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that restricts route access to internal services.
 * Mandates that the 'X-Internal-API-Key' header matches the configured key.
 */
export function requireInternalApiKey(apiKey: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = req.headers['x-internal-api-key'];
    if (!key || key !== apiKey) {
      return next(new UnauthorizedError('Invalid or missing internal service API key.'));
    }
    next();
  };
}
