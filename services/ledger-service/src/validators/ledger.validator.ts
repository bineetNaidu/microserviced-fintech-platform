import { z } from 'zod';

/**
 * Validator schema for individual entry line items.
 */
export const LedgerEntrySchema = z.object({
  accountId: z.string().length(26, { message: 'accountId must be a valid 26-character ULID' }),
  amountPaise: z.number().int().positive({ message: 'amountPaise must be a positive integer' }),
  direction: z.enum(['CREDIT', 'DEBIT'], {
    errorMap: () => ({ message: "Direction must be either 'CREDIT' or 'DEBIT'" }),
  }),
});

/**
 * Validator schema for creating a new double-entry transaction record.
 */
export const CreateLedgerTransactionSchema = z.object({
  referenceId: z.string().length(26, { message: 'referenceId must be a valid 26-character ULID' }),
  purpose: z.enum(['USER_TRANSFER', 'DEPOSIT', 'FEE', 'REVERSAL'], {
    errorMap: () => ({
      message: "Purpose must be one of: 'USER_TRANSFER', 'DEPOSIT', 'FEE', 'REVERSAL'",
    }),
  }),
  currency: z.enum(['INR', 'USD', 'EUR'], {
    errorMap: () => ({ message: "Currency must be one of: 'INR', 'USD', 'EUR'" }),
  }),
  entries: z.array(LedgerEntrySchema).min(2, {
    message: 'A ledger transaction must contain at least 2 entries (debit/credit legs)',
  }),
});
