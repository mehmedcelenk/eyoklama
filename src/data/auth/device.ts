/**
 * Device Authentication & Token Generation
 * Vibecoding-Safe Native DOM Architecture
 */

import { STORAGE_KEYS } from '../storage/keys';

const DEFAULT_FALLBACK_DEVICE = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Returns or generates a persistent 64-character hexadecimal device token.
 * Token is stored in localStorage under STORAGE_KEYS.DEVICE.
 *
 * @returns 64-character hex device token string
 */
export function getDeviceToken(): string {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_FALLBACK_DEVICE;
  }

  let token = localStorage.getItem(STORAGE_KEYS.DEVICE) || '';

  if (!/^[0-9a-f]{64}$/.test(token)) {
    try {
      const bytes = new Uint8Array(32);
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < 32; i++) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
      }
      token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(STORAGE_KEYS.DEVICE, token);
    } catch {
      return DEFAULT_FALLBACK_DEVICE;
    }
  }

  return token;
}
