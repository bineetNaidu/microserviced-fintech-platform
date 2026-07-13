import { Router } from 'express';
import { validateRequest, requireInternalApiKey } from '@fintech/shared-middleware';
import type { UserController } from '../../controllers/user.controller';
import {
  createProfileSchema,
  updateProfileSchema,
  submitKycSchema,
} from '../../validators/user.validator';
import { config } from '../../config';
import { ApiRoutes } from '@fintech/shared-config';

/**
 * Creates the Express router and registers all routes for the User Service.
 */
export function createUserRouter(controller: UserController): Router {
  const router = Router();

  // ─── PUBLIC CLIENT ROUTES (GATEWAY AUTHENTICATED) ─────────────────────────
  // These routes are proxied by the gateway. The gateway verifies the JWT
  // and injects the x-user-id and x-user-role headers.

  // Profile endpoints
  router.get(ApiRoutes.Users.v1.GetProfile, controller.getProfile);
  router.get(ApiRoutes.Users.v1.GetProfileAlt, controller.getProfile);

  router.post(
    ApiRoutes.Users.v1.CreateProfile,
    validateRequest(createProfileSchema),
    controller.updateProfile,
  );
  router.patch(
    ApiRoutes.Users.v1.UpdateProfile,
    validateRequest(updateProfileSchema),
    controller.updateProfile,
  );
  router.patch(
    ApiRoutes.Users.v1.UpdateProfileAlt,
    validateRequest(updateProfileSchema),
    controller.updateProfile,
  );

  // KYC endpoints
  router.post(ApiRoutes.Users.v1.SubmitKyc, validateRequest(submitKycSchema), controller.submitKyc);
  router.post(
    ApiRoutes.Users.v1.SubmitKycAlt,
    validateRequest(submitKycSchema),
    controller.submitKyc,
  );
  router.get(ApiRoutes.Users.v1.GetKycStatus, controller.getKycStatus);

  // ─── INTERNAL SERVICE ENDPOINTS (s2s authenticated) ──────────────────────
  // Requires X-Internal-API-Key to match config.INTERNAL_API_KEY
  const requireApiKey = requireInternalApiKey(config.INTERNAL_API_KEY);

  router.get(ApiRoutes.Users.v1.GetInternalProfile, requireApiKey, controller.internalGetProfile);
  router.get(
    ApiRoutes.Users.v1.GetInternalProfileAlt,
    requireApiKey,
    controller.internalGetProfile,
  );

  return router;
}
