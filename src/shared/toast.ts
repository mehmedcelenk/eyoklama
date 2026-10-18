/**
 * Notification Toast Utility
 * Vibecoding-Safe Native DOM Architecture
 * Lightweight, DOM-resilient notification messenger
 */

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Displays a transient notification toast message in the UI.
 * Safely guards against non-DOM / test environments.
 *
 * @param msg Message text to display
 * @param type Optional styling type ('err' or 'ok')
 */
export function toast(msg: string, type?: 'err' | 'ok'): void {
  if (typeof document === 'undefined') return;

  const toastEl = document.getElementById('toast');
  if (!toastEl) return;

  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');

  if (type === 'err') {
    toastEl.classList.add('error');
  } else {
    toastEl.classList.remove('error');
  }

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 3000);
}
