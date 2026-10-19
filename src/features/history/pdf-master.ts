/**
 * Master Range PDF Generation Engine
 * Vibecoding-Safe Native DOM Architecture
 * Multi-class attendance grid with automatic font scaling and absent/excused marks
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, AttendanceRecord, AttendanceDetails } from '../../data/models/types';
import {
  cleanListName,
  formatTitleCaseTR,
  normalizeStudentKey,
  safeFileName
} from '../../shared/formatters';
import { pdfCleanDate } from '../../shared/date';
import { toast } from '../../shared/toast';
import { ensurePdfMake } from '../../shared/pdf-loader';

/**
 * Generates and downloads comprehensive multi-class master PDF schedule.
 */
export async function downloadMasterRangePdf(
  items: AttendanceRecord[],
  titleLabel: string,
  context: FeatureContext
): Promise<void> {
  const pdfMake = await ensurePdfMake();

  const state = context.getState();
  const sortedItems = [...items].sort(
    (a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()
  );

  const sessions: Array<{ h: AttendanceRecord; r: AttendanceDetails }> = [];
  const cacheCopy = { ...state.history.sessionDetailsCache };

  for (const h of sortedItems) {
    let r = cacheCopy[h.id];
    if (!r && state.session.token) {
      r = (await rpc('get_attendance', {
        p_token: state.session.token,
        p_attendance_id: h.id
      })) as AttendanceDetails;
      cacheCopy[h.id] = r;
    }
    if (r) {
      sessions.push({ h, r });
    }
  }
  context.setState({ history: { sessionDetailsCache: cacheCopy } });

  if (!sessions.length) {
    toast('Yoklama verisi bulunamadı.');
    return;
  }

  // 1) Group classes cleanly by normalized list name
  const classMap = new Map<string, { groupKey: string; listName: string; items: typeof sessions }>();
  sessions.forEach((sess) => {
    const cleanName = cleanListName(sess.h.listName);
    const groupKey = cleanName.toLocaleUpperCase('tr-TR');
    if (!classMap.has(groupKey)) {
      classMap.set(groupKey, { groupKey, listName: cleanName, items: [] });
    }
    classMap.get(groupKey)!.items.push(sess);
  });
  const classGroups = [...classMap.values()].sort((a, b) =>
    a.listName.localeCompare(b.listName, 'tr')
  );

  // 2) Deduplicate students across all lists & sessions
  const studentMap = new Map<
    string,
    { normKey: string; ids: Set<string>; name: string; listKeys: Set<string> }
  >();

  state.roster.lists.forEach((l) => {
    const cName = cleanListName(l.name).toLocaleUpperCase('tr-TR');
    if (classGroups.some((cg) => cg.groupKey === cName)) {
      l.students.forEach((s) => {
        const normKey = normalizeStudentKey(s.firstName, s.lastName, s.id);
        if (!studentMap.has(normKey)) {
          studentMap.set(normKey, {
            normKey,
            ids: new Set(s.id ? [s.id] : []),
            name: formatTitleCaseTR(`${s.firstName || ''} ${s.lastName || ''}`),
            listKeys: new Set([cName])
          });
        } else {
          if (s.id) studentMap.get(normKey)!.ids.add(s.id);
          studentMap.get(normKey)!.listKeys.add(cName);
        }
      });
    }
  });

  sessions.forEach(({ r, h }) => {
    const cName = cleanListName(h.listName).toLocaleUpperCase('tr-TR');
    r.entries.forEach((e) => {
      const normKey = normalizeStudentKey(e.firstName, e.lastName, e.studentId);
      if (!studentMap.has(normKey)) {
        studentMap.set(normKey, {
          normKey,
          ids: new Set(e.studentId ? [e.studentId] : []),
          name: formatTitleCaseTR(`${e.firstName || ''} ${e.lastName || ''}`),
          listKeys: new Set([cName])
        });
      } else {
        if (e.studentId) studentMap.get(normKey)!.ids.add(e.studentId);
        studentMap.get(normKey)!.listKeys.add(cName);
      }
    });
  });

  const allStudents = [...studentMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  if (!allStudents.length) {
    toast('Öğrenci bulunamadı.');
    return;
  }

  // 3) Calculate dimensions & single-page font scaling
  const totalCols = sessions.length;
  const isLandscape = totalCols > 16;
  const printableWidth = isLandscape ? 822 : 575;
  const nameColWidth = isLandscape ? 140 : 125;
  const colWidth = Math.max(15, Math.min(22, Math.floor((printableWidth - nameColWidth) / totalCols)));

  const N = allStudents.length;
  let bodyFont = 8.0;
  let markFont = 9.0;
  let sessionFont = 6.5;
  let rowPad = 1.5;

  if (N <= 20) {
    bodyFont = 8.0; markFont = 9.0; sessionFont = 6.5; rowPad = 1.5;
  } else if (N <= 30) {
    bodyFont = 7.5; markFont = 8.5; sessionFont = 6.2; rowPad = 1.0;
  } else if (N <= 40) {
    bodyFont = 6.8; markFont = 7.8; sessionFont = 5.8; rowPad = 0.5;
  } else if (N <= 55) {
    bodyFont = 6.0; markFont = 7.0; sessionFont = 5.5; rowPad = 0.2;
  } else if (N <= 70) {
    bodyFont = 5.2; markFont = 6.0; sessionFont = 5.0; rowPad = 0.0;
  } else {
    bodyFont = 4.5; markFont = 5.5; sessionFont = 4.5; rowPad = 0.0;
  }

  // 4) Build minimal, clean table headers
  const headerRow1: any[] = [
    { text: 'İSİM SOYİSİM', rowSpan: 2, bold: true, fontSize: bodyFont, margin: [0, 6, 0, 0], color: '#1e293b', fillColor: '#f8fafc' }
  ];
  const headerRow2: any[] = [{}];

  classGroups.forEach((cg) => {
    headerRow1.push({
      text: cg.listName,
      colSpan: cg.items.length,
      bold: true,
      fontSize: bodyFont,
      alignment: 'center',
      fillColor: '#f1f5f9',
      color: '#0f172a'
    });
    for (let k = 1; k < cg.items.length; k++) headerRow1.push({});

    cg.items.forEach((sess, localIdx) => {
      const dateStr = pdfCleanDate(sess.h.takenAt);
      const sessionLabel = cg.items.length > 1 ? `${dateStr}\n(${localIdx + 1}/${cg.items.length})` : dateStr;
      headerRow2.push({
        text: sessionLabel,
        bold: true,
        fontSize: sessionFont,
        alignment: 'center',
        color: '#475569',
        fillColor: '#ffffff'
      });
    });
  });

  // 5) Build student rows
  const rows = allStudents.map((s) => {
    const rowCells: any[] = [{ text: s.name, fontSize: bodyFont, bold: true, margin: [1, rowPad, 0, rowPad], color: '#1e293b' }];

    classGroups.forEach((cg) => {
      cg.items.forEach(({ r }) => {
        const entry = r.entries.find((e) => {
          const ek = normalizeStudentKey(e.firstName, e.lastName, e.studentId);
          return ek === s.normKey || (e.studentId && s.ids.has(e.studentId));
        });

        if (!entry) {
          rowCells.push({ text: '', fontSize: markFont, alignment: 'center', margin: [0, rowPad, 0, rowPad] });
        } else if (entry.status === 'present') {
          rowCells.push({ text: '+', color: '#16a34a', bold: true, fontSize: markFont, alignment: 'center', margin: [0, rowPad, 0, rowPad] });
        } else if (entry.status === 'excused') {
          rowCells.push({ text: '±', color: '#d97706', bold: true, fontSize: markFont, alignment: 'center', margin: [0, rowPad, 0, rowPad] });
        } else if (entry.status === 'absent') {
          rowCells.push({ text: '-', color: '#dc2626', bold: true, fontSize: markFont, alignment: 'center', margin: [0, rowPad, 0, rowPad] });
        } else {
          rowCells.push({ text: '', fontSize: markFont, alignment: 'center', margin: [0, rowPad, 0, rowPad] });
        }
      });
    });

    return rowCells;
  });

  const doc = {
    pageSize: 'A4',
    pageOrientation: isLandscape ? 'landscape' : 'portrait',
    pageMargins: [10, 8, 10, 8],
    defaultStyle: { font: 'Roboto', fontSize: bodyFont, color: '#1e293b' },
    content: [
      {
        columns: [
          {
            stack: [
              { text: titleLabel, fontSize: 11, bold: true, color: '#0f172a' },
              {
                text: `${classGroups.length} ders grubu · ${totalCols} ders kaydı · ${allStudents.length} öğrenci · + Var  - Yok  ± İzinli`,
                fontSize: 6.5,
                color: '#64748b',
                margin: [0, 1, 0, 0]
              }
            ]
          }
        ],
        margin: [0, 0, 0, 4]
      },
      {
        table: {
          headerRows: 2,
          widths: [nameColWidth, ...sessions.map(()=>colWidth)],
          body: [headerRow1, headerRow2, ...rows],
          dontBreakRows: true
        },
        layout: {
          hLineWidth: (i: number, node: any) => (i === 0 || i === 2 || i === node.table.body.length ? 0.5 : 0.15),
          vLineWidth: () => 0.15,
          hLineColor: () => '#e2e8f0',
          vLineColor: () => '#f1f5f9',
          paddingLeft: () => 1,
          paddingRight: () => 1,
          paddingTop: () => 0,
          paddingBottom: () => 0,
          fillColor: (rowIndex: number) => (rowIndex < 2 ? null : rowIndex % 2 === 0 ? '#fafafa' : null)
        }
      }
    ]
  };

  pdfMake.createPdf(doc).download(`yoklama-cizelgesi-${safeFileName(titleLabel)}.pdf`);
  toast('PDF dosyası indirildi.');
}
