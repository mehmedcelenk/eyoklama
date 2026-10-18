import { describe, it, expect } from 'vitest';
import { filterAbsentOrExcusedStudents } from '@shared/attendance-filter';

describe('Attendance Filter Utility (filterAbsentOrExcusedStudents)', () => {
  it('preserves assertion 7: filters only students who are absent or excused', () => {
    const students = [
      { key: '1', name: 'Tam Katılan', absentCount: 0, excusedCount: 0 },
      { key: '2', name: 'Yok Olan', absentCount: 1, excusedCount: 0 },
      { key: '3', name: 'İzinli Olan', absentCount: 0, excusedCount: 1 }
    ];

    const filtered = filterAbsentOrExcusedStudents(students);
    expect(filtered.length).toBe(2);
    expect(filtered[0]?.name).toBe('Yok Olan');
    expect(filtered[1]?.name).toBe('İzinli Olan');
  });

  it('returns empty array when all students are present (0 absent and 0 excused)', () => {
    const students = [
      { key: '1', name: 'Öğrenci 1', absentCount: 0, excusedCount: 0 },
      { key: '2', name: 'Öğrenci 2', absentCount: 0, excusedCount: 0 }
    ];
    expect(filterAbsentOrExcusedStudents(students)).toEqual([]);
  });

  it('handles empty student list', () => {
    expect(filterAbsentOrExcusedStudents([])).toEqual([]);
  });

  it('retains students who have both absent and excused counts', () => {
    const students = [
      { key: '1', name: 'Çok Devamsız', absentCount: 2, excusedCount: 3 },
      { key: '2', name: 'Düzenli', absentCount: 0, excusedCount: 0 }
    ];
    const filtered = filterAbsentOrExcusedStudents(students);
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.name).toBe('Çok Devamsız');
  });

  it('handles objects with undefined or optional count fields safely', () => {
    const students = [
      { key: '1', name: 'Eksik Alanlar' },
      { key: '2', name: 'Sadece Devamsız', absentCount: 1 }
    ];
    const filtered = filterAbsentOrExcusedStudents(students);
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.name).toBe('Sadece Devamsız');
  });
});
