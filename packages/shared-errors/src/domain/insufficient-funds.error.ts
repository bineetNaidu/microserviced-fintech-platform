import { BaseAppError } from '../base.error';
import { ErrorCode } from '@fintech/shared-types';

/**
 * HTTP 422 Unprocessable Entity — Insufficient Funds.
 *
 * Thrown by the Transfer and Ledger services when a debit operation would
 * result in a negative ledger balance on the source account.
 *
 * WHY 422 AND NOT 400?
 * HTTP 400 (Bad Request) signals a syntactically malformed or schema-invalid request.
 * The request that triggers this error is syntactically valid — `amountPaise` is a
 * correct integer, the account IDs exist, etc. The failure is a DOMAIN RULE violation
 * (business invariant), not a schema violation. HTTP 422 is the correct status for that.
 *
 * FRONTEND HANDLING:
 * When the client receives `code: 'INSUFFICIENT_FUNDS'`, it should:
 * 1. Display the account balance to the user
 * 2. Offer to redirect to the deposit flow
 * 3. NOT show a generic error toast
 */
export class InsufficientFundsError extends BaseAppError {
  /** Enforced HTTP compliance status code mapping */
  public readonly statusCode = 422;

  constructor(message = 'Account balance is insufficient to complete this transfer') {
    super(ErrorCode.INSUFFICIENT_FUNDS, message, []);
  }
}
