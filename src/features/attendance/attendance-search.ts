/**
 * Attendance Search Bar & Filter Controller
 * Vibecoding-Safe Native DOM Architecture
 */

import type { FeatureContext } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { fullName, normalizeSearchText } from '../../shared/formatters';

let currentQuery = '';

/**
 * Returns the active search query.
 */
export function getAttendanceSearchQuery(): string {
  return currentQuery;
}

/**
 * Resets the current attendance search filter.
 */
export function resetAttendanceSearch(): void {
  currentQuery = '';
}

/**
 * Sets search query and updates visible student card filtering.
 */
export function setAttendanceSearchQuery(query: string, context: FeatureContext): void {
  currentQuery = (query || '').trim();
  applyAttendanceFilter(context);
}

/**
 * Clears search query and clears input element value.
 */
export function clearAttendanceSearch(context: FeatureContext): void {
  currentQuery = '';
  const input = document.getElementById('attendanceSearchInput') as HTMLInputElement | null;
  if (input) {
    input.value = '';
    input.focus();
  }
  applyAttendanceFilter(context);
}

/**
 * Applies search filter across rendered student cards in the DOM.
 */
export function applyAttendanceFilter(context: FeatureContext): void {
  if (typeof document === 'undefined') return;
  const active = context.getState().attendance.active;
  const listEl = document.querySelector('.student-list');
  const clearBtn = document.getElementById('searchClearBtn');
  if (!active || !listEl) return;

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !currentQuery);
  }

  const q = normalizeSearchText(currentQuery);
  let visibleCount = 0;

  active.students.forEach((s) => {
    const sId = s.id || '';
    const card = listEl.querySelector(`[data-student-id="${sId}"]`) as HTMLElement | null;
    if (!card) return;

    if (!q) {
      card.classList.remove('hidden');
      visibleCount++;
    } else {
      const sName = normalizeSearchText(fullName(s));
      const lName = normalizeSearchText(s.listName || '');
      const match = sName.includes(q) || lName.includes(q);
      card.classList.toggle('hidden', !match);
      if (match) visibleCount++;
    }
  });

  let emptyMsg = listEl.querySelector('.empty-search-notice') as HTMLElement | null;
  if (visibleCount === 0) {
    if (!emptyMsg) {
      emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-search-notice';
      emptyMsg.textContent = 'Aramanızla eşleşen öğrenci veya ders bulunamadı.';
      listEl.appendChild(emptyMsg);
    }
    emptyMsg.classList.remove('hidden');
  } else if (emptyMsg) {
    emptyMsg.classList.add('hidden');
  }
}

/**
 * Renders HTML markup for the attendance search bar.
 */
export function renderAttendanceSearchBar(): string {
  return `<div class="attendance-search-bar">
    <div class="search-input-wrap">
      <span class="search-icon-inline" aria-hidden="true">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </span>
      <input type="text" id="attendanceSearchInput" class="attendance-search-input"
        placeholder="Öğrenci veya ders ara..." value="${escapeHtml(currentQuery)}"
        autocomplete="off" spellcheck="false">
      <button type="button" id="searchClearBtn" class="search-clear-btn ${currentQuery ? '' : 'hidden'}"
        data-action="clear-attendance-search" aria-label="Aramayı temizle" title="Temizle">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </div>`;
}

/**
 * Attaches DOM input and keydown event listeners to attendance search bar.
 */
export function setupAttendanceSearchListeners(context: FeatureContext): void {
  if (typeof document === 'undefined') return;
  const input = document.getElementById('attendanceSearchInput') as HTMLInputElement | null;
  if (!input) return;

  input.addEventListener('input', () => {
    setAttendanceSearchQuery(input.value, context);
  });

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      input.value = '';
      setAttendanceSearchQuery('', context);
    }
  });
}

