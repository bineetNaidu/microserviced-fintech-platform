import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import type { EventEnvelope } from '@fintech/shared-events';
import { TOPOLOGY, declareTopology } from './topology';

/**
 * Configuration for a consumer subscription.
 */
export interface ConsumerOptions {
  /**
   * The RabbitMQ queue name.
   *
   * NAMING CONVENTION: '{service-name}.{routing-key-pattern}'
   * This prevents naming collisions across services and makes it obvious
   * which service owns which queue in the RabbitMQ management UI.
   *
   * @example 'notification-service.transfer.initiated'
   * @example 'ledger-service.transfer.*'
   */
  queueName: string;

  /**
   * The routing key or pattern to bind this queue to on the topic exchange.
   * RabbitMQ topic exchange supports wildcard patterns:
   *   '*' = matches exactly one word segment
   *   '#' = matches zero or more word segments
   *
   * @example 'transfer.initiated'       → exact match
   * @example 'transfer.*'               → any transfer event
   * @example 'account.#'               → any event under 'account.' prefix
   * @example '#'                        → ALL events (use with extreme caution)
   */
  routingKey: string;

  /**
   * Maximum number of unacknowledged messages this consumer holds at once.
   * Set to 1 (default) for serial processing — ensures one message is fully
   * processed and acknowledged before the next is delivered.
   *
   * Increase for workloads where parallel processing is safe and beneficial
   * (e.g., stateless notification sends). Keep at 1 for stateful operations
   * (e.g., ledger writes, balance updates) where ordering matters.
   *
   * @default 1
   */
  prefetch?: number;
}

/**
 * A strongly-typed message handler function.
 * Receives the full EventEnvelope<T> and must return a Promise.
 * Throw any error to trigger automatic dead-lettering for this message.
 */
export type EventHandler<T = unknown> = (event: EventEnvelope<T>) => Promise<void>;

/**
 * Consumer instance returned by createConsumer().
 */
export interface Consumer {
  /**
   * Closes the consumer's channel wrapper.
   * In-flight messages that have been delivered but not yet acknowledged
   * will be re-queued by RabbitMQ after the channel closes.
   */
  close(): Promise<void>;
}

/**
 * Creates a typed AMQP event consumer with automatic dead-lettering on failure.
 *
 * ─── MANUAL ACKNOWLEDGEMENT (noAck: false) ───────────────────────────────────
 * We use MANUAL acknowledgement — the consumer explicitly calls channel.ack()
 * after successfully processing a message. This is critical for at-least-once delivery.
 *
 * With auto-ack (noAck: true), RabbitMQ marks the message as delivered the moment
 * it's sent to the consumer. If the consumer crashes before processing completes,
 * the message is LOST FOREVER — no retry, no dead-letter, no trace.
 *
 * With manual ack, the flow is:
 *   1. RabbitMQ delivers message → consumer starts processing
 *   2. Consumer finishes → calls channel.ack(msg)     → message removed from queue ✓
 *   3. Consumer crashes  → no ack sent                → RabbitMQ re-delivers to next consumer ✓
 *   4. Consumer rejects  → calls channel.nack(msg, false, false) → sent to DLQ ✓
 *
 * ─── DEAD LETTERING ON FAILURE ────────────────────────────────────────────────
 * When the handler throws an error, we call nack(msg, false, false):
 *   • 'false' for allUpTo — only reject THIS message
 *   • 'false' for requeue — do NOT requeue (would cause infinite retry loop for bugs)
 *
 * Instead, the message is routed to the dead-letter exchange (fintech.dlx),
 * which queues it in fintech.dead-letters for manual inspection and replay.
 *
 * WHY NOT REQUEUE?
 * Requeuing a failed message on a processing error typically causes an INFINITE LOOP:
 *   Bug in handler → nack(requeue:true) → message goes back to queue → re-delivered
 *   → same bug triggers → nack again → infinite loop → queue floods → service crash
 *
 * The correct production pattern is: nack to DLQ, fix the bug, manually replay from DLQ.
 *
 * ─── PREFETCH = 1 ────────────────────────────────────────────────────────────
 * With prefetch = 1, RabbitMQ delivers exactly ONE message at a time per consumer.
 * The next message is only delivered after the first is ack'd or nack'd.
 * This ensures serial processing order — critical for ledger operations.
 *
 * @param connection  - The AmqpConnectionManager from createMessagingConnection()
 * @param options     - Queue name, routing key, and prefetch configuration
 * @param handler     - Async function to process each received event
 * @returns Consumer instance with close() method
 *
 * @example
 * // Ledger service consuming transfer events
 * const consumer = createConsumer<TransferInitiatedEventData>(
 *   connection,
 *   {
 *     queueName: 'ledger-service.transfer.initiated',
 *     routingKey: 'transfer.initiated',
 *     prefetch: 1,
 *   },
 *   async (event) => {
 *     // event is fully typed as EventEnvelope<TransferInitiatedEventData>
 *     await ledgerService.recordTransfer(event.data);
 *   },
 * );
 */
