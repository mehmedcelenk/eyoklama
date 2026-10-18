import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@shared/sanitization';

describe('Sanitization Utility (escapeHtml)', () => {
  it('preserves assertion 1: filters dangerous XSS characters (<script>alert("xss")</script>)', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('preserves assertion 1: filters ampersand and quotes (Ahmet & Mehmet \'Can\')', () => {
    expect(escapeHtml("Ahmet & Mehmet 'Can'")).toBe(
      'Ahmet &amp; Mehmet &#039;Can&#039;'
    );
  });

  it('safely handles null and undefined by returning empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('safely handles numeric inputs', () => {
    expect(escapeHtml(12345)).toBe('12345');
    expect(escapeHtml(0)).toBe('0');
  });

  it('leaves clean strings unmodified', () => {
    expect(escapeHtml('Normal Türkçe metin 123')).toBe('Normal Türkçe metin 123');
    expect(escapeHtml('')).toBe('');
  });

  it('correctly escapes chained and nested HTML tags and attributes', () => {
    const input = '<img src="x" onerror=\'alert("xss")\'>';
    const expected = '&lt;img src=&quot;x&quot; onerror=&#039;alert(&quot;xss&quot;)&#039;&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });
});
