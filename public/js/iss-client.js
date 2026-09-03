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

  // Порядковый номер экспирации из тикера (SiZ5 -> дек-2025). Месяц — предпосл.
  // символ, год — последний (одна цифра, разворачиваем к ближайшему десятилетию).
  const MCODE = { F: 1, G: 2, H: 3, J: 4, K: 5, M: 6, N: 7, Q: 8, U: 9, V: 10, X: 11, Z: 12 };
  function expiryOrd(secid) {
    const s = String(secid || '');
    const mo = MCODE[s.slice(-2, -1)]; if (!mo) return null;
    const y = +s.slice(-1); if (!Number.isFinite(y)) return null;
    const nowY = new Date().getUTCFullYear();
    let full = Math.floor(nowY / 10) * 10 + y;
    if (full < nowY - 5) full += 10;                 // перескок десятилетия (…9 -> …0)
    return full * 100 + mo;
  }

  /* --- склейка непрерывного фьючерса из квартальных контрактов ---
   * contracts: [{secid, bars(asc)}]. Строим НЕПРЕРЫВНЫЙ ряд по ликвидности:
   * на каждый момент времени берём самый ОБЪЁМНЫЙ из ещё не «прошедших»
   * контрактов (монотонно вперёд по экспирации — назад не откатываемся). Так
   * дальний, уже листингованный, но неликвидный квартал не подменяет фронт, а
   * ролл происходит ровно там, где ликвидность реально мигрировала. Хвостовые
   * «одиночные» неликвидные принты дальнего контракта отсекаются. Стыки
   * back-adjust (разностный «панамский») — по разнице close в точке ролла.
   * Итог: последний бар графика — всегда цена ликвидного фронта, без «улётов». */
  function stitchContracts(contracts) {
    const cs = contracts.filter((c) => c.bars && c.bars.length)
      .map((c) => ({ secid: c.secid, bars: c.bars.slice().sort((a, b) => a.timestamp - b.timestamp) }));
    if (!cs.length) return [];
    cs.forEach((c) => {
      c.ord = expiryOrd(c.secid);
      c.lastTs = c.bars[c.bars.length - 1].timestamp;
      c.byTs = new Map(c.bars.map((b) => [b.timestamp, b]));
    });
    // порядок контрактов — по РЕАЛЬНОЙ экспирации из тикера (а не по последней
    // свече: у дальнего квартала она тоже «сегодня»); фолбэк — по последней свече
    cs.sort((a, b) => (a.ord != null && b.ord != null ? a.ord - b.ord : a.lastTs - b.lastTs));
    if (cs.length === 1) return cs[0].bars.map((b) => ({ timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));

    // объединённая шкала времени
    const tsSet = new Set(); cs.forEach((c) => c.bars.forEach((b) => tsSet.add(b.timestamp)));
    const allTs = [...tsSet].sort((a, b) => a - b);
    let globalMaxVol = 0; cs.forEach((c) => c.bars.forEach((b) => { const v = +b.volume || 0; if (v > globalMaxVol) globalMaxVol = v; }));

    // на каждый ts — самый ликвидный контракт из индексов >= текущего (монотонно)
    let curIdx = 0; const picks = [];   // {ts, ci, bar}
    for (const ts of allTs) {
      let best = -1, bestVol = -Infinity;
      for (let ci = curIdx; ci < cs.length; ci++) { const b = cs[ci].byTs.get(ts); if (b) { const v = +b.volume || 0; if (v > bestVol) { bestVol = v; best = ci; } } }
      if (best < 0) { for (let ci = curIdx; ci < cs.length && best < 0; ci++) if (cs[ci].byTs.has(ts)) best = ci; }
      if (best < 0) continue;
      curIdx = best; picks.push({ ts, ci: best, bar: cs[best].byTs.get(ts) });
    }
    if (!picks.length) return [];

    // непрерывные «прогоны» одного контракта
    let runs = [];
    for (let i = 0; i < picks.length; i++) {
      if (!runs.length || runs[runs.length - 1].ci !== picks[i].ci) runs.push({ ci: picks[i].ci, start: i, end: i, maxVol: 0 });
      const r = runs[runs.length - 1]; r.end = i; const v = +picks[i].bar.volume || 0; if (v > r.maxVol) r.maxVol = v;
    }
    // отсечь хвостовые НЕЛИКВИДНЫЕ прогоны (случайные принты дальнего квартала):
    // если последний прогон почти без объёма относительно рынка — выбросить
    const liqFloor = globalMaxVol * 0.05;
    while (runs.length > 1 && runs[runs.length - 1].maxVol < liqFloor) { const dead = runs.pop(); picks.length = dead.start; }

    // собрать ряд из оставшихся прогонов
    const out = [];
    for (const r of runs) for (let i = r.start; i <= r.end; i++) { const p = picks[i]; out.push({ timestamp: p.ts, open: p.bar.open, high: p.bar.high, low: p.bar.low, close: p.bar.close, volume: p.bar.volume, _ci: p.ci }); }
    if (!out.length) return [];

    // back-adjust: от новых к старым, копим смещение по разнице close в точке ролла
    let off = 0;
    for (let r = runs.length - 2; r >= 0; r--) {
      const older = runs[r], newer = runs[r + 1];
      const rollTs = picks[newer.start].ts;
      const nb = cs[newer.ci].byTs.get(rollTs), ob = cs[older.ci].byTs.get(rollTs);
      if (nb && ob) off += (nb.close - ob.close);
      const o = off, s = older.start - runs[0].start, e = older.end - runs[0].start;
      for (let k = s; k <= e; k++) { out[k].open += o; out[k].high += o; out[k].low += o; out[k].close += o; }
    }
    out.forEach((b) => { delete b._ci; });
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
    const out = [];
    for (const j of pages) {
      // имя таблицы может отличаться — берём любую с колонкой clgroup
      for (const key of Object.keys(j)) {
        const t = j[key];
        if (t && t.columns && t.data && t.columns.some((c) => String(c).toLowerCase() === 'clgroup')) {
          for (const o of rowsToObjects(t)) out.push(o);
        }
      }
    }
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

  // Разбор кода опциона FORTS -> {strike, type:'C'|'P'}. Поддержаны оба формата:
  //  новый: ...CA65000 / ...PA65000 (тип+страйк в конце);
  //  старый: <asset><strike><месяц-буква><год>, где A–L=CALL, M–X=PUT.
  function parseOptSecid(secid, asset) {
    const s = String(secid || '');
    let m = s.match(/([CP])A?(\d{2,8})$/i);
    if (m) { const st = +m[2]; if (st > 0) return { type: m[1].toUpperCase(), strike: st }; }
    let t = s; if (asset && t.toUpperCase().indexOf(asset.toUpperCase()) === 0) t = t.slice(asset.length);
    m = t.match(/^(\d{2,7})([A-X])/i);
    if (m) { const st = +m[1]; if (st > 0) { const ml = m[2].toUpperCase(); return { type: (ml >= 'A' && ml <= 'L') ? 'C' : 'P', strike: st }; } }
    return null;
  }
  // Класс серии по дате экспирации: квартал (3/6/9/12, 3-я неделя), месяц (3-я
  // неделя прочих месяцев), иначе неделя.
  function classifyExpiry(d) {
    const p = String(d || '').split('-'); if (p.length < 3) return 'week';
    const M = +p[1], D = +p[2], thirdWeek = D >= 15 && D <= 21;
    if (thirdWeek && (M === 3 || M === 6 || M === 9 || M === 12)) return 'quarter';
    if (thirdWeek) return 'month';
    return 'week';
  }
  // Опционы FORTS по базовому активу (asset='Si'/'RI'/'BR'/'GD'…): страйки, тип,
  // дата экспирации, открытый интерес. ОИ берём из marketdata.OPENPOSITION, при
  // отсутствии — из securities.PREVOPENPOSITION (вчерашний). Мёржим по SECID
  // (устойчиво к рассинхрону страниц securities/marketdata).
  async function fetchOptions(asset) {
    const url = 'https://iss.moex.com/iss/engines/futures/markets/options/securities.json'
      + '?iss.meta=off&securities.columns=SECID,SHORTNAME,LASTDELDATE,PREVOPENPOSITION&marketdata.columns=SECID,OPENPOSITION';
    const pages = await getAllPages(url, 'securities', 80);
    const meta = {}, oi = {};
    for (const j of pages) {
      for (const o of rowsToObjects(j.securities)) if (o.SECID) meta[o.SECID] = o;
      for (const o of rowsToObjects(j.marketdata)) if (o.SECID && o.OPENPOSITION != null) oi[o.SECID] = +o.OPENPOSITION || 0;
    }
    const out = [], A = String(asset || '').toUpperCase();
    for (const secid in meta) {
      if (A && secid.slice(0, A.length).toUpperCase() !== A) continue;
      const pr = parseOptSecid(secid, asset); if (!pr) continue;
      const m = meta[secid];
      let o = oi[secid]; if (o == null) o = +m.PREVOPENPOSITION || 0;
      out.push({ secid, strike: pr.strike, type: pr.type, expiry: m.LASTDELDATE || '', klass: classifyExpiry(m.LASTDELDATE), oi: o });
    }
    return out;
  }

  window.LunISS = { fetchCandles, fetchCandlesFrom, fetchSecuritiesList, fetchContinuousFutures, stitchContracts, aggregate, fetchFront, fetchFUTOI, fetchOIHistory, fetchOptions, parseOptSecid, classifyExpiry };
})();
