/**
 * Unit Tests for Export Menu Controller and Auto-Dismissal
 * Vibecoding-Safe Native DOM Architecture
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toggleExportMenu,
  closeExportMenu,
  resetExportMenuTimer,
  getActiveExportMenu
} from '../../src/features/history/export-menu';

describe('Export Menu Subsystem', () => {
  let menu1: HTMLElement;
  let menu2: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="exportMenu-day-1" class="export-format-pills hidden"></div>
      <div id="exportMenu-day-2" class="export-format-pills hidden"></div>
    `;
    menu1 = document.getElementById('exportMenu-day-1')!;
    menu2 = document.getElementById('exportMenu-day-2')!;
  });

  afterEach(() => {
    closeExportMenu();
    vi.useRealTimers();
  });

  it('opens menu and clears hidden class on toggle', () => {
    toggleExportMenu('exportMenu-day-1');
    expect(menu1.classList.contains('hidden')).toBe(false);
    expect(getActiveExportMenu()).toBe('exportMenu-day-1');
  });

  it('closes menu if clicked again (toggle behavior)', () => {
    toggleExportMenu('exportMenu-day-1');
    expect(menu1.classList.contains('hidden')).toBe(false);

    toggleExportMenu('exportMenu-day-1');
    expect(menu1.classList.contains('hidden')).toBe(true);
    expect(getActiveExportMenu()).toBeNull();
  });

  it('automatically closes menu after 3.5 seconds (3500ms) if not clicked', () => {
    toggleExportMenu('exportMenu-day-1');
    expect(menu1.classList.contains('hidden')).toBe(false);

    // Fast forward 3400ms - still open
    vi.advanceTimersByTime(3400);
    expect(menu1.classList.contains('hidden')).toBe(false);

    // Advance 100ms more (total 3500ms) - should close automatically
    vi.advanceTimersByTime(100);
    expect(menu1.classList.contains('hidden')).toBe(true);
    expect(getActiveExportMenu()).toBeNull();
  });

  it('closes previous menu when a different menu is opened', () => {
    toggleExportMenu('exportMenu-day-1');
    expect(menu1.classList.contains('hidden')).toBe(false);
    expect(menu2.classList.contains('hidden')).toBe(true);

    toggleExportMenu('exportMenu-day-2');
    expect(menu1.classList.contains('hidden')).toBe(true);
    expect(menu2.classList.contains('hidden')).toBe(false);
    expect(getActiveExportMenu()).toBe('exportMenu-day-2');
  });

  it('allows manual closing via closeExportMenu()', () => {
    toggleExportMenu('exportMenu-day-1');
    expect(menu1.classList.contains('hidden')).toBe(false);

    closeExportMenu('exportMenu-day-1');
    expect(menu1.classList.contains('hidden')).toBe(true);
    expect(getActiveExportMenu()).toBeNull();
  });

  it('resets timer on user interaction', () => {
    toggleExportMenu('exportMenu-day-1');
    vi.advanceTimersByTime(2000);
    expect(menu1.classList.contains('hidden')).toBe(false);

    // Reset timer
    resetExportMenuTimer();

    // Advance 2000ms (4000ms from start, but only 2000ms from reset)
    vi.advanceTimersByTime(2000);
    expect(menu1.classList.contains('hidden')).toBe(false);

    // Advance 1500ms more (3500ms from reset)
    vi.advanceTimersByTime(1500);
    expect(menu1.classList.contains('hidden')).toBe(true);
  });
});
