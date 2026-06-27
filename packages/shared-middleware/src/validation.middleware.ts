import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { BadRequestError } from '@fintech/shared-errors';

interface ValidationTarget {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Higher-Order Request Target Schema Validation Interceptor.
 * Validates inbound request structures against specific Zod configurations.
 * Rejects parameters immediately with a BadRequestError if data constraints fail.
 */
export function validateRequest(target: ValidationTarget): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (target.body) {
        req.body = target.body.parse(req.body);
      }
      if (target.query) {
        req.query = target.query.parse(req.query);
      }
      if (target.params) {
        req.params = target.params.parse(req.params);
      }

      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        // Transform native Zod structural defects into standard ApiErrorDetail definitions
        const errorDetails = error.errors.map((zodErr) => ({
          field: zodErr.path.join('.'),
          message: zodErr.message,
        }));

        return next(
          new BadRequestError('Structural parameter schema validation failed.', errorDetails),
        );
      }

      next(error);
    }
  };
}
