/* =============================================================================
 *  server.js — статAPI-прокси к MOEX ISS + раздача статики  (чистый Node)
 * =============================================================================
 *  Запуск:  node server.js         →  http://localhost:8080
 *  Порт:    PORT=9000 node server.js
 *
 *  Зачем прокси: обходим CORS браузера и собираем M5/M15 из 1-минуток
 *  (ISS их напрямую не отдаёт). Всё, что зависит от сети, вынесено в
 *  чистые функции и покрыто офлайн-тестом (test/iss.test.js).
 *
 *  API:
 *    GET /api/candles?secid=SiU6&iss=60&from=2026-07-01&till=2026-07-31
 *        iss ∈ {1,10,60,24} — интервал ISS; 5 и 15 — агрегируются из 1-мин.
 *    GET /api/front?asset=Si     — ближний (неистёкший) контракт по коду актива
 * ===========================================================================*/
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

/* ============================ Чистые функции ============================ */

// MSK-строку "YYYY-MM-DD HH:MM:SS" → epoch ms (MOEX работает в UTC+3)
const mskToMs = (s) => Date.parse(String(s).replace(' ', 'T') + '+03:00');

// Строки ISS-таблицы → массив объектов по именам колонок
function rowsToObjects(table) {
  if (!table || !table.data) return [];
  const col = {}; table.columns.forEach((n, i) => (col[n] = i));
  return table.data.map((r) => {
    const o = {}; table.columns.forEach((n) => (o[n] = r[col[n]])); return o;
  });
}

// candles.json (одна или несколько страниц) → бары KLineChart
function parseCandles(pages) {
  const arr = Array.isArray(pages) ? pages : [pages];
  const out = [];
  for (const j of arr) {
    for (const o of rowsToObjects(j.candles)) {
      const ts = mskToMs(o.begin);
      if (Number.isFinite(ts)) out.push({ timestamp: ts, open: o.open, high: o.high, low: o.low, close: o.close, volume: o.volume });
    }
  }
  return out;
}

// Агрегация минуток в N-минутные свечи (для M5/M15)
function aggregate(bars, n) {
  const step = n * 60000;
  const out = []; let cur = null;
  for (const b of bars) {
    const bucket = Math.floor(b.timestamp / step) * step;
    if (!cur || cur.timestamp !== bucket) {
      if (cur) out.push(cur);
      cur = { timestamp: bucket, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume || 0;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Из страниц securities.json выбрать ближний фьючерс нужного актива
function pickFront(pages, asset, today) {
  const arr = Array.isArray(pages) ? pages : [pages];
  const futRe = /^[A-Za-z]{1,3}[FGHJKMNQUVXZ]\d$/;   // напр. SiU6, CRU6
  const seen = new Set();
  const list = [];
  for (const j of arr) {
    for (const o of rowsToObjects(j.securities)) {
      if (o.ASSETCODE !== asset) continue;
      if (!futRe.test(o.SECID)) continue;             // только фьючерсы, без опционов
      if (!o.LASTDELDATE || o.LASTDELDATE < today) continue;
      if (seen.has(o.SECID)) continue; seen.add(o.SECID);
      list.push({ ticker: o.SECID, lastDelDate: o.LASTDELDATE });
    }
  }
  list.sort((a, b) => a.lastDelDate.localeCompare(b.lastDelDate));
  return list;
}

/* ============================ Сеть (ISS) ============================ */

function httpGetJSON(u) {
  return new Promise((resolve, reject) => {
    https.get(u, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('ISS HTTP ' + res.statusCode)); }
      let buf = ''; res.on('data', (d) => (buf += d));
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// Постраничная выборка: тянем ?start=N, пока таблица tableName не иссякнет.
async function issGetAllPages(baseUrl, tableName, maxPages = 40) {
  const pages = [];
  let start = 0;
  for (let i = 0; i < maxPages; i++) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const j = await httpGetJSON(`${baseUrl}${sep}start=${start}`);
    pages.push(j);
    const rows = (j[tableName] && j[tableName].data) ? j[tableName].data.length : 0;
    if (rows === 0) break;
    start += rows;
    if (i === maxPages - 1) break;
  }
  return pages;
}

async function fetchCandles(secid, interval, from, till) {
  const base = `https://iss.moex.com/iss/engines/futures/markets/forts/securities/`
    + `${encodeURIComponent(secid)}/candles.json?interval=${interval}&from=${from}&till=${till}&iss.reverse=false`;
  return parseCandles(await issGetAllPages(base, 'candles'));
}

async function fetchFront(asset, today) {
  const base = 'https://iss.moex.com/iss/engines/futures/markets/forts/securities.json'
    + '?iss.meta=off&securities.columns=SECID,ASSETCODE,LASTDELDATE';
  return pickFront(await issGetAllPages(base, 'securities'), asset, today);
}

/* ============================ HTTP-обработчики ============================ */

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function handleCandles(q, res) {
  const { secid, iss, from, till } = q;
  if (!secid || !iss || !from || !till) return sendJSON(res, 400, { error: 'bad params' });
  try {
    let bars;
    if (iss === '5' || iss === '15') bars = aggregate(await fetchCandles(secid, 1, from, till), parseInt(iss, 10));
    else bars = await fetchCandles(secid, iss, from, till);
    sendJSON(res, 200, bars);
  } catch (e) { sendJSON(res, 502, { error: String(e.message || e) }); }
}

async function handleFront(q, res) {
  if (!q.asset) return sendJSON(res, 400, { error: 'bad params' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const list = await fetchFront(q.asset, today);
    if (!list.length) return sendJSON(res, 404, { error: 'no front contract for ' + q.asset });
    sendJSON(res, 200, { ticker: list[0].ticker, lastDelDate: list[0].lastDelDate, contracts: list });
  } catch (e) { sendJSON(res, 502, { error: String(e.message || e) }); }
}

function serveStatic(pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

function start() {
  http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname === '/api/candles') return handleCandles(parsed.query, res);
    if (parsed.pathname === '/api/front') return handleFront(parsed.query, res);
    serveStatic(parsed.pathname, res);
  }).listen(PORT, () => console.log(`Lun_term → http://localhost:${PORT}`));
}

/* Запуск сервера — только при прямом вызове; при require() отдаём чистые функции */
if (require.main === module) start();
module.exports = { mskToMs, rowsToObjects, parseCandles, aggregate, pickFront };
