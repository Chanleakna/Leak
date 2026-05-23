// Reporting weeks start on SATURDAY — new submissions land Sat/Sun/Mon, so a
// Saturday-anchored week keeps each intake cycle inside one bucket.

const DAY_MS = 86400000;

/** Parse a flexible date string/Date into a Date (or null). */
export function parseDate(v: unknown): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  // Try native first.
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // Try DD/MM/YYYY and MM/DD/YYYY fallbacks.
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    let [_, a, b, y] = m;
    const yy = y.length === 2 ? "20" + y : y;
    // assume DD/MM when first part > 12
    const day = Number(a) > 12 ? Number(a) : Number(b);
    const mon = Number(a) > 12 ? Number(b) : Number(a);
    d = new Date(Number(yy), mon - 1, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** The Saturday on or before the given date, at local midnight. */
export function weekStartSaturday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // JS: Sun=0..Sat=6. Days since most recent Saturday:
  const offset = (d.getDay() + 1) % 7; // Sat->0, Sun->1, ... Fri->6
  d.setDate(d.getDate() - offset);
  return d;
}

/** Stable week key, e.g. "2025-04-05" (the Saturday). */
export function weekKey(date: Date): string {
  const s = weekStartSaturday(date);
  const mm = String(s.getMonth() + 1).padStart(2, "0");
  const dd = String(s.getDate()).padStart(2, "0");
  return `${s.getFullYear()}-${mm}-${dd}`;
}

/** Human label, e.g. "Sat 5 Apr – Fri 11 Apr". */
export function weekLabel(key: string): string {
  const start = new Date(key + "T00:00:00");
  if (isNaN(start.getTime())) return key;
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const f = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${f(start)} – ${f(end)}`;
}

export interface WeekInfo {
  key: string;
  label: string;
  start: Date;
}

/** Unique sorted weeks (descending: newest first) from a list of dates. */
export function weeksFromDates(dates: Date[]): WeekInfo[] {
  const map = new Map<string, Date>();
  for (const d of dates) {
    if (!d) continue;
    const k = weekKey(d);
    if (!map.has(k)) map.set(k, weekStartSaturday(d));
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].getTime() - a[1].getTime())
    .map(([key, start]) => ({ key, start, label: weekLabel(key) }));
}
