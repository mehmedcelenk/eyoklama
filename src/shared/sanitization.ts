/**
 * HTML Sanitization Utility
 * Vibecoding-Safe Native DOM Architecture
 * Pure, side-effect-free, DOM-independent XSS prevention
 */

/**
 * Escapes unsafe HTML characters to prevent XSS injection.
 * Safely handles null, undefined, and non-string values.
 *
 * @param v Value to sanitize
 * @returns Escaped safe HTML string
 */
export function escapeHtml(v: string | number | null | undefined): string {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
