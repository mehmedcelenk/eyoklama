import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getState, setState, subscribe, resetState } from '@app/store';
import { navigate, setRouteRenderer } from '@app/router';
import type { InFlightAttendance } from '@data/models/types';

describe('Milestone M3 Empirical Stress: Central State Store', () => {
  beforeEach(() => {
    resetState();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('handles multiple subscriber registrations and notifications correctly', () => {
    const logA: string[] = [];
    const logB: string[] = [];

    const unsubA = subscribe((s) => logA.push(s.session.displayName));
    const unsubB = subscribe((s) => logB.push(s.session.displayName));

    setState({ session: { displayName: 'Teacher Alice' } });
    setState({ session: { displayName: 'Teacher Bob' } });

    expect(logA).toEqual(['Teacher Alice', 'Teacher Bob']);
    expect(logB).toEqual(['Teacher Alice', 'Teacher Bob']);

    unsubA();
    setState({ session: { displayName: 'Teacher Charlie' } });

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

    expect(() => setState({ session: { displayName: 'Resilient Teacher' } })).not.toThrow();
    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(successListener).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });

  it('supports updater function and preserves immutability via shallow clone', () => {
    setState({ session: { displayName: 'Initial' }, navigation: { currentTab: 'lists' } });
    const snap1 = getState();

    setState((prev) => ({ session: { displayName: `${prev.session.displayName} -> Updated` } }));
    const snap2 = getState();

    expect(snap1.session.displayName).toBe('Initial');
    expect(snap2.session.displayName).toBe('Initial -> Updated');
    expect(snap1).not.toBe(snap2);
  });

  it('syncs active attendance session with sessionStorage', () => {
    const dummyActive: InFlightAttendance = {
      mode: 'new',
      listId: 'list-123',
      listName: '9-A',
      students: [{ id: 's1', firstName: 'Ahmet', lastName: 'Yılmaz' }],
      statuses: { s1: 'present' }
    };

    setState({ attendance: { active: dummyActive } });
    expect(sessionStorage.getItem('eyoklama_active')).toContain('list-123');

    setState({ attendance: { active: null } });
    expect(sessionStorage.getItem('eyoklama_active')).toBeNull();
  });

  it('sustains rapid high-volume state updates under multiple listeners', () => {
    let callCount = 0;
    const unsub = subscribe(() => {
      callCount++;
    });

    for (let i = 0; i < 500; i++) {
      setState({ session: { displayName: `Iter ${i}` } });
    }

    expect(callCount).toBe(500);
    expect(getState().session.displayName).toBe('Iter 499');
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
    expect(getState().navigation.currentTab).toBe('lists');
    expect(document.getElementById('topNav')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('listsPage')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('attendancePage')?.classList.contains('hidden')).toBe(true);

    navigate('attendance');
    expect(getState().navigation.currentTab).toBe('attendance');
    expect(document.getElementById('topNav')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('attendancePage')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('listsPage')?.classList.contains('hidden')).toBe(true);

    navigate('admin');
    expect(getState().navigation.currentTab).toBe('admin');
    expect(document.getElementById('adminPage')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('attendancePage')?.classList.contains('hidden')).toBe(true);
  });

  it('clears active session when navigating away unless skipClearActive is specified', () => {
    const dummyActive: InFlightAttendance = {
      mode: 'new',
      listId: 'list-99',
      listName: '10-B',
      students: [],
      statuses: {}
    };

    setState({ attendance: { active: dummyActive } });
    sessionStorage.setItem('eyoklama_active', JSON.stringify(dummyActive));

    // Navigating without skipClearActive clears active
    navigate('lists');
    expect(getState().attendance.active).toBeNull();
    expect(sessionStorage.getItem('eyoklama_active')).toBeNull();

    // Navigating with skipClearActive preserves active
    setState({ attendance: { active: dummyActive } });
    sessionStorage.setItem('eyoklama_active', JSON.stringify(dummyActive));
    navigate('lists', { skipClearActive: true });
    expect(getState().attendance.active).toEqual(dummyActive);
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
