import { describe, it, expect } from 'vitest';
import { validateRows } from '@shared/student-validator';

describe('Student Validator Utility (validateRows)', () => {
  it('preserves assertion 6: validates student rows and ignores header row', () => {
    const raw = [
      ['İsim', 'Soyisim'],
      ['Ahmet', 'Yılmaz'],
      [' Ayşe ', ' Öztürk ']
    ];
    const validated = validateRows(raw);
    expect(validated.length).toBe(2);
    expect(validated[0]).toEqual({ firstName: 'Ahmet', lastName: 'Yılmaz' });
    expect(validated[1]).toEqual({ firstName: 'Ayşe', lastName: 'Öztürk' });
  });

  it('accepts rows without header row if they are valid student pairs', () => {
    const raw = [
      ['Mehmet', 'Kaya'],
      ['Fatma', 'Çelik']
    ];
    const validated = validateRows(raw);
    expect(validated.length).toBe(2);
    expect(validated[0]?.firstName).toBe('Mehmet');
    expect(validated[1]?.lastName).toBe('Çelik');
  });

  it('normalizes case and Turkish characters in header row ("isim", "soyisim")', () => {
    const raw = [
      ['ISIM', 'SOYISIM'],
      ['Kemal', 'Sunal']
    ];
    const validated = validateRows(raw);
    expect(validated.length).toBe(1);
    expect(validated[0]).toEqual({ firstName: 'Kemal', lastName: 'Sunal' });
  });

  it('throws error when file contains no student rows', () => {
    expect(() => validateRows([])).toThrow('Dosyada öğrenci bulunamadı.');
    expect(() => validateRows([['   ', '   ']])).toThrow('Dosyada öğrenci bulunamadı.');
  });

  it('takes the first 2 columns if extra columns exist', () => {
    const raw = [
      ['Ahmet', 'Yılmaz', '101']
    ];
    const validated = validateRows(raw);
    expect(validated.length).toBe(1);
    expect(validated[0]).toEqual({ firstName: 'Ahmet', lastName: 'Yılmaz' });
  });

  it('throws error when only header exists without students', () => {
    const raw = [
      ['İsim', 'Soyisim']
    ];
    expect(() => validateRows(raw)).toThrow('Başlık dışında öğrenci bulunamadı.');
  });

  it('throws error when student first name or last name is missing', () => {
    const raw = [
      ['İsim', 'Soyisim'],
      ['Ahmet', ''],
      ['Ayşe', 'Demir']
    ];
    expect(() => validateRows(raw)).toThrow('1. öğrenci satırında İsim veya Soyisim eksik.');
  });

  it('extracts 3rd column as tcNo if it is an 11-digit number', () => {
    const raw = [
      ['Ad', 'Soyad', 'TC Kimlik'],
      ['Ali', 'Yılmaz', '10000000146']
    ];
    const validated = validateRows(raw);
    expect(validated.length).toBe(1);
    expect(validated[0]).toEqual({
      firstName: 'Ali',
      lastName: 'Yılmaz',
      tcNo: '10000000146'
    });
  });
});
