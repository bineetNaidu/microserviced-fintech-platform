import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '@fintech/shared-errors';
import type { UserRole } from '@fintech/shared-types';

// Re-export AuthenticatedUser so consumers can import it from either file
export type { AuthenticatedUser } from './authenticate.middleware';

/**
 * High-Order Role Access Guard Interceptor.
 *
 * This middleware MUST be placed AFTER createAuthenticateMiddleware() in the route chain.
 * authenticate() populates req.user → requireRole() reads and validates req.user.role.
 *
 * USAGE PATTERN:
 * ```typescript
 * import { createAuthenticateMiddleware, requireRole } from '@fintech/shared-middleware';
 *
 * const authenticate = createAuthenticateMiddleware(config.JWT_SECRET);
 *
 * // Only OPERATIONS and AUDITOR roles can access admin reports
 * router.get('/admin/reports',
 *   authenticate,                               // Step 1: verify JWT, populate req.user
 *   requireRole(['OPERATIONS', 'AUDITOR']),     // Step 2: check role allows access
 *   reportController.getAdminReport,            // Step 3: run handler
 * );
 * ```
 *
 * ─── ROLE HIERARCHY (for reference) ──────────────────────────────────────────
 * CUSTOMER   → Standard end-user: can view own accounts, initiate transfers
 * MAKER      → Admin who initiates high-risk actions (requires CHECKER approval)
 * CHECKER    → Admin who reviews and approves/rejects MAKER actions
 * OPERATIONS → Full admin: can view all accounts, freeze/unfreeze, manage configs
 * AUDITOR    → Read-only admin: can view everything but cannot mutate any data
 *
 * MAKER and CHECKER must NEVER be the same person for the same action (4-eyes principle).
 * The Approval Service enforces this by rejecting a checker whose ID matches the maker ID.
 *
 * @param allowedRoles - Array of UserRole values that are permitted to access the route
 */
export function requireRole(allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // req.user is undefined if createAuthenticateMiddleware() was not run first.
    // This is a middleware ordering mistake — surface it clearly.
    if (!req.user) {
      return next(
        new UnauthorizedError(
          'Authentication credentials are missing or invalid. ' +
            'Ensure createAuthenticateMiddleware() runs before requireRole().',
        ),
      );
    }

    // Check if the authenticated user's role is in the permitted roles list.
    // allowedRoles.includes() is O(n) but n is always tiny (≤5 roles total)
    // so a Set optimization is unnecessary here.
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Route requires one of: [${allowedRoles.join(', ')}]. ` +
            `Your role: ${req.user.role}.`,
        ),
      );
    }

    next();
  };
}
