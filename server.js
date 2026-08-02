/* =============================================================================
 *  server.js — статический сервер + прокси к MOEX ISS  (чистый Node, без зависимостей)
 * =============================================================================
 *  Запуск:  node server.js   →   http://localhost:8080
 *
 *  Зачем прокси: браузер не всегда может ходить на iss.moex.com напрямую (CORS),
 *  и MOEX ISS не отдаёт 5- и 15-минутные свечи — их собираем агрегацией из
 *  1-минутных здесь, на сервере.
 *
 *  API:  GET /api/candles?secid=SiU5&iss=60&from=2025-07-01&till=2025-07-31
 *        iss ∈ {1,10,60,24} — интервал ISS; 5 и 15 — агрегируются из 1-мин.
 * ===========================================================================*/
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

/* ---- запрос к ISS ---- */
function issGet(secid, interval, from, till) {
  const u = `https://iss.moex.com/iss/engines/futures/markets/forts/securities/`
    + `${encodeURIComponent(secid)}/candles.json`
    + `?interval=${interval}&from=${from}&till=${till}&iss.reverse=false`;
  return new Promise((resolve, reject) => {
    https.get(u, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('ISS HTTP ' + res.statusCode)); }
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// MSK-строку "YYYY-MM-DD HH:MM:SS" → epoch ms (MOEX работает в UTC+3)
const mskToMs = (s) => Date.parse(s.replace(' ', 'T') + '+03:00');

function issToBars(json) {
  const c = json.candles;
  if (!c || !c.data) return [];
  const col = {}; c.columns.forEach((n, i) => (col[n] = i));
  return c.data.map((r) => ({
    timestamp: mskToMs(r[col.begin]),
    open: r[col.open], high: r[col.high], low: r[col.low], close: r[col.close],
    volume: r[col.volume],
  })).filter((b) => Number.isFinite(b.timestamp));
}

// Агрегация минуток в N-минутные свечи
function aggregate(bars, n) {
  const stepMs = n * 60000;
  const out = [];
  let cur = null;
  for (const b of bars) {
    const bucket = Math.floor(b.timestamp / stepMs) * stepMs;
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

async function handleCandles(q, res) {
  const { secid, iss, from, till } = q;
  if (!secid || !iss || !from || !till) { res.writeHead(400); return res.end('bad params'); }
  try {
    let bars;
    if (iss === '5' || iss === '15') {
      const raw = issToBars(await issGet(secid, 1, from, till));
      bars = aggregate(raw, parseInt(iss, 10));
    } else {
      bars = issToBars(await issGet(secid, iss, from, till));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(bars));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}

/* ---- статика ---- */
function serveStatic(pathname, res) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === '/api/candles') return handleCandles(parsed.query, res);
  serveStatic(parsed.pathname, res);
}).listen(PORT, () => {
  console.log(`Lun_term → http://localhost:${PORT}`);
});
