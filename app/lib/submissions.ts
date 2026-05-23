// Weekly achievement engine: who submitted vs the master roster, per week.
//
// Matching strategy (per your choice): PA + Store name, normalized. Submissions
// store PA as "PA | Store"; the master has separate PA Name + Outlet columns
// (or a combined "PA Name W Store"). We collapse both to [a-z0-9] and match on
// the combined key, with a PA-name-only fallback so a missing store still links.

import { SheetData } from "./useSheets";
import {
  detectCol,
  detectColName,
  normName,
  Row,
} from "./normalize";
import { parseDate, weekKey, weeksFromDates, WeekInfo } from "./week";

export interface MasterPA {
  combinedKey: string; // normName(paName) + normName(store)
  paKey: string; // normName(paName)
  paName: string;
  store: string;
  teamLeader: string;
}

export interface ParsedMaster {
  list: MasterPA[];
  total: number;
  byCombined: Map<string, MasterPA>;
  byPa: Map<string, MasterPA[]>;
  teamLeaders: string[];
  error: string | null;
}

const INACTIVE = /resign|inactive|maternity|leave|terminated/i;

export function parseMaster(sheet?: SheetData): ParsedMaster {
  const empty: ParsedMaster = {
    list: [],
    total: 0,
    byCombined: new Map(),
    byPa: new Map(),
    teamLeaders: [],
    error: sheet?.error || null,
  };
  if (!sheet || !sheet.columns.length) return empty;

  const cols = sheet.columns;
  const paName =
    detectColName(cols, [/^pa\s*name$/i, /\bpa\b[\s_-]*name/i, /\bpa\b/i]) ||
    detectColName(cols, [/name/i]);
  const store = detectColName(cols, [
    /outlet.*name/i,
    /\bstore\b/i,
    /\boutlet\b/i,
    /shop/i,
  ]);
  const tl = detectColName(cols, [/team.*leader/i, /\btl\b/i, /leader/i]);
  const remarks = detectColName(cols, [/remark/i, /\bstatus\b/i, /\bnote/i]);
  const combinedCol = detectColName(cols, [/pa.*name.*store/i, /name.*w.*store/i]);

  const list: MasterPA[] = [];
  const byCombined = new Map<string, MasterPA>();
  const byPa = new Map<string, MasterPA[]>();
  const tlSet = new Set<string>();

  for (const r of sheet.rows) {
    if (remarks && INACTIVE.test(String(r[remarks] || ""))) continue;
    const pn = String((paName && r[paName]) || "").trim();
    const st = String((store && r[store] || "")).trim();
    if (!pn && !st) continue;

    let combinedKey = normName(pn) + normName(st);
    if (combinedCol && r[combinedCol]) combinedKey = normName(r[combinedCol]);
    const paKey = normName(pn) || combinedKey;
    const leader = String((tl && r[tl]) || "").trim();

    const item: MasterPA = { combinedKey, paKey, paName: pn, store: st, teamLeader: leader };
    list.push(item);
    if (combinedKey) byCombined.set(combinedKey, item);
    if (paKey) {
      const arr = byPa.get(paKey) || [];
      arr.push(item);
      byPa.set(paKey, arr);
    }
    if (leader) tlSet.add(leader);
  }

  return {
    list,
    total: list.length,
    byCombined,
    byPa,
    teamLeaders: Array.from(tlSet).sort(),
    error: sheet.error,
  };
}

export interface Submission {
  raw: string; // the PA cell value, e.g. "Alice | Mart One"
  date: Date | null;
  weekKey: string;
}

export interface ParsedSubmissions {
  list: Submission[];
  paCol: string;
  dateCol: string;
  error: string | null;
}

export function parseSubmissions(sheet?: SheetData): ParsedSubmissions {
  if (!sheet || !sheet.columns.length) {
    return { list: [], paCol: "", dateCol: "", error: sheet?.error || null };
  }
  const cols = sheet.columns;
  const paCol =
    detectColName(cols, [/pa.*name/i, /name.*store/i]) ||
    detectColName(cols, [/\bname\b/i]);

  // Prefer an explicit Count Date; else Timestamp; else any date that isn't expiry.
  let dateCol = detectColName(cols, [/count\s*date/i, /time\s*stamp/i]);
  if (!dateCol) {
    const i = cols.findIndex((c) => /date/i.test(c) && !/expiry/i.test(c));
    dateCol = i >= 0 ? cols[i] : "";
  }

  const list: Submission[] = [];
  for (const r of sheet.rows) {
    const raw = String((paCol && r[paCol]) || "").trim();
    if (!raw) continue;
    const d = parseDate(dateCol ? r[dateCol] : "");
    list.push({ raw, date: d, weekKey: d ? weekKey(d) : "" });
  }
  return { list, paCol, dateCol, error: sheet.error };
}

