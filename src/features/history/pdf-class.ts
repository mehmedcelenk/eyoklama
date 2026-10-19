/**
 * Class-Level and Single-Session PDF Generators
 * Vibecoding-Safe Native DOM Architecture
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, AttendanceRecord, AttendanceDetails } from '../../data/models/types';
import { safeFileName } from '../../shared/formatters';
import { dayKey, pdfCleanDate, formatHistoryDay } from '../../shared/date';
import { toast } from '../../shared/toast';
import { ensurePdfMake } from '../../shared/pdf-loader';

export interface PdfClassSectionResult {
  listName: string;
  day: string;
  content: any[];
}

/**
 * Builds table content and summary section for a single class session or series.
 */
export async function buildPdfClassSection(
  items: AttendanceRecord[],
  context: FeatureContext
): Promise<PdfClassSectionResult | null> {
  const state = context.getState();
  const sessions: Array<{ h: AttendanceRecord; r: AttendanceDetails }> = [];
  const cacheCopy = { ...state.history.sessionDetailsCache };

  for (const h of items) {
    let r = cacheCopy[h.id];
    if (!r && state.session.token) {
      r = (await rpc('get_attendance', {
        p_token: state.session.token,
        p_attendance_id: h.id
      })) as AttendanceDetails;
      cacheCopy[h.id] = r;
    }
    if (r) sessions.push({ h, r });
  }
  context.setState({ history: { sessionDetailsCache: cacheCopy } });
  if (!sessions.length || !sessions[0]) return null;

  const first = sessions[0];
  const listName = first.r.attendance.listName;
  const n = sessions.length;

  const studentMap = new Map<string, { key: string; name: string }>();
  sessions.forEach(({ r }) =>
    r.entries.forEach((e) => {
      const k = e.studentId || `${e.firstName}|${e.lastName}`;
      if (!studentMap.has(k)) {
        studentMap.set(k, { key: k, name: `${e.firstName} ${e.lastName}` });
      }
    })
  );

  const statusMaps = sessions.map(({ r }) => {
    const m = new Map<string, string>();
    r.entries.forEach((e) => m.set(e.studentId || `${e.firstName}|${e.lastName}`, e.status));
    return m;
  });

  const students = [...studentMap.values()]
    .map((s) => {
      const absentCount = statusMaps.filter((m) => m.get(s.key) === 'absent').length;
      const excusedCount = statusMaps.filter((m) => m.get(s.key) === 'excused').length;
      return { ...s, absentCount, excusedCount };
    })
    .filter((s) => s.absentCount > 0 || s.excusedCount > 0)
    .sort(
      (a, b) =>
        b.absentCount - a.absentCount ||
        b.excusedCount - a.excusedCount ||
        a.name.localeCompare(b.name, 'tr')
    );

  const headerRow: any[] = [{ text: 'Öğrenci', bold: true, fontSize: 8.5, margin: [0, 2, 0, 2] }];
  sessions.forEach((_, i) => {
    headerRow.push({
      text: n > 1 ? `${i + 1}/${n}` : '1/1',
      bold: true,
      fontSize: 8,
      alignment: 'center',
      margin: [0, 2, 0, 2]
    });
  });

  const rows = students.map((s) => [
    { text: s.name, fontSize: 8.5, margin: [0, 2, 0, 2] },
    ...statusMaps.map((m) => {
      if (!m.has(s.key)) return { text: '·', color: '#aaaaaa', alignment: 'center', margin: [0, 2, 0, 2] };
      const st = m.get(s.key);
      if (st === 'excused') return { text: '±', color: '#d97706', bold: true, fontSize: 9, alignment: 'center', margin: [0, 2, 0, 2] };
      if (st === 'absent') return { text: '-', color: '#d32f2f', bold: true, fontSize: 9, alignment: 'center', margin: [0, 2, 0, 2] };
      return { text: '+', color: '#247a43', bold: true, fontSize: 9, alignment: 'center', margin: [0, 2, 0, 2] };
    })
  ]);

  const teachers = sessions
    .map(({ r }, i) => (n > 1 ? `${i + 1}/${n}: ${r.attendance.takenByName}` : r.attendance.takenByName))
    .join('  •  ');

  return {
    listName,
    day: dayKey(first.h.takenAt),
    content: [
      { text: listName, fontSize: 12, bold: true, color: '#111111', margin: [0, 0, 0, 2] },
      { text: teachers, fontSize: 7.5, color: '#777777', margin: [0, 0, 0, 5] },
      rows.length
        ? {
            table: {
              headerRows: 1,
              widths: ['auto', ...sessions.map(() => 18)],
              body: [headerRow, ...rows],
              dontBreakRows: true
            },
            layout: {
              hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length ? 0.6 : 0.2),
              vLineWidth: () => 0,
              hLineColor: () => '#d0d0d0',
              paddingLeft: (i: number) => (i === 0 ? 4 : 2),
              paddingRight: (i: number) => (i === 0 ? 8 : 2),
              paddingTop: () => 2,
              paddingBottom: () => 2,
              fillColor: (rowIndex: number) => (rowIndex === 0 ? '#f2f2f2' : null)
            }
          }
        : {
            text: 'Tüm öğrenciler mevcuttur (Devamsızlık/izin yok).',
            italics: true,
            fontSize: 8,
            color: '#247a43',
            margin: [0, 4, 0, 8]
          }
    ]
  };
}

