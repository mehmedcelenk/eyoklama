/**
 * History Feature View & Accordion Controller
 * Vibecoding-Safe Native DOM Architecture
 * Uses data-action event delegation (Zero inline onclick handlers)
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, AttendanceRecord, AttendanceDetails } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { dayKey, formatHistoryDay, formatCardDate, formatCardTime, getWeekDetails, getMonthDetails } from '../../shared/date';
import { buildHistoryGroups, selectedHistoryItem, HistoryGroup } from './grouping';
import { draftStatus } from './edit-drawer';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

export const historyGroupCache: Record<string, HistoryGroup> = {};

/**
 * Generates summary card header markup with list title and timestamp badges.
 */
export function historyInfoHtml(h: AttendanceRecord, g: HistoryGroup): string {
  return `<strong>${escapeHtml(h.listName)}${g.archived ? `<span class="archive-tag">ARŞİV</span>` : ''}</strong>
    <div class="history-card-meta">
      <span class="history-card-date">${formatCardDate(h.takenAt)}</span>
      <div class="history-card-times">
        ${g.items.map((it) => `<span class="history-time-badge">${formatCardTime(it.takenAt)}</span>`).join('')}
      </div>
      <span class="history-card-teacher">${escapeHtml(h.takenByName)}</span>
    </div>`;
}

/**
 * Builds HTML string for ALINANLAR (GEÇMİŞ) section.
 */
export function buildHistorySectionHtml(context: FeatureContext): string {
  const state = context.getState();
  const groups = buildHistoryGroups(state.history.records, state.history.groupingMode, state.navigation.showArchived);

  // Clear and update module cache
  Object.keys(historyGroupCache).forEach((k) => delete historyGroupCache[k]);
  (context as any)._historyGroupCache = historyGroupCache;

  let lastGroupKey = '';
  const modeEmoji = state.history.groupingMode === 'day' ? '☀️' : state.history.groupingMode === 'week' ? '📅' : '🌙';
  const modeTitle =
    state.history.groupingMode === 'day'
      ? 'Günlük Görünüm (Haftalık için tıklayın)'
      : state.history.groupingMode === 'week'
        ? 'Haftalık Görünüm (Aylık için tıklayın)'
        : 'Aylık Görünüm (Günlük için tıklayın)';

  const cards = groups
    .map((g, i) => {
      const key = `g${i}`;
      historyGroupCache[key] = g;
      const sel = selectedHistoryItem(historyGroupCache, key, state.history.groupIndex);
      const h = sel?.item || g.items[0];
      if (!h) return '';

      let currentGroupKey = '';
      let currentGroupLabel = '';
      let downloadParam = '';

      if (state.history.groupingMode === 'day') {
        const day = dayKey(h.takenAt);
        currentGroupKey = day;
        currentGroupLabel = formatHistoryDay(day);
        downloadParam = `data-day="${escapeHtml(day)}"`;
      } else if (state.history.groupingMode === 'week') {
        const w = getWeekDetails(h.takenAt);
        currentGroupKey = w.key;
        currentGroupLabel = w.label;
        downloadParam = `data-range-key="${escapeHtml(w.key)}"`;
      } else {
        const m = getMonthDetails(h.takenAt);
        currentGroupKey = m.key;
        currentGroupLabel = m.label;
        downloadParam = `data-range-key="${escapeHtml(m.key)}"`;
      }

      const divider =
        currentGroupKey !== lastGroupKey
          ? `<div class="history-day" id="dayHeader-${escapeHtml(currentGroupKey)}">
        <div class="history-day-line"><span class="history-day-label">${escapeHtml(currentGroupLabel)}</span></div>
        <div class="history-day-export" style="display:flex;align-items:center;gap:4px">
          <div id="exportMenu-${escapeHtml(currentGroupKey)}" class="export-format-pills hidden" style="display:inline-flex;gap:4px;align-items:center">
            <button type="button" class="btn tiny" data-action="export-format" data-format="pdf" ${downloadParam} data-target="exportMenu-${escapeHtml(currentGroupKey)}" style="padding:2px 7px;font-size:0.72rem;min-height:26px">PDF</button>
            <button type="button" class="btn tiny secondary" data-action="export-format" data-format="csv" ${downloadParam} data-target="exportMenu-${escapeHtml(currentGroupKey)}" style="padding:2px 7px;font-size:0.72rem;min-height:26px">CSV</button>
            <button type="button" class="btn tiny secondary" data-action="export-format" data-format="word" ${downloadParam} data-target="exportMenu-${escapeHtml(currentGroupKey)}" style="padding:2px 7px;font-size:0.72rem;min-height:26px">Word</button>
          </div>
          <button type="button" class="history-day-download" id="exportBtn-${escapeHtml(currentGroupKey)}" data-action="toggle-export-menu" data-target="exportMenu-${escapeHtml(currentGroupKey)}"
            aria-label="${escapeHtml(currentGroupLabel)} indir" title="İndir (PDF, CSV, Word)">
            <svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
          </button>
        </div>
      </div>`
          : '';
      lastGroupKey = currentGroupKey;

      return `${divider}<details id="historyCard-${key}" class="history-item" data-action="toggle-history-group" data-group-key="${key}">
        <summary>
          <div class="history-summary">
            <div id="historyInfo-${key}" style="flex:1;min-width:0">${historyInfoHtml(h, g)}</div>
            <div class="history-summary-actions">
              <span class="history-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
              </span>
            </div>
          </div>
        </summary>
        <div id="historyBody-${key}" class="history-body"><div class="muted tiny">Yükleniyor…</div></div>
      </details>`;
    })
    .join('');

  return `
    <div class="history-section stack" style="margin-top:24px;padding-top:20px;border-top:1px solid var(--line)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px">
        <h2 class="section-title" style="margin:0;font-size:1.05rem;font-weight:800;letter-spacing:-0.01em;color:var(--text)">ALINANLAR (GEÇMİŞ)</h2>
        <div style="display:flex;align-items:center;gap:8px">
          <button type="button" class="top-icon-btn" data-action="cycle-history-mode" title="${modeTitle}" style="font-size:1.15rem;width:34px;height:34px">
            ${modeEmoji}
          </button>
          <span data-action="toggle-archive" style="font-size:0.76rem;color:var(--muted);cursor:pointer;user-select:none">
            ${state.navigation.showArchived ? 'Arşivi gizle' : 'Arşivi göster'}
          </span>
        </div>
      </div>
      <div class="history">${cards || `<div class="card" style="text-align:center;padding:32px 16px"><p class="muted" style="margin-bottom:12px">Henüz yoklama kaydı yok.</p></div>`}</div>
    </div>
  `;
}

