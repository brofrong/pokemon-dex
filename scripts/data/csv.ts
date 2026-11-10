/**
 * A single-pass RFC 4180 CSV parser (no dependency).
 *
 * Supports quoted fields containing commas, newlines and escaped quotes (`""` -> `"`),
 * both CRLF and LF line endings, and a missing trailing newline. The header row supplies
 * the object keys; a row with fewer fields than the header fills the rest with `''`.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  const length = text.length;
  for (let i = 0; i < length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    switch (char) {
      case '"':
        inQuotes = true;
        break;
      case ",":
        endField();
        break;
      case "\r":
        endRow();
        if (text[i + 1] === "\n") i++;
        break;
      case "\n":
        endRow();
        break;
      default:
        field += char;
    }
  }

  // A trailing newline leaves nothing pending; anything else is the final row.
  if (field.length > 0 || row.length > 0) endRow();

  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  return dataRows.map((values) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = values[index] ?? "";
    });
    return record;
  });
}
