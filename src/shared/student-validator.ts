/**
 * Student Import Row Validator
 * Vibecoding-Safe Native DOM Architecture
 * Validates parsed CSV/spreadsheet rows for student rosters
 */

export interface ValidatedStudentRow {
  firstName: string;
  lastName: string;
}

const norm = (v: unknown): string => String(v ?? '').trim();

const normHead = (v: unknown): string =>
  norm(v)
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replaceAll('ş', 's')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c');

/**
 * Validates 2D array of rows representing imported student rosters.
 *
 * Requirements:
 * - Drops empty rows and trailing empty cells
 * - Strips optional header row ('İsim', 'Soyisim')
 * - Enforces strictly 2 columns per student (First Name, Last Name)
 * - Ensures neither First Name nor Last Name is empty
 *
 * @param raw 2D array of raw cell strings
 * @returns Array of validated student objects { firstName, lastName }
 * @throws Error with user-friendly Turkish validation message if invalid
 */
export function validateRows(raw: (string | unknown)[][]): ValidatedStudentRow[] {
  let rows = raw
    .map((r) => (Array.isArray(r) ? r.map(norm) : []))
    .filter((r) => r.some((c) => c !== ''))
    .map((r) => {
      const trimmed = [...r];
      while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
        trimmed.pop();
      }
      return trimmed;
    });

  if (!rows.length) {
    throw new Error('Dosyada öğrenci bulunamadı.');
  }

  if (rows.some((r) => r.length > 2)) {
    throw new Error('Dosya reddedildi: 3. sütun bulundu.');
  }

  // Strip common header line if present (İsim/Soyisim, Ad/Soyad, etc.)
  const isHeaderRow = (r: string[]) => {
    if (r.length < 2) return false;
    const h0 = normHead(r[0]);
    const h1 = normHead(r[1]);
    return (
      (h0 === 'isim' || h0 === 'ad' || h0 === 'ogrenci adi' || h0 === 'adi') &&
      (h1 === 'soyisim' || h1 === 'soyad' || h1 === 'ogrenci soyadi' || h1 === 'soyadi')
    );
  };

  // If first row is a title/metadata (single column) and next has headers or data, handle gracefully
  while (rows.length > 0 && rows[0] && rows[0].length === 1 && rows.length > 1) {
    rows = rows.slice(1);
  }

  if (rows.length > 0 && rows[0] && isHeaderRow(rows[0])) {
    rows = rows.slice(1);
  }

  if (!rows.length) {
    throw new Error('Başlık dışında öğrenci bulunamadı.');
  }

  const badIndex = rows.findIndex((r) => r.length !== 2 || !r[0] || !r[1]);
  if (badIndex !== -1) {
    throw new Error(`${badIndex + 1}. öğrenci satırında İsim veya Soyisim eksik.`);
  }

  return rows.map((r) => ({
    firstName: r[0]!,
    lastName: r[1]!
  }));
}

/**
 * Parses user-pasted text (e.g. from Excel/Sheets or formatted text) into student objects.
 */
export function parsePastedStudents(text: string): ValidatedStudentRow[] {
  if (!text || !text.trim()) return [];

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rawRows: string[][] = [];

  for (const line of lines) {
    if (line.includes('\t')) {
      const parts = line.split('\t').map(norm).filter(Boolean);
      if (parts.length >= 2 && parts[0]) {
        rawRows.push([parts[0], parts.slice(1).join(' ')]);
      } else if (parts.length === 1 && parts[0]) {
        const segs = parts[0].split(/\s+/).filter(Boolean);
        if (segs.length >= 2 && segs[segs.length - 1]) {
          rawRows.push([segs.slice(0, -1).join(' '), segs[segs.length - 1]!]);
        }
      }
    } else if (line.includes(';') || line.includes(',')) {
      const delim = line.includes(';') ? ';' : ',';
      const parts = line.split(delim).map(norm).filter(Boolean);
      if (parts.length >= 2 && parts[0]) {
        rawRows.push([parts[0], parts.slice(1).join(' ')]);
      }
    } else {
      // Space separated "Ad Soyad"
      const segs = line.split(/\s+/).map(norm).filter(Boolean);
      if (segs.length >= 2 && segs[segs.length - 1]) {
        rawRows.push([segs.slice(0, -1).join(' '), segs[segs.length - 1]!]);
      }
    }
  }

  if (!rawRows.length) return [];
  return validateRows(rawRows);
}
