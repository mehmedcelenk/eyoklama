import { describe, it, expect } from 'vitest';
import { generateMemorablePin } from '@shared/pin';

describe('PIN Generator (generateMemorablePin)', () => {
  it('preserves assertion 4: generates 6-digit numeric, non-trivial PINs over 100 iterations', () => {
    for (let i = 0; i < 100; i++) {
      const pin = generateMemorablePin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(pin).not.toBe('000000');
      expect(pin).not.toBe('111111');
    }
  });

  it('guarantees string length of exactly 6 characters over 500 iterations', () => {
    const generated = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const pin = generateMemorablePin();
      expect(pin.length).toBe(6);
      expect(/^\d{6}$/.test(pin)).toBe(true);
      generated.add(pin);
    }

    // High randomness and diversity across 500 generations
    expect(generated.size).toBeGreaterThan(25);
  });

  it('contains valid non-zero digits suitable for keypad patterns', () => {
    for (let i = 0; i < 50; i++) {
      const pin = generateMemorablePin();
      const digits = pin.split('').map(Number);
      expect(digits.every((d) => d >= 1 && d <= 9)).toBe(true);
    }
  });
});
