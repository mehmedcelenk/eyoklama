import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getState, setState, subscribe, resetState } from '@app/store';
import { navigate, setRouteRenderer } from '@app/router';
import { renderStudentCard } from '@features/attendance/student-card';
import { handleStudentTap, updateAttendanceCounts } from '@features/attendance/attendance-view';
import { buildHistoryGroups, nextGroupingMode, selectedHistoryItem, HistoryGroup } from '@features/history/grouping';
import type { ActiveAttendance, AttendanceRecord, FeatureContext } from '@data/models/types';

describe('Milestone M3 Empirical Stress: Central State Store', () => {
  beforeEach(() => {
    resetState();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('handles multiple subscriber registrations and notifications correctly', () => {
    const logA: string[] = [];
    const logB: string[] = [];

    const unsubA = subscribe((s) => logA.push(s.displayName));
    const unsubB = subscribe((s) => logB.push(s.displayName));

    setState({ displayName: 'Teacher Alice' });
    setState({ displayName: 'Teacher Bob' });

    expect(logA).toEqual(['Teacher Alice', 'Teacher Bob']);
    expect(logB).toEqual(['Teacher Alice', 'Teacher Bob']);

    unsubA();
    setState({ displayName: 'Teacher Charlie' });

    expect(logA).toEqual(['Teacher Alice', 'Teacher Bob']);
    expect(logB).toEqual(['Teacher Alice', 'Teacher Bob', 'Teacher Charlie']);

    // Multiple unsubscribes are idempotent and do not throw
    expect(() => {
      unsubA();
      unsubA();
      unsubB();
      unsubB();
    }).not.toThrow();
  });

  it('isolates subscriber errors so subsequent listeners still execute', () => {
    const errorListener = vi.fn().mockImplementation(() => {
      throw new Error('Subscriber intentional failure');
    });
    const successListener = vi.fn();

    const unsub1 = subscribe(errorListener);
    const unsub2 = subscribe(successListener);

    expect(() => setState({ displayName: 'Resilient Teacher' })).not.toThrow();
    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(successListener).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it('supports updater function and preserves immutability via shallow clone', () => {
    setState({ displayName: 'Initial', currentTab: 'lists' });
    const snap1 = getState();

    setState((prev) => ({ displayName: `${prev.displayName} -> Updated` }));
    const snap2 = getState();

    expect(snap1.displayName).toBe('Initial');
    expect(snap2.displayName).toBe('Initial -> Updated');
    expect(snap1).not.toBe(snap2);
  });

  it('syncs active attendance session with sessionStorage', () => {
    const dummyActive: ActiveAttendance = {
      mode: 'new',
      listId: 'list-123',
      listName: '9-A',
      students: [{ id: 's1', firstName: 'Ahmet', lastName: 'Yılmaz' }],
      statuses: { s1: 'present' }
    };

    setState({ active: dummyActive });
    expect(sessionStorage.getItem('eyoklama_active')).toContain('list-123');

    setState({ active: null });
    expect(sessionStorage.getItem('eyoklama_active')).toBeNull();
  });

  it('sustains rapid high-volume state updates under multiple listeners', () => {
    let callCount = 0;
    const unsub = subscribe(() => {
      callCount++;
    });

    for (let i = 0; i < 500; i++) {
      setState({ displayName: `Iter ${i}` });
    }

    expect(callCount).toBe(500);
    expect(getState().displayName).toBe('Iter 499');
    unsub();
  });
});

describe('Milestone M3 Empirical Stress: Router Navigation', () => {
  beforeEach(() => {
    resetState();
    sessionStorage.clear();
    document.body.innerHTML = `
      <div id="topNav"></div>
      <div id="attendancePage" class="page hidden"></div>
      <div id="listsPage" class="page hidden"></div>
      <div id="newPage" class="page hidden"></div>
      <div id="adminPage" class="page hidden"></div>
    `;
  });

  it('switches views and updates DOM visibility according to target tab', () => {
    navigate('lists');
    expect(getState().currentTab).toBe('lists');
    expect(document.getElementById('topNav')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('listsPage')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('attendancePage')?.classList.contains('hidden')).toBe(true);

    navigate('attendance');
    expect(getState().currentTab).toBe('attendance');
    expect(document.getElementById('topNav')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('attendancePage')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('listsPage')?.classList.contains('hidden')).toBe(true);

    navigate('admin');
    expect(getState().currentTab).toBe('admin');
    expect(document.getElementById('adminPage')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('attendancePage')?.classList.contains('hidden')).toBe(true);
  });

  it('clears active session when navigating away unless skipClearActive is specified', () => {
    const dummyActive: ActiveAttendance = {
      mode: 'new',
      listId: 'list-99',
      listName: '10-B',
      students: [],
      statuses: {}
    };

    setState({ active: dummyActive });
    sessionStorage.setItem('eyoklama_active', JSON.stringify(dummyActive));

    // Navigating without skipClearActive clears active
    navigate('lists');
    expect(getState().active).toBeNull();
    expect(sessionStorage.getItem('eyoklama_active')).toBeNull();

    // Navigating with skipClearActive preserves active
    setState({ active: dummyActive });
    sessionStorage.setItem('eyoklama_active', JSON.stringify(dummyActive));
    navigate('lists', { skipClearActive: true });
    expect(getState().active).toEqual(dummyActive);
  });

  it('invokes registered route renderer callback', () => {
    const renderer = vi.fn();
    setRouteRenderer(renderer);

    navigate('new');
    expect(renderer).toHaveBeenCalledWith('new');

    navigate('history');
    expect(renderer).toHaveBeenCalledWith('history');
  });
});

describe('Milestone M3 Empirical Stress: Attendance Tri-State Toggles (+, -, ±)', () => {
  let context: FeatureContext;

  beforeEach(() => {
    resetState();
    document.body.innerHTML = `
      <div id="topCounts"></div>
      <button class="save-fab dimmed"></button>
    `;
    context = {
      getState,
      setState,
      navigate,
      refresh: vi.fn(),
      updateTopBar: vi.fn()
    };
  });

  it('cycles student status deterministically: absent (-) -> present (+) -> excused (±) -> absent (-)', () => {
    const studentId = 'student-1';
    const active: ActiveAttendance = {
      mode: 'new',
      listId: 'list-1',
      listName: 'Math',
      students: [{ id: studentId, firstName: 'Ali', lastName: 'Kaya' }],
      statuses: { [studentId]: 'absent' }
    };
    setState({ active });

    // Step 1: absent -> present (+)
    handleStudentTap(studentId, context);
    expect(getState().active?.statuses[studentId]).toBe('present');

    // Step 2: present -> excused (±)
    handleStudentTap(studentId, context);
    expect(getState().active?.statuses[studentId]).toBe('excused');

    // Step 3: excused -> absent (-)
    handleStudentTap(studentId, context);
    expect(getState().active?.statuses[studentId]).toBe('absent');

    // Run cycle 30 times consecutively
    for (let i = 0; i < 30; i++) {
      handleStudentTap(studentId, context); // -> present
      expect(getState().active?.statuses[studentId]).toBe('present');
      handleStudentTap(studentId, context); // -> excused
      expect(getState().active?.statuses[studentId]).toBe('excused');
      handleStudentTap(studentId, context); // -> absent
      expect(getState().active?.statuses[studentId]).toBe('absent');
    }
  });

  it('strictly prevents toggling for students with preExcused administrative lock', () => {
    const studentId = 'student-locked';
    const active: ActiveAttendance = {
      mode: 'new',
      listId: 'list-1',
      listName: 'Math',
      students: [{ id: studentId, firstName: 'Zeynep', lastName: 'Demir' }],
      statuses: { [studentId]: 'excused' },
      preExcused: { [studentId]: true }
    };
    setState({ active });

    // Attempting tap must leave status unaltered
    handleStudentTap(studentId, context);
    expect(getState().active?.statuses[studentId]).toBe('excused');

    handleStudentTap(studentId, context);
    expect(getState().active?.statuses[studentId]).toBe('excused');
  });

  it('in permission mode only toggles between absent and excused, never present', () => {
    const studentId = 'perm-student';
    const active: ActiveAttendance = {
      mode: 'permission',
      listId: 'list-1',
      listName: 'Permissions',
      students: [{ id: studentId, firstName: 'Mert', lastName: 'Oz' }],
      statuses: { [studentId]: 'absent' }
    };
    setState({ active });

    handleStudentTap(studentId, context);
    expect(getState().active?.statuses[studentId]).toBe('excused');

    handleStudentTap(studentId, context);
    expect(getState().active?.statuses[studentId]).toBe('absent');

    handleStudentTap(studentId, context);
    expect(getState().active?.statuses[studentId]).toBe('excused');
  });

  it('renders student card markup with proper tags and XSS escaping', () => {
    const normalHtml = renderStudentCard({
      student: { id: 's1', firstName: 'Kemal', lastName: 'Aydın' },
      status: 'present'
    });
    expect(normalHtml).toContain('data-action="student-tap"');
    expect(normalHtml).toContain('data-student-id="s1"');
    expect(normalHtml).toContain('+');

    const lockedHtml = renderStudentCard({
      student: { id: 's2', firstName: 'Ayşe', lastName: 'Gül' },
      status: 'excused',
      isLocked: true
    });
    expect(lockedHtml).toContain('±');
    expect(lockedHtml).toContain('locked');
    expect(lockedHtml).toContain('🔒');

    const xssHtml = renderStudentCard({
      student: { id: 's3', firstName: '<script>alert(1)</script>', lastName: '" onclick="bad()' },
      status: 'absent'
    });
    expect(xssHtml).not.toContain('<script>');
    expect(xssHtml).toContain('&lt;script&gt;');
  });

  it('updates top counts and toggles dimmed state on save FAB', () => {
    const active: ActiveAttendance = {
      mode: 'new',
      listId: 'list-1',
      listName: 'Math',
      students: [
        { id: 's1', firstName: 'A', lastName: 'B' },
        { id: 's2', firstName: 'C', lastName: 'D' },
        { id: 's3', firstName: 'E', lastName: 'F' }
      ],
      statuses: { s1: 'absent', s2: 'absent', s3: 'absent' }
    };
    setState({ active });
    updateAttendanceCounts(context);

    const countsEl = document.getElementById('topCounts');
    const fab = document.querySelector('.save-fab');
    expect(countsEl?.innerHTML).toContain('<b>0</b><span>+</span>');
    expect(countsEl?.innerHTML).toContain('<b>3</b><span>-</span>');
    expect(countsEl?.innerHTML).toContain('<b>0</b><span>±</span>');
    expect(fab?.classList.contains('dimmed')).toBe(true);

    // Make 1 student present
    active.statuses.s1 = 'present';
    setState({ active });
    updateAttendanceCounts(context);

    expect(countsEl?.innerHTML).toContain('<b>1</b><span>+</span>');
    expect(countsEl?.innerHTML).toContain('<b>2</b><span>-</span>');
    expect(fab?.classList.contains('dimmed')).toBe(false);
  });
});

describe('Milestone M3 Empirical Stress: History Grouping Subsystem', () => {
  const sampleRecords: AttendanceRecord[] = [
    {
      id: 'rec-1',
      listId: 'list-1',
      listName: '10-A',
      takenAt: '2026-10-01T08:00:00Z',
      takenByName: 'Teacher 1',
      entries: [{ studentId: 's1', status: 'present', firstName: 'A', lastName: 'B' }]
    },
    {
      id: 'rec-2',
      listId: 'list-1',
      listName: '10-A',
      takenAt: '2026-10-01T12:00:00Z',
      takenByName: 'Teacher 1',
      entries: [{ studentId: 's1', status: 'absent', firstName: 'A', lastName: 'B' }]
    },
    {
      id: 'rec-3',
      listId: 'list-2',
      listName: '10-B',
      takenAt: '2026-10-02T09:00:00Z',
      takenByName: 'Teacher 2',
      entries: [{ studentId: 's2', status: 'present', firstName: 'C', lastName: 'D' }]
    },
    {
      id: 'rec-4',
      listId: 'list-1',
      listName: '10-A',
      takenAt: '2026-10-03T10:00:00Z',
      takenByName: 'Teacher 1',
      archivedAt: '2026-10-04T00:00:00Z',
      entries: [{ studentId: 's1', status: 'excused', firstName: 'A', lastName: 'B' }]
    }
  ];

  it('cycles nextGroupingMode through day -> week -> month -> day', () => {
    expect(nextGroupingMode('day')).toBe('week');
    expect(nextGroupingMode('week')).toBe('month');
    expect(nextGroupingMode('month')).toBe('day');
  });

  it('groups records by day and respects showArchived filter', () => {
    // When showArchived is false, rec-4 must be omitted
    const unarchivedGroups = buildHistoryGroups(sampleRecords, 'day', false);
    expect(unarchivedGroups.length).toBe(2);

    // List 1 on 2026-10-01 has 2 sessions sorted ascending
    const list1Day1 = unarchivedGroups.find((g) => g.rawKey.startsWith('list-1'));
    expect(list1Day1).toBeDefined();
    expect(list1Day1?.items.length).toBe(2);
    expect(new Date(list1Day1!.items[0]!.takenAt).getTime()).toBeLessThan(
      new Date(list1Day1!.items[1]!.takenAt).getTime()
    );

    // When showArchived is true, rec-4 is included in archived group
    const allGroups = buildHistoryGroups(sampleRecords, 'day', true);
    expect(allGroups.length).toBe(3);
    const archivedGroup = allGroups.find((g) => g.archived);
    expect(archivedGroup).toBeDefined();
    expect(archivedGroup?.items[0]?.id).toBe('rec-4');
  });

  it('groups records by week and month correctly', () => {
    const weekGroups = buildHistoryGroups(sampleRecords, 'week', false);
    expect(weekGroups.length).toBeGreaterThan(0);

    const monthGroups = buildHistoryGroups(sampleRecords, 'month', false);
    expect(monthGroups.length).toBeGreaterThan(0);
  });

  it('handles timezone boundaries crossing midnight in Europe/Istanbul (+3)', () => {
    // 2026-10-10 22:30:00 UTC is 2026-10-11 01:30:00 in Istanbul
    const lateUtcRecord: AttendanceRecord = {
      id: 'rec-tz',
      listId: 'list-tz',
      listName: 'TZ Test',
      takenAt: '2026-10-10T22:30:00Z',
      takenByName: 'T',
      entries: []
    };

    const groups = buildHistoryGroups([lateUtcRecord], 'day', false);
    expect(groups.length).toBe(1);
    expect(groups[0]!.rawKey).toContain('2026-10-11');
  });

  it('safely handles selectedHistoryItem edge cases with bounds clamping', () => {
    const groupKey = 'list-1|2026-10-01|n';
    const cache: Record<string, HistoryGroup> = {
      [groupKey]: {
        rawKey: groupKey,
        archived: false,
        items: [sampleRecords[0]!, sampleRecords[1]!]
      }
    };
    const indexMap: Record<string, number> = {};

    // First selection defaults to index 0
    const res0 = selectedHistoryItem(cache, groupKey, indexMap);
    expect(res0?.index).toBe(0);
    expect(res0?.item.id).toBe('rec-1');

    // Index exceeding array length is clamped to items.length - 1
    indexMap[groupKey] = 999;
    const resClamped = selectedHistoryItem(cache, groupKey, indexMap);
    expect(resClamped?.index).toBe(1);
    expect(resClamped?.item.id).toBe('rec-2');

    // Non-existent key returns null
    expect(selectedHistoryItem(cache, 'non-existent', indexMap)).toBeNull();

    // Empty items returns null
    cache['empty'] = { rawKey: 'empty', archived: false, items: [] };
    expect(selectedHistoryItem(cache, 'empty', indexMap)).toBeNull();
  });
});
