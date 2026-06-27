import type { Transfer } from '../domain/transfer';
import type { CurrencyType, Paise } from '../domain/types';

/**
 * Data Transfer Object submitted by authenticated clients to initialize a distributed fund movement.
 * NOTE: The matching `userId` ownership check is intercepted and verified out-of-band at the API Gateway
 * layer by validating the session JWT claims and injecting a trusted `X-User-ID` header downstream.
 */
export interface InitiateTransferRequestDto {
  /** 26-character time-sortable alphanumeric unique primary identifier of the source financial account */
  fromAccountId: string;

  /** 26-character time-sortable alphanumeric unique primary identifier of the destination recipient account */
  toAccountId: string;

  /** Strict 64-bit signed integer representing the raw transaction volume in the lowest fraction parameter (Paise) */
  amountPaise: Paise;

  /** ISO 4217 Currency specification parameter used to enforce matching asset rules cross-ledger */
  currency: CurrencyType;
}

/**
 * Data Transfer Object returned when fetching synchronous transactional state tracking logs.
 * Maps directly to the underlying domain Transfer state machine record to preserve contract alignment.
 */
export type TransferStatusResponseDto = Transfer;
