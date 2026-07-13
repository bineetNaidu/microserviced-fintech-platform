import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgDatabase, NodePgTransaction } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export type TransactionContext = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/**
 * InboxRepository tracks consumed event IDs to guarantee exactly-once processing (ADR-011).
 */
export class InboxRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  private getDb(tx?: TransactionContext) {
    return tx || this.db;
  }

  /**
   * Attempts to insert a processed message ID.
   * Returns true on success, or false if the message has already been processed (unique constraint violation).
   */
  async insertMessage(
    eventId: string,
    eventType: string,
    tx?: TransactionContext,
  ): Promise<boolean> {
    try {
      await this.getDb(tx).insert(schema.inboxMessages).values({
        id: eventId,
        eventType,
      });
      return true;
    } catch (error) {
      // pg unique constraint violation code
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        return false;
      }
      throw error;
    }
  }
}
