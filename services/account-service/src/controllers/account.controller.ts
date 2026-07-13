import type { Request, Response, NextFunction } from 'express';
import type { AccountService } from '../services/account.service';
import { ForbiddenError, UnauthorizedError } from '@fintech/shared-errors';
import {
  ErrorCode,
  type AccountStatus,
  type AccountType,
  type CurrencyType,
} from '@fintech/shared-types';

export class AccountController {
  constructor(private readonly accountService: AccountService) {}

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
   * Helper to verify internal S2S authorization.
   */
  private isInternalS2S(internalKey: string | undefined): boolean {
    const serviceInternalKey = process.env.INTERNAL_API_KEY || 'test-internal-key';
    return !!internalKey && internalKey === serviceInternalKey;
  }

  /**
   * POST /v1/create
   */
  createAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, userRole, correlationId } = this.getContextHeaders(req);

      if (!userId) {
        throw new UnauthorizedError('User authentication context headers missing.');
      }

      // Enforce: Customers can only register their own accounts
      if (userRole === 'CUSTOMER' && req.body.userId && req.body.userId !== userId) {
        throw new ForbiddenError('Access Denied: Cannot register account for another user.');
      }

      const { type, currency } = req.body;
      const targetUserId =
        userRole !== 'CUSTOMER' && req.body.userId
          ? (req.body.userId as string)
          : (userId as string);

      const account = await this.accountService.createAccount(
        targetUserId,
        type as AccountType,
        currency as CurrencyType,
        correlationId,
      );

      res.status(201).json({
        success: true,
        data: account,
        meta: null,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /v1/:accountId
   */
  getAccountDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId } = req.params as { accountId: string };
      const { userId, userRole, internalKey } = this.getContextHeaders(req);

      const account = await this.accountService.getAccount(accountId);

      // Access control
      if (!this.isInternalS2S(internalKey)) {
        if (!userId) {
          throw new UnauthorizedError('User authentication context headers missing.');
        }

        // CUSTOMER can only view their own accounts
        if (userRole === 'CUSTOMER' && account.userId !== userId) {
          throw new ForbiddenError(
            'Access Denied: You do not own this account.',
            ErrorCode.FORBIDDEN,
          );
        }
      }

      res.status(200).json({
        success: true,
        data: account,
        meta: null,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /v1 (translates to GET /api/accounts/v1 from gateway)
   */
  listAccounts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, userRole } = this.getContextHeaders(req);

      if (!userId) {
        throw new UnauthorizedError('User authentication context headers missing.');
      }

      let accounts;
      if (userRole === 'CUSTOMER') {
        accounts = await this.accountService.getAccountsByUser(userId as string);
      } else {
        // Administrative view
        const filterUserId = req.query.userId as string | undefined;
        const filterStatus = req.query.status as string | undefined;
        accounts = await this.accountService.listAllAccounts({
          userId: filterUserId,
          status: filterStatus as AccountStatus | undefined,
        });
      }

      res.status(200).json({
        success: true,
        data: accounts,
        meta: {
          count: accounts.length,
        },
        error: null,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /v1/:accountId/freeze
   */
  freezeAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId } = req.params as { accountId: string };
      const { userId, userRole, correlationId, internalKey } = this.getContextHeaders(req);

      // Ensure administrative permissions
      if (!this.isInternalS2S(internalKey)) {
        if (!userId) {
          throw new UnauthorizedError('User authentication context headers missing.');
        }
        if (userRole === 'CUSTOMER') {
          throw new ForbiddenError(
            'Access Denied: Customers cannot administratively freeze accounts.',
            ErrorCode.FORBIDDEN,
          );
        }
      }

      const { reason } = req.body;
      const actorId = userId || 'SYSTEM';
      const actorRole = userRole || 'SYSTEM';

      const account = await this.accountService.freezeAccount(
        accountId,
        actorId,
        actorRole,
        reason,
        correlationId,
      );

      res.status(200).json({
        success: true,
        data: account,
        meta: null,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /v1/:accountId/unfreeze
   */
  unfreezeAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId } = req.params as { accountId: string };
      const { userId, userRole, correlationId, internalKey } = this.getContextHeaders(req);

      // Ensure administrative permissions (Only Operations/Admins can unfreeze)
      if (!this.isInternalS2S(internalKey)) {
        if (!userId) {
          throw new UnauthorizedError('User authentication context headers missing.');
        }
        if (userRole !== 'OPERATIONS') {
          throw new ForbiddenError(
            'Access Denied: Only Operations Agents can unfreeze accounts.',
            ErrorCode.FORBIDDEN,
          );
        }
      }

      const { reason } = req.body;
      const actorId = userId || 'SYSTEM';
      const actorRole = userRole || 'SYSTEM';

      const account = await this.accountService.unfreezeAccount(
        accountId,
        actorId,
        actorRole,
        reason,
        correlationId,
      );

      res.status(200).json({
        success: true,
        data: account,
        meta: null,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /v1/:accountId/close
   */
  closeAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountId } = req.params as { accountId: string };
      const { userId, userRole, correlationId, internalKey } = this.getContextHeaders(req);

      // Ownership check or Admin permissions
      const account = await this.accountService.getAccount(accountId);

      if (!this.isInternalS2S(internalKey)) {
        if (!userId) {
          throw new UnauthorizedError('User authentication context headers missing.');
        }
        if (userRole === 'CUSTOMER' && account.userId !== userId) {
          throw new ForbiddenError(
            'Access Denied: You do not own this account.',
            ErrorCode.FORBIDDEN,
          );
        }
      }

      const actorId = userId || 'SYSTEM';
      const actorRole = userRole || 'SYSTEM';

      const closedAccount = await this.accountService.closeAccount(
        accountId,
        actorId,
        actorRole,
        correlationId,
      );

      res.status(200).json({
        success: true,
        data: closedAccount,
        meta: null,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /v1/internal/validate-bounds
   */
  validateBounds = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { internalKey } = this.getContextHeaders(req);

      if (!this.isInternalS2S(internalKey)) {
        throw new ForbiddenError('Access Denied: Internal S2S endpoint.');
      }

      const { fromAccountId, toAccountId, amountPaise } = req.body;

      const validation = await this.accountService.validateBounds(
        fromAccountId,
        toAccountId,
        amountPaise,
      );

      res.status(200).json({
        success: true,
        data: validation,
        meta: null,
        error: null,
      });
    } catch (err) {
      next(err);
    }
  };
}
