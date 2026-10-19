/**
 * Admin Management Actions & Security Subsystem
 * Vibecoding-Safe Native DOM Architecture
 */

import { rpc } from '../../data/supabase/rpc';
import { getSupabaseClient } from '../../data/supabase/client';
import type { FeatureContext } from '../../data/models/types';
import { generateMemorablePin } from '../../shared/pin';
import { todayKey } from '../../shared/date';
import { toast } from '../../shared/toast';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Toggles PIN visibility between masked and plaintext.
 */
export function togglePinReveal(context: FeatureContext): void {
  const cur = context.getState().session.pinRevealed;
  context.setState({ session: { pinRevealed: !cur } });
}

/**
 * Copies today's teacher PIN to clipboard.
 */
export async function copyPin(context: FeatureContext): Promise<void> {
  const pin = context.getState().session.teacherPin || '';
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(pin);
      toast('PIN kopyalandı.');
      return;
    }
  } catch {
    // fallback
  }
  toast(`PIN: ${pin}`);
}

/**
 * Regenerates teacher PIN with memorable pattern and saves to backend.
 */
export async function regeneratePin(context: FeatureContext): Promise<void> {
  const state = context.getState();
  const newPin = generateMemorablePin();

  try {
    let r: any;
    try {
      r = await rpc('regenerate_teacher_pin', { p_token: state.session.token, p_pin: newPin });
    } catch {
      r = await rpc('regenerate_teacher_pin', { p_token: state.session.token });
    }

    const teacherPin = r?.teacherPin || r?.pin || newPin;
    const teacherPinDate =
      r?.teacherPinDate ||
      new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

    context.setState({ session: { teacherPin, teacherPinDate } });
    toast(`Yeni PIN üretildi: ${teacherPin}`);
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'PIN üretilemedi.');
  }
}

/**
 * Enters in-place editing mode for class list name.
 */
export function startRenameList(id: string, context: FeatureContext): void {
  context.setState({ roster: { editingListId: id } });
  const input = $(`className-${id}`) as HTMLInputElement | null;
  if (input) {
    input.focus();
    input.select();
  }
}

/**
 * Cancels class list renaming mode.
 */
export function cancelClassRename(context: FeatureContext): void {
  context.setState({ roster: { editingListId: null } });
}

/**
 * Confirms class list renaming and persists to backend via rename_list RPC.
 */
export async function confirmRenameList(id: string, context: FeatureContext): Promise<void> {
  const input = $(`className-${id}`) as HTMLInputElement | null;
  const name = input?.value.trim() || '';

  if (!name) {
    toast('Sınıf adı boş olamaz.');
    return;
  }

  try {
    await rpc('rename_list', {
      p_token: context.getState().session.token,
      p_list_id: id,
      p_name: name
    });
    context.setState({ roster: { editingListId: null } });
    await context.refresh();
    toast('Sınıf adı değiştirildi.');
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Ad değiştirilemedi.');
  }
}

/**
 * Deletes a class list via delete_list RPC with user confirmation.
 */
export async function deleteList(id: string, context: FeatureContext): Promise<void> {
  if (context.getState().session.role !== 'admin') {
    toast('Sınıf silmek için kurum yöneticisi yetkisi gereklidir.');
    return;
  }
  const list = context.getState().roster.lists.find((x) => x.id === id);
  if (!list) return;

  const msg = `“${list.name}” sınıfı silinsin mi?\nEski yoklamalar korunur.`;
  if (typeof window !== 'undefined' && !window.confirm(msg)) {
    return;
  }

  try {
    await rpc('delete_list', {
      p_token: context.getState().session.token,
      p_list_id: id
    });
    if (context.getState().roster.editingListId === id) {
      context.setState({ roster: { editingListId: null } });
    }
    await context.refresh();
    toast('Sınıf silindi.');
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Sınıf silinemedi.');
  }
}

/**
 * Exports JSON backup of all lists and history records.
 */
