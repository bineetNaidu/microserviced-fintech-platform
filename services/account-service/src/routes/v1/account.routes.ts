import { Router } from 'express';
import type { AccountController } from '../../controllers/account.controller';
import { ApiRoutes } from '@fintech/shared-config';
import { validateRequest, requireInternalApiKey } from '@fintech/shared-middleware';
import { config } from '../../config';
import {
  CreateAccountSchema,
  FreezeAccountSchema,
  ValidateBoundsSchema,
} from '../../validators/account.validator';

export function createAccountRouter(controller: AccountController): Router {
  const router = Router();

  // ─── CLIENT-FACING / ROUTED ENDPOINTS (GATEWAY PROXIED) ───────────────────

  // GET /v1 (list accounts)
  router.get('/v1', controller.listAccounts);

  // POST /v1/create (create account)
  router.post(
    ApiRoutes.Accounts.v1.Create,
    validateRequest(CreateAccountSchema),
    controller.createAccount,
  );

  // GET /v1/:accountId (get account details)
  router.get(ApiRoutes.Accounts.v1.GetDetails, controller.getAccountDetails);

  // POST /v1/:accountId/freeze (freeze account)
  router.post(
    ApiRoutes.Accounts.v1.Freeze,
    validateRequest(FreezeAccountSchema),
    controller.freezeAccount,
  );

  // POST /v1/:accountId/unfreeze (unfreeze account)
  router.post(
    '/v1/:accountId/unfreeze',
    validateRequest(FreezeAccountSchema),
    controller.unfreezeAccount,
  );

  // POST /v1/:accountId/close (close account)
  router.post('/v1/:accountId/close', controller.closeAccount);

  // ─── INTERNAL SERVICE-TO-SERVICE ENDPOINTS (S2S) ─────────────────────────
  const requireApiKey = requireInternalApiKey(config.INTERNAL_API_KEY);

  // POST /v1/internal/validate-bounds
  router.post(
    '/v1/internal/validate-bounds',
    requireApiKey,
    validateRequest(ValidateBoundsSchema),
    controller.validateBounds,
  );

  return router;
}
