import { describe, it, expect } from 'vitest';
import {
  dayKey,
  todayKey,
  pdfCleanDate,
  formatCardDate,
  formatCardTime,
  formatHistoryDay,
  getWeekDetails,
  getMonthDetails
} from '@shared/date';

describe('Date Utilities', () => {
  const d = '2026-10-08T14:30:00Z';

  it('preserves assertion 3: extracts YYYY-MM-DD dayKey in Istanbul timezone', () => {
    expect(dayKey(d)).toBe('2026-10-08');
  });

  it('preserves assertion 3: formats pdfCleanDate (DD.MM) in Istanbul timezone', () => {
    expect(pdfCleanDate(d)).toBe('08.10');
  });

  it('preserves assertion 3: todayKey returns valid YYYY-MM-DD date string', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('correctly shifts date across midnight into Europe/Istanbul timezone (UTC+3)', () => {
    // 2026-10-08 22:30:00 UTC is 2026-10-09 01:30:00 in Istanbul
    const lateUtc = '2026-10-08T22:30:00Z';
    expect(dayKey(lateUtc)).toBe('2026-10-09');
    expect(pdfCleanDate(lateUtc)).toBe('09.10');
  });

  it('formats formatCardDate to DD.MM.YY format in Istanbul timezone', () => {
    expect(formatCardDate(d)).toBe('08.10.26');
  });

  it('formats formatCardTime to HH:mm format in Istanbul timezone', () => {
    // 14:30 UTC -> 17:30 TRT (+3)
    expect(formatCardTime(d)).toBe('17:30');
  });

  it('formats formatHistoryDay with Turkish weekday, day, and month name', () => {
    const formatted = formatHistoryDay('2026-10-08');
    expect(formatted).toContain('8');
    expect(formatted).toContain('Ekim');
    expect(formatted).toContain('2026');
    expect(formatted.toLowerCase()).toContain('perşembe');
  });

  it('calculates getWeekDetails with monday start key and Turkish week label', () => {
    const week = getWeekDetails(d);
    expect(week.key).toBe('week-2026-10-05'); // Monday of that week
    expect(week.label).toContain('Hafta');
    expect(week.label).toContain('Eki');
  });

  it('calculates getMonthDetails with YYYY-MM key and Turkish month label', () => {
    const month = getMonthDetails(d);
    expect(month.key).toBe('month-2026-10');
    expect(month.label).toContain('Ekim');
    expect(month.label).toContain('2026');
  });
});
