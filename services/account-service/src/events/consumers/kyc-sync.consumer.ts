import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { createConsumer, type Consumer } from '@fintech/shared-messaging';
import type { InboxRepository } from '../../repositories/inbox.repository';
import type { AccountService } from '../../services/account.service';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import type { UserKycStatusChangedEvent } from '@fintech/shared-events';

/**
 * Consumer that listens to 'user.kyc_status_changed' events and synchronizes compliance freezes.
 */
export function createKycSyncConsumer(
  connection: AmqpConnectionManager,
  db: NodePgDatabase<typeof schema>,
  accountService: AccountService,
  inboxRepo: InboxRepository,
): Consumer {
  return createConsumer<UserKycStatusChangedEvent['data']>(
    connection,
    {
      // NAMING CONVENTION: '{service-name}.{routing-key}'
      queueName: 'account-service.kyc_sync',
      routingKey: 'user.kyc_status_changed',
      prefetch: 1,
    },
    async (event) => {
      const { userId, newStatus, reason } = event.data;

      process.stdout.write(
        JSON.stringify({
          level: 'info',
          msg: 'KYC_STATUS_CHANGED_EVENT_RECEIVED',
          userId,
          newStatus,
          eventId: event.id,
          correlationId: event.correlationId,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );

      // 1. Transaction context for idempotency
      await db.transaction(async (tx) => {
        // Idempotency check via inboxMessages
        const isNewMessage = await inboxRepo.insertMessage(event.id, event.type, tx);
        if (!isNewMessage) {
          process.stdout.write(
            JSON.stringify({
              level: 'info',
              msg: 'KYC_STATUS_CHANGED_EVENT_DUPLICATE_SKIPPED',
              userId,
              eventId: event.id,
              correlationId: event.correlationId,
              timestamp: new Date().toISOString(),
            }) + '\n',
          );
          return; // Acknowledges message cleanly
        }

        // 2. Synchronize states in DB & publish account.status_changed if suspended/rejected
        await accountService.handleKycStatusChanged(
          userId,
          newStatus,
          reason || 'KYC status changed to ' + newStatus,
          event.correlationId,
        );
      });
    },
  );
}
