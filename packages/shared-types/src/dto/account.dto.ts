import type { Account, AccountType } from '../domain/account';
import type { CurrencyType } from '../domain/types';

/**
 * Data Transfer Object utilized when initializing a new financial account configuration rule record.
 */
export interface CreateAccountRequestDto {
  /** * Unique identification string reference of the user profile owning this account.
   * NOTE: Downstream creation routes must verify this ownership via the Gateway-injected
   * header `X-User-ID`, matching it against the authenticated session context.
   */
  userId: string;

  /** Categorizes the operational intent and rule constraints of the account (e.g., CHECKING, SAVINGS) */
  type: AccountType;

  /** Strict ISO 4217 Currency Parameter mapping to enforce ledger settlement rules */
  currency: CurrencyType;
}

/**
 * Data Transfer Object returned upon successful account mutations.
 * Safe to expose full model since it outlines configuration boundaries, limits, and statuses
 * while explicitly storing no mutable balance or sensitive asset state information.
 */
export type AccountResponseDto = Account;
