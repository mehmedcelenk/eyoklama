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
  BackupExport,
  GradeEntry,
  StudentReportResponse,
  MasterStudent,
  TeacherAccessResponse,
  TeacherApprovalCheckResponse,
  AdminTeacherApprovalsResult
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
    params: {
      p_name?: string;
      p_pin?: string;
      p_device_token: string;
      p_institution_slug?: string;
    };
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
      p_students: Array<{ firstName: string; lastName: string; tcNo?: string }>;
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
  get_student_report: {
    params: { p_tc: string };
    returns: StudentReportResponse;
  };
  save_grades_batch: {
    params: {
      p_token: string;
      p_list_id: string;
      p_course_name: string;
      p_academic_year: string;
      p_term: number;
      p_exam: number;
      p_entries: GradeEntry[];
    };
    returns: { success?: boolean };
  };
  get_class_grades: {
    params: {
      p_token: string;
      p_list_id: string;
      p_course_name: string;
      p_academic_year: string;
      p_term: number;
      p_exam: number;
    };
    returns: Record<string, { grade: string; opinion: string }>;
  };
  get_school_students: {
    params: { p_token: string };
    returns: MasterStudent[];
  };
  upsert_school_students: {
    params: {
      p_token: string;
      p_students: Array<{ firstName: string; lastName: string; tcNo?: string; classLabel?: string }>;
    };
    returns: { success?: boolean; insertedCount?: number };
  };
  delete_school_student: {
    params: { p_token: string; p_student_id: string };
    returns: { success?: boolean };
  };
  request_teacher_access: {
    params: {
      p_institution_slug: string;
      p_tc_no: string;
      p_full_name?: string;
      p_device_token: string;
    };
    returns: TeacherAccessResponse;
  };
  check_teacher_approval: {
    params: {
      p_institution_slug: string;
      p_tc_no: string;
      p_device_token: string;
    };
    returns: TeacherApprovalCheckResponse;
  };
  admin_get_teacher_approvals: {
    params: { p_token: string };
    returns: AdminTeacherApprovalsResult;
  };
  admin_decide_teacher: {
    params: {
      p_token: string;
      p_registration_id: string;
      p_action: 'approve' | 'reject' | 'revoke' | 'delete';
    };
    returns: { ok?: boolean; action?: string; id?: string };
  };
  update_student_in_list: {
    params: {
      p_token: string;
      p_list_id: string;
      p_student_id: string;
      p_first_name: string;
      p_last_name: string;
      p_tc_no?: string | null;
    };
    returns: {
      success?: boolean;
      studentId?: string;
      firstName?: string;
      lastName?: string;
      tcNo?: string;
      poolSynced?: boolean;
    };
  };
  add_student_to_list: {
    params: {
      p_token: string;
      p_list_id: string;
      p_first_name: string;
      p_last_name: string;
      p_tc_no?: string | null;
    };
    returns: {
      success?: boolean;
      studentId?: string;
      firstName?: string;
      lastName?: string;
      tcNo?: string;
      poolSynced?: boolean;
    };
  };
  remove_student_from_list: {
    params: {
      p_token: string;
      p_list_id: string;
      p_student_id: string;
    };
    returns: { success?: boolean; removedStudentId?: string };
  };
  bulk_add_students_to_list: {
    params: {
      p_token: string;
      p_list_id: string;
      p_students: Array<{ firstName: string; lastName: string; tcNo?: string }>;
    };
    returns: { success?: boolean; addedCount?: number };
  };
  update_school_student: {
    params: {
      p_token: string;
      p_student_id: string;
      p_first_name: string;
      p_last_name: string;
      p_tc_no?: string | null;
      p_class_label?: string | null;
    };
    returns: {
      success?: boolean;
      studentId?: string;
      firstName?: string;
      lastName?: string;
      tcNo?: string;
      classLabel?: string;
    };
  };
  update_institution_profile: {
    params: {
      p_token: string;
      p_name: string;
      p_slug: string;
    };
    returns: {
      success?: boolean;
      name?: string;
      slug?: string;
    };
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
