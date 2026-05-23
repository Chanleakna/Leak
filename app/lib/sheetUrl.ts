// Convert ANY Google Sheets URL into a CSV export URL for a given tab gid.
//
//  - Publish-to-web : /d/e/<PUBID>/pubhtml...  ->  /d/e/<PUBID>/pub?output=csv&gid=<gid>&single=true
//  - Regular edit   : /d/<ID>/edit...          ->  /d/<ID>/export?format=csv&gid=<gid>
//  - Already a CSV export URL                   ->  returned as-is (gid ensured)

export function toCsvUrl(rawUrl: string, gid: string = "0"): string {
  const url = (rawUrl || "").trim();
  if (!url) return "";

  // Already an export/pub CSV URL — make sure the gid is present.
  if (/output=csv|format=csv/.test(url)) {
    return ensureGid(url, gid);
  }

  // Publish-to-web form: /spreadsheets/d/e/<PUBID>/(pubhtml|pub|...)
  const pub = url.match(/\/spreadsheets\/d\/e\/([^/]+)/);
  if (pub) {
    return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv&gid=${encodeURIComponent(
      gid
    )}&single=true`;
  }

  // Regular form: /spreadsheets/d/<ID>/edit...
  const reg = url.match(/\/spreadsheets\/d\/([^/]+)/);
  if (reg) {
    return `https://docs.google.com/spreadsheets/d/${reg[1]}/export?format=csv&gid=${encodeURIComponent(
      gid
    )}`;
  }

  // Unknown shape — return as-is so the proxy can surface a clear error.
  return url;
}

function ensureGid(url: string, gid: string): string {
  if (/[?&]gid=/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}gid=${encodeURIComponent(gid)}`;
}
