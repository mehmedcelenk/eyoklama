import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@shared/sanitization';
import { generateMemorablePin } from '@shared/pin';
import { parseCSV } from '@shared/csv';
import {
  dayKey,
  todayKey,
  pdfCleanDate,
  formatCardDate,
  formatCardTime
} from '@shared/date';

describe('Adversarial Stress Test: escapeHtml', () => {
  it('handles null, undefined, and empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('handles nested quotes and backticks', () => {
    const input = `'single' and "double" and \`backtick\` and "'nested'"`;
    const escaped = escapeHtml(input);
    expect(escaped).toBe(
      '&#039;single&#039; and &quot;double&quot; and `backtick` and &quot;&#039;nested&#039;&quot;'
    );
  });

  it('escapes common XSS script payloads', () => {
    const payloads = [
      '<script>alert("xss")</script>',
      '<IMG SRC=javascript:alert(\'XSS\')>',
      '<svg/onload=alert(1)>',
      '"><script>alert(1)</script>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<<SCRIPT>alert("XSS");//<</SCRIPT>'
    ];

    for (const p of payloads) {
      const out = escapeHtml(p);
      expect(out).not.toContain('<script');
      expect(out).not.toContain('<IMG');
      expect(out).not.toContain('<svg');
      expect(out).not.toContain('<iframe');
      expect(out).not.toContain('<');
      expect(out).not.toContain('>');
      expect(out).not.toContain('"');
    }
  });

  it('preserves multi-byte Unicode and Turkish characters', () => {
    const input = 'ĞğÜüŞşİıÖöÇç 🚀 🎉 漢字 العربية \u200B';
    const escaped = escapeHtml(input);
    expect(escaped).toBe('ĞğÜüŞşİıÖöÇç 🚀 🎉 漢字 العربية \u200B');
  });

  it('handles numeric and zero values correctly', () => {
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(-10)).toBe('-10');
  });

  it('handles large strings efficiently (100k characters)', () => {
    const large = '<div class="test">&copy;</div>'.repeat(3000); // ~90k chars
    const start = performance.now();
    const result = escapeHtml(large);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100); // under 100ms
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });
});

describe('Adversarial Stress Test: generateMemorablePin', () => {
  it('strictly generates 6 digits, never 000000 or 111111 over 10,000 iterations', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 10000; i++) {
      const pin = generateMemorablePin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(pin.length).toBe(6);
      expect(pin).not.toBe('000000');
      expect(pin).not.toBe('111111');
      expect(pin).not.toContain('undefined');
      expect(pin).not.toContain('NaN');
      counts.set(pin, (counts.get(pin) || 0) + 1);
    }

    // Verify entropy / diversity
    expect(counts.size).toBeGreaterThan(40);
  });

  it('only generates digits from 1 to 9 (no zeroes)', () => {
    for (let i = 0; i < 1000; i++) {
      const pin = generateMemorablePin();
      for (const ch of pin) {
        const d = Number(ch);
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(9);
      }
    }
  });
});

