import type { Transfer } from '../domain/transfer';
import type { CurrencyType, Paise } from '../domain/types';

export interface InitiateTransferRequestDto {
  fromAccountId: string;
  toAccountId: string;
  amountPaise: Paise;
  currency: CurrencyType;
}

export type TransferStatusResponseDto = Transfer;
