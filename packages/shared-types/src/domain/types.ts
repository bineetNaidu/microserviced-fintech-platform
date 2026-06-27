/** 26-character time-sortable alphanumeric unique identifier string */
export type ULID = string;

/** Standard UUID v4 identification string */
export type UUID = string;

/** * Strict 64-bit signed integer representing the lowest currency unit fraction.
 * For INR, this maps to absolute values in Paise (e.g., ₹1.00 = 100 paise).
 * Using integers completely eliminates floating-point rounding errors.
 */
export type Paise = number;

/** Supported ISO 4217 Currency Parameter Tokens */
export const SupportedCurrency = {
  INR: 'INR',
  USD: 'USD',
  EUR: 'EUR',
} as const;

export type CurrencyType = (typeof SupportedCurrency)[keyof typeof SupportedCurrency];
