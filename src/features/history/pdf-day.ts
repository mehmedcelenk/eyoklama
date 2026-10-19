/**
 * Daily Multi-Class Summary PDF Generator
 * Vibecoding-Safe Native DOM Architecture
 */

import type { FeatureContext, AttendanceRecord } from '../../data/models/types';
import { dayKey, formatHistoryDay } from '../../shared/date';
import { toast } from '../../shared/toast';
import { ensurePdfMake } from '../../shared/pdf-loader';
import { buildPdfClassSection } from './pdf-class';

/**
 * Downloads day summary PDF report (gunun-yoklamasi-YYYY-MM-DD.pdf).
 */
export async function downloadDayPdf(day: string, context: FeatureContext): Promise<void> {
  try {
    const pdfMake = await ensurePdfMake();

    const state = context.getState();
    const sameDay = state.history.records.filter(
      (h) => !h.archivedAt && dayKey(h.takenAt) === day
    );

    if (!sameDay.length) {
      toast('Bu güne ait aktif yoklama yok.');
      return;
    }

    const byClass = new Map<string, AttendanceRecord[]>();
    sameDay.forEach((h) => {
      const k = h.listId || h.listName;
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k)!.push(h);
    });

    const groups = [...byClass.values()]
      .map((items) =>
        items.sort(
          (a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()
        )
      )
      .sort((a, b) => {
        const at = new Date(a[0]?.takenAt || 0).getTime();
        const bt = new Date(b[0]?.takenAt || 0).getTime();
        return at - bt || (a[0]?.listName || '').localeCompare(b[0]?.listName || '', 'tr');
      });

    const sections = [];
    for (const items of groups) {
      const section = await buildPdfClassSection(items, context);
      if (section) sections.push(section);
    }
    if (!sections.length) {
      toast('PDF oluşturulacak yoklama bulunamadı.');
      return;
    }

    const doc = {
      pageSize: 'A4',
      pageOrientation: 'portrait',
      pageMargins: [24, 22, 24, 26],
      defaultStyle: { font: 'Roboto', fontSize: 8.5, color: '#202020' },
      footer: (currentPage: number, pageCount: number) => ({
        text: `${currentPage} / ${pageCount}`,
        alignment: 'center',
        fontSize: 7,
        color: '#909090',
        margin: [0, 6, 0, 0]
      }),
      content: [
        {
          columns: [
            { text: formatHistoryDay(day), fontSize: 13, bold: true },
            { text: '- Yok   ± İzinli', alignment: 'right', fontSize: 8, color: '#666666', margin: [0, 2, 0, 0] }
          ],
          margin: [0, 0, 0, 10]
        },
        {
          columns: sections.map((sec) => ({
            width: 'auto',
            stack: sec.content
          })),
          columnGap: 24
        },
        { text: 'İmza', alignment: 'right', fontSize: 8, color: '#666666', margin: [0, 18, 28, 2] },
        { text: '________________________', alignment: 'right', fontSize: 8, color: '#888888' }
      ]
    };

    pdfMake.createPdf(doc).download(`gunun-yoklamasi-${day}.pdf`);
    toast('PDF dosyası indirildi.');
  } catch (e: unknown) {
    const err = e as { message?: string };
    toast(err.message || "Günün PDF'i oluşturulamadı.");
  }
}
