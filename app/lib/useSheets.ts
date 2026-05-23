"use client";

import useSWR from "swr";
import { REFRESH_MS, SHEET_LIST, SheetSource } from "./config";
import { toCsvUrl } from "./sheetUrl";

export interface SheetData {
  columns: string[];
  rows: Record<string, any>[];
  grid: string[][];
  fetchedAt: string;
  error: string | null;
}

export interface SheetsResult {
  [key: string]: SheetData;
}

const EMPTY: SheetData = {
  columns: [],
  rows: [],
  grid: [],
  fetchedAt: "",
  error: null,
};

async function fetchOne(src: SheetSource): Promise<SheetData> {
  if (!src.url) return { ...EMPTY, error: "Not configured" };
  const csv = toCsvUrl(src.url, src.gid);
  const proxy = `/api/sheet?url=${encodeURIComponent(csv)}&raw=${src.raw}`;
  try {
    const res = await fetch(proxy, { cache: "no-store" });
    const json = (await res.json()) as SheetData;
    return json;
  } catch (err: any) {
    return { ...EMPTY, error: String(err?.message || err) };
  }
}

async function fetchAll(): Promise<SheetsResult> {
  const results = await Promise.all(SHEET_LIST.map(fetchOne));
  const out: SheetsResult = {};
  SHEET_LIST.forEach((src, i) => {
    out[src.key] = results[i];
  });
  return out;
}

export function useSheets() {
  const { data, error, isLoading, mutate } = useSWR<SheetsResult>(
    "all-sheets",
    fetchAll,
    {
      refreshInterval: REFRESH_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
      dedupingInterval: 5000,
    }
  );

  return {
    sheets: data || {},
    isLoading: isLoading && !data,
    error,
    refresh: () => mutate(),
    lastFetched: data
      ? Object.values(data)
          .map((d) => d.fetchedAt)
          .filter(Boolean)
          .sort()
          .pop() || ""
      : "",
  };
}
