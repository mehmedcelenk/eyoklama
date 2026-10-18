/**
 * Date and Time Formatting Utilities
 * Vibecoding-Safe Native DOM Architecture
 * Deterministic Istanbul timezone formatting (Europe/Istanbul)
 */

export interface WeekDetails {
  key: string;
  label: string;
}

export interface MonthDetails {
  key: string;
  label: string;
}

/**
 * Extracts YYYY-MM-DD date key in Europe/Istanbul timezone.
 *
 * @param iso ISO 8601 string or date representation
 * @returns YYYY-MM-DD formatted date string
 */
export function dayKey(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(iso));

  const get = (type: string): string => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Returns today's date key (YYYY-MM-DD) in Europe/Istanbul timezone.
 */
export function todayKey(): string {
  return dayKey(new Date().toISOString());
}

/**
 * Formats ISO date to DD.MM format in Europe/Istanbul timezone for PDF tables.
 */
export function pdfCleanDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit'
  }).formatToParts(new Date(iso));

  const d = parts.find((p) => p.type === 'day')?.value || '';
  const m = parts.find((p) => p.type === 'month')?.value || '';
  return `${d}.${m}`;
}

/**
 * Formats ISO timestamp to short card date (DD.MM.YY) in Europe/Istanbul timezone.
 */
export function formatCardDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'Europe/Istanbul'
  }).formatToParts(new Date(iso));

  const d = parts.find((p) => p.type === 'day')?.value || '';
  const m = parts.find((p) => p.type === 'month')?.value || '';
  const y = parts.find((p) => p.type === 'year')?.value || '';
  return `${d}.${m}.${y}`;
}

/**
 * Formats ISO timestamp to short card time (HH:mm) in Europe/Istanbul timezone.
 */
export function formatCardTime(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul'
  }).format(new Date(iso));
}

/**
 * Formats YYYY-MM-DD day key into human-readable Turkish date string.
 * Example: "8 Ekim 2026 Perşembe"
 */
export function formatHistoryDay(day: string): string {
  const [y, m, d] = String(day).split('-').map(Number);
  if (!y || !m || !d) return day;

  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(Date.UTC(y, m - 1, d, 9, 0, 0)));
}

/**
 * Calculates start/end dates and ISO week number for a given timestamp.
 */
export function getWeekDetails(iso: string): WeekDetails {
  const dt = new Date(iso);
  const dayOfWeek = (dt.getDay() + 6) % 7; // 0 = Monday, 6 = Sunday

  const mon = new Date(dt);
  mon.setDate(dt.getDate() - dayOfWeek);

  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const startDayStr = dayKey(mon.toISOString());
  const fStart = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(mon);
  const fEnd = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(sun);

  // ISO 8601 week calculation
  const target = new Date(dt.valueOf());
  const dayNr = (dt.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);

  return {
    key: `week-${startDayStr}`,
    label: `${fStart} – ${fEnd} (${weekNum}. Hafta)`
  };
}

/**
 * Calculates month key (YYYY-MM) and Turkish display label.
 */
export function getMonthDetails(iso: string): MonthDetails {
  const dt = new Date(iso);
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const monthStr = `${y}-${String(m).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(dt);

  return {
    key: `month-${monthStr}`,
    label
  };
}
