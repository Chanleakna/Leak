// Key normalization + flexible column detection.
// These exist because real sheets are messy: codes arrive as "281070030",
// "281070030.0", "281,070,030", " 281070030 " and must all collapse to the
// same key; headers get renamed; and sometimes the only reliable way to find
// the right column is by checking which one's VALUES overlap another sheet.

/** Normalize a join code: drop separators, trailing decimal zeros, then keep
 *  only [a-z0-9] lowercased. "281070030.0" / "281,070,030" -> "281070030". */
export function normCode(value: unknown): string {
  let s = String(value ?? "").trim();
  if (!s) return "";
  s = s.replace(/[,\s]/g, ""); // thousands separators / spaces
  if (/^-?\d+\.\d+$/.test(s)) {
    // float-formatted integer like 281070030.0 -> 281070030
    s = s.replace(/\.0+$/, "");
    s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Normalize a free-text key (names, "PA | Store"): keep only [a-z0-9]. */
export function normName(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type Row = Record<string, any>;

/** Find the index of the first column whose header matches any regex.
 *  Returns -1 when nothing matches. */
export function detectCol(columns: string[], patterns: RegExp[]): number {
  for (const re of patterns) {
    for (let i = 0; i < columns.length; i++) {
      if (re.test(String(columns[i] || ""))) return i;
    }
  }
  return -1;
}

/** Header-name lookup that returns the column NAME (or "") for use with row
 *  objects keyed by header. */
export function detectColName(columns: string[], patterns: RegExp[]): string {
  const i = detectCol(columns, patterns);
  return i >= 0 ? columns[i] : "";
}

/** Value-overlap fallback: when header lookup fails, pick the column whose
 *  normalized values overlap the supplied reference key set the most. */
export function detectColByValues(
  columns: string[],
  rows: Row[],
  refKeys: Set<string>,
  normalizer: (v: unknown) => string = normCode
): string {
  let bestCol = "";
  let bestHits = 0;
  const sample = rows.slice(0, 200);
  for (const col of columns) {
    let hits = 0;
    for (const r of sample) {
      const k = normalizer(r[col]);
      if (k && refKeys.has(k)) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestCol = col;
    }
  }
  return bestHits > 0 ? bestCol : "";
}
