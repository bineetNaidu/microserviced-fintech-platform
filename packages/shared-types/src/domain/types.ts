/** 26-character time-sortable alphanumeric unique identifier string */
export type ULID = string;

/** Standard UUID v4 identification string */
export type UUID = string;

/**
 * Branded nominal type enforcing strict integer-only monetary values in Paise (₹ × 100).
 *
 * WHY BRANDED?
 * TypeScript's structural type system treats `number` and `Paise` as the same without
 * branding. The `__brand` phantom property makes them structurally incompatible, so a
 * function that accepts `Paise` will refuse a raw `number` at compile time. This prevents
 * the single most dangerous fintech bug: silently passing a floating-point rupee value
 * where an integer paise value is expected.
 *
 * CORRECT:   toPaise(50000)    → ₹500.00 stored as integer 50000 paise ✓
 * INCORRECT: 499.99 as Paise   → TypeScript compile error ✓ (caught before runtime)
 * INCORRECT: toPaise(499.99)   → RangeError thrown at runtime ✓ (caught before DB write)
 *
 * ARITHMETIC NOTE:
 * Always perform arithmetic in paise, never rupees. Only convert to rupees at the
 * presentation layer (e.g., `amount / 100` for display).
 */
export type Paise = number & { readonly __brand: 'Paise' };

/**
 * Safe runtime constructor for the Paise branded type.
 * Validates that the value is a finite, non-negative safe integer before branding it.
 *
 * A "safe integer" is any integer in the range [-(2^53 - 1), (2^53 - 1)] — the range
 * JavaScript can represent without floating-point precision loss. Numbers outside this
 * range can silently round to the nearest representable value, corrupting monetary data.
 *
 * @param value - The raw integer paise value to brand (e.g., 50000 for ₹500.00)
 * @throws {RangeError} if value is not finite, not a safe integer, or negative
 *
 * @example
 * const amount = toPaise(50000); // ₹500.00 — OK
 * toPaise(499.99);               // throws RangeError — floating point rejected
 * toPaise(-100);                 // throws RangeError — negative money rejected
 * toPaise(Number.MAX_SAFE_INTEGER + 1); // throws RangeError — unsafe integer rejected
 */
export function toPaise(value: number): Paise {
  if (!Number.isFinite(value)) {
    throw new RangeError(`toPaise: value must be a finite number, received: ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `toPaise: value must be a safe integer with no decimal component, received: ${value}. ` +
        `Remember to store amounts in paise (e.g., ₹500 → 50000), not rupees.`,
    );
  }
  if (value < 0) {
    throw new RangeError(
      `toPaise: monetary amounts must be non-negative, received: ${value}. ` +
        `Use a DEBIT entry direction to represent a subtraction from an account.`,
    );
  }
  return value as Paise;
}

/** Supported ISO 4217 Currency Parameter Tokens */
export const SupportedCurrency = {
  INR: 'INR',
  USD: 'USD',
  EUR: 'EUR',
} as const;

export type CurrencyType = (typeof SupportedCurrency)[keyof typeof SupportedCurrency];
