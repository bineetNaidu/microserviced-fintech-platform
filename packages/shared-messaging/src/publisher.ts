import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { Channel } from 'amqplib';
import type { EventEnvelope } from '@fintech/shared-events';
import { TOPOLOGY, declareTopology } from './topology';

/**
 * Options for customizing individual publish calls.
 */
export interface PublishOptions {
  /**
   * Override the routing key used to route this message on the topic exchange.
   * Default: the `routingKey` parameter passed to publish().
   * Usually you don't need this — it's here for edge cases (e.g., publishing to a specific queue directly).
   */
  routingKeyOverride?: string;

  /**
   * Additional AMQP message properties to merge with defaults.
   * Useful for setting message TTL, priority, or custom headers.
   *
   * @example
   * { expiration: '60000' } // Message expires after 60 seconds if not consumed
   */
  amqpOptions?: Record<string, unknown>;
}

/**
 * Typed AMQP publisher interface returned by createPublisher().
 */
export interface Publisher {
  /**
   * Publishes a typed EventEnvelope to the fintech.events topic exchange.
   *
   * The routingKey must match the event's `type` field (e.g., 'transfer.initiated').
   * Consumer queues bind to this exchange using routing key patterns (e.g., 'transfer.*').
   *
   * @param routingKey - The dot-notation routing key (maps to event type)
   * @param event      - The EventEnvelope to publish (use createEnvelope() to construct it)
   * @param options    - Optional publish customizations
   */
  publish<T>(routingKey: string, event: EventEnvelope<T>, options?: PublishOptions): Promise<void>;

  /**
   * Closes the publisher's channel wrapper.
   * Call during SIGTERM handling before closing the connection.
   */
  close(): Promise<void>;
}

/**
 * Creates a typed AMQP event publisher.
 *
 * ─── MESSAGE DURABILITY ───────────────────────────────────────────────────────
 * Every message is published with `persistent: true`. This tells RabbitMQ to
 * write the message to disk before acknowledging the publish. Without persistence:
 *   • A RabbitMQ restart between publish and consume → message is LOST FOREVER
 *   • A payment event that never reaches the ledger → silent data corruption
 *
 * The trade-off: disk write per message adds ~1ms latency. Acceptable for fintech.
 * Do NOT change this to false for performance — the correctness guarantee is required.
 *
 * ─── MESSAGE BUFFERING DURING DISCONNECTS ────────────────────────────────────
 * amqp-connection-manager's ChannelWrapper buffers publish() calls when the
 * connection is unavailable. When the connection is restored, buffered messages
 * are flushed in order. This means:
 *   • A brief RabbitMQ restart → no messages lost, no retry logic needed in services
 *   • A prolonged outage → the in-memory buffer has a finite size — monitor heap memory
 *
 * ─── CONTENT TYPE ────────────────────────────────────────────────────────────
 * Messages are serialized as JSON with contentType 'application/json'.
 * Consumers parse them with JSON.parse(msg.content.toString()).
 * Binary or Avro encoding would be more efficient but adds schema registry complexity
 * that's not justified for this platform's scale.
 *
 * @param connection - The AmqpConnectionManager from createMessagingConnection()
 * @returns Publisher instance with typed publish() method
 *
 * @example
 * import { createEnvelope } from '@fintech/shared-events';
 * import { createMessagingConnection, createPublisher } from '@fintech/shared-messaging';
 *
 * const connection = createMessagingConnection({ url: config.RABBITMQ_URL });
 * const publisher = createPublisher(connection);
 *
 * // Publish a transfer event
 * const event = createEnvelope('transfer.initiated', config.SERVICE_NAME, req.correlationId, {
 *   transferId: transfer.id,
 *   fromAccountId: transfer.fromAccountId,
 *   amountPaise: transfer.amountPaise,
 * });
 * await publisher.publish('transfer.initiated', event);
 */
export function createPublisher(connection: AmqpConnectionManager): Publisher {
  // Create a persistent channel wrapper dedicated to publishing.
  // The setup function is replayed automatically after each reconnection —
  // ensuring the exchange always exists before we try to publish to it.
  const channelWrapper: ChannelWrapper = connection.createChannel({
    json: false, // We serialize manually for explicit type control
    setup: async (channel: Channel): Promise<void> => {
      await declareTopology(channel);
    },
  });

  return {
    async publish<T>(
      routingKey: string,
      event: EventEnvelope<T>,
      options: PublishOptions = {},
    ): Promise<void> {
      const effectiveRoutingKey = options.routingKeyOverride ?? routingKey;

      // Serialize to Buffer explicitly — gives us full control over encoding
      const content = Buffer.from(JSON.stringify(event), 'utf-8');

      await channelWrapper.publish(TOPOLOGY.EVENTS_EXCHANGE, effectiveRoutingKey, content, {
        // Survive RabbitMQ restarts — critical for financial events
        persistent: true,

        // Content metadata — helps consumers decode correctly without guessing
        contentType: 'application/json',
        contentEncoding: 'utf-8',

        // Propagate correlation ID as a standard AMQP header for trace continuity
        // Some tracing systems (Jaeger, Zipkin) read this header automatically
        headers: {
          'x-correlation-id': event.correlationId,
          'x-producer': event.producer,
          'x-event-version': event.version,
        },

        // Spread any additional caller-specified options (TTL, priority, etc.)
        ...options.amqpOptions,
      });
    },

    async close(): Promise<void> {
      await channelWrapper.close();
    },
  };
}
