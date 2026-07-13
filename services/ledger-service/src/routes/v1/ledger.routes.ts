import { Router } from 'express';
import type { LedgerController } from '../../controllers/ledger.controller';
import { ApiRoutes } from '@fintech/shared-config';
import { validateRequest, requireInternalApiKey } from '@fintech/shared-middleware';
import { config } from '../../config';
import { CreateLedgerTransactionSchema } from '../../validators/ledger.validator';

export function createLedgerRouter(controller: LedgerController): Router {
  const router = Router();

  // ─── INTERNAL SERVICE-TO-SERVICE ENDPOINTS (S2S) ─────────────────────────
  const requireApiKey = requireInternalApiKey(config.INTERNAL_API_KEY);

  // POST /v1/internal/ledger/entry (Record balance transfers leg)
  router.post(
    ApiRoutes.Ledger.v1.RecordEntry,
    requireApiKey,
    validateRequest(CreateLedgerTransactionSchema),
    controller.recordTransaction,
  );

  // ─── CLIENT-FACING / ROUTED ENDPOINTS (GATEWAY PROXIED) ───────────────────

  // GET /v1/balance/:accountId
  router.get(ApiRoutes.Ledger.v1.GetBalance, controller.getBalance);

  // GET /v1/ledger/accounts/:accountId/balance (Legacy / internal S2S compatibility alias)
  router.get(ApiRoutes.Ledger.v1.GetBalanceLegacy, controller.getBalance);

  return router;
}
