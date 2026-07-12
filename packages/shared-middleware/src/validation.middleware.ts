import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodSchema, ZodType } from 'zod';
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
export function validateRequest(target: ValidationTarget | ZodSchema): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const isDirectSchema =
        target instanceof ZodType || (target && typeof (target as ZodSchema).parse === 'function');
      const spec: ValidationTarget = isDirectSchema
        ? { body: target as ZodSchema }
        : (target as ValidationTarget);

      if (spec.body) {
        req.body = spec.body.parse(req.body);
      }
      if (spec.query) {
        req.query = spec.query.parse(req.query);
      }
      if (spec.params) {
        req.params = spec.params.parse(req.params);
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
