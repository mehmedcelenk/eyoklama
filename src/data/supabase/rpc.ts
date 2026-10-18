/**
 * Strongly-Typed Supabase RPC Dispatcher
 * Vibecoding-Safe Native DOM Architecture
 * Implements all 17 RPC endpoints with strict parameter and return contracts
 */

import { getSupabaseClient } from './client';
import type {
  LoginResult,
  BootstrapData,
  AttendanceLockResult,
  AttendanceDetails,
  AttendanceChangeItem,
  ApplyChangesResult,
  UndoChangeResult,
  ClassList,
  BackupExport
} from '../models/types';

/**
 * Strips Supabase / Postgres error wrappers (e.g. P0001) for clean UI presentation.
 */
export function cleanRpcError(err: { message?: string } | null | undefined): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'İnternet bağlantısı yok.';
  }
  let msg = err?.message || 'İşlem başarısız.';
  msg = msg.replace(/^.*?P0001[: ]*/i, '').replace(/^.*?message[: ]*/i, '');
  return msg;
}

/**
 * Type contract map for all 17 Supabase RPC endpoints
 */
export interface RpcSchema {
  app_login: {
    params: { p_name?: string; p_pin?: string; p_device_token: string };
    returns: LoginResult;
  };
  app_bootstrap: {
    params: { p_token: string };
    returns: BootstrapData;
  };
  app_logout: {
    params: { p_token: string };
    returns: { ok?: boolean } | void;
  };
  begin_attendance: {
    params: { p_token: string; p_list_id: string };
    returns: AttendanceLockResult;
  };
  release_attendance: {
    params: { p_token: string; p_list_id: string };
    returns: { ok?: boolean } | void;
  };
  heartbeat_attendance: {
    params: { p_token: string; p_list_id: string };
    returns: { ok?: boolean } | void;
  };
  save_attendance: {
    params: { p_token: string; p_list_id: string; p_statuses: Record<string, string> };
    returns: { success?: boolean; id?: string };
  };
  get_attendance: {
    params: { p_token: string; p_attendance_id: string };
    returns: AttendanceDetails;
  };
  apply_attendance_changes: {
    params: { p_token: string; p_attendance_id: string; p_changes: AttendanceChangeItem[] };
    returns: ApplyChangesResult;
  };
  undo_attendance_change: {
    params: {
      p_token: string;
      p_attendance_id?: string;
      p_undo_token: string;
      p_password?: string | null;
    };
    returns: UndoChangeResult;
  };
  archive_attendance: {
    params: { p_token: string; p_attendance_id: string };
    returns: { success?: boolean };
  };
  create_list: {
    params: {
      p_token: string;
      p_name: string;
      p_students: Array<{ firstName: string; lastName: string }>;
    };
    returns: ClassList & { listId?: string };
  };
  rename_list: {
    params: { p_token: string; p_list_id: string; p_name: string };
    returns: { success?: boolean; id?: string; name?: string };
  };
  delete_list: {
    params: { p_token: string; p_list_id: string };
    returns: { success?: boolean };
  };
  regenerate_teacher_pin: {
    params: { p_token: string; p_pin?: string };
    returns: { teacherPin?: string; pin?: string };
  };
  change_admin_password: {
    params: {
      p_token: string;
      p_old_password: string;
      p_new_password: string;
      p_confirm_password?: string;
    };
    returns: { success?: boolean };
  };
  admin_export_backup: {
    params: { p_token: string };
    returns: BackupExport;
  };
}

export type RpcFunctionName = keyof RpcSchema;

/**
 * Invokes a typed Supabase RPC stored procedure.
 *
 * @param name Stored procedure name
 * @param params Stored procedure arguments
 * @returns Result data typed according to RpcSchema
 */
export async function rpc<K extends RpcFunctionName>(
  name: K,
  params: RpcSchema[K]['params']
): Promise<RpcSchema[K]['returns']>;
export async function rpc<T = unknown>(
  name: string,
  params?: Record<string, unknown>
): Promise<T>;
export async function rpc(
  name: string,
  params: Record<string, unknown> = {}
): Promise<unknown> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc(name, params);
  if (error) {
    throw new Error(cleanRpcError(error));
  }
  return data;
}
