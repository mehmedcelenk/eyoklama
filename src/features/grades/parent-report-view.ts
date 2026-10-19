/**
 * Public Parent Student Report View (Karne & Kanaat Sorgulama)
 * Vibecoding-Safe Native DOM Architecture
 * Features Layer (Layer 2) - data-action event delegation, zero inline handlers
 */

import { rpc } from '../../data/supabase/rpc';
import { setActiveInstitution, getActiveInstitutionSlug } from '../../data/supabase/config';
import { getLastInstitutionSlugKey } from '../../data/storage/keys';
import type { StudentGradeItem, StudentReportResponse } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { sanitizeTc } from '../../shared/tc-validator';
import { toast } from '../../shared/toast';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Executes public student report query by TC number and optional Institution Code.
 */
export async function queryParentReport(): Promise<void> {
  const instInput = $('parentInstCode') as HTMLInputElement | null;
  const input = $('parentTcInput') as HTMLInputElement | null;
  const resultEl = $('parentReportResult');
  if (!input || !resultEl) return;

  const instSlug = (instInput?.value.trim() || getActiveInstitutionSlug() || 'default').toLowerCase();
  const raw = input.value.trim();
  const tc = sanitizeTc(raw);

  if (!tc || tc.length !== 11) {
    toast('Lütfen 11 haneli T.C. Kimlik Numarası girin.');
    return;
  }

  setActiveInstitution(instSlug);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getLastInstitutionSlugKey(), instSlug);
  }

  resultEl.innerHTML = `
    <div style="text-align:center;padding:24px 0">
      <div class="muted tiny">Sorgulanıyor...</div>
    </div>
  `;

  try {
    const res = (await rpc('get_student_report', { p_tc: tc })) as StudentReportResponse;

    if (!res || !res.success || !res.student) {
      resultEl.innerHTML = `
        <div class="notice error" style="margin-top:12px;text-align:center">
          ${escapeHtml(res?.error || 'Bu T.C. Kimlik Numarası ile kayıtlı öğrenci bulunamadı.')}
        </div>
      `;
      return;
    }

    renderReportCard(res.student, res.grades || []);
  } catch (err: unknown) {
    const e = err as { message?: string };
    resultEl.innerHTML = `
      <div class="notice error" style="margin-top:12px;text-align:center">
        ${escapeHtml(e.message || 'Sorgulama başarısız oldu.')}
      </div>
    `;
  }
}

/**
 * Renders the formatted digital report card into #parentReportResult.
 */
function renderReportCard(
  student: { firstName: string; lastName: string; className: string },
  grades: StudentGradeItem[]
): void {
  const resultEl = $('parentReportResult');
  if (!resultEl) return;

  // Group by Academic Year -> Term -> Course Name
  const years: Record<string, Record<number, Record<string, StudentGradeItem[]>>> = {};

  for (const g of grades) {
    const y = g.academicYear || 'Genel';
    const t = g.term || 1;
    const c = g.courseName || 'Ders';

    if (!years[y]) years[y] = {};
    if (!years[y][t]) years[y][t] = {};
    if (!years[y][t][c]) years[y][t][c] = [];
    years[y][t][c].push(g);
  }

  const sortedYears = Object.keys(years).sort().reverse();

  let bodyHtml = '';
  if (sortedYears.length === 0) {
    bodyHtml = `<div class="card" style="padding:16px;text-align:center"><p class="muted tiny">Henüz girilmiş bir not veya kanaat bulunmuyor.</p></div>`;
  } else {
    bodyHtml = sortedYears
      .map((year) => {
        const terms = years[year]!;
        const sortedTerms = Object.keys(terms).map(Number).sort();

        const termsHtml = sortedTerms
          .map((term) => {
            const courses = terms[term]!;
            const courseNames = Object.keys(courses).sort();

            const coursesHtml = courseNames
              .map((cName) => {
                const items = courses[cName]!;
                items.sort((a, b) => a.exam - b.exam);

                const examRows = items
                  .map(
                    (it) => `
                    <div style="padding:6px 0;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px dashed var(--border-color,#333)">
                      <div>
                        <span style="font-weight:600;font-size:0.85rem">${it.exam}. Sınav</span>
                        ${
                          it.opinion
                            ? `<div class="muted tiny" style="margin-top:2px;font-style:italic">"${escapeHtml(it.opinion)}"</div>`
                            : ''
                        }
                      </div>
                      <div style="font-weight:700;font-size:1rem;color:var(--text)">
                        ${escapeHtml(it.grade || '-')}
                      </div>
                    </div>
                  `
                  )
                  .join('');

                return `
                  <div style="margin-bottom:12px;background:var(--card-subtle,#1a1a1a);border-radius:6px;padding:10px">
                    <div style="font-weight:700;font-size:0.95rem;color:var(--text);margin-bottom:6px">📖 ${escapeHtml(cName)}</div>
                    <div>${examRows}</div>
                  </div>
                `;
              })
              .join('');

            return `
              <div style="margin-top:12px">
                <div style="font-size:0.8rem;font-weight:800;color:var(--muted);text-transform:uppercase;margin-bottom:6px;letter-spacing:0.05em">
                  📌 ${term}. DÖNEM
                </div>
                ${coursesHtml}
              </div>
            `;
          })
          .join('');

        return `
          <div class="card" style="padding:14px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-color,#333);padding-bottom:6px">
              <strong style="font-size:1.05rem">📅 ${escapeHtml(year)} EĞİTİM YILI</strong>
            </div>
            ${termsHtml}
          </div>
        `;
      })
      .join('');
  }

  resultEl.innerHTML = `
    <div class="stack" style="margin-top:16px">
      <div class="card" style="padding:14px;background:var(--card-bg,#111);border:1px solid var(--border-color,#333)">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <h2 style="margin:0;font-size:1.15rem;font-weight:800">🎓 ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</h2>
            <div class="muted tiny" style="margin-top:2px">Sınıf: ${escapeHtml(student.className)}</div>
          </div>
          <button type="button" class="btn small secondary" data-action="print-parent-report" style="font-size:0.75rem">
            🖨️ Yazdır
          </button>
        </div>
      </div>

      <div style="margin-top:8px">
        ${bodyHtml}
      </div>
    </div>
  `;
}

/**
 * Triggers native browser print dialog for the report card.
 */
export function printParentReport(): void {
  if (typeof window !== 'undefined') {
    window.print();
  }
}
