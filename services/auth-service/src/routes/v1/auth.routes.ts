import { Router } from 'express';
import { validateRequest, createAuthenticateMiddleware } from '@fintech/shared-middleware';
import type { AuthController } from '../../controllers/auth.controller';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../validators/auth.validator';
import { config } from '../../config';
import { ApiRoutes } from '@fintech/shared-config';

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(config.JWT_PUBLIC_KEY);

  // ─── PUBLIC ROUTES ─────────────────────────────────────────────────────────

  router.post(
    ApiRoutes.Auth.v1.Register,
    validateRequest({ body: registerSchema }),
    controller.register,
  );

  router.post(
    ApiRoutes.Auth.v1.VerifyEmail,
    validateRequest({ body: verifyEmailSchema }),
    controller.verifyEmail,
  );

  router.post(ApiRoutes.Auth.v1.Login, validateRequest({ body: loginSchema }), controller.login);

  router.post(ApiRoutes.Auth.v1.Refresh, controller.refresh);

  router.post(
    ApiRoutes.Auth.v1.ForgotPassword,
    validateRequest({ body: forgotPasswordSchema }),
    controller.forgotPassword,
  );

  router.post(
    ApiRoutes.Auth.v1.ResetPassword,
    validateRequest({ body: resetPasswordSchema }),
    controller.resetPassword,
  );

  // ─── PROTECTED ROUTES ──────────────────────────────────────────────────────

  router.post(ApiRoutes.Auth.v1.Logout, authenticate, controller.logout);

  router.get(ApiRoutes.Auth.v1.GetSessions, authenticate, controller.getSessions);

  router.delete(ApiRoutes.Auth.v1.RevokeSession, authenticate, controller.revokeSession);

  return router;
}
