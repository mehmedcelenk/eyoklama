/**
 * Pool Selector Feature Component
 * Vibecoding-Safe Native DOM Architecture
 * Allows picking students from the Master Directory / School Pool
 */

import type { FeatureContext, MasterStudent } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { normalizeSearchText } from '../../shared/formatters';
import {
  getImportedStudents,
  setImportedStudents,
  renderStudentPreview
} from './import-roster';

let poolSearchQuery = '';
let poolSelectedClass = '';

/**
 * Returns list of unique class labels from master pool.
 */
export function getAvailableClassLabels(masterPool: MasterStudent[]): string[] {
  const set = new Set<string>();
  masterPool.forEach((s) => {
    if (s.classLabel && s.classLabel.trim()) {
      // e.g. "10-A, 11-B" or single
      s.classLabel.split(',').forEach((c) => {
        const tr = c.trim();
        if (tr) set.add(tr);
      });
    }
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
}

/**
 * Renders HTML markup for the Pool Selector panel.
 */
export function renderPoolSelectorHtml(context: FeatureContext): string {
  const state = context.getState();
  const pool = state.roster.masterPool || [];
  const classLabels = getAvailableClassLabels(pool);
  const staged = getImportedStudents();
  const stagedKeys = new Set(
    staged.map((s) => `${s.firstName.toLowerCase()}_${s.lastName.toLowerCase()}`)
  );

  const q = normalizeSearchText(poolSearchQuery);

  const filtered = pool.filter((s) => {
    if (poolSelectedClass) {
      const cLabel = s.classLabel || '';
      if (!cLabel.includes(poolSelectedClass)) return false;
    }
    if (q) {
      const matchFirst = normalizeSearchText(s.firstName).includes(q);
      const matchLast = normalizeSearchText(s.lastName).includes(q);
      const matchClass = normalizeSearchText(s.classLabel || '').includes(q);
      return matchFirst || matchLast || matchClass;
    }
    return true;
  });

  const classOptionsHtml = classLabels
    .map(
      (c) =>
        `<option value="${escapeHtml(c)}" ${poolSelectedClass === c ? 'selected' : ''}>${escapeHtml(c)}</option>`
    )
    .join('');

  const cardsHtml = filtered.length
    ? filtered
        .map((s) => {
          const key = `${s.firstName.toLowerCase()}_${s.lastName.toLowerCase()}`;
          const isSelected = stagedKeys.has(key);
          return `<button type="button" class="pool-student-pill ${isSelected ? 'selected' : ''}"
            data-action="toggle-pool-student"
            data-first="${escapeHtml(s.firstName)}"
            data-last="${escapeHtml(s.lastName)}"
            data-tc="${escapeHtml(s.tcNo || '')}"
            data-class="${escapeHtml(s.classLabel || '')}">
            <span class="pool-pill-name">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</span>
            ${s.classLabel ? `<span class="pool-pill-tag">${escapeHtml(s.classLabel)}</span>` : ''}
            <span class="pool-pill-check">${isSelected ? '✓' : '+'}</span>
          </button>`;
        })
        .join('')
    : `<div class="muted tiny" style="padding:16px;text-align:center">Havuzda öğrenci bulunamadı.</div>`;

  return `
    <div class="pool-selector stack">
      <div class="pool-controls-row">
        <div class="pool-search-wrap">
          <input id="poolSearchInput" type="text" placeholder="İsim, soyisim veya şube ara..."
            value="${escapeHtml(poolSearchQuery)}" autocomplete="off">
        </div>
        <select id="poolClassFilter" class="pool-class-select">
          <option value="">Tüm Sınıflar (${pool.length})</option>
          ${classOptionsHtml}
        </select>
      </div>

      <div class="pool-quick-actions">
        <button type="button" class="btn small secondary" data-action="add-filtered-pool-students">
          Görüntülenen ${filtered.length} Öğrenciyi Ekle
        </button>
        <button type="button" class="btn small ghost" data-action="clear-staged-pool-students">
          Seçimleri Temizle
        </button>
      </div>

      <div class="pool-student-grid" id="poolStudentGrid">
        ${cardsHtml}
      </div>
    </div>
  `;
}

/**
 * Toggles a student from the pool into/out of the staged importedStudents list.
 */
export function togglePoolStudent(data: {
  first: string;
  last: string;
  tc?: string;
}): void {
  const staged = getImportedStudents();
  const key = `${data.first.toLowerCase()}_${data.last.toLowerCase()}`;
  const idx = staged.findIndex(
    (s) => `${s.firstName.toLowerCase()}_${s.lastName.toLowerCase()}` === key
  );

  if (idx >= 0) {
    staged.splice(idx, 1);
  } else {
    staged.push({
      firstName: data.first,
      lastName: data.last,
      tcNo: data.tc || undefined
    });
  }

  setImportedStudents(staged);
  renderStudentPreview();
  updatePillVisuals();
}

/**
 * Adds all currently filtered pool students to staged list.
 */
export function addFilteredPoolStudents(context: FeatureContext): void {
  const state = context.getState();
  const pool = state.roster.masterPool || [];
  const staged = getImportedStudents();
  const stagedKeys = new Set(
    staged.map((s) => `${s.firstName.toLowerCase()}_${s.lastName.toLowerCase()}`)
  );

  const q = normalizeSearchText(poolSearchQuery);

  const filtered = pool.filter((s) => {
    if (poolSelectedClass && !(s.classLabel || '').includes(poolSelectedClass)) return false;
    if (q) {
      const matchFirst = normalizeSearchText(s.firstName).includes(q);
      const matchLast = normalizeSearchText(s.lastName).includes(q);
      const matchClass = normalizeSearchText(s.classLabel || '').includes(q);
      return matchFirst || matchLast || matchClass;
    }
    return true;
  });

  filtered.forEach((s) => {
    const key = `${s.firstName.toLowerCase()}_${s.lastName.toLowerCase()}`;
    if (!stagedKeys.has(key)) {
      staged.push({
        firstName: s.firstName,
        lastName: s.lastName,
        tcNo: s.tcNo || undefined
      });
      stagedKeys.add(key);
    }
  });

  setImportedStudents(staged);
  renderStudentPreview();
  updatePillVisuals();
}

/**
 * Clears all staged imported students.
 */
export function clearStagedPoolStudents(): void {
  setImportedStudents([]);
  renderStudentPreview();
  updatePillVisuals();
}

/**
 * Updates DOM pill visuals without full re-render.
 */
function updatePillVisuals(): void {
  const staged = getImportedStudents();
  const stagedKeys = new Set(
    staged.map((s) => `${s.firstName.toLowerCase()}_${s.lastName.toLowerCase()}`)
  );

  document.querySelectorAll<HTMLElement>('.pool-student-pill').forEach((pill) => {
    const f = pill.dataset.first || '';
    const l = pill.dataset.last || '';
    const key = `${f.toLowerCase()}_${l.toLowerCase()}`;
    const isSelected = stagedKeys.has(key);
    pill.classList.toggle('selected', isSelected);
    const check = pill.querySelector('.pool-pill-check');
    if (check) check.textContent = isSelected ? '✓' : '+';
  });
}

/**
 * Sets filter criteria and triggers partial update.
 */
export function setPoolFilter(
  query: string,
  classLabel: string,
  context: FeatureContext
): void {
  poolSearchQuery = query;
  poolSelectedClass = classLabel;
  const container = document.getElementById('poolSelectorMount');
  if (container) {
    container.innerHTML = renderPoolSelectorHtml(context);
    setupPoolInputListeners(context);
  }
}

/**
 * Sets up non-inline input listeners on pool search elements.
 */
export function setupPoolInputListeners(context: FeatureContext): void {
  const searchInput = document.getElementById('poolSearchInput') as HTMLInputElement | null;
  const classSelect = document.getElementById('poolClassFilter') as HTMLSelectElement | null;

  if (searchInput) {
    searchInput.oninput = () => {
      setPoolFilter(searchInput.value, classSelect?.value || '', context);
    };
  }

  if (classSelect) {
    classSelect.onchange = () => {
      setPoolFilter(searchInput?.value || '', classSelect.value, context);
    };
  }
}
