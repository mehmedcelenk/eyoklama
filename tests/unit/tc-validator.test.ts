import { describe, it, expect } from 'vitest';
import { isValidTcNumber, sanitizeTc } from '../../src/shared/tc-validator';

describe('TC Validator', () => {
  it('validates correct Turkish TC numbers', () => {
    // 10000000146 is a valid algorithmic TC
    expect(isValidTcNumber('10000000146')).toBe(true);
    // Algorithmic TC: 14785236940
    // d1..d9: 1,4,7,8,5,2,3,6,9 -> odd: 1+7+5+3+9=25, even: 4+8+2+6=20 -> (25*7 - 20)=155%10=5? let's check
    // Let's test negative cases first
  });

  it('rejects invalid TC numbers', () => {
    expect(isValidTcNumber('')).toBe(false);
    expect(isValidTcNumber(null as any)).toBe(false);
    expect(isValidTcNumber('01234567890')).toBe(false); // starts with 0
    expect(isValidTcNumber('12345')).toBe(false); // too short
    expect(isValidTcNumber('123456789012')).toBe(false); // too long
    expect(isValidTcNumber('10000000147')).toBe(false); // wrong checksum
    expect(isValidTcNumber('11111111111')).toBe(false); // invalid checksum
    expect(isValidTcNumber('abcdefghijk')).toBe(false);
  });

  it('sanitizes input correctly', () => {
    expect(sanitizeTc(' 100 000 001 46 ')).toBe('10000000146');
    expect(sanitizeTc('tc: 12345-678901-extra')).toBe('12345678901');
    expect(sanitizeTc('')).toBe('');
    expect(sanitizeTc(null)).toBe('');
  });
});
