/************************************************************************
 * INVENTORY SURVEY APP — Google Apps Script backend
 * ----------------------------------------------------------------------
 * Serves:
 *   - Index.html      PA stock-count survey form (mobile)
 *   - Dashboard.html  Manager dashboard (desktop)
 *
 * Data fetching:
 *   - PA list & SKU list are pulled LIVE in the browser from published
 *     Google Sheet CSV URLs (see CONFIG below + the HTML files).
 *   - Dashboard data is served from this script via JSONP (doGet ?action=)
 *     and via google.script.run.
 *   - Submissions are written to the inventory sheet, one row per SKU.
 ************************************************************************/

/* =========================== CONFIG ================================ */
var CONFIG = {
  PASSWORD: 'StockCount@2025',

  // The Google Sheet that stores submitted inventory rows.
  INVENTORY_SHEET_ID: '[INVENTORY_SHEET_ID]',
  INVENTORY_TAB: 'Inventory',

  // Published-to-web CSV base URL for the master workbook.
  // Format: https://docs.google.com/spreadsheets/d/e/.../pub
  PUBLISHED_SHEET_URL: '[YOUR_PUBLISHED_SHEET_URL]',
  PA_GID: '[PA_GID]',
  SKU_GID: '[SKU_GID]',

  // Off-take source (optional separate published tab).
  OFFTAKE_GID: '[OFFTAKE_GID]'
};

var INVENTORY_HEADERS = [
  'Submission ID', 'Timestamp', 'PA Name', 'Location', 'Count Date',
  'Material Code', 'Material Name', 'QTY', 'Expiry Date', 'Batch Code',
  'Status', 'Notes', 'GPS Lat', 'GPS Lon'
];

