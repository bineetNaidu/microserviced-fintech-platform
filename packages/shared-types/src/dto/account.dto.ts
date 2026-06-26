import type { Account, AccountType } from '../domain/account';
import type { CurrencyType } from '../domain/types';

export interface CreateAccountRequestDto {
  userId: string;
  type: AccountType;
  currency: CurrencyType;
}

export type AccountResponseDto = Account; // Safe to expose full model
