/**
 * Turkish National ID (T.C. Kimlik Numarası) Validator
 * Vibecoding-Safe Native DOM Architecture
 * Shared Layer (Layer 0) - Pure functions with zero dependencies
 */

/**
 * Validates whether given string is a valid Turkish Citizenship ID (T.C. Kimlik No).
 *
 * Algorithm Rules:
 * 1. Exactly 11 digits numeric string
 * 2. Cannot start with '0'
 * 3. 10th digit: ((Sum of odd-indexed digits 1,3,5,7,9 * 7) - (Sum of even-indexed digits 2,4,6,8)) % 10
 * 4. 11th digit: Sum of first 10 digits % 10
 */
export function isValidTcNumber(tc: string | null | undefined): boolean {
  if (!tc) return false;
  const clean = tc.trim();
  if (!/^[1-9]\d{10}$/.test(clean)) {
    return false;
  }

  const digits = clean.split('').map(Number);
  const d = digits;

  const oddSum = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const evenSum = d[1]! + d[3]! + d[5]! + d[7]!;

  const digit10 = ((oddSum * 7 - evenSum) % 10 + 10) % 10;
  if (d[9] !== digit10) {
    return false;
  }

  const sum10 = digits.slice(0, 10).reduce((acc, curr) => acc + curr, 0);
  const digit11 = sum10 % 10;
  if (d[10] !== digit11) {
    return false;
  }

  return true;
}

/**
 * Sanitizes TC input by stripping all non-digits and truncating to max 11 chars.
 */
export function sanitizeTc(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/\D/g, '').slice(0, 11);
}