/** Resolve a submission's PA cell to a master record (combined key, then
 *  pa+store split, then unique PA-name fallback). */
export function matchMaster(raw: string, master: ParsedMaster): MasterPA | null {
  const combined = normName(raw);
  if (master.byCombined.has(combined)) return master.byCombined.get(combined)!;

  const parts = raw.split("|");
  if (parts.length >= 2) {
    const pa = normName(parts[0]);
    const st = normName(parts.slice(1).join(""));
    if (master.byCombined.has(pa + st)) return master.byCombined.get(pa + st)!;
    const arr = master.byPa.get(pa);
    if (arr && arr.length === 1) return arr[0];
  } else {
    const arr = master.byPa.get(combined);
    if (arr && arr.length === 1) return arr[0];
  }
  return null;
}

export interface WeekAchievement {
  week: WeekInfo;
  submittedKeys: Set<string>;
  submittedCount: number;
  total: number;
  pct: number;
  unmatched: { raw: string; date: Date | null }[];
}

export interface AchievementResult {
  weeks: WeekInfo[];
  byWeek: Map<string, WeekAchievement>;
  master: ParsedMaster;
}

export function computeAchievement(
  subSheet?: SheetData,
  masterSheet?: SheetData
): AchievementResult {
  const master = parseMaster(masterSheet);
  const subs = parseSubmissions(subSheet);

  const dated = subs.list.filter((s) => s.weekKey);
  const weeks = weeksFromDates(dated.map((s) => s.date!).filter(Boolean));

  const byWeek = new Map<string, WeekAchievement>();
  for (const w of weeks) {
    byWeek.set(w.key, {
      week: w,
      submittedKeys: new Set<string>(),
      submittedCount: 0,
      total: master.total,
      pct: 0,
      unmatched: [],
    });
  }

  for (const s of dated) {
    const wa = byWeek.get(s.weekKey);
    if (!wa) continue;
    const m = matchMaster(s.raw, master);
    if (m) wa.submittedKeys.add(m.combinedKey);
    else wa.unmatched.push({ raw: s.raw, date: s.date });
  }

  byWeek.forEach((wa) => {
    wa.submittedCount = wa.submittedKeys.size;
    wa.pct = wa.total ? Math.round((wa.submittedCount / wa.total) * 100) : 0;
  });

  return { weeks, byWeek, master };
}

/** Split the master into submitted / not-submitted for a given week. */
export function rosterForWeek(result: AchievementResult, weekKeyStr: string) {
  const wa = result.byWeek.get(weekKeyStr);
  const keys = wa ? wa.submittedKeys : new Set<string>();
  const submitted: MasterPA[] = [];
  const notSubmitted: MasterPA[] = [];
  for (const pa of result.master.list) {
    (keys.has(pa.combinedKey) ? submitted : notSubmitted).push(pa);
  }
  return { submitted, notSubmitted, achievement: wa };
}

export interface TLStat {
  teamLeader: string;
  submitted: number;
  total: number;
  pct: number;
}

/** Per-Team-Leader submitted vs total for a week. */
export function tlBreakdown(result: AchievementResult, weekKeyStr: string): TLStat[] {
  const wa = result.byWeek.get(weekKeyStr);
  const keys = wa ? wa.submittedKeys : new Set<string>();
  const map = new Map<string, TLStat>();
  for (const pa of result.master.list) {
    const tl = pa.teamLeader || "Unassigned";
    const s = map.get(tl) || { teamLeader: tl, submitted: 0, total: 0, pct: 0 };
    s.total++;
    if (keys.has(pa.combinedKey)) s.submitted++;
    map.set(tl, s);
  }
  const arr = Array.from(map.values());
  arr.forEach((s) => (s.pct = s.total ? Math.round((s.submitted / s.total) * 100) : 0));
  return arr.sort((a, b) => b.pct - a.pct);
}