/**
 * Downloads single session PDF (*-ders.pdf).
 */
export async function downloadSingleAttendancePdf(
  attendanceId: string,
  context: FeatureContext
): Promise<void> {
  try {
    const pdfMake = await ensurePdfMake();
    const state = context.getState();
    const h = state.history.records.find((x) => x.id === attendanceId);
    if (!h) throw new Error('Yoklama bulunamadı.');

    const section = await buildPdfClassSection([h], context);
    if (!section) return;

    const doc = {
      pageSize: 'A4',
      pageMargins: [30, 30, 30, 38],
      defaultStyle: { font: 'Roboto', fontSize: 9, color: '#202020' },
      content: section.content
    };
    pdfMake.createPdf(doc).download(`${safeFileName(section.listName)}-${section.day}-ders.pdf`);
    toast('PDF dosyası indirildi.');
  } catch (e: unknown) {
    const err = e as { message?: string };
    toast(err.message || 'PDF oluşturulamadı.');
  }
}

/**
 * Downloads all historical attendance sessions for a specific class (*-tum-yoklamalar.pdf).
 */
export async function downloadAllClassPdf(
  listId: string,
  context: FeatureContext
): Promise<void> {
  const state = context.getState();
  const list = state.roster.lists.find((x) => x.id === listId);
  if (!list) return;

  const chosen = state.history.records
    .filter((h) => !h.archivedAt && h.listId === listId)
    .sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime());

  if (!chosen.length) {
    toast('Bu sınıfta henüz yoklama kaydı yok.');
    return;
  }

  try {
    const pdfMake = await ensurePdfMake();
    const sessions: Array<{ h: AttendanceRecord; r: AttendanceDetails }> = [];
    const cacheCopy = { ...state.history.sessionDetailsCache };

    for (const h of chosen) {
      let r = cacheCopy[h.id];
      if (!r && state.session.token) {
        r = (await rpc('get_attendance', { p_token: state.session.token, p_attendance_id: h.id })) as AttendanceDetails;
        cacheCopy[h.id] = r;
      }
      if (r) sessions.push({ h, r });
    }
    context.setState({ history: { sessionDetailsCache: cacheCopy } });

    const studentMap = new Map<string, { key: string; name: string }>();
    sessions.forEach(({ r }) =>
      r.entries.forEach((e) => {
        const k = e.studentId || `${e.firstName}|${e.lastName}`;
        if (!studentMap.has(k)) studentMap.set(k, { key: k, name: `${e.firstName} ${e.lastName}` });
      })
    );

    const statusMaps = sessions.map(({ r }) => {
      const m = new Map<string, string>();
      r.entries.forEach((e) => m.set(e.studentId || `${e.firstName}|${e.lastName}`, e.status));
      return m;
    });

    const students = [...studentMap.values()]
      .map((s) => {
        const absentCount = statusMaps.filter((m) => m.get(s.key) === 'absent').length;
        const excusedCount = statusMaps.filter((m) => m.get(s.key) === 'excused').length;
        return { ...s, absentCount, excusedCount };
      })
      .filter((s) => s.absentCount > 0 || s.excusedCount > 0)
      .sort((a, b) => b.absentCount - a.absentCount || b.excusedCount - a.excusedCount || a.name.localeCompare(b.name, 'tr'));

    const firstDay = sessions[0] ? dayKey(sessions[0].h.takenAt) : '';
    const lastSession = sessions[sessions.length - 1];
    const lastDay = lastSession ? dayKey(lastSession.h.takenAt) : '';
    const rangeLabel = firstDay === lastDay ? formatHistoryDay(firstDay) : `${formatHistoryDay(firstDay)} – ${formatHistoryDay(lastDay)}`;

    const colWidth = Math.max(7.5, Math.min(12.5, (814 - 135) / sessions.length));
    const bodyFont = Math.max(6.5, Math.min(8, colWidth * 0.65));
    const markFont = Math.max(7, Math.min(9.5, colWidth * 0.75));
    const rowPad = sessions.length > 35 ? 0.2 : sessions.length > 20 ? 0.5 : 0.8;

    const dateGroups: Array<{ date: string; count: number; indices: number[] }> = [];
    sessions.forEach(({ h }, i) => {
      const d = pdfCleanDate(h.takenAt);
      const last = dateGroups[dateGroups.length - 1];
      if (last && last.date === d) {
        last.count++;
        last.indices.push(i);
      } else {
        dateGroups.push({ date: d, count: 1, indices: [i] });
      }
    });

    const headerRow1: any[] = [{ text: 'Öğrenci', rowSpan: 2, bold: true, fontSize: bodyFont, margin: [0, 12, 0, 0] }];
    dateGroups.forEach((g) => {
      headerRow1.push({ text: g.date, colSpan: g.count, bold: true, fontSize: 7.5, alignment: 'center', margin: [0, 1, 0, 0] });
      for (let k = 1; k < g.count; k++) headerRow1.push({});
    });

    const headerRow2: any[] = [{}];
    dateGroups.forEach((g) => {
      g.indices.forEach((_, localIdx) => {
        headerRow2.push({
          text: g.count > 1 ? `${localIdx + 1}/${g.count}` : '1',
          bold: true,
          fontSize: 5.8,
          alignment: 'center',
          color: '#444444',
          margin: [0, 0, 0, 1]
        });
      });
    });

    const rows = students.map((s) => [
      { text: s.name, fontSize: bodyFont, margin: [0, rowPad, 0, rowPad] },
      ...statusMaps.map((m) => {
        if (!m.has(s.key)) return { text: '·', color: '#aaaaaa', fontSize: markFont, alignment: 'center', margin: [0, rowPad, 0, rowPad] };
        const st = m.get(s.key);
        if (st === 'present') return { text: '+', color: '#247a43', bold: true, fontSize: markFont, alignment: 'center', margin: [0, rowPad, 0, rowPad] };
        if (st === 'excused') return { text: '±', color: '#d97706', bold: true, fontSize: markFont, alignment: 'center', margin: [0, rowPad, 0, rowPad] };
        return { text: '-', color: '#d32f2f', bold: true, fontSize: markFont, alignment: 'center', margin: [0, rowPad, 0, rowPad] };
      })
    ]);

    const doc = {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [16, 14, 16, 16],
      defaultStyle: { font: 'Roboto', fontSize: bodyFont, color: '#202020' },
      content: [
        {
          columns: [
            {
              stack: [
                { text: list.name, fontSize: 12, bold: true },
                { text: rangeLabel, fontSize: 6.5, color: '#666666', margin: [0, 1, 0, 0] },
                { text: `${sessions.length} ders · - Yok  ± İzinli`, fontSize: 6, color: '#777777', margin: [0, 2, 0, 0] }
              ]
            }
          ],
          margin: [0, 0, 0, 5]
        },
        rows.length
          ? {
              table: {
                headerRows: 2,
                widths: ['auto', ...sessions.map(() => colWidth)],
                body: [headerRow1, headerRow2, ...rows],
                dontBreakRows: true
              },
              layout: {
                hLineWidth: (i: number, node: any) => (i === 0 || i === 2 || i === node.table.body.length ? 0.55 : 0.18),
                vLineWidth: () => 0,
                hLineColor: () => '#d8d8d8',
                paddingLeft: (i: number) => (i === 0 ? 3 : 0),
                paddingRight: (i: number) => (i === 0 ? 6 : 0),
                paddingTop: () => 0,
                paddingBottom: () => 0,
                fillColor: (rowIndex: number) => (rowIndex < 2 ? '#f4f4f4' : null)
              }
            }
          : {
              text: 'Tüm öğrenciler derste mevcuttur (Yok veya izinli öğrenci bulunmamaktadır).',
              italics: true,
              fontSize: 8,
              color: '#247a43',
              margin: [0, 6, 0, 8]
            }
      ]
    };

    pdfMake.createPdf(doc).download(`${safeFileName(list.name)}-tum-yoklamalar.pdf`);
    toast('PDF dosyası indirildi.');
  } catch (e: unknown) {
    const err = e as { message?: string };
    toast(err.message || 'PDF oluşturulamadı.');
  }
}
