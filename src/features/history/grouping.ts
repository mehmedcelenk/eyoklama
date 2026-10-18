/**
 * History Interactive Grouping Subsystem
 * Vibecoding-Safe Native DOM Architecture
 * Supports Day (☀️), Week (📅), and Month (🌙) aggregation
 */

import type { AttendanceRecord, HistoryGroupingMode } from '../../data/models/types';
import { dayKey, getWeekDetails, getMonthDetails } from '../../shared/date';
import { cleanListName } from '../../shared/formatters';

export interface HistoryGroup {
  rawKey: string;
  archived: boolean;
  items: AttendanceRecord[];
}

export interface SelectedHistoryItemResult {
  group: HistoryGroup;
  index: number;
  item: AttendanceRecord;
}

/**
 * Groups attendance records according to active grouping mode (day, week, month).
 */
export function buildHistoryGroups(
  history: AttendanceRecord[],
  mode: HistoryGroupingMode,
  showArchived: boolean
): HistoryGroup[] {
  const map = new Map<string, HistoryGroup>();

  history
    .filter((h) => !h.archivedAt || showArchived)
    .forEach((h) => {
      const archived = Boolean(h.archivedAt);
      let dateGroupKey = '';

      if (mode === 'week') {
        dateGroupKey = getWeekDetails(h.takenAt).key;
      } else if (mode === 'month') {
        dateGroupKey = getMonthDetails(h.takenAt).key;
      } else {
        dateGroupKey = dayKey(h.takenAt);
      }

      const rawKey = `${h.listId || cleanListName(h.listName)}|${dateGroupKey}|${archived ? 'a' : 'n'}`;
      if (!map.has(rawKey)) {
        map.set(rawKey, { rawKey, archived, items: [] });
      }
      map.get(rawKey)!.items.push(h);
    });

  const groups = [...map.values()];
  groups.forEach((g) =>
    g.items.sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime())
  );
  groups.sort((a, b) => {
    const aLast = a.items[a.items.length - 1];
    const bLast = b.items[b.items.length - 1];
    if (!aLast || !bLast) return 0;
    return new Date(bLast.takenAt).getTime() - new Date(aLast.takenAt).getTime();
  });
  return groups;
}

/**
 * Returns currently selected item within a history group card.
 */
export function selectedHistoryItem(
  cache: Record<string, HistoryGroup>,
  key: string,
  indexMap: Record<string, number>
): SelectedHistoryItemResult | null {
  const g = cache[key];
  if (!g || !g.items.length) return null;
  const i = Math.min(indexMap[g.rawKey] || 0, g.items.length - 1);
  indexMap[g.rawKey] = Math.max(0, i);
  const item = g.items[i];
  if (!item) return null;
  return { group: g, index: i, item };
}

/**
 * Cycles history grouping mode: day -> week -> month -> day.
 */
export function nextGroupingMode(current: HistoryGroupingMode): HistoryGroupingMode {
  return current === 'day' ? 'week' : current === 'week' ? 'month' : 'day';
}
