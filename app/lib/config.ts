// Single source of truth for every sheet the dashboard reads.
// Each value is overridable by a NEXT_PUBLIC_* env var (set once in Vercel),
// falling back to the published default below. Nothing else references sheet
// URLs directly — change them here or in Vercel and the whole app follows.

export const REFRESH_MS = 15000; // SWR polling interval (15s)

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

export interface SheetSource {
  key: string;
  label: string;
  url: string; // any Google Sheets URL (publish-to-web or /edit)
  gid: string; // tab gid
  raw: 0 | 1; // 0 = header+rows objects, 1 = raw 2-D grid
}

export const SHEETS: Record<string, SheetSource> = {
  submissions: {
    key: "submissions",
    label: "Submissions",
    // Default is a placeholder — set NEXT_PUBLIC_SUBMISSIONS_URL in Vercel.
    url: env("NEXT_PUBLIC_SUBMISSIONS_URL", ""),
    gid: env("NEXT_PUBLIC_SUBMISSIONS_GID", "0"),
    raw: 0,
  },
  master: {
    key: "master",
    label: "Master PA",
    url: env("NEXT_PUBLIC_MASTER_URL", ""),
    gid: env("NEXT_PUBLIC_MASTER_GID", "0"),
    raw: 0,
  },
};

export const SHEET_LIST: SheetSource[] = Object.values(SHEETS);

// True only when every sheet has a real Google URL configured.
export const IS_CONFIGURED: boolean = SHEET_LIST.every((s) =>
  /^https:\/\/docs\.google\.com\//.test(s.url)
);