describe('Adversarial Stress Test: parseCSV', () => {
  it('handles empty and whitespace-only inputs', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('   ')).toEqual([]);
    expect(parseCSV('\n\n\r\n')).toEqual([]);
  });

  it('handles RFC-4180 escaped quotes inside quoted fields', () => {
    const csv = '"a""b","c""d""e"\n"f","g"';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['a"b', 'c"d"e'],
      ['f', 'g']
    ]);
  });

  it('handles RFC-4180 field that is just a single escaped quote', () => {
    const csv = '""""';
    const result = parseCSV(csv);
    expect(result).toEqual([['"']]);
  });

  it('handles newlines inside quoted fields', () => {
    const csv = '"line 1\nline 2","col 2"\n"row 2","val 2"';
    const result = parseCSV(csv);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual(['line 1\nline 2', 'col 2']);
    expect(result[1]).toEqual(['row 2', 'val 2']);
  });

  it('handles mixed CRLF, LF, and CR line endings', () => {
    const csv = 'a,b\r\nc,d\ne,f\rg,h';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h']
    ]);
  });

  it('handles trailing comma on a row', () => {
    const csv = 'a,b,\nc,d,';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['a', 'b', ''],
      ['c', 'd', '']
    ]);
  });

  it('handles leading and consecutive commas', () => {
    const csv = ',b,,\n,,c,';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['', 'b', '', ''],
      ['', '', 'c', '']
    ]);
  });

  it('handles single-column rows without delimiters', () => {
    const csv = 'Alice\nBob\nCharlie';
    const result = parseCSV(csv);
    expect(result).toEqual([['Alice'], ['Bob'], ['Charlie']]);
  });

  it('handles semicolon delimiter with quotes', () => {
    const csv = '"Ali; Demir";"Veli; Can"\n"1";"2"';
    const result = parseCSV(csv);
    expect(result).toEqual([
      ['Ali; Demir', 'Veli; Can'],
      ['1', '2']
    ]);
  });

  it('tests delimiter collision: commas vs semicolons inside quoted fields', () => {
    // If the file is comma-delimited, but a quoted field in line 1 contains multiple semicolons:
    const csv = '"John; Jr; III",Doe\nJane,Smith';
    const result = parseCSV(csv);
    console.log('Delimiter collision result:', result);
  });
});

describe('Adversarial Stress Test: date.ts', () => {
  it('correctly handles Istanbul timezone (UTC+3) exact midnight cutoffs', () => {
    // 2026-10-08 20:59:59.999 UTC is 2026-10-08 23:59:59.999 in Istanbul
    const beforeMidnight = '2026-10-08T20:59:59.999Z';
    expect(dayKey(beforeMidnight)).toBe('2026-10-08');
    expect(pdfCleanDate(beforeMidnight)).toBe('08.10');

    // 2026-10-08 21:00:00.000 UTC is 2026-10-09 00:00:00.000 in Istanbul
    const exactMidnight = '2026-10-08T21:00:00.000Z';
    expect(dayKey(exactMidnight)).toBe('2026-10-09');
    expect(pdfCleanDate(exactMidnight)).toBe('09.10');
    expect(formatCardTime(exactMidnight)).toBe('00:00');
  });

  it('formats formatCardDate correctly across year boundary', () => {
    const newYearEve = '2026-12-31T21:00:00.000Z'; // 2027-01-01 00:00 Istanbul
    expect(formatCardDate(newYearEve)).toBe('01.01.27');
    expect(dayKey(newYearEve)).toBe('2027-01-01');
  });

  it('maintains consistent UTC+3 Europe/Istanbul behavior across DST transition days in other regions', () => {
    // 2026-03-29: EU Daylight Saving changeover
    // In Istanbul (UTC+3, no DST change):
    // 2026-03-29 00:30 UTC -> 03:30 Istanbul
    // 2026-03-29 21:30 UTC -> 2026-03-30 00:30 Istanbul
    const d1 = '2026-03-29T00:30:00.000Z';
    expect(dayKey(d1)).toBe('2026-03-29');
    expect(pdfCleanDate(d1)).toBe('29.03');
    expect(formatCardDate(d1)).toBe('29.03.26');
    expect(formatCardTime(d1)).toBe('03:30');

    const d2 = '2026-03-29T21:30:00.000Z';
    expect(dayKey(d2)).toBe('2026-03-30');
    expect(pdfCleanDate(d2)).toBe('30.03');
    expect(formatCardDate(d2)).toBe('30.03.26');
    expect(formatCardTime(d2)).toBe('00:30');

    // 2026-10-25: EU Winter changeover
    // 2026-10-25 21:00 UTC -> 2026-10-26 00:00 Istanbul
    const d3 = '2026-10-25T21:00:00.000Z';
    expect(dayKey(d3)).toBe('2026-10-26');
    expect(pdfCleanDate(d3)).toBe('26.10');
    expect(formatCardDate(d3)).toBe('26.10.26');
    expect(formatCardTime(d3)).toBe('00:00');
  });

  it('guarantees todayKey matches dayKey of current instant in Istanbul', () => {
    const tk = todayKey();
    const expected = dayKey(new Date().toISOString());
    expect(tk).toBe(expected);
    expect(tk).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
