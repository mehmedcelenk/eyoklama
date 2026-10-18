/**
 * String and Data Formatting Utilities
 * Vibecoding-Safe Native DOM Architecture
 * Pure, side-effect-free, DOM-independent formatting
 */

export interface StudentNameInput {
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Combines first and last name, collapsing duplicate spaces and trimming outer whitespace.
 *
 * @param s Student name container
 * @returns Clean combined full name string
 */
export function fullName(s: StudentNameInput | null | undefined): string {
  if (!s) return '';
  const first = s.firstName || '';
  const last = s.lastName || '';
  return `${first} ${last}`.replace(/\s+/g, ' ').trim();
}

/**
 * Returns formatted display name: full name if showFirstName is true, or only last name if false.
 */
export function displayName(s: StudentNameInput | null | undefined, showFirstName: boolean = true): string {
  if (!s) return '';
  if (showFirstName) return fullName(s);
  const last = (s.lastName || '').trim();
  return last || fullName(s);
}

/**
 * Strips leading dash/underscore punctuation and normalizes class name spacing.
 */
export function cleanListName(name: string | null | undefined): string {
  if (!name) return 'Ders';
  let cleaned = name.replace(/^[\s\-–—_]+/, '').trim();
  cleaned = cleaned.replace(/([A-ZÇĞİÖŞÜa-zçğıöşü]+)\s*(\d+)/gi, '$1 $2');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || 'Ders';
}

/**
 * Sanitizes a string for safe filesystem filename generation.
 */
export function safeFileName(v: string | null | undefined): string {
  return String(v || 'yoklama').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
}

/**
 * Converts Turkish string to title case (e.g. "ahmet yılmaz" -> "Ahmet Yılmaz").
 */
export function formatTitleCaseTR(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : ''))
    .join(' ');
}

/**
 * Normalizes student name and key for cross-session deduplication.
 */
export function normalizeStudentKey(firstName?: string, lastName?: string, _studentId?: string): string {
  const fn = (firstName || '')
    .normalize('NFC')
    .replace(/[\u00a0\u180e\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');
  const ln = (lastName || '')
    .normalize('NFC')
    .replace(/[\u00a0\u180e\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');

  let full = `${fn} ${ln}`.trim().replace(/\s+/g, ' ');
  full = full.replace(/\bMAHMUD\b/gi, 'MAHMUT').replace(/\bMEHMED\b/gi, 'MEHMET');
  return full;
}

/**
 * Normalizes text for Turkish search matching (case-insensitive, trims extra whitespace).
 */
export function normalizeSearchText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .normalize('NFC')
    .replace(/[\u00a0\u180e\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

/**
 * Formats ISO timestamp to localized medium date and short time string.
 */
export function fmt(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
