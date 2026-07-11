import { ulid } from 'ulid';
import type { EventEnvelope } from './envelope';

/**
 * Factory function for constructing correctly-populated, type-safe event envelopes.
 *
 * ─── WHY USE THIS FACTORY? ───────────────────────────────────────────────────
 * Manually constructing an EventEnvelope object risks:
 *   1. Forgetting required fields (id, version, timestamp) → runtime crashes in consumers
 *   2. Using wrong timestamp format (Date instead of string) → serialization bug
 *   3. Generating non-time-sortable IDs (using UUID instead of ULID) → broken event ordering
 *   4. Hardcoding version as a magic number → version drift across services
 *
 * This factory enforces correct construction every time. Use it exclusively.
 * Do NOT construct EventEnvelope objects manually in service code.
 *
 * ─── WHAT IS ULID? ────────────────────────────────────────────────────────────
 * ULID (Universally Unique Lexicographically Sortable Identifier) is a 26-character
 * string that encodes both a millisecond timestamp and random entropy. Unlike UUID v4,
 * ULIDs sort chronologically — the first event ALWAYS has a lexicographically smaller
 * ID than the second event. This is critical for event ordering in the ledger.
 *
 * @param type        - Dot-notation event type (e.g., 'transfer.initiated')
 * @param producer    - The SERVICE_NAME of the emitting service (e.g., 'transfer-service')
 * @param correlationId - The OpenTelemetry trace ID from req.correlationId
 * @param data        - The strongly-typed event payload
 * @returns A fully populated, serialization-safe EventEnvelope<T>
 *
 * @example
 * // In transfer-service publisher:
 * import { createEnvelope } from '@fintech/shared-events';
 *
 * const event = createEnvelope(
 *   'transfer.initiated',
 *   config.SERVICE_NAME,
 *   req.correlationId,
 *   {
 *     transferId: transfer.id,
 *     fromAccountId: transfer.fromAccountId,
 *     toAccountId: transfer.toAccountId,
 *     amountPaise: transfer.amountPaise,
 *     currency: transfer.currency,
 *     idempotencyKey: transfer.idempotencyKey,
 *   },
 * );
 * await publisher.publish('transfer.initiated', event);
 */
export function createEnvelope<T>(
  type: string,
  producer: string,
  correlationId: string,
  data: T,
): EventEnvelope<T> {
  return {
    id: ulid(), // Time-sortable unique ID — see ULID comment above
    type,
    correlationId,
    timestamp: new Date().toISOString(), // Always ISO 8601 string, never Date object
    version: 1, // Current schema version — bump on breaking data shape changes
    producer,
    data,
  };
}
