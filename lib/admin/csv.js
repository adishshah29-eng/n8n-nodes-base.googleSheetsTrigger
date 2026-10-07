/**
 * One CSV cell. Values starting with = + - @ (or tab/CR) are prefixed with ' so a spreadsheet
 * never runs a worker-supplied name as a formula (CSV injection).
 */
export function cell(v) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const row = (values) => values.map(cell).join(',');
