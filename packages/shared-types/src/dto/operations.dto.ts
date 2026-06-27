import type { UUID } from '../domain/types';

export type BlocklistType = 'IP_ADDRESS' | 'EMAIL_DOMAIN' | 'PAN_CARD' | 'BANK_ACCOUNT';

/**
 * Data Transfer Object utilized when modifying platform runtime configurations dynamically.
 * Updates are broadcasted over AMQP to alter downstream microservice memory caches instantly.
 */
export interface UpdateConfigDto {
  /** System configuration key identifier string (e.g., 'GLOBAL_TRANSFER_HALT', 'MAINTENANCE_MODE') */
  key: string;

  /** The new value string parameter to apply to the targeted configuration cell */
  value: string;

  /** The administrative User UUID tracking who executed the runtime adjustment */
  updatedBy: UUID;
}

/**
 * Data Transfer Object utilized to restrict high-risk or compromised identities at the cluster edge.
 */
export interface CreateBlocklistItemDto {
  /** Target classification filter type layer being enforced */
  type: BlocklistType;

  /** The explicit matching value string being restricted (e.g., a specific IP address, PAN, or email domain) */
  value: string;

  /** Descriptive compliance or forensic justification explaining the security rule triggered */
  reason: string;

  /** The administrative User UUID tracking who added the asset to the blocklist engine */
  createdBy: UUID;
}

/**
 * Standard HTTP response payload mapping returned when an operational modification is confirmed.
 */
export interface OperationsConfigResponseDto {
  success: boolean;
  data: {
    key: string;
    value: string;
  };
  meta: null;
  error: null;
}
