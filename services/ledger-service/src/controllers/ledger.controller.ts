import type { Request, Response, NextFunction } from 'express';
import type { LedgerService } from '../services/ledger.service';
import { ForbiddenError, UnauthorizedError, NotFoundError } from '@fintech/shared-errors';
import { ErrorCode } from '@fintech/shared-types';
import { config } from '../config';

export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  /**
   * Helper to extract standard Gateway/Session headers.
   */
  private getContextHeaders(req: Request) {
    const userId = req.headers['x-user-id'] as string | undefined;
    const userRole = req.headers['x-user-role'] as string | undefined;
    const correlationId = (req.headers['x-correlation-id'] as string) || `corr_${Date.now()}`;
    const internalKey = req.headers['x-internal-api-key'] as string | undefined;

    return { userId, userRole, correlationId, internalKey };
  }

  /**
   * Helper to verify internal S2S authorization (using the strictly validated boot-time config).
   */
  private isInternalS2S(internalKey: string | undefined): boolean {
    return !!internalKey && internalKey === config.INTERNAL_API_KEY;
  }

  /**
   * POST /v1/internal/ledger/entry
   */
  recordTransaction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { correlationId } = this.getContextHeaders(req);
      const result = await this.ledgerService.recordTransaction(req.body, correlationId);

      res.status(201).json({
        success: true,
        data: result,
        meta: null,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /v1/balance/:accountId (and alias /v1/ledger/accounts/:accountId/balance)
   */
  getBalance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId } = req.params as { accountId: string };
      const { userId, userRole, internalKey } = this.getContextHeaders(req);

      // Access control checks
      if (!this.isInternalS2S(internalKey)) {
        if (!userId) {
          throw new UnauthorizedError('User authentication context headers missing.');
        }

        // If CUSTOMER, verify they own the account by checking with account-service
        if (userRole === 'CUSTOMER') {
          const accountServiceUrl = `${config.ACCOUNT_SERVICE_URL}/v1/${accountId}`;
          try {
            const response = await fetch(accountServiceUrl, {
              method: 'GET',
              headers: {
                'x-internal-api-key': config.INTERNAL_API_KEY,
              },
            });

            if (!response.ok) {
              if (response.status === 404) {
                throw new NotFoundError('Account not found.', ErrorCode.ACCOUNT_NOT_FOUND);
              }
              throw new Error(
                `Failed to fetch account details from account-service: status ${response.status}`,
              );
            }

            const resData = (await response.json()) as {
              success: boolean;
              data?: { userId: string };
            };

            if (!resData.success || !resData.data || resData.data.userId !== userId) {
              throw new ForbiddenError(
                'Access Denied: You do not own this account.',
                ErrorCode.FORBIDDEN,
              );
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (fetchErr: any) {
            if (fetchErr instanceof ForbiddenError || fetchErr instanceof NotFoundError) {
              throw fetchErr;
            }
            throw new Error(
              `Internal connection failure checking account ownership: ${fetchErr.message}`,
            );
          }
        }
      }

      // Calculate and return balance
      const result = await this.ledgerService.calculateBalance(accountId);

      res.status(200).json({
        success: true,
        data: {
          accountId,
          balance: result.balance,
          currency: result.currency,
        },
        meta: null,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  };
}