/**
 * Loads missing session details from backend and renders accordion body.
 */
export async function loadHistoryGroup(key: string, context: FeatureContext): Promise<void> {
  const g = historyGroupCache[key];
  if (!g) return;
  const body = $(`historyBody-${key}`);
  if (!body) return;

  const state = context.getState();
  const missing = g.items.filter((h) => !state.history.sessionDetailsCache[h.id]);

  if (missing.length && state.session.token) {
    body.innerHTML = `<div class="muted tiny">Yükleniyor…</div>`;
    try {
      const cacheCopy = { ...state.history.sessionDetailsCache };
      await Promise.all(
        missing.map(async (h) => {
          cacheCopy[h.id] = (await rpc('get_attendance', {
            p_token: state.session.token,
            p_attendance_id: h.id
          })) as AttendanceDetails;
        })
      );
      context.setState({ history: { sessionDetailsCache: cacheCopy } });
    } catch (e: unknown) {
      const err = e as { message?: string };
      body.innerHTML = `<div class="notice error">${escapeHtml(err.message || 'Yüklenemedi')}</div>`;
      return;
    }
  }
  renderHistoryBody(key, context);
}

/**
 * Renders the expanded student grid, status badges, and action toolbar inside an open accordion card.
 */
export function renderHistoryBody(key: string, context: FeatureContext): void {
  const g = historyGroupCache[key];
  if (!g) return;
  const body = $(`historyBody-${key}`);
  if (!body) return;

  const state = context.getState();
  const editing = g.items.some((h) => Boolean(state.history.activeEditModes[h.id]));
  const archived = Boolean(g.archived);

  const studentMap = new Map<string, { id: string; key: string; firstName: string; lastName: string }>();
  g.items.forEach((h) => {
    const r = state.history.sessionDetailsCache[h.id];
    if (r) {
      r.entries.forEach((e) => {
        const k = e.studentId || `${e.firstName}|${e.lastName}`;
        if (!studentMap.has(k)) {
          studentMap.set(k, { id: e.studentId, key: k, firstName: e.firstName, lastName: e.lastName });
        }
      });
    }
  });

  const students = [...studentMap.values()].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')
  );

  body.innerHTML = `
    <div class="history-grid">
      <div class="history-grid-header">
        <span class="muted tiny" style="font-weight:700">Öğrenci</span>
        <div class="history-grid-cols">
          ${g.items.map((_, idx) => `<div class="h-col-head">${idx + 1}/${g.items.length}</div>`).join('')}
        </div>
      </div>

      ${students
        .map(
          (s) => `
        <div class="history-grid-row">
          <span class="history-grid-name">${escapeHtml(`${s.firstName} ${s.lastName}`)}</span>
          <div class="history-grid-cols">
            ${g.items
              .map((h) => {
                const r = state.history.sessionDetailsCache[h.id];
                const entry = r?.entries.find(
                  (e) => (e.studentId && e.studentId === s.id) || (e.firstName === s.firstName && e.lastName === s.lastName)
                );
                if (!entry) return `<span class="h-cell empty">·</span>`;
                const st = draftStatus(h.id, entry, state);
                const sym = st === 'present' ? '+' : st === 'excused' ? '±' : '-';
                const canEdit = editing && !archived && (state.session.role === 'admin' || st !== 'present');
                return canEdit
                  ? `<button type="button" class="h-cell btn-cell ${st}" data-action="stage-history-status"
                       data-attendance-id="${escapeHtml(h.id)}" data-entry-id="${escapeHtml(entry.studentId || (entry as any).id)}" data-group-key="${key}">${sym}</button>`
                  : `<span class="h-cell ${st}">${sym}</span>`;
              })
              .join('')}
          </div>
        </div>
      `
        )
        .join('')}

      <div class="history-grid-footer">
        <div class="history-group-actions">
          <button type="button" class="history-tool" data-action="download-history-pdf" data-group-key="${key}"
            aria-label="Tümünü PDF indir" title="Tümünü PDF indir">
            <svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
          </button>
          <button type="button" class="history-tool summary-icon" data-action="copy-history-all" data-group-key="${key}"
            aria-label="Tümünü kopyala" title="Tümünü kopyala">
            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          ${
            !archived && !editing
              ? `<button type="button" class="history-tool" data-action="toggle-history-edit" data-group-key="${key}" aria-label="Düzenle" title="Düzenle">
              <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>
            </button>`
              : ''
          }
          ${
            !archived && editing
              ? `<button type="button" class="history-save" data-action="save-history-changes" data-group-key="${key}" aria-label="Düzenlemeyi onayla" title="Onayla">
              <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>
            </button>`
              : ''
          }
          ${
            state.session.role === 'admin' && !archived
              ? `<button type="button" class="history-tool archive" data-action="archive-history" data-group-key="${key}" aria-label="Arşivle" title="Arşivle">
              <svg viewBox="0 0 24 24"><path d="M3 5h18"/><path d="M5 5l1 15h12l1-15"/><path d="M9 9h6"/></svg>
            </button>`
              : ''
          }
          ${
            !archived && g.items.some((h) => state.history.undoTokens[h.id])
              ? `<button type="button" class="archive-toggle" data-action="undo-history-change" data-group-key="${key}">Geri al</button>`
              : ''
          }
        </div>
        <div class="history-col-actions">
          <div class="history-grid-cols">
            ${g.items
              .map(
                (h, idx) => `
              <button type="button" class="icon-btn ghost h-download-btn" data-action="download-single-pdf" data-attendance-id="${escapeHtml(h.id)}"
                aria-label="${idx + 1}/${g.items.length} PDF indir" title="${idx + 1}/${g.items.length} PDF indir">
                <svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
              </button>
            `
              )
              .join('')}
          </div>
          <div class="history-grid-cols">
            ${g.items
              .map(
                (h, idx) => `
              <button type="button" class="icon-btn ghost h-download-btn summary-icon" data-action="copy-single-attendance" data-attendance-id="${escapeHtml(h.id)}"
                aria-label="${idx + 1}/${g.items.length} kopyala" title="${idx + 1}/${g.items.length} kopyala">
                <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>

    ${
      state.session.role === 'admin' && !archived && g.items.some((h) => state.history.undoTokens[h.id])
        ? `<div id="undoPanel-${key}" class="undo-confirm hidden">
      <div class="password-wrap">
        <input id="undoPassword-${key}" type="password" maxlength="64" autocomplete="current-password" placeholder="Üst yetkili parolası">
        <button type="button" class="password-eye" data-action="reveal-password" data-target="undoPassword-${key}" aria-label="Parolayı göster" title="1 saniye göster">
          <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
        </button>
      </div>
      <button type="button" class="btn small" data-action="confirm-saved-undo" data-group-key="${key}" title="Onayla" aria-label="Onayla" style="min-width:34px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;background:#22c55e;color:#090909;border-color:#16a34a"><svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12l4 4L19 6"/></svg></button>
    </div>`
        : ''
    }`;
}
