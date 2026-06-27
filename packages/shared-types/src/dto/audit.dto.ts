export type AuditActorType = 'CUSTOMER' | 'ADMIN' | 'SYSTEM_SERVICE' | 'API_GATEWAY';
export type AuditLogStatus = 'SUCCESS' | 'FAILURE' | 'SUSPICIOUS';

/**
 * Data Transfer Object for appending data to the immutable Compliance and Forensic Logger.
 * Captures user actions, administrative overrides, and system access anomalies.
 */
export interface CreateAuditLogDto {
  /** Global transaction trace identifier propagated across microservice network boundaries */
  correlationId: string;

  /** Identifies the entity initiating the action (maps to User UUID, Admin ID, or 'SYSTEM') */
  actorId: string;

  /** Categorizes the origin entity type to optimize administrative risk indexing */
  actorType: AuditActorType;

  /** Descriptive dot-notation action identifier string (e.g., 'auth.login_failed', 'limit.elevated') */
  actionName: string;

  /** The security or functional outcome of the attempted action loop */
  status: AuditLogStatus;

  /** Client IP address captured at the API Gateway edge for geographic auditing */
  ipAddress: string | null;

  /** Complete HTTP user agent string identifying the browser or runtime platform profile */
  userAgent: string | null;

  /** Captured state snapshot *before* the mutation was executed (useful for rollback audits) */
  oldState: Record<string, unknown> | null;

  /** Captured state snapshot *after* the mutation was successfully written */
  newState: Record<string, unknown> | null;

  /** Arbitrary metadata parameters providing extended compliance tracking details */
  metadata: Record<string, unknown> | null;
}

/**
 * Standard HTTP structural response returned when an audit payload is acknowledged.
 */
export interface AuditLogResponseDto {
  success: boolean;
  data: {
    /** 26-character time-sortable alphanumeric audit row identifier */
    auditLogId: string;
  };
  meta: null;
  error: null;
}
