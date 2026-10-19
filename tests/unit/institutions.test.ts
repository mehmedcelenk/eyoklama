import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getActiveInstitution,
  setActiveInstitution,
  INSTITUTIONS,
  INSTITUTION_STORAGE_KEY
} from '../../src/data/supabase/config';
import {
  getTeacherNameKey,
  getTeacherWeekUntilKey
} from '../../src/data/storage/keys';

describe('Multi-Institution Config & Storage Scoping', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset location mock if needed
    if (typeof window !== 'undefined') {
      history.replaceState({}, '', '/');
    }
  });

  it('defaults to 1. Kurum (default) when no parameters or subdomains are present', () => {
    const inst = getActiveInstitution();
    expect(inst.id).toBe('kurum1');
    expect(inst.slug).toBe('default');
    expect(inst.supabaseUrl).toBe(INSTITUTIONS.default!.supabaseUrl);
  });

  it('resolves kurum2 when k query parameter is passed in URL', () => {
    history.replaceState({}, '', '/?k=kurum2');
    const inst = getActiveInstitution();
    expect(inst.id).toBe('kurum2');
    expect(inst.slug).toBe('kurum2');
    expect(localStorage.getItem(INSTITUTION_STORAGE_KEY)).toBe('kurum2');
  });

  it('resolves institution saved in localStorage', () => {
    localStorage.setItem(INSTITUTION_STORAGE_KEY, 'kurum2');
    const inst = getActiveInstitution();
    expect(inst.id).toBe('kurum2');
    expect(inst.name).toBe('2. Kurum');
  });

  it('manually switches institution via setActiveInstitution', () => {
    setActiveInstitution('kurum2');
    expect(localStorage.getItem(INSTITUTION_STORAGE_KEY)).toBe('kurum2');
    const inst = getActiveInstitution();
    expect(inst.slug).toBe('kurum2');
  });

  it('scopes teacher storage keys when non-default institution is active', () => {
    // Default
    history.replaceState({}, '', '/');
    localStorage.removeItem(INSTITUTION_STORAGE_KEY);
    expect(getTeacherNameKey()).toBe('eyoklama_v3_teacher_name');
    expect(getTeacherWeekUntilKey()).toBe('eyoklama_v3_teacher_week_until');

    // Kurum 2
    history.replaceState({}, '', '/?k=kurum2');
    expect(getTeacherNameKey()).toBe('eyoklama_v3_teacher_name_kurum2');
    expect(getTeacherWeekUntilKey()).toBe('eyoklama_v3_teacher_week_until_kurum2');
  });

  it('updates institution profile name and slug for admin', async () => {
    const { updateInstitutionProfile } = await import('../../src/features/settings/admin-actions');
    const rpcModule = await import('../../src/data/supabase/rpc');
    const rpcSpy = vi.spyOn(rpcModule, 'rpc').mockResolvedValue({ success: true, name: 'Yeni Okul', slug: 'yeni-okul' });

    let state = {
      session: {
        role: 'admin' as const,
        token: 'admin-token',
        institutionName: 'Eski Okul',
        institutionSlug: 'eski-okul'
      }
    };

    const mockContext = {
      getState: () => state as any,
      setState: vi.fn((updater: any) => {
        const partial = typeof updater === 'function' ? updater(state) : updater;
        state = {
          ...state,
          session: { ...state.session, ...partial.session }
        };
      }),
      navigate: vi.fn(),
      refresh: vi.fn(),
      updateTopBar: vi.fn()
    };

    document.body.innerHTML = `
      <input id="institutionNameInput" value="Yeni Okul" />
      <input id="institutionSlugInput" value="yeni-okul" />
    `;

    await updateInstitutionProfile(mockContext as any);

    expect(rpcSpy).toHaveBeenCalledWith('update_institution_profile', {
      p_token: 'admin-token',
      p_name: 'Yeni Okul',
      p_slug: 'yeni-okul'
    });
    expect(mockContext.setState).toHaveBeenCalled();
    expect(mockContext.updateTopBar).toHaveBeenCalled();
    expect(localStorage.getItem('eyoklama_institution_slug')).toBe('yeni-okul');

    rpcSpy.mockRestore();
  });
});