export function createConsumer<T = unknown>(
  connection: AmqpConnectionManager,
  options: ConsumerOptions,
  handler: EventHandler<T>,
): Consumer {
  const { queueName, routingKey, prefetch = 1 } = options;

  const channelWrapper: ChannelWrapper = connection.createChannel({
    json: false, // Manual JSON parsing for type safety
    setup: async (channel: Channel): Promise<void> => {
      // 1. Assert platform topology (exchanges + DLQ) — idempotent, safe to repeat
      await declareTopology(channel);

      // 2. Assert service queue with dead-letter exchange configured.
      //    deadLetterExchange ensures nack'd messages route to fintech.dlx instead of dropping.
      await channel.assertQueue(queueName, {
        durable: true, // Survive RabbitMQ restarts
        deadLetterExchange: TOPOLOGY.DLX_EXCHANGE,
      });

      // 3. Bind the service queue to the events exchange with the routing key pattern
      await channel.bindQueue(queueName, TOPOLOGY.EVENTS_EXCHANGE, routingKey);

      // 4. Set prefetch — limit how many unacked messages are in-flight per consumer
      await channel.prefetch(prefetch);

      // 5. Start consuming — noAck: false = manual acknowledgement mode
      await channel.consume(queueName, async (msg: ConsumeMessage | null) => {
        // msg is null when the consumer is cancelled by the server (e.g., queue deleted)
        // This is normal — log it and return without processing
        if (!msg) {
          process.stderr.write(
            JSON.stringify({
              level: 'warn',
              msg: 'AMQP_CONSUMER_CANCELLED',
              queue: queueName,
              note: 'Consumer was cancelled by RabbitMQ. This may indicate the queue was deleted.',
              timestamp: new Date().toISOString(),
            }) + '\n',
          );
          return;
        }

        let parsedEvent: EventEnvelope<T>;

        // ─── Step 1: Parse the message content ──────────────────────────
        // JSON.parse throws on invalid JSON — we treat this as a dead-letter
        // scenario (malformed message from a buggy producer, not our fault)
        try {
          parsedEvent = JSON.parse(msg.content.toString()) as EventEnvelope<T>;
        } catch (parseError: unknown) {
          process.stderr.write(
            JSON.stringify({
              level: 'error',
              msg: 'AMQP_MESSAGE_PARSE_FAILURE',
              queue: queueName,
              rawContent: msg.content.toString().slice(0, 200), // Truncate for log safety
              error: parseError instanceof Error ? parseError.message : String(parseError),
              timestamp: new Date().toISOString(),
            }) + '\n',
          );

          // Dead-letter the malformed message — do NOT requeue (would loop forever)
          channel.nack(msg, false, false);
          return;
        }

        // ─── Step 2: Run the handler ─────────────────────────────────────
        try {
          await handler(parsedEvent);

          // Handler succeeded — acknowledge the message to remove it from the queue
          channel.ack(msg);
        } catch (handlerError: unknown) {
          // Handler failed — dead-letter the message for manual inspection
          process.stderr.write(
            JSON.stringify({
              level: 'error',
              msg: 'AMQP_HANDLER_FAILURE',
              queue: queueName,
              eventId: parsedEvent.id,
              eventType: parsedEvent.type,
              correlationId: parsedEvent.correlationId,
              producer: parsedEvent.producer,
              error:
                handlerError instanceof Error
                  ? { message: handlerError.message, stack: handlerError.stack }
                  : { message: String(handlerError) },
              timestamp: new Date().toISOString(),
            }) + '\n',
          );

          // nack(msg, allUpTo=false, requeue=false) → routes to fintech.dlx → fintech.dead-letters
          // See "DEAD LETTERING ON FAILURE" in the class JSDoc for full rationale
          channel.nack(msg, false, false);
        }
      });
    },
  });

  return {
    async close(): Promise<void> {
      await channelWrapper.close();
    },
  };
}
