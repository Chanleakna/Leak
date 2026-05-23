// All currency / number / percent formatting lives here.

export function fmtNumber(v: unknown, digits = 0): string {
  const n = Number(v);
  if (!isFinite(n)) return "0";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtCurrency(v: unknown, digits = 2): string {
  const n = Number(v);
  if (!isFinite(n)) return "$0.00";
  return (
    "$" +
    n.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

export function fmtPercent(v: unknown, digits = 0): string {
  const n = Number(v);
  if (!isFinite(n)) return "0%";
  return (
    n.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }) + "%"
  );
}

export function toNumber(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
}
