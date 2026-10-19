/**
 * Multi-Format History Export Engine (CSV & Word)
 * Vibecoding-Safe Native DOM Architecture
 * Supports instant downloads in CSV (Excel UTF-8 BOM) and Word (.doc HTML table)
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, AttendanceRecord, AttendanceDetails } from '../../data/models/types';
import { pdfCleanDate } from '../../shared/date';
import { safeFileName, cleanListName } from '../../shared/formatters';
import { toast } from '../../shared/toast';

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Loads session details for given records and caches them.
 */
async function loadSessions(records: AttendanceRecord[], context: FeatureContext): Promise<AttendanceDetails[]> {
  const state = context.getState();
  const cacheCopy = { ...state.history.sessionDetailsCache };
  const result: AttendanceDetails[] = [];

  for (const h of records) {
    let r = cacheCopy[h.id];
    if (!r && state.session.token) {
      try {
        r = (await rpc('get_attendance', {
          p_token: state.session.token,
          p_attendance_id: h.id
        })) as AttendanceDetails;
        cacheCopy[h.id] = r;
      } catch {
        // ignore single failure
      }
    }
    if (r) result.push(r);
  }
  context.setState({ history: { sessionDetailsCache: cacheCopy } });
  return result;
}

/**
 * Downloads single session or multi-session attendance as CSV (Excel compatible).
 */
export async function downloadAttendanceCsv(
  records: AttendanceRecord[],
  title: string,
  context: FeatureContext
): Promise<void> {
  try {
    const details = await loadSessions(records, context);
    if (!details.length) {
      toast('İndirilecek yoklama verisi bulunamadı.');
      return;
    }

    // Student map across all sessions
    const studentMap = new Map<string, string>();
    details.forEach((d) => {
      d.entries.forEach((e) => {
        const k = e.studentId || `${e.firstName}|${e.lastName}`;
        if (!studentMap.has(k)) {
          studentMap.set(k, `${e.firstName} ${e.lastName}`.trim());
        }
      });
    });

    const students = [...studentMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr'));
    const headers = ['Öğrenci Adı Soyadı', ...details.map((d, i) => `${cleanListName(d.attendance.listName)} (${pdfCleanDate(d.attendance.takenAt)}${details.length > 1 ? ` - ${i + 1}` : ''})`)];

    const rows = students.map(([sKey, sName]) => {
      const statuses = details.map((d) => {
        const entry = d.entries.find((e) => (e.studentId || `${e.firstName}|${e.lastName}`) === sKey);
        if (!entry) return '';
        if (entry.status === 'present') return '+';
        if (entry.status === 'excused') return '±';
        return '-';
      });
      return [sName, ...statuses].map((v) => `"${(v || '').replace(/"/g, '""')}"`).join(';');
    });

    const csvContent = '\uFEFF' + [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerBrowserDownload(blob, `yoklama-${safeFileName(title)}.csv`);
    toast('CSV (Excel) dosyası indirildi.');
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'CSV oluşturulamadı.');
  }
}

/**
 * Downloads attendance as Microsoft Word (.doc) table document.
 */
export async function downloadAttendanceWord(
  records: AttendanceRecord[],
  title: string,
  context: FeatureContext
): Promise<void> {
  try {
    const details = await loadSessions(records, context);
    if (!details.length) {
      toast('İndirilecek yoklama verisi bulunamadı.');
      return;
    }

    const studentMap = new Map<string, string>();
    details.forEach((d) => {
      d.entries.forEach((e) => {
        const k = e.studentId || `${e.firstName}|${e.lastName}`;
        if (!studentMap.has(k)) {
          studentMap.set(k, `${e.firstName} ${e.lastName}`.trim());
        }
      });
    });

    const students = [...studentMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'tr'));

    const headerThs = details
      .map(
        (d, i) =>
          `<th style="border:1px solid #999;padding:6px;background:#f0f0f0;font-size:11px;text-align:center">${cleanListName(
            d.attendance.listName
          )}<br><span style="font-weight:normal;font-size:10px">${pdfCleanDate(d.attendance.takenAt)}${
            details.length > 1 ? ` (${i + 1}/${details.length})` : ''
          }</span></th>`
      )
      .join('');

    const bodyTrs = students
      .map((s, idx) => {
        const tds = details
          .map((d) => {
            const entry = d.entries.find((e) => (e.studentId || `${e.firstName}|${e.lastName}`) === s[0]);
            if (!entry) return '<td style="border:1px solid #ccc;text-align:center;color:#888">-</td>';
            const sym = entry.status === 'present' ? '+' : entry.status === 'excused' ? '±' : '-';
            const color = entry.status === 'present' ? '#15803d' : entry.status === 'excused' ? '#b45309' : '#b91c1c';
            return `<td style="border:1px solid #ccc;text-align:center;font-weight:bold;color:${color}">${sym}</td>`;
          })
          .join('');

        return `<tr>
          <td style="border:1px solid #ccc;padding:5px 8px;font-size:11px">${idx + 1}. ${s[1]}</td>
          ${tds}
        </tr>`;
      })
      .join('');

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${title}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; margin-top: 12px; }
          h2 { margin: 0; font-size: 16px; }
          p { margin: 4px 0 12px; color: #555; font-size: 11px; }
        </style>
      </head>
      <body>
        <h2>${title}</h2>
        <p>Tarih: ${new Date().toLocaleDateString('tr-TR')} · İşaretler: + Var, - Yok, ± İzinli</p>
        <table>
          <thead>
            <tr>
              <th style="border:1px solid #999;padding:6px;background:#f0f0f0;font-size:11px;text-align:left">Öğrenci Adı Soyadı</th>
              ${headerThs}
            </tr>
          </thead>
          <tbody>
            ${bodyTrs}
          </tbody>
        </table>
      </body>
    </html>`;

    const blob = new Blob(['\uFEFF' + html], { type: 'application/msword' });
    triggerBrowserDownload(blob, `yoklama-${safeFileName(title)}.doc`);
    toast('Word (.doc) dosyası indirildi.');
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Word dosyası oluşturulamadı.');
  }
}