/* ======================= ROUTING (doGet) =========================== */
function doGet(e) {
  e = e || {};
  var p = e.parameter || {};
  var action = p.action;

  // ---- JSONP data endpoints ----
  if (action) {
    var result;
    try {
      switch (action) {
        case 'getDashboardData': result = getDashboardData(); break;
        case 'getOfftakeData':   result = getOfftakeData(); break;
        case 'getMasterPA':      result = getMasterPA(); break;
        case 'getMasterSKU':     result = getMasterSKU(); break;
        default: result = { ok: false, error: 'Unknown action: ' + action };
      }
    } catch (err) {
      result = { ok: false, error: String(err) };
    }
    return jsonpOut(result, p.callback);
  }

  // ---- HTML pages ----
  var page = (p.page || 'survey').toLowerCase();
  var file = (page === 'dashboard') ? 'Dashboard' : 'Index';
  return HtmlService.createHtmlOutputFromFile(file)
    .setTitle(page === 'dashboard' ? 'Inventory Dashboard' : 'Stock Count Survey')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var result;
  try {
    var payload = JSON.parse(e.postData.contents);
    result = submitInventory(payload);
  } catch (err) {
    result = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Wrap a result as JSONP (or plain JSON when no callback supplied). */
function jsonpOut(obj, callback) {
  var json = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== INVENTORY SHEET I/O ========================= */
function getInventorySheet_() {
  var ss = CONFIG.INVENTORY_SHEET_ID && CONFIG.INVENTORY_SHEET_ID.indexOf('[') !== 0
    ? SpreadsheetApp.openById(CONFIG.INVENTORY_SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.INVENTORY_TAB);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.INVENTORY_TAB);
    sh.getRange(1, 1, 1, INVENTORY_HEADERS.length).setValues([INVENTORY_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Append one row per SKU. Returns { ok, submissionId, rows }.
 * payload = {
 *   paName, location, countDate, notes, batchCode, gpsLat, gpsLon,
 *   items: [{ code, name, qty, expiryDate, batchCode, status }]
 * }
 */
function submitInventory(payload) {
  if (!payload || !payload.items || !payload.items.length) {
    return { ok: false, error: 'No items to submit.' };
  }
  var sh = getInventorySheet_();
  var submissionId = 'SUB-' + Date.now() + '-' +
    Math.floor(Math.random() * 9000 + 1000);
  var ts = new Date();
  var rows = payload.items.map(function (it) {
    return [
      submissionId,
      ts,
      payload.paName || '',
      payload.location || '',
      payload.countDate || '',
      it.code || '',
      it.name || '',
      Number(it.qty) || 0,
      it.expiryDate || '',
      it.batchCode || payload.batchCode || '',
      it.status || '',
      payload.notes || '',
      payload.gpsLat || '',
      payload.gpsLon || ''
    ];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, INVENTORY_HEADERS.length)
    .setValues(rows);
  return { ok: true, submissionId: submissionId, rows: rows.length };
}

/* ===================== LIVE MASTER FETCHES ========================= */
function publishedCsvUrl_(gid) {
  return CONFIG.PUBLISHED_SHEET_URL + '?gid=' + gid + '&single=true&output=csv';
}

function fetchCsv_(url) {
  var resp = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('CSV fetch failed: HTTP ' + resp.getResponseCode());
  }
  return parseCsv_(resp.getContentText());
}

/** Master PA list — filters out inactive PAs. */
function getMasterPA() {
  try {
    var rows = fetchCsv_(publishedCsvUrl_(CONFIG.PA_GID));
    if (!rows.length) return { ok: true, data: [] };
    var head = rows.shift().map(normHeader_);
    var idx = headerIndex_(head);
    var blocked = /resign|inactive|maternity|leave|terminated/i;
    var data = [];
    rows.forEach(function (r) {
      var remarks = cell_(r, idx['remarks']);
      if (blocked.test(remarks)) return;
      var paName = cell_(r, idx['pa name']);
      if (!paName) return;
      data.push({
        code: cell_(r, idx['code']),
        outlet: cell_(r, idx['outlet name']),
        address: cell_(r, idx['address']),
        paCode: cell_(r, idx['pa code']),
        paName: paName,
        customerCode: cell_(r, idx['customer code']),
        customerName: cell_(r, idx['customer name']),
        cusWName: cell_(r, idx['cus w name']),
        paNameWStore: cell_(r, idx['pa name w store']),
        teamLeader: cell_(r, idx['team leader name']),
        type: cell_(r, idx['type']),
        lat: cell_(r, idx['latitude']),
        lon: cell_(r, idx['longitude']),
        remarks: remarks,
        label: paName + ' | ' + cell_(r, idx['outlet name'])
      });
    });
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: String(err), data: [] };
  }
}

/** Master SKU + price list. SAP Code is the primary material code. */
function getMasterSKU() {
  try {
    var rows = fetchCsv_(publishedCsvUrl_(CONFIG.SKU_GID));
    if (!rows.length) return { ok: true, data: [] };
    var head = rows.shift().map(normHeader_);
    var idx = headerIndex_(head);
    var data = [];
    rows.forEach(function (r) {
      var desc = cell_(r, idx['description']);
      if (!desc) return;
      var sap = cell_(r, idx['sap code']);
      data.push({
        barCode: cell_(r, idx['bar code']),
        productCode: cell_(r, idx['product code']),
        sapCode: sap,
        code: sap || cell_(r, idx['product code']),
        name: desc,
        priceIncl: parseNum_(cell_(r, idx['price/unit incl.vat'])),
        priceExcl: parseNum_(cell_(r, idx['price/unit excl.vat']))
      });
    });
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: String(err), data: [] };
  }
}

/* ===================== DASHBOARD AGGREGATION ======================= */
/**
 * Aggregate the inventory sheet into store-level submission objects,
 * each carrying its SKU array and pre-bucketed expiry counts/values.
 */
function getDashboardData() {
  var sh = getInventorySheet_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return { ok: true, data: [], generatedAt: new Date().toISOString() };
  }
  var head = values.shift();
  var col = {};
  head.forEach(function (h, i) { col[String(h).trim()] = i; });

  // group rows by submission (one store visit = one submissionId)
  var groups = {};
  values.forEach(function (r) {
    var id = r[col['Submission ID']];
    if (!id) return;
    if (!groups[id]) groups[id] = [];
    groups[id].push(r);
  });

  var priceMap = buildPriceMap_();
  var out = [];

  Object.keys(groups).forEach(function (id) {
    var rows = groups[id];
    var first = rows[0];
    var countDate = parseDate_(first[col['Count Date']]) ||
      parseDate_(first[col['Timestamp']]);
    var store = {
      submissionId: id,
      paName: first[col['PA Name']] || '',
      outlet: extractStore_(first[col['PA Name']]),
      teamLeader: '',
      location: first[col['Location']] || '',
      submitted: true,
      submittedOn: countDate ? countDate.toISOString() : '',
      weekNum: countDate ? isoWeek_(countDate) : 0,
      total: 0, expired: 0, m3: 0, m36: 0, m69: 0, m912: 0, m12p: 0,
      stockVal: 0, expiredVal: 0,
      skus: []
    };

    rows.forEach(function (r) {
      var qty = Number(r[col['QTY']]) || 0;
      var name = r[col['Material Name']] || '';
      var code = r[col['Material Code']] || '';
      var brand = extractBrand_(name);
      var unit = priceMap[code] || priceMap[name] || priceFallback_(brand);
      var value = qty * unit;
      var exp = parseDate_(r[col['Expiry Date']]);
      var daysLeft = exp ? Math.floor((exp - new Date()) / 86400000) : null;

      store.total += qty;
      store.stockVal += value;
      bucketize_(store, daysLeft, qty, value);

      store.skus.push({
        code: code,
        name: name,
        brand: brand,
        subBrand: extractSubBrand_(name),
        qty: qty,
        unitPrice: unit,
        value: value,
        daysLeft: daysLeft,
        batchCode: r[col['Batch Code']] || '',
        expiryDate: exp ? exp.toISOString() : '',
        status: r[col['Status']] || statusFromDays_(daysLeft)
      });
    });

    out.push(store);
  });

  return { ok: true, data: out, generatedAt: new Date().toISOString() };
}

/** Place qty/value into the right expiry bucket on a store object. */
function bucketize_(store, daysLeft, qty, value) {
  if (daysLeft === null) { store.m12p += qty; return; }
  if (daysLeft < 0)        { store.expired += qty; store.expiredVal += value; }
  else if (daysLeft <= 90) { store.m3 += qty; }
  else if (daysLeft <= 180){ store.m36 += qty; }
  else if (daysLeft <= 270){ store.m69 += qty; }
  else if (daysLeft <= 365){ store.m912 += qty; }
  else                     { store.m12p += qty; }
}

/** Off-take rows for the Off-Take & Depletion tab. */
function getOfftakeData() {
  // If a published off-take tab is configured, read it; otherwise derive
  // a simple structure from the inventory data so the tab still works.
  try {
    if (CONFIG.OFFTAKE_GID && CONFIG.OFFTAKE_GID.indexOf('[') !== 0) {
      var rows = fetchCsv_(publishedCsvUrl_(CONFIG.OFFTAKE_GID));
      var head = rows.shift() || [];
      var data = rows.map(function (r) {
        var o = {};
        head.forEach(function (h, i) { o[String(h).trim()] = r[i]; });
        return o;
      });
      return { ok: true, data: data };
    }
  } catch (err) {
    // fall through to derived data
  }
  var dash = getDashboardData();
  var derived = [];
  (dash.data || []).forEach(function (s) {
    s.skus.forEach(function (k) {
      derived.push({
        store: s.outlet,
        paName: s.paName,
        teamLeader: s.teamLeader,
        code: k.code, name: k.name,
        brand: k.brand, subBrand: k.subBrand,
        totalStock: k.qty, value: k.value,
        daysLeft: k.daysLeft
      });
    });
  });
  return { ok: true, data: derived };
}

/* ====================== PRICE / BRAND HELPERS ===================== */
function buildPriceMap_() {
  var map = {};
  try {
    var res = getMasterSKU();
    (res.data || []).forEach(function (s) {
      if (s.code)  map[s.code]  = s.priceIncl || s.priceExcl || 0;
      if (s.name)  map[s.name]  = s.priceIncl || s.priceExcl || 0;
    });
  } catch (e) { /* ignore — fall back to estimates */ }
  return map;
}

function priceFallback_(brand) {
  var f = { GLU: 21, PED: 28, ENS: 25, SIM: 25, STC: 30, SM: 12, PRO: 27, NEP: 23 };
  return f[brand] || 20;
}

/** Map a SKU description to a short brand code. Order matters. */
function extractBrand_(name) {
  var n = String(name).toUpperCase();
  if (n.indexOf('GLUCERNA') >= 0) return 'GLU';
  if (n.indexOf('PEDIASURE') >= 0) return 'PED';
  if (n.indexOf('ENSURE') >= 0) return 'ENS';
  if (n.indexOf('SIMILAC MUM') >= 0 || n.indexOf('SIM MUM') >= 0) return 'SM';
  if (n.indexOf('SIMILAC TOTAL COMFORT') >= 0) return 'STC';
  if (n.indexOf('SIMILAC') >= 0 || n.indexOf('ISOMIL') >= 0) return 'SIM';
  if (n.indexOf('PROSURE') >= 0) return 'PRO';
  if (n.indexOf('NEPRO') >= 0) return 'NEP';
  return 'OTH';
}

/** Sub-brand = first meaningful descriptor after the brand word. */
function extractSubBrand_(name) {
  var n = String(name).trim();
  if (!n) return 'Unknown';
  // Use first 2-3 tokens as a readable sub-brand grouping.
  var tokens = n.split(/\s+/).slice(0, 3).join(' ');
  return tokens || 'Unknown';
}

function statusFromDays_(daysLeft) {
  if (daysLeft === null) return 'Good';
  if (daysLeft < 0) return 'Expired';
  if (daysLeft <= 90) return 'Expiring';
  return 'Good';
}

function extractStore_(paName) {
  var s = String(paName);
  var i = s.indexOf('|');
  return i >= 0 ? s.slice(i + 1).trim() : s.trim();
}

/* ========================= DATE / WEEK ============================ */
/** ISO 8601 week number (weeks start Monday). */
function isoWeek_(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function parseDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function parseNum_(v) {
  if (v === null || v === undefined) return 0;
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

/* ============================ CSV ================================= */
/** Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines). */
function parseCsv_(text) {
  var rows = [];
  var row = [];
  var field = '';
  var i = 0, inQuotes = false;
  text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < text.length) {
    var c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(function (r) {
    return r.length && !(r.length === 1 && r[0] === '');
  });
}

function normHeader_(h) { return String(h).trim().toLowerCase(); }

function headerIndex_(head) {
  var idx = {};
  head.forEach(function (h, i) { idx[h] = i; });
  return idx;
}

function cell_(row, i) {
  return (i === undefined || row[i] === undefined) ? '' : String(row[i]).trim();
}
