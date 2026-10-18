import { describe, it, expect } from 'vitest';
import { fullName } from '@shared/formatters';

describe('Formatters Utility (fullName)', () => {
  it('preserves assertion 2: trims outer whitespace and combines first & last name', () => {
    expect(fullName({ firstName: '  Ahmet ', lastName: ' Yılmaz ' })).toBe('Ahmet Yılmaz');
  });

  it('preserves assertion 2: formats student with missing last name', () => {
    expect(fullName({ firstName: 'Mehmet', lastName: '' })).toBe('Mehmet');
  });

  it('formats student with missing first name', () => {
    expect(fullName({ firstName: '', lastName: 'Kaya' })).toBe('Kaya');
    expect(fullName({ lastName: 'Demir' })).toBe('Demir');
  });

  it('collapses multiple internal whitespace and tabs into single space', () => {
    expect(fullName({ firstName: 'Ali   Can', lastName: '  Öz   türk  ' })).toBe('Ali Can Öz türk');
  });

  it('returns empty string for null, undefined, or empty object inputs', () => {
    expect(fullName(null)).toBe('');
    expect(fullName(undefined)).toBe('');
    expect(fullName({})).toBe('');
    expect(fullName({ firstName: '', lastName: '' })).toBe('');
  });

  it('preserves Turkish characters correctly', () => {
    expect(fullName({ firstName: 'Şükran', lastName: 'Ağaoğlu' })).toBe('Şükran Ağaoğlu');
    expect(fullName({ firstName: 'Ömer Faruk', lastName: 'İncesu' })).toBe('Ömer Faruk İncesu');
  });
});

describe('Formatters Utility (normalizeSearchText)', () => {
  it('handles null, undefined and empty string gracefully', async () => {
    const { normalizeSearchText } = await import('@shared/formatters');
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
    expect(normalizeSearchText('')).toBe('');
  });

  it('normalizes Turkish characters with case-insensitivity (İ -> i, I -> ı)', async () => {
    const { normalizeSearchText } = await import('@shared/formatters');
    expect(normalizeSearchText('İBRAHİM')).toBe('ibrahim');
    expect(normalizeSearchText('IŞIK')).toBe('ışık');
    expect(normalizeSearchText('ŞEYMA ÖZTÜRK')).toBe('şeyma öztürk');
    expect(normalizeSearchText('Çiğdem')).toBe('çiğdem');
  });

  it('normalizes multiple spaces and outer whitespace', async () => {
    const { normalizeSearchText } = await import('@shared/formatters');
    expect(normalizeSearchText('  Ali    Veli   ')).toBe('ali veli');
  });
});

describe('Formatters Utility (displayName)', () => {
  it('returns full name when showFirstName is true', async () => {
    const { displayName } = await import('@shared/formatters');
    expect(displayName({ firstName: 'Ahmet', lastName: 'Yılmaz' }, true)).toBe('Ahmet Yılmaz');
  });

  it('returns only last name when showFirstName is false', async () => {
    const { displayName } = await import('@shared/formatters');
    expect(displayName({ firstName: 'Ahmet', lastName: 'Yılmaz' }, false)).toBe('Yılmaz');
  });

  it('falls back to full name or available name if last name is missing', async () => {
    const { displayName } = await import('@shared/formatters');
    expect(displayName({ firstName: 'Mehmet', lastName: '' }, false)).toBe('Mehmet');
  });

  it('handles null and undefined safely', async () => {
    const { displayName } = await import('@shared/formatters');
    expect(displayName(null, false)).toBe('');
    expect(displayName(undefined, true)).toBe('');
  });
});


