/* =============================================================================
 *  iss-client.js — прямой доступ к MOEX ISS из браузера (без бэкенда)
 * =============================================================================
 *  MOEX ISS отдаёт ответы с CORS (Access-Control-Allow-Origin: *), поэтому
 *  свечи и список контрактов можно забирать прямо из браузера — не нужен ни
 *  PHP, ни Node. Если у конкретного хостинга/сети CORS всё же не проходит,
 *  data.js откатится на прокси (api.php), а затем на демо.
 *
 *  window.LunISS = { fetchCandles, aggregate, fetchFront }
 * ===========================================================================*/
(function () {
  const BASE = 'https://iss.moex.com/iss/engines/futures/markets/forts';

  // "YYYY-MM-DD HH:MM:SS" (МСК, UTC+3) -> epoch ms
  const mskToMs = (s) => Date.parse(String(s).replace(' ', 'T') + '+03:00');

  function rowsToObjects(table) {
    if (!table || !table.columns || !table.data) return [];
    const col = {}; table.columns.forEach((n, i) => (col[n] = i));
    return table.data.map((r) => {
      const o = {}; table.columns.forEach((n) => (o[n] = r[col[n]])); return o;
    });
  }

  function parseCandles(pages) {
    const out = [];
    for (const j of pages) for (const o of rowsToObjects(j.candles)) {
      const ts = mskToMs(o.begin);
      if (Number.isFinite(ts)) out.push({ timestamp: ts, open: o.open, high: o.high, low: o.low, close: o.close, volume: o.volume });
    }
    return out;
  }

  // агрегация минуток в N-минутные свечи (для M5/M15)
  function aggregate(bars, n) {
    const step = n * 60000; const out = []; let cur = null;
    for (const b of bars) {
      const bucket = Math.floor(b.timestamp / step) * step;
      if (!cur || cur.timestamp !== bucket) {
        if (cur) out.push(cur);
        cur = { timestamp: bucket, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
      } else {
        cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low);
        cur.close = b.close; cur.volume += b.volume || 0;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  function pickFront(pages, asset, today) {
    const futRe = /^[A-Za-z]{1,3}[FGHJKMNQUVXZ]\d$/;
    const seen = new Set(); const list = [];
    for (const j of pages) for (const o of rowsToObjects(j.securities)) {
      if (o.ASSETCODE !== asset || !futRe.test(o.SECID || '')) continue;
      if (!o.LASTDELDATE || o.LASTDELDATE < today) continue;
      if (seen.has(o.SECID)) continue; seen.add(o.SECID);
      list.push({ ticker: o.SECID, lastDelDate: o.LASTDELDATE });
    }
    list.sort((a, b) => a.lastDelDate.localeCompare(b.lastDelDate));
    return list;
  }

  // список шлюзов; первый рабочий запоминаем
  const gateways = () => (window.LUN && window.LUN.ISS_GATEWAYS) || [{ name: 'прямой', wrap: (u) => u }];
  let workingGw = null;                         // {name, wrap}
  window.LUN_ISS_GATEWAY = '';

  async function fetchJSON(issUrl) {
    // если уже знаем рабочий шлюз — идём через него
    const tryList = workingGw ? [workingGw] : gateways();
    let lastErr;
    for (const gw of tryList) {
      try {
        const res = await fetch(gw.wrap(issUrl));
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
        const j = await res.json();
        workingGw = gw; window.LUN_ISS_GATEWAY = gw.name;
        return j;
      } catch (e) { lastErr = e; }
    }
    workingGw = null;
    throw lastErr || new Error('нет доступного шлюза к ISS');
  }

  // постранично тянем ?start=N, пока таблица не иссякнет
  async function getAllPages(baseUrl, table, maxPages = 40) {
    const pages = []; let start = 0;
    for (let i = 0; i < maxPages; i++) {
      const sep = baseUrl.includes('?') ? '&' : '?';
      const j = await fetchJSON(`${baseUrl}${sep}start=${start}`);
      pages.push(j);
      const rows = (j[table] && j[table].data) ? j[table].data.length : 0;
      if (rows === 0) break;
      start += rows;
    }
    return pages;
  }

  async function fetchCandles(secid, interval, from, till) {
    const url = `${BASE}/securities/${encodeURIComponent(secid)}/candles.json`
      + `?interval=${interval}&from=${from}&till=${till}&iss.reverse=false`;
    return parseCandles(await getAllPages(url, 'candles'));
  }

  async function fetchFront(asset, today) {
    const url = `${BASE}/securities.json?iss.meta=off&securities.columns=SECID,ASSETCODE,LASTDELDATE`;
    return pickFront(await getAllPages(url, 'securities'), asset, today);
  }

  // Свечи с произвольного рынка (для бэктеста берём непрерывную дневную USD/RUB
  // с валютного рынка: engine=currency, market=selt, secid=USD000UTSTOM — годы истории).
  async function fetchCandlesFrom(engine, market, secid, interval, from, till) {
    const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/securities/`
      + `${encodeURIComponent(secid)}/candles.json?interval=${interval}&from=${from}&till=${till}&iss.reverse=false`;
    return parseCandles(await getAllPages(url, 'candles'));
  }

  window.LunISS = { fetchCandles, fetchCandlesFrom, aggregate, fetchFront };
})();
