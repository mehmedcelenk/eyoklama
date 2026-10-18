/**
 * Login Rate Limiting & Brute Force Protection
 * Vibecoding-Safe Native DOM Architecture
 */

const LOGIN_ATTEMPTS_KEY = 'eyoklama_login_attempts';

interface LoginAttemptRecord {
  count?: number;
  blockedUntil?: number;
}

/**
 * Checks whether user is currently blocked by rate limit.
 * Returns formatted Turkish lockout notice, or null if allowed.
 */
export function getLoginRateLimitMsg(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    if (!raw) return null;
    const rec: LoginAttemptRecord = JSON.parse(raw);
    const now = Date.now();
    if (rec.blockedUntil && rec.blockedUntil > now) {
      const sec = Math.ceil((rec.blockedUntil - now) / 1000);
      return `Çok fazla hatalı deneme yapıldı. Lütfen ${sec} saniye bekleyin.`;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Records a failed login attempt. Locks out for 30s after 3 consecutive failures.
 */
export function recordFailedAttempt(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const now = Date.now();
    const raw = localStorage.getItem(LOGIN_ATTEMPTS_KEY);
    const rec: LoginAttemptRecord = raw ? JSON.parse(raw) : {};
    const cnt = (rec.count || 0) + 1;
    if (cnt >= 3) {
      rec.blockedUntil = now + 30000;
      rec.count = 0;
    } else {
      rec.count = cnt;
    }
    localStorage.setItem(LOGIN_ATTEMPTS_KEY, JSON.stringify(rec));
  } catch {
    // ignore storage errors
  }
}

/**
 * Clears failed login counter on successful authentication.
 */
export function resetLoginAttempts(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(LOGIN_ATTEMPTS_KEY);
  } catch {
    // ignore storage errors
  }
}
