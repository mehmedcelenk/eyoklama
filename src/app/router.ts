/**
 * Application Tab Router & Coordinator
 * Vibecoding-Safe Native DOM Architecture
 */

import type { TabName } from '../data/models/types';
import { getState, setState } from './store';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

export type RouteRenderCallback = (tab: TabName) => void;
let renderCallback: RouteRenderCallback | null = null;

/**
 * Registers callback invoked whenever active tab changes to render target view.
 */
export function setRouteRenderer(callback: RouteRenderCallback): void {
  renderCallback = callback;
}

/**
 * Navigates to target application tab.
 */
export function navigate(tab: TabName, options?: { skipClearActive?: boolean }): void {
  const state = getState();

  if (tab !== 'attendance' && !options?.skipClearActive) {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('eyoklama_active');
    }
    setState({
      attendance: { active: null },
      history: {
        stagedDrafts: tab === 'lists' || tab === 'history' ? state.history.stagedDrafts : {},
        activeEditModes: tab === 'lists' || tab === 'history' ? state.history.activeEditModes : {}
      }
    });
  }

  setState({ navigation: { currentTab: tab } });

  if (typeof document === 'undefined') return;

  if (tab === 'attendance') {
    $('topNav')?.classList.add('hidden');
    document.querySelectorAll('.page').forEach((x) => x.classList.add('hidden'));
    $('attendancePage')?.classList.remove('hidden');
  } else {
    $('attendancePage')?.classList.add('hidden');
    $('topNav')?.classList.remove('hidden');
    document.querySelectorAll('.page').forEach((x) => x.classList.add('hidden'));

    const targetSection = tab === 'history' || tab === 'lists' ? 'lists' : tab;
    $(`${targetSection}Page`)?.classList.remove('hidden');
  }

  if (typeof window !== 'undefined') {
    window.scrollTo(0, 0);
  }

  if (renderCallback) {
    renderCallback(tab);
  }
}

export const router = {
  navigate,
  setRouteRenderer
};
