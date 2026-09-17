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
        const res = await fetch(gw.wrap(issUrl), { credentials: 'same-origin' });
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
        const j = await res.json();
        workingGw = gw; window.LUN_ISS_GATEWAY = gw.name;
        // источник: наш серверный прокси отдаёт заголовок X-Data-Source
        // (online = apim/AlgoPack реалтайм, delayed = iss отложенный). Прямой/сторонний
        // шлюз ходит на iss.moex.com напрямую → всегда отложенный.
        const src = res.headers.get('X-Data-Source');
        if (src) window.LUN_ISS_ONLINE = (src === 'online');
        else if (gw.name !== 'сервер') window.LUN_ISS_ONLINE = false;
        return j;
      } catch (e) { lastErr = e; }
    }
    workingGw = null;
    throw lastErr || new Error('нет доступного шлюза к ISS');
  }

  /* --- ПАРАЛЛЕЛЬНАЯ пагинация ?start=N ---
   * ISS отдаёт страницы фиксированного размера (свечи — 500 строк) и у candles НЕТ
   * таблицы-курсора с общим числом строк. Раньше страницы шли строго по одной: M5 за
   * 20 дней = 36 последовательных походов в прокси (~1.5 с каждый) → до минуты.
   * Теперь: первая страница задаёт размер, дальше просим пачками по PAGE_PAR штук
   * одновременно; короткая или пустая страница в пачке = конец ряда. Если таблица
   * даёт <table>.cursor (TOTAL/PAGESIZE — history, tradestats), смещения известны
   * заранее, и пустую «хвостовую» страницу не запрашиваем вовсе.
   * fetchPage(start) -> Promise<json>. Порядок страниц = порядок смещений.
   * pageSizeHint — известный размер полной страницы (свечи ISS: 500): первая страница
   * короче него = ряд закончился, вторую не просим. */
  const PAGE_PAR = 5;
  const CANDLE_PAGE = 500;
  async function pagesParallel(fetchPage, table, maxPages, pageSizeHint) {
    maxPages = maxPages || 40;
    const rowsOf = (j) => (j && j[table] && j[table].data) ? j[table].data.length : 0;
    const first = await fetchPage(0);
    const pages = [first];
    const n0 = rowsOf(first);
    if (n0 === 0 || maxPages <= 1) return pages;
    if (pageSizeHint && n0 < pageSizeHint) return pages;
    let total = null, pageSize = pageSizeHint || n0;
    const cur = first[table + '.cursor'];
    if (cur && cur.columns && cur.data && cur.data[0]) {
      const ci = {}; cur.columns.forEach((c, i) => (ci[c] = i));
      const T = +cur.data[0][ci.TOTAL], P = +cur.data[0][ci.PAGESIZE];
      if (T > 0 && P > 0) { total = T; pageSize = P; }
    }
    if (total !== null && n0 >= total) return pages;
    let start = n0, count = 1, done = false;
    while (!done && count < maxPages) {
      const starts = [];
      for (let k = 0; k < PAGE_PAR && count + starts.length < maxPages; k++) {
        const s = start + k * pageSize;
        if (total !== null && s >= total) break;
        starts.push(s);
      }
      if (!starts.length) break;
      const batch = await Promise.all(starts.map((s) => fetchPage(s)));
      for (const j of batch) {
        count++;
        const n = rowsOf(j);
        if (n > 0) pages.push(j);
        if (n < pageSize) { done = true; break; }
      }
      start += starts.length * pageSize;
    }
    return pages;
  }

  async function getAllPages(baseUrl, table, maxPages = 40, pageSizeHint) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    return pagesParallel((start) => fetchJSON(`${baseUrl}${sep}start=${start}`), table, maxPages, pageSizeHint);
  }

  async function fetchCandles(secid, interval, from, till) {
    const url = `${BASE}/securities/${encodeURIComponent(secid)}/candles.json`
      + `?interval=${interval}&from=${from}&till=${till}&iss.reverse=false`;
    return parseCandles(await getAllPages(url, 'candles', 40, CANDLE_PAGE));
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
    return parseCandles(await getAllPages(url, 'candles', maxPages || 40, CANDLE_PAGE));
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

  // Собрать строки clgroup (FIZ/YUR) из ISS-страниц futoi (имя таблицы бывает разным).
  function collectFutoiRows(pages) {
    const out = [];
    for (const j of pages) for (const key of Object.keys(j)) {
      const t = j[key];
      if (t && t.columns && t.data && t.columns.some((c) => String(c).toLowerCase() === 'clgroup')) {
        for (const o of rowsToObjects(t)) out.push(o);
      }
    }
    return out;
  }

  // Онлайн-FUTOI через НАШ серверный прокси api.php?fn=algopack (ключ AlgoPack
  // лежит на сервере, в браузер не попадает). Требует залогиненного пользователя.
  // Постранично тянем &start=N (same-origin, куки сессии). Бросает при 401/500/сети.
  async function fetchAlgopackJSON(params) {
    const res = await fetch('api.php?fn=algopack&' + params, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('algopack HTTP ' + res.status);
    const j = await res.json();
    if (j && j.error) throw new Error(j.error);
    return j;
  }
  // Страницы датасета AlgoPack (tradestats и пр.) — параллельно по data.cursor.
  async function fetchAlgopackPages(params, table, maxPages = 20) {
    return pagesParallel((start) => fetchAlgopackJSON(params + '&start=' + start), table, maxPages);
  }
  window.LUN_FUTOI_SRC = '';                       // 'online' | 'delayed' — для статуса

  /* --- FUTOI: открытый интерес физ/юр (аналитический продукт MOEX) ---
   * ФАКТЫ (проверены по ответам 2026-09-10): и apim (по ключу), и публичный ISS
   * отдают НЕ БОЛЬШЕ 1000 строк за запрос (новые сверху, ≈2.7 дня 5-мин снимков
   * физ+юр), параметр start= ИГНОРИРУЮТ (30 «страниц» приходили одинаковыми), date=
   * не принимают, а окно from=till возвращает день целиком (~404 строки). Публичный
   * фид бесплатно закрыт за последние 14 дней. Поэтому диапазон режем на ОКНА по
   * датам (2 дня интрадей; 10 дней в дневном режиме — их сервер сам сжимает до
   * последнего снимка дня) и тянем окна параллельно, строки дедупим.
   * code — код актива (Si, GD, BR ...). opts.daily — только последний снимок дня по
   * группе (дневной ОИ физ/юр на долгую историю).
   * Источник: онлайн через api.php?fn=algopack (ключ на сервере), при 401/нет ключа
   * — публичный ISS кусками по 2 дня. */
  const DAY_MS = 86400000;
  const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const parseYmd = (s) => Date.parse(String(s).slice(0, 10) + 'T00:00:00Z');
  function dateWindows(from, till, days) {
    const out = []; let a = parseYmd(from); const end = parseYmd(till);
    if (!Number.isFinite(a) || !Number.isFinite(end)) return out;
    while (a <= end) { const b = Math.min(end, a + (days - 1) * DAY_MS); out.push([ymd(a), ymd(b)]); a = b + DAY_MS; }
    return out;
  }
  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length); let i = 0;
    const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
    return out;
  }
  const fKey = (r, keys) => keys.map((k) => r[k] != null ? r[k] : (r[k.toUpperCase()] != null ? r[k.toUpperCase()] : '')).join('|');
  // последний снимок каждого дня по (дата, группа, тикер)
  function futoiDaily(rows) {
    const best = new Map();
    for (const r of rows) { const k = fKey(r, ['tradedate', 'clgroup', 'ticker']); const t = String(fKey(r, ['tradetime'])); const cur = best.get(k); if (!cur || t > cur.t) best.set(k, { t, r }); }
    return [...best.values()].map((x) => x.r);
  }
  function futoiDedupe(rows) {
    const seen = new Set(); const out = [];
    for (const r of rows) { const k = fKey(r, ['tradedate', 'tradetime', 'clgroup', 'ticker']); if (seen.has(k)) continue; seen.add(k); out.push(r); }
    return out;
  }
  async function fetchFUTOI(code, from, till, opts) {
    opts = opts || {}; const daily = !!opts.daily;
    const wantOnline = !(window.LUN && window.LUN.ALGOPACK && window.LUN.ALGOPACK.online === false);
    let online = false, delayed = false, onlineDead = !wantOnline;   // 401/нет ключа — дальше сразу резерв
    const pub = async (a, b) => {
      const url = `https://iss.moex.com/iss/analyticalproducts/futoi/securities/${encodeURIComponent(code)}.json?iss.meta=off&from=${a}&till=${b}`;
      return collectFutoiRows([await fetchJSON(url)]);
    };
    const one = async ([a, b]) => {
      if (!onlineDead) {
        try {
          const j = await fetchAlgopackJSON('ds=futoi&secid=' + encodeURIComponent(code) + '&from=' + a + '&till=' + b + (daily ? '&daily=1' : ''));
          const rows = collectFutoiRows([j]);
          if (rows.length) { online = true; return rows; }
        } catch (e) { if (/HTTP (401|500)|login required|not configured/.test(String(e && e.message))) onlineDead = true; }
      }
      let rows = [];
      for (const [c, d] of dateWindows(a, b, 2)) { try { rows = rows.concat(await pub(c, d)); } catch (e) { /* окно недоступно — пропускаем */ } }
      if (rows.length) delayed = true;
      return daily ? futoiDaily(rows) : rows;
    };
    const parts = await mapLimit(dateWindows(from, till, daily ? 10 : 2), 4, one);
    window.LUN_FUTOI_SRC = online ? 'online' : (delayed ? 'delayed' : '');
    const all = futoiDedupe([].concat.apply([], parts));
    return daily ? futoiDaily(all) : all;
  }

  // TradeStats (AlgoPack SuperCandles) — ГОТОВЫЕ данные ПО КАЖДОМУ 5-мин бару
  // конкретного контракта (secid = SiU6, а не актив): цена, объём, и главное —
  // vol_b/vol_s (агрессивные покупки/продажи = покупатели/продавцы), а для
  // фьючерсов (fo) ещё oi_open/high/low/close (открытый интерес НА БАР). Ничего не
  // пересчитываем — берём как есть. Только онлайн (по подписке AlgoPack).
  // mkt: 'fo' фьючерсы, 'eq' акции, 'fx' валюта. Возвращает массив строк-объектов.
  async function fetchTradeStats(secid, from, till, mkt) {
    mkt = mkt || 'fo';
    const params = 'ds=tradestats&mkt=' + mkt + '&secid=' + encodeURIComponent(secid)
      + (from ? '&from=' + from : '') + (till ? '&till=' + till : '');
    const pages = await fetchAlgopackPages(params, 'data', 40);
    const out = [];
    for (const j of pages) {
      const t = j.data || j.tradestats || null;
      if (t && t.columns && t.data) for (const o of rowsToObjects(t)) out.push(o);
    }
    return out;
  }

  // Общий загрузчик AlgoPack-датасета по бару (hi2/obstats/alerts) — как tradestats.
  async function fetchAlgopackDS(ds, secid, from, till, mkt) {
    mkt = mkt || 'fo';
    const params = 'ds=' + ds + '&mkt=' + mkt + '&secid=' + encodeURIComponent(secid)
      + (from ? '&from=' + from : '') + (till ? '&till=' + till : '');
    const pages = await fetchAlgopackPages(params, 'data', 40);
    const out = [];
    for (const j of pages) { const t = j.data || j[ds] || null; if (t && t.columns && t.data) for (const o of rowsToObjects(t)) out.push(o); }
    return out;
  }
  // HI2 — индекс концентрации участников (по бару, длинный формат metric/value).
  const fetchHI2 = (secid, from, till, mkt) => fetchAlgopackDS('hi2', secid, from, till, mkt);
  // OBStats — статистика стакана по бару (объёмы по уровням, дисбаланс, спреды).
  const fetchOBStats = (secid, from, till, mkt) => fetchAlgopackDS('obstats', secid, from, till, mkt);
  // MegaAlerts — торговые аномалии (крупняк) с 90-дневной статистикой в reference.
  const fetchAlerts = (secid, from, till, mkt) => fetchAlgopackDS('alerts', secid, from, till, mkt);

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
  // Опционы FORTS по базовому активу (asset='Si'/'RI'/'BR'/'GD'…). У MOEX в
  // securities есть готовые колонки STRIKE, OPTIONTYPE (C/P), LASTDELDATE,
  // ASSETCODE, UNDERLYINGASSET, PREVOPENPOSITION — берём прямо их (без разбора
  // SECID). ОИ — PREVOPENPOSITION (стенки меняются медленно). Тянем только
  // securities и только нужные колонки (меньше объём).
  async function fetchOptions(asset) {
    const url = 'https://iss.moex.com/iss/engines/futures/markets/options/securities.json'
      + '?iss.meta=off&iss.only=securities'
      + '&securities.columns=SECID,ASSETCODE,UNDERLYINGASSET,OPTIONTYPE,STRIKE,LASTDELDATE,PREVOPENPOSITION';
    const pages = await getAllPages(url, 'securities', 160);
    const A = String(asset || '').toUpperCase();
    const out = [];
    for (const j of pages) for (const o of rowsToObjects(j.securities)) {
      const ac = String(o.ASSETCODE || '').toUpperCase();
      const ua = String(o.UNDERLYINGASSET || '').toUpperCase();
      if (A && ac !== A && ua.slice(0, A.length) !== A) continue;
      const type = String(o.OPTIONTYPE || '').toUpperCase().charAt(0);
      const strike = +o.STRIKE;
      if (!(strike > 0) || (type !== 'C' && type !== 'P')) continue;
      out.push({ secid: o.SECID, strike, type, expiry: o.LASTDELDATE || '', klass: classifyExpiry(o.LASTDELDATE), oi: +o.PREVOPENPOSITION || 0 });
    }
    return out;
  }

  window.LunISS = { fetchCandles, fetchCandlesFrom, fetchSecuritiesList, fetchContinuousFutures, stitchContracts, aggregate, fetchFront, fetchFUTOI, fetchTradeStats, fetchHI2, fetchOBStats, fetchAlerts, fetchOIHistory, fetchOptions, parseOptSecid, classifyExpiry };
})();