export async function downloadBackup(context: FeatureContext): Promise<void> {
  const msg =
    'Bu dosya sınıflarınızın ve tüm yoklama geçmişinizin yedeğidir. Güvenli bir yerde saklayın ve silmeyin. Parola/PIN içermez. İndirilsin mi?';
  if (typeof window !== 'undefined' && !window.confirm(msg)) {
    return;
  }

  try {
    const data = await rpc('admin_export_backup', {
      p_token: context.getState().session.token
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eyoklama-yedek-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Yedek indirildi. Güvenli bir yerde saklayın.');
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Yedek indirilemedi.');
  }
}

/**
 * Modifies master admin password with policy verification.
 */
export async function changeAdminPassword(context: FeatureContext): Promise<void> {
  const oldInput = $('oldAdminPassword') as HTMLInputElement | null;
  const newInput = $('newAdminPassword') as HTMLInputElement | null;
  const confirmInput = $('confirmAdminPassword') as HTMLInputElement | null;

  const oldP = oldInput?.value || '';
  const newP = newInput?.value || '';
  const confirmP = confirmInput?.value || '';

  if (!oldP) {
    toast('Mevcut parolayı yazın.');
    return;
  }
  if (newP !== confirmP) {
    toast('Yeni parolalar eşleşmiyor.');
    return;
  }
  if (newP.length < 11) {
    toast('Yeni parola en az 11 karakter olmalı.');
    return;
  }
  if (!/[A-ZÇĞİÖŞÜ]/.test(newP)) {
    toast('En az bir büyük harf gerekli.');
    return;
  }
  if (!/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(newP)) {
    toast('En az bir özel karakter gerekli.');
    return;
  }

  try {
    await rpc('change_admin_password', {
      p_token: context.getState().session.token,
      p_old_password: oldP,
      p_new_password: newP,
      p_confirm_password: confirmP
    });
    if (oldInput) oldInput.value = '';
    if (newInput) newInput.value = '';
    if (confirmInput) confirmInput.value = '';
    toast('Üst yetkili parolası değiştirildi.');
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Parola değiştirilemedi.');
  }
}

/**
 * Updates institution name and slug.
 */
export async function updateInstitutionProfile(context: FeatureContext): Promise<void> {
  if (context.getState().session.role !== 'admin') {
    toast('Bu işlem için kurum yöneticisi yetkisi gereklidir.');
    return;
  }

  const nameInput = $('institutionNameInput') as HTMLInputElement | null;
  const slugInput = $('institutionSlugInput') as HTMLInputElement | null;

  const rawName = nameInput?.value.trim() || '';
  const rawSlug = slugInput?.value.trim().toLowerCase() || '';

  if (!rawName || rawName.length < 2) {
    toast('Kurum adı en az 2 karakter olmalıdır.');
    return;
  }
  if (!rawSlug || rawSlug.length < 2) {
    toast('Kurum kodu en az 2 karakter olmalıdır.');
    return;
  }
  if (!/^[a-z0-9_-]+$/.test(rawSlug)) {
    toast('Kurum kodu yalnızca küçük harf, rakam ve tire içerebilir.');
    return;
  }

  const token = context.getState().session.token;

  try {
    try {
      await rpc('update_institution_profile', {
        p_token: token,
        p_name: rawName,
        p_slug: rawSlug
      });
    } catch {
      const client = getSupabaseClient();
      const currentSlug = context.getState().session.institutionSlug || 'default';
      const { error } = await client
        .from('institutions')
        .update({ name: rawName, slug: rawSlug })
        .eq('slug', currentSlug);
      if (error) throw error;
    }

    context.setState({
      session: {
        institutionName: rawName,
        institutionSlug: rawSlug
      }
    });

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('eyoklama_institution_slug', rawSlug);
    }

    context.updateTopBar();
    toast('Kurum bilgileri güncellendi.');
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Kurum bilgileri güncellenemedi.');
  }
}

