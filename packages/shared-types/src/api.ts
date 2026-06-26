import type { StandardErrorPayload } from './errors';

export interface PaginationMeta {
  nextCursor: string | null; // ULID cursor
  hasMore: boolean;
}

// Base Generic Interface
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  meta: PaginationMeta | null;
  error: StandardErrorPayload | null;
}

// Discriminated Union Helpers for strict type narrowing in frontend
export interface ApiSuccessResponse<T> extends ApiResponse<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiErrorResponse extends ApiResponse<null> {
  success: false;
  data: null;
  meta: null;
  error: StandardErrorPayload;
}
