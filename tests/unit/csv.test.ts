import { describe, it, expect } from 'vitest';
import { parseCSV } from '@shared/csv';

describe('CSV Parser Utility (parseCSV)', () => {
  it('preserves assertion 5: parses comma-separated values', () => {
    const csv1 = 'Ahmet,Yılmaz\nMehmet,Kaya';
    const parsed1 = parseCSV(csv1);
    expect(parsed1.length).toBe(2);
    expect(parsed1[0]).toEqual(['Ahmet', 'Yılmaz']);
    expect(parsed1[1]).toEqual(['Mehmet', 'Kaya']);
  });

  it('preserves assertion 5: parses semicolon-separated values', () => {
    const csv2 = 'Ali;Demir\nVeli;Şahin';
    const parsed2 = parseCSV(csv2);
    expect(parsed2.length).toBe(2);
    expect(parsed2[0]).toEqual(['Ali', 'Demir']);
    expect(parsed2[1]).toEqual(['Veli', 'Şahin']);
  });

  it('handles Windows CRLF line endings (\\r\\n)', () => {
    const csv = 'Kemal,Öztürk\r\nSelin,Yıldız\r\n';
    const parsed = parseCSV(csv);
    expect(parsed.length).toBe(2);
    expect(parsed[0]).toEqual(['Kemal', 'Öztürk']);
    expect(parsed[1]).toEqual(['Selin', 'Yıldız']);
  });

  it('handles quotes containing delimiters', () => {
    const csv = '"Ömer, Faruk",Aydın\n"Ahmet, Mehmet",Çelik';
    const parsed = parseCSV(csv);
    expect(parsed.length).toBe(2);
    expect(parsed[0]).toEqual(['Ömer, Faruk', 'Aydın']);
    expect(parsed[1]).toEqual(['Ahmet, Mehmet', 'Çelik']);
  });

  it('handles escaped quotes within quoted cells ("")', () => {
    const csv = '"Ahmet ""Usta""",Demir\nCan,Yılmaz';
    const parsed = parseCSV(csv);
    expect(parsed.length).toBe(2);
    expect(parsed[0]).toEqual(['Ahmet "Usta"', 'Demir']);
  });

  it('handles empty input gracefully', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('   ')).toEqual([]);
  });
});
