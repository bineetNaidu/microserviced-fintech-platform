import type { Publisher } from '@fintech/shared-messaging';
import { createEnvelope } from '@fintech/shared-events';
import { config } from '../../config';
import type { Account, AccountStatus } from '@fintech/shared-types';

export class AccountPublisher {
  constructor(private readonly amqpPublisher: Publisher) {}

  /**
   * Broadcasts an account.created event downstream.
   */
  async publishAccountCreated(account: Account, correlationId: string): Promise<void> {
    const event = createEnvelope('account.created', config.SERVICE_NAME, correlationId, {
      accountId: account.id,
      userId: account.userId,
      type: account.type,
      currency: account.currency,
      createdAt: account.createdAt,
    });

    await this.amqpPublisher.publish('account.created', event);
  }

  /**
   * Broadcasts an account.status_changed event downstream (freeze, unfreeze, close).
   */
  async publishAccountStatusChanged(
    account: Account,
    oldStatus: AccountStatus,
    reason: string,
    updatedBy: string,
    correlationId: string,
  ): Promise<void> {
    const event = createEnvelope('account.status_changed', config.SERVICE_NAME, correlationId, {
      accountId: account.id,
      oldStatus,
      newStatus: account.status,
      reason,
      updatedBy: updatedBy, // Can be UUID or 'SYSTEM'
    });

    await this.amqpPublisher.publish('account.status_changed', event);
  }
}
