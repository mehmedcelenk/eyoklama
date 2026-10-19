/**
 * CSV / DSV Parser Utility
 * Vibecoding-Safe Native DOM Architecture
 * Pure, RFC-4180 compliant CSV/DSV parsing with automatic delimiter detection (comma vs semicolon)
 */

/**
 * Parses raw CSV or semicolon-separated text into a 2D array of string cells.
 * Correctly handles quotes, escaped quotes (""), multiline cells, and Windows/Unix newlines.
 *
 * @param text Raw CSV content string
 * @returns 2D array of parsed rows and columns
 */
export function parseCSV(text: string): string[][] {
  if (!text || !text.trim()) return [];

  // Detect delimiter by inspecting sample of non-empty lines
  const sampleLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 10);
  let totalTab = 0;
  let totalSemicolon = 0;
  let totalComma = 0;

  for (const line of sampleLines) {
    totalTab += (line.match(/\t/g) || []).length;
    totalSemicolon += (line.match(/;/g) || []).length;
    totalComma += (line.match(/,/g) || []).length;
  }

  let delimiter = ',';
  if (totalTab > 0 && totalTab >= totalSemicolon && totalTab >= totalComma) {
    delimiter = '\t';
  } else if (totalSemicolon > totalComma) {
    delimiter = ';';
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      currentCell += '"';
      i++; // Skip escaped quote
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') {
        i++; // Handle CRLF
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}
