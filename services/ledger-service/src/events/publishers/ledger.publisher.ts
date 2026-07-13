import type { Publisher } from '@fintech/shared-messaging';
import { createEnvelope } from '@fintech/shared-events';
import { config } from '../../config';
import type { CurrencyType } from '@fintech/shared-types';

/**
 * LedgerPublisher aggregates RabbitMQ event dispatching workflows.
 */
export class LedgerPublisher {
  constructor(private readonly amqpPublisher: Publisher) {}

  /**
   * Broadcasts a ledger.transaction_posted event downstream.
   */
  async publishTransactionPosted(
    transactionId: string,
    referenceId: string,
    currency: CurrencyType,
    affectedAccounts: string[],
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope('ledger.transaction_posted', config.SERVICE_NAME, correlationId, {
      transactionId,
      referenceId,
      currency,
      affectedAccounts,
    });

    await this.amqpPublisher.publish('ledger.transaction_posted', event);
  }

  /**
   * Broadcasts a ledger.balance_breached event downstream when an account debit is blocked.
   */
  async publishBalanceBreached(
    accountId: string,
    amountPaise: number,
    currentBalancePaise: number,
    referenceId: string,
    reason: string,
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope('ledger.balance_breached', config.SERVICE_NAME, correlationId, {
      accountId,
      amountPaise,
      currentBalancePaise,
      reason,
      referenceId,
    });

    await this.amqpPublisher.publish('ledger.balance_breached', event);
  }
}
