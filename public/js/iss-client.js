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

  // Список бумаг рынка (для поиска инструмента): engine/market — напр.
  // stock/shares (акции), futures/forts (фьючерсы).
  async function fetchSecuritiesList(engine, market, columns) {
    const cols = columns ? '&securities.columns=' + columns : '';
    const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/securities.json?iss.meta=off${cols}`;
    const pages = await getAllPages(url, 'securities');
    const out = [];
    for (const j of pages) for (const o of rowsToObjects(j.securities)) out.push(o);
    return out;
  }

  // Свечи с произвольного рынка (для бэктеста берём непрерывную дневную USD/RUB
  // с валютного рынка: engine=currency, market=selt, secid=USD000UTSTOM — годы истории).
  async function fetchCandlesFrom(engine, market, secid, interval, from, till, maxPages) {
    const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/securities/`
      + `${encodeURIComponent(secid)}/candles.json?interval=${interval}&from=${from}&till=${till}&iss.reverse=false`;
    return parseCandles(await getAllPages(url, 'candles', maxPages || 40));
  }

  /* --- склейка непрерывного фьючерса из квартальных контрактов ---
   * contracts: [{secid, bars(asc)}]. Роллинг по экспирации (последняя свеча
   * контракта), фронт-окно = (пред.экспирация, своя экспирация]. Стыки
   * back-adjust (разностный «панамский»): по перекрытию в день ролла. */
  function stitchContracts(contracts) {
    const cs = contracts.filter((c) => c.bars && c.bars.length)
      .map((c) => ({ secid: c.secid, bars: c.bars.slice().sort((a, b) => a.timestamp - b.timestamp) }));
    cs.forEach((c) => { c.expiry = c.bars[c.bars.length - 1].timestamp; c.byTs = new Map(c.bars.map((b) => [b.timestamp, b])); });
    cs.sort((a, b) => a.expiry - b.expiry);
    let prevExp = -Infinity; const segs = [];
    for (const c of cs) {
      const front = c.bars.filter((b) => b.timestamp > prevExp && b.timestamp <= c.expiry);
      if (front.length) segs.push({ c, front });
      prevExp = c.expiry;
    }
    let offset = 0;                       // накапливаем от новых к старым
    for (let i = segs.length - 2; i >= 0; i--) {
      const older = segs[i], newer = segs[i + 1], rollTs = older.c.expiry;
      const ob = older.c.byTs.get(rollTs), nb = newer.c.byTs.get(rollTs);
      if (ob && nb) offset += (nb.close - ob.close);
      const off = offset;
      older.front = older.front.map((b) => ({ timestamp: b.timestamp, open: b.open + off, high: b.high + off, low: b.low + off, close: b.close + off, volume: b.volume }));
    }
    const out = [];
    for (const s of segs) for (const b of s.front) out.push(b);
    out.sort((a, b) => a.timestamp - b.timestamp);
    return out;
  }

  // непрерывный фьючерс: prefix — префикс тикера (SiU6 -> 'Si'), years — глубина.
  // tf — таймфрейм: { iss, agg, maxPages }. iss — нативный интервал ISS
  //   (24=день, 60=час, 10=10м, 1=минутка); agg — доп. агрегация из iss в N
  //   минут (для M5/M15 берём iss:1 + agg:5/15); maxPages — лимит страниц (для
  //   минуток нужно больше). Внутридневная история у старых контрактов часто
  //   недоступна — они просто пропускаются (склейка по имеющимся). onProgress —
  //   колбэк (done,total,secid) для статуса.
  async function fetchContinuousFutures(prefix, years, tf, onProgress) {
    tf = tf || {}; const iss = tf.iss || 24, agg = tf.agg || 0, maxPages = tf.maxPages || 40;
    const MONTHS = ['H', 'M', 'U', 'Z'];             // квартальные: март/июнь/сент/дек
    const nowY = new Date().getUTCFullYear();
    const from = (nowY - years - 1) + '-01-01', till = new Date().toISOString().slice(0, 10);
    const secids = [];
    for (let y = nowY - years; y <= nowY; y++) for (const m of MONTHS) secids.push(prefix + m + (y % 10));
    const contracts = []; let done = 0;
    for (const secid of secids) {
      try {
        let bars = await fetchCandlesFrom('futures', 'forts', secid, iss, from, till, maxPages);
        if (agg && bars && bars.length) bars = aggregate(bars, agg);
        if (bars && bars.length) contracts.push({ secid, bars });
      } catch (e) { /* контракта/истории нет — пропускаем */ }
      done++; if (onProgress) onProgress(done, secids.length, secid);
    }
    return stitchContracts(contracts);
  }

  // FUTOI — открытый интерес по физлицам/юрлицам (аналитический продукт ISS).
  // code — код актива фьючерса (Si, GD, Eu, BR, CR ...). Возвращает строки по
  // датам/времени с колонками clgroup (FIZ/YUR), pos_long, pos_short.
  async function fetchFUTOI(code, from, till) {
    const url = `https://iss.moex.com/iss/analyticalproducts/futoi/securities/${encodeURIComponent(code)}.json?iss.meta=off&from=${from}&till=${till}`;
    const pages = await getAllPages(url, 'futoi');
    const out = []; for (const j of pages) for (const o of rowsToObjects(j.futoi)) out.push(o);
    return out;
  }

  // Дневная история открытого интереса по конкретному контракту (OPENPOSITION).
  async function fetchOIHistory(secid, from, till) {
    const url = `https://iss.moex.com/iss/history/engines/futures/markets/forts/securities/${encodeURIComponent(secid)}.json`
      + `?iss.meta=off&from=${from}&till=${till}&history.columns=TRADEDATE,OPENPOSITION`;
    const pages = await getAllPages(url, 'history');
    const out = []; for (const j of pages) for (const o of rowsToObjects(j.history)) { if (o.OPENPOSITION != null && o.TRADEDATE) out.push({ date: o.TRADEDATE, oi: +o.OPENPOSITION }); }
    return out;
  }

  window.LunISS = { fetchCandles, fetchCandlesFrom, fetchSecuritiesList, fetchContinuousFutures, stitchContracts, aggregate, fetchFront, fetchFUTOI, fetchOIHistory };
})();
