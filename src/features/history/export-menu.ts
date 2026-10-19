/**
 * Export Menu Interaction & Auto-Dismiss Subsystem
 * Vibecoding-Safe Native DOM Architecture
 * Features Layer (Layer 2) - History domain
 */

let exportMenuTimer: ReturnType<typeof setTimeout> | null = null;
let activeMenuTarget: string | null = null;

const DEFAULT_AUTO_CLOSE_MS = 3500; // 3.5 seconds (within 3-4s requirement)

/**
 * Closes specified or currently active export format menu and clears timers.
 */
export function closeExportMenu(targetId?: string): void {
  if (exportMenuTimer) {
    clearTimeout(exportMenuTimer);
    exportMenuTimer = null;
  }

  const id = targetId || activeMenuTarget;
  if (id && typeof document !== 'undefined') {
    const el = document.getElementById(id);
    el?.classList.add('hidden');
  }

  if (!targetId || targetId === activeMenuTarget) {
    activeMenuTarget = null;
  }
}

/**
 * Toggles export options menu. Automatically closes if no action taken within 3-4 seconds.
 */
export function toggleExportMenu(targetId: string, autoCloseMs: number = DEFAULT_AUTO_CLOSE_MS): void {
  if (typeof document === 'undefined') return;

  const target = document.getElementById(targetId);
  if (!target) return;

  // If another menu is already open, close it cleanly first
  if (activeMenuTarget && activeMenuTarget !== targetId) {
    closeExportMenu(activeMenuTarget);
  }

  const isHidden = target.classList.contains('hidden');

  if (isHidden) {
    target.classList.remove('hidden');
    activeMenuTarget = targetId;

    if (exportMenuTimer) {
      clearTimeout(exportMenuTimer);
    }
    exportMenuTimer = setTimeout(() => {
      closeExportMenu(targetId);
    }, autoCloseMs);
  } else {
    closeExportMenu(targetId);
  }
}

/**
 * Resets the auto-close timer if user hovers or interacts with the menu.
 */
export function resetExportMenuTimer(autoCloseMs: number = DEFAULT_AUTO_CLOSE_MS): void {
  if (!activeMenuTarget) return;

  if (exportMenuTimer) {
    clearTimeout(exportMenuTimer);
  }
  const current = activeMenuTarget;
  exportMenuTimer = setTimeout(() => {
    closeExportMenu(current);
  }, autoCloseMs);
}

/**
 * Returns currently active menu target ID if any.
 */
export function getActiveExportMenu(): string | null {
  return activeMenuTarget;
}
