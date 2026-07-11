/**
 * Cursor-based pagination utilities for high-volume read endpoints.
 *
 * ─── WHY CURSOR PAGINATION OVER OFFSET PAGINATION ────────────────────────────
 * Offset pagination (LIMIT 20 OFFSET 100) has two critical flaws at scale:
 *
 * PERFORMANCE PROBLEM:
 *   PostgreSQL must scan through and discard OFFSET rows before returning results.
 *   "Give me page 500 of 20 items" → Postgres scans 10,000 rows internally.
 *   At millions of records, this becomes a full-table scan on every paginated request.
 *   O(N) cost per page, where N grows indefinitely with data volume.
 *
 * CONSISTENCY PROBLEM (critical for financial ledgers):
 *   If a new transaction is inserted between page 1 and page 2 fetches, all rows
 *   shift by one position. The first item on page 2 is now the last item of page 1.
 *   The user gets duplicate rows — or worse, SKIPS a ledger entry. In a financial
 *   context, skipping a ledger entry is a compliance violation.
 *
 * CURSOR PAGINATION (KEYSET PAGINATION):
 *   Instead of "skip N rows", we use "give me rows WHERE id > last_seen_id".
 *   Since ULID IDs are time-sortable and always indexed, this is an O(log N) index
 *   seek — constant-time regardless of how deep into the dataset you paginate.
 *   New insertions don't affect existing cursor positions.
 *
 * ─── HOW IT WORKS IN PRACTICE ────────────────────────────────────────────────
 * 1. Client makes first request (no cursor): GET /v1/transfers?limit=20
 * 2. Server returns 20 items + the ULID of the last item encoded as `nextCursor`
 * 3. Client makes next request: GET /v1/transfers?limit=20&cursor=<base64url>
 * 4. Server decodes cursor → ULID, returns WHERE id > ULID LIMIT 20
 * 5. When the server returns fewer than `limit` items, there are no more pages.
 *
 * ─── CURSOR FORMAT ───────────────────────────────────────────────────────────
 * The cursor is base64url-encoded to:
 *   • Make it URL-safe (no +, /, = characters in query params)
 *   • Obscure the raw ULID (prevents clients from guessing/constructing cursors)
 *   • Provide a stable interface that can change internally without breaking clients
 */

/**
 * Encodes a ULID string into a base64url cursor token for HTTP query parameter transport.
 *
 * @param ulid - The ULID string of the LAST item in the current page
 * @returns A base64url-safe string to pass as `nextCursor` in the API response
 *
 * @example
 * const nextCursor = encodeCursor(items[items.length - 1].id);
 * return { items, nextCursor, hasMore: items.length === limit };
 */
export function encodeCursor(ulid: string): string {
  return Buffer.from(ulid, 'utf-8').toString('base64url');
}

/**
 * Decodes a base64url cursor token back to a ULID string.
 * Returns null if the cursor is malformed (invalid base64, wrong length, non-ULID chars).
 *
 * SECURITY NOTE:
 * Always validate that the decoded ULID actually exists in the database before using it
 * in a WHERE clause. An attacker could craft a valid-looking cursor pointing to a ULID
 * that belongs to another user's records. The calling service's repository layer must
 * enforce ownership/visibility checks AFTER cursor decoding.
 *
 * @param cursor - The base64url cursor string from the client's query parameter
 * @returns The decoded ULID string, or null if the cursor is invalid
 */
export function decodeCursor(cursor: string): string | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');

    // ULIDs are exactly 26 characters of Crockford Base32 ([0-9A-HJKMNP-TV-Z] case-insensitive)
    // This regex catches malformed cursors early before they reach the SQL layer.
    if (!/^[0-9A-Z]{26}$/i.test(decoded)) {
      return null;
    }

    return decoded;
  } catch {
    // Buffer.from() can throw on invalid base64 input
    return null;
  }
}

/**
 * Result of buildCursorWhereClause — contains the SQL fragment and its parameter array.
 */
export interface CursorClause {
  /** SQL WHERE fragment (empty string if no cursor, 'WHERE id > $N' if cursor provided) */
  sql: string;
  /** Positional parameters array to spread into the pg query call */
  params: string[];
}

/**
 * Builds a SQL WHERE clause fragment for cursor-based pagination on the `id` column.
 *
 * Returns empty sql + params when cursor is null (first page — no WHERE needed).
 * Returns `WHERE id > $N` when a cursor is provided (subsequent pages).
 *
 * @param cursor     - Decoded ULID cursor (from decodeCursor()), or null for first page
 * @param paramIndex - The $N index to use for the cursor parameter (default: 1)
 * @returns CursorClause with SQL fragment and parameters
 *
 * @example
 * // First page (cursor is null):
 * const { sql, params } = buildCursorWhereClause(null);
 * // sql = '', params = []
 * // → SELECT * FROM transfers ORDER BY id ASC LIMIT $1
 *
 * @example
 * // Subsequent pages:
 * const cursor = decodeCursor(req.query.cursor as string);
 * const { sql, params } = buildCursorWhereClause(cursor, 1);
 * // sql = 'WHERE id > $1', params = ['01JXYZ...']
 * // Full query: `SELECT * FROM transfers ${sql} ORDER BY id ASC LIMIT $2`
 * // Params: [...params, limit] = ['01JXYZ...', 20]
 *
 * @example
 * // With additional WHERE conditions (paramIndex shifts):
 * // 'SELECT * FROM transfers WHERE user_id = $1 AND id > $2 ORDER BY id ASC LIMIT $3'
 * const { sql, params } = buildCursorWhereClause(cursor, 2);
 * const result = await client.query(baseQuery + sql + ' ORDER BY id ASC LIMIT $3', [userId, ...params, limit]);
 */
export function buildCursorWhereClause(
  cursor: string | null,
  paramIndex: number = 1,
): CursorClause {
  if (!cursor) {
    return { sql: '', params: [] };
  }
  return {
    sql: `WHERE id > $${paramIndex}`,
    params: [cursor],
  };
}
