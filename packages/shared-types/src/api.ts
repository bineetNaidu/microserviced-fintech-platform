import type { StandardErrorPayload } from './errors';

/**
 * Standard cursor-based pagination tracking metadata payload.
 * Applied on high-volume read endpoints to prevent memory thrashing and query-layer slowdowns.
 */
export interface PaginationMeta {
  /** 26-character time-sortable alphanumeric ULID string pointing to the tail entry of the current batch */
  nextCursor: string | null;

  /** Boolean flag signaling to client apps if an additional segment of data rows remains unfetched */
  hasMore: boolean;
}

/**
 * Base Generic Matrix representing the unified structural interface returned across all platform HTTP routes.
 * NOTE: Prefer consuming the discriminated union variations (ApiSuccessResponse / ApiErrorResponse)
 * inside frontend applications to gain automatic type-narrowing.
 */
export interface ApiResponse<T = unknown> {
  /** Discriminator field tracking execution success status */
  success: boolean;

  /** Primary transactional data response payload packet */
  data: T | null;

  /** Structural cursor pagination parameters (null if endpoint reads a single entity resource) */
  meta: PaginationMeta | null;

  /** Unified error detail payload packet (null unless success evaluates to false) */
  error: StandardErrorPayload | null;
}

/**
 * Enforced Success Response Contract.
 * Guarantees that when success is true, the target data packet is populated and error properties evaluate to null.
 */
export interface ApiSuccessResponse<T> extends ApiResponse<T> {
  success: true;
  data: T;
  error: null;
}

/**
 * Enforced Error Response Contract.
 * Guarantees that when success is false, structural data/meta layers drop cleanly to null,
 * and the standard error telemetry object is fully populated.
 */
export interface ApiErrorResponse extends ApiResponse<null> {
  success: false;
  data: null;
  meta: null;
  error: StandardErrorPayload;
}
