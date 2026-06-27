import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '@fintech/shared-errors';
import type { UserRole, ApprovalActionType } from '@fintech/shared-types';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  permissions: ApprovalActionType[];
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

/**
 * High-Order Role Access Guard Interceptor.
 * Restricts downstream controller runtime invocation to users holding explicit privilege level assignments.
 */
export function requireRole(allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication credentials are missing or invalid.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError('Access privilege validation failed: Insufficient role permissions.'),
      );
    }

    next();
  };
}
