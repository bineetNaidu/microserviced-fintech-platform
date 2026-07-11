import amqp, { type AmqpConnectionManager } from 'amqp-connection-manager';

/**
 * Configuration for the AMQP connection factory.
 */
export interface MessagingConnectionOptions {
  /**
   * RabbitMQ connection URL.
   * Format: amqp://user:password@host:5672/vhost
   * Example: amqp://fintech:secret@rabbitmq:5672/
   *
   * For production, use a connection string stored in the RABBITMQ_URL environment variable.
   * Do NOT hardcode credentials here.
   */
  url: string;

  /**
   * Interval in seconds between reconnection attempts.
   * @default 5
   */
  reconnectTimeInSeconds?: number;

  /**
   * Heartbeat interval in seconds — detects dead TCP connections.
   * RabbitMQ closes connections that miss heartbeats.
   * @default 10
   */
  heartbeatIntervalInSeconds?: number;
}

/**
 * Creates a managed AMQP connection using amqp-connection-manager.
 *
 * ─── WHY amqp-connection-manager OVER RAW amqplib ────────────────────────────
 * Raw amqplib requires you to manually handle connection failures:
 *   • The 'error' event on Connection/Channel must be caught or the process crashes
 *   • The 'close' event means you must re-declare all exchanges, queues, and bindings
 *   • Reconnection logic requires exponential backoff with jitter to avoid thundering herd
 *   • Channels that existed before reconnect are invalid and must be recreated
 *
 * This is ~200 lines of error-prone reconnection logic that you must write, test,
 * and maintain for every service. amqp-connection-manager does all of this automatically:
 *   ✓ Auto-reconnects with configurable retry interval
 *   ✓ Replays channel setup functions (exchange/queue assertions) after reconnect
 *   ✓ Buffers published messages during disconnects and flushes on reconnect
 *   ✓ Fires 'connect' and 'disconnect' events for observability hooks
 *
 * ─── HEARTBEAT ────────────────────────────────────────────────────────────────
 * TCP connections can appear "alive" at the OS level while actually being dead
 * (e.g., firewall dropped the connection silently). Heartbeats are small periodic
 * frames sent between client and server. If N heartbeat periods pass without response,
 * both sides close the connection and the client triggers a reconnect.
 *
 * Without heartbeats, a dead connection might not be detected for minutes — during
 * which time published messages are silently dropped.
 *
 * ─── USAGE ────────────────────────────────────────────────────────────────────
 * ```typescript
 * import { createMessagingConnection } from '@fintech/shared-messaging';
 *
 * const connection = createMessagingConnection({ url: config.RABBITMQ_URL });
 *
 * // Optional: log connection lifecycle events for observability
 * connection.on('connect', () => console.log('RabbitMQ connected'));
 * connection.on('disconnect', (err) => console.error('RabbitMQ disconnected', err));
 *
 * // Pass connection to createPublisher() and createConsumer()
 * const publisher = createPublisher(connection);
 * const consumer = createConsumer(connection, 'transfer-service.transfer.initiated', handler);
 *
 * // On SIGTERM — close gracefully
 * process.on('SIGTERM', async () => { await connection.close(); });
 * ```
 *
 * @param options - Connection configuration (URL, heartbeat, reconnect intervals)
 * @returns A managed AmqpConnectionManager instance
 */
export function createMessagingConnection(
  options: MessagingConnectionOptions,
): AmqpConnectionManager {
  const { url, reconnectTimeInSeconds = 5, heartbeatIntervalInSeconds = 10 } = options;

  const connection = amqp.connect([url], {
    heartbeatIntervalInSeconds,
    reconnectTimeInSeconds,
  });

  return connection;
}
