/**
 * Attendance Filter Utilities
 * Vibecoding-Safe Native DOM Architecture
 * Pure utilities for filtering student attendance subsets
 */

export interface AttendanceCounts {
  absentCount?: number;
  excusedCount?: number;
  [key: string]: unknown;
}

/**
 * Filters a student collection to only include students who were absent or excused.
 * Used for focused PDF reports and attendance analytics.
 *
 * @param students Array of student objects with absentCount and excusedCount
 * @returns Filtered array containing only absent or excused students
 */
export function filterAbsentOrExcusedStudents<T extends AttendanceCounts>(students: T[]): T[] {
  return students.filter((s) => (s.absentCount ?? 0) > 0 || (s.excusedCount ?? 0) > 0);
}
