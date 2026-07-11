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

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(config.JWT_SECRET);

  // ─── PUBLIC ROUTES ─────────────────────────────────────────────────────────

  router.post('/v1/register', validateRequest({ body: registerSchema }), controller.register);

  router.post(
    '/v1/verify-email',
    validateRequest({ body: verifyEmailSchema }),
    controller.verifyEmail,
  );

  router.post('/v1/login', validateRequest({ body: loginSchema }), controller.login);

  router.post('/v1/refresh', controller.refresh);

  router.post(
    '/v1/forgot-password',
    validateRequest({ body: forgotPasswordSchema }),
    controller.forgotPassword,
  );

  router.post(
    '/v1/reset-password',
    validateRequest({ body: resetPasswordSchema }),
    controller.resetPassword,
  );

  // ─── PROTECTED ROUTES ──────────────────────────────────────────────────────

  router.post('/v1/logout', authenticate, controller.logout);

  router.get('/v1/sessions', authenticate, controller.getSessions);

  router.delete('/v1/sessions/:sessionId', authenticate, controller.revokeSession);

  return router;
}
