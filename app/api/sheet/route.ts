// Server proxy for Google Sheets CSV. Keeps the browser same-origin, forces
// no-store so every poll is fresh, and NEVER throws — a bad sheet returns an
// { error } payload instead of crashing the page.

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface SheetResponse {
  columns: string[];
  rows: Record<string, any>[];
  grid: string[][];
  fetchedAt: string;
  error: string | null;
}

function empty(error: string | null): SheetResponse {
  return { columns: [], rows: [], grid: [], fetchedAt: new Date().toISOString(), error };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";
  const raw = searchParams.get("raw") === "1";

  // Allow-list: only Google Docs URLs.
  if (!/^https:\/\/docs\.google\.com\//.test(url)) {
    return NextResponse.json(empty("URL not allowed (must be docs.google.com)"));
  }

  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (dashboard-proxy)" },
    });
    if (!res.ok) {
      return NextResponse.json(empty(`HTTP ${res.status} from Google Sheets`));
    }
    const text = await res.text();

    // Google returns an HTML login/error page when a sheet isn't published.
    if (/^\s*<(!doctype|html)/i.test(text)) {
      return NextResponse.json(
        empty("Sheet is not published to the web (got HTML, not CSV).")
      );
    }

    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    const grid: string[][] = (parsed.data as string[][]).filter(
      (r) => Array.isArray(r) && r.some((c) => String(c).trim() !== "")
    );

    if (raw) {
      return NextResponse.json({
        columns: [],
        rows: [],
        grid,
        fetchedAt: new Date().toISOString(),
        error: null,
      } as SheetResponse);
    }

    if (!grid.length) return NextResponse.json(empty("Sheet is empty."));

    const columns = grid[0].map((c) => String(c).trim());
    const rows = grid.slice(1).map((r) => {
      const obj: Record<string, any> = {};
      columns.forEach((col, i) => {
        obj[col] = r[i] !== undefined ? r[i] : "";
      });
      return obj;
    });

    return NextResponse.json({
      columns,
      rows,
      grid,
      fetchedAt: new Date().toISOString(),
      error: null,
    } as SheetResponse);
  } catch (err: any) {
    return NextResponse.json(empty(String(err?.message || err)));
  }
}
