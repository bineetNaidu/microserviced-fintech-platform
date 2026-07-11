import type { Pool, PoolClient } from 'pg';

/**
 * Executes a callback function inside a PostgreSQL transaction with automatic COMMIT/ROLLBACK.
 *
 * ─── WHEN TO USE THIS vs DRIZZLE'S db.transaction() ─────────────────────────
 * Drizzle ORM has a built-in `db.transaction(callback)` method that is schema-aware
 * and preferred for most use cases in services. Use `withTransaction` when you need to:
 *
 *   1. Mix raw SQL (client.query) and Drizzle queries in the same transaction
 *   2. Execute DDL statements (CREATE TABLE, ALTER COLUMN) within a transaction
 *   3. Use a specific isolation level that Drizzle doesn't expose easily
 *   4. Work at the pool level before a Drizzle instance is available (e.g., migrations)
 *
 * For regular service CRUD operations, use Drizzle's `db.transaction()` instead.
 *
 * ─── TRANSACTION ISOLATION LEVELS ────────────────────────────────────────────
 * PostgreSQL default isolation level is READ COMMITTED. For financial operations,
 * consider REPEATABLE READ or SERIALIZABLE to prevent phantom reads.
 *
 * SERIALIZABLE is required for balance checks + debit operations to prevent the
 * "double spend" race condition (two concurrent transfers both reading the same balance
 * and both thinking there are sufficient funds):
 *
 * ```typescript
 * await withTransaction(pool, async (client) => {
 *   await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
 *   const { rows } = await client.query('SELECT balance FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
 *   const balance = rows[0].balance;
 *   if (balance < amount) throw new InsufficientFundsError();
 *   await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, accountId]);
 * });
 * ```
 *
 * The `FOR UPDATE` row lock + SERIALIZABLE isolation together prevent concurrent transfers
 * from both succeeding when only one should. This is the correct pattern for the
 * Transfer and Ledger services.
 *
 * ─── ERROR BEHAVIOR ───────────────────────────────────────────────────────────
 * If the callback throws ANY error:
 *   1. The transaction is rolled back (all mutations reverted atomically)
 *   2. The original error is re-thrown for the caller to handle
 *   3. The pool client is ALWAYS released (even if rollback itself fails)
 *
 * The caller (controller or use-case) is responsible for catching the error
 * and returning the appropriate HTTP response.
 *
 * @param pool - The pg.Pool to acquire a transaction client from
 * @param fn   - Async callback that receives the transaction client and returns a value
 * @returns    - The value returned by the callback (committed data)
 * @throws     - Re-throws the callback error after rolling back the transaction
 *
 * @example
 * // Atomic transfer debit + credit
 * const result = await withTransaction(pool, async (client) => {
 *   await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
 *   await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
 *   const { rows } = await client.query('INSERT INTO ledger_entries ...');
 *   return rows[0];
 * });
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  // Acquire a dedicated client from the pool for this transaction.
  // This ensures all queries in the callback share the same database connection,
  // which is required for transactions (each connection has its own transaction state).
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await fn(client);

    await client.query('COMMIT');
    return result;
  } catch (error: unknown) {
    // Attempt to roll back all mutations from this transaction.
    // If rollback itself fails (e.g., network dropped mid-transaction), log
    // the rollback failure separately — the original error is still re-thrown.
    await client.query('ROLLBACK').catch((rollbackErr: unknown) => {
      const rollbackLog = JSON.stringify({
        level: 'fatal',
        msg: 'TRANSACTION_ROLLBACK_FAILED',
        note: 'The database may be in an inconsistent state. Manual intervention may be required.',
        rollbackError:
          rollbackErr instanceof Error
            ? { message: rollbackErr.message }
            : { message: String(rollbackErr) },
        timestamp: new Date().toISOString(),
      });
      process.stderr.write(rollbackLog + '\n');
    });

    // Re-throw the ORIGINAL error (not the rollback error) to the caller.
    // The original error contains the domain context (e.g., InsufficientFundsError).
    throw error;
  } finally {
    // ALWAYS release the client back to the pool, regardless of success or failure.
    // A leaked client (never released) starves the pool — other requests time out
    // waiting for a connection that never returns. This is one of the most common
    // and hardest-to-diagnose production database bugs.
    client.release();
  }
}
