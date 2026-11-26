/** Local display preferences — not sent to the server. */

export type DateFormatId = 'dmy' | 'mdy' | 'ymd';
export type TimeFormatId = 'h12' | 'h24';

export const DATE_FORMAT_OPTIONS: Array<{
  id: DateFormatId;
  label: string;
  example: string;
}> = [
  { id: 'dmy', label: 'DD/MM/YYYY', example: '26/11/2026' },
  { id: 'mdy', label: 'MM/DD/YYYY', example: '11/26/2026' },
  { id: 'ymd', label: 'YYYY-MM-DD', example: '2026-11-26' },
];

export const TIME_FORMAT_OPTIONS: Array<{
  id: TimeFormatId;
  label: string;
  example: string;
}> = [
  { id: 'h12', label: '12-Hour', example: '4:30 PM' },
  { id: 'h24', label: '24-Hour', example: '16:30' },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function formatDateOnly(
  value: Date | string | number,
  dateFormat: DateFormatId,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  if (dateFormat === 'mdy') return `${month}/${day}/${year}`;
  if (dateFormat === 'ymd') return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}

export function formatTimeOnly(
  value: Date | string | number,
  timeFormat: TimeFormatId,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  if (timeFormat === 'h24') {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const period = d.getHours() >= 12 ? 'PM' : 'AM';
  let h = d.getHours() % 12;
  if (h === 0) h = 12;
  return `${h}:${pad(d.getMinutes())} ${period}`;
}

export function formatAppDateTime(
  value: Date | string | number,
  dateFormat: DateFormatId,
  timeFormat: TimeFormatId,
): string {
  const date = formatDateOnly(value, dateFormat);
  const time = formatTimeOnly(value, timeFormat);
  if (!date) return '';
  return `${date}, ${time}`;
}
