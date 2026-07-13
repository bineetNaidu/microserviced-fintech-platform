import type { AmqpConnectionManager } from 'amqp-connection-manager';
import { createConsumer, type Consumer } from '@fintech/shared-messaging';
import type { InboxRepository } from '../../repositories/inbox.repository';
import type { LedgerService } from '../../services/ledger.service';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import type { EventEnvelope } from '@fintech/shared-events';

interface SnapshotSweepEventData {
  jobName: string;
  executionTargetDate: string;
}

/**
 * Consumer that listens to 'scheduler.trigger.snapshot_sweep' ticks
 * and executes daily balance snapshots for all active accounts.
 */
export function createSnapshotSweepConsumer(
  connection: AmqpConnectionManager,
  db: NodePgDatabase<typeof schema>,
  ledgerService: LedgerService,
  inboxRepo: InboxRepository,
): Consumer {
  return createConsumer<SnapshotSweepEventData>(
    connection,
    {
      queueName: 'ledger-service.snap',
      routingKey: 'scheduler.trigger.snapshot_sweep',
      prefetch: 1,
    },
    async (event: EventEnvelope<SnapshotSweepEventData>) => {
      const { jobName, executionTargetDate } = event.data;

      process.stdout.write(
        JSON.stringify({
          level: 'info',
          msg: 'SNAPSHOT_SWEEP_EVENT_RECEIVED',
          jobName,
          executionTargetDate,
          eventId: event.id,
          correlationId: event.correlationId,
          timestamp: new Date().toISOString(),
        }) + '\n',
      );

      // 1. Check idempotency and execute the daily snapshot sweep within a transaction context
      await db.transaction(async (tx) => {
        // Idempotency check via inboxMessages
        const isNewMessage = await inboxRepo.insertMessage(event.id, event.type, tx);
        if (!isNewMessage) {
          process.stdout.write(
            JSON.stringify({
              level: 'info',
              msg: 'SNAPSHOT_SWEEP_EVENT_DUPLICATE_SKIPPED',
              eventId: event.id,
              correlationId: event.correlationId,
              timestamp: new Date().toISOString(),
            }) + '\n',
          );
          return;
        }

        // 2. Perform daily snapshot generation
        await ledgerService.runSnapshotSweep(executionTargetDate, tx);
      });
    },
  );
}
