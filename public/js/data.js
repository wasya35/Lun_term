/* =============================================================================
 *  data.js — источник свечей для KLineChart (DataLoader)
 * =============================================================================
 *  Порядок попыток:
 *    1) ПРЯМОЙ MOEX ISS из браузера (LunISS) — не нужен бэкенд, работает на
 *       статичном хостинге, если у ISS проходит CORS;
 *    2) ПРОКСИ (/api/... для Node или api.php?fn=... для PHP) — на случай, если
 *       прямой доступ закрыт CORS, но есть серверный прокси;
 *    3) ДЕМО-свечи — чтобы интерфейс и лунная лента всё равно работали.
 *  Причина отката (если дошло до демо) пишется в window.LUN_DATA_ERROR.
 * ===========================================================================*/
(function () {
  const PERIOD_MS = { minute: 60000, hour: 3600000, day: 86400000 };
  const periodMillis = (p) => (PERIOD_MS[p.type] || 3600000) * p.span;
  const fmtDate = (d) => d.toISOString().slice(0, 10);

  function rangeFor(tf) {
    const till = new Date();
    const backDays = tf.type === 'day' ? 500 : (tf.type === 'hour' ? 45 : 3);
    return { from: fmtDate(new Date(till.getTime() - backDays * 86400000)), till: fmtDate(till) };
  }

  /* --- прокси (Node /api/... или PHP api.php?fn=...) --- */
  async function apiFetch(endpoint, qs) {
    const candidates = [`/api/${endpoint}?${qs}`, `api.php?fn=${endpoint}&${qs}`];
    let lastErr;
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          let detail = '';
          try { const j = await res.clone().json(); detail = j && j.error ? j.error : ''; }
          catch (e) { try { detail = (await res.text()).slice(0, 100); } catch (_) {} }
          lastErr = new Error(`HTTP ${res.status}${detail ? ': ' + detail : ''}`); continue;
        }
        return await res.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('нет прокси');
  }

  /* --- ближний контракт: прямой ISS -> прокси -> запасной тикер --- */
  const frontCache = new Map();
  async function resolveTicker(instrument) {
    // не-MOEX провайдеры сами резолвят символ (крипта/США)
    const provId = instrument.provider || 'moex';
    if (provId !== 'moex') {
      const prov = window.LunProviders && window.LunProviders.get(provId);
      if (prov && prov.resolveSymbol) { try { return await prov.resolveSymbol(instrument); } catch (e) { /* фолбэк ниже */ } }
      return instrument.symbol || instrument.ticker;
    }
    if (!instrument.assetCode) return instrument.ticker;
    if (frontCache.has(instrument.assetCode)) return frontCache.get(instrument.assetCode);
    const today = new Date().toISOString().slice(0, 10);
    let ticker = instrument.ticker;
    try {
      const list = await window.LunISS.fetchFront(instrument.assetCode, today);
      if (list && list.length) ticker = list[0].ticker;
    } catch (e1) {
      try {
        const j = await apiFetch('front', 'asset=' + encodeURIComponent(instrument.assetCode));
        if (j && j.ticker) ticker = j.ticker;
      } catch (e2) { /* остаёмся на запасном тикере из конфига */ }
    }
    frontCache.set(instrument.assetCode, ticker);
    return ticker;
  }

  /* --- свечи: провайдер (крипта/США) ИЛИ MOEX (прямой ISS -> прокси) -> демо --- */
  async function loadCandles(symbol, tf) {
    const provId = symbol.provider || 'moex';
    if (provId !== 'moex') {
      const prov = window.LunProviders && window.LunProviders.get(provId);
      if (prov) {
        try {
          const bars = await prov.fetchCandles(symbol, tf);
          if (bars && bars.length) { window.LUN_DATA_SOURCE = prov.title; window.LUN_DATA_ERROR = ''; return bars; }
          throw new Error('пусто');
        } catch (e) { window.LUN_DATA_ERROR = provId + ': ' + e.message; window.LUN_DATA_SOURCE = 'ДЕМО — ' + e.message; return null; }
      }
      window.LUN_DATA_ERROR = 'провайдер ' + provId + ' не подключён'; window.LUN_DATA_SOURCE = 'ДЕМО'; return null;
    }
    const { from, till } = rangeFor(tf);
    const agg = (tf.iss === 5 || tf.iss === 15);
    const eng = symbol.engine || 'futures', mkt = symbol.market || 'forts';
    const fetchC = (secid, iv) => window.LunISS.fetchCandlesFrom(eng, mkt, secid, iv, from, till);

    // 1) прямой ISS из браузера
    try {
      let bars = agg
        ? window.LunISS.aggregate(await fetchC(symbol.ticker, 1), tf.iss)
        : await fetchC(symbol.ticker, tf.iss);
      if (bars && bars.length) {
        const gw = window.LUN_ISS_GATEWAY;
        window.LUN_DATA_SOURCE = 'MOEX ISS' + (gw && gw !== 'прямой' ? ` (шлюз: ${gw})` : ' (прямо)');
        window.LUN_DATA_ERROR = ''; return bars;
      }
      throw new Error('пусто');
    } catch (eDirect) {
      // 2) прокси
      try {
        const qs = `secid=${encodeURIComponent(symbol.ticker)}&iss=${tf.iss}&from=${from}&till=${till}`;
        const bars = await apiFetch('candles', qs);
        if (bars && bars.length) { window.LUN_DATA_SOURCE = 'MOEX ISS (через прокси)'; window.LUN_DATA_ERROR = ''; return bars; }
        throw new Error('пусто');
      } catch (eProxy) {
        window.LUN_DATA_ERROR = `прямо: ${eDirect.message} · прокси: ${eProxy.message}`;
        window.LUN_DATA_SOURCE = 'ДЕМО — ' + eDirect.message;
        return null;
      }
    }
  }

  // Демо-свечи: случайное блуждание достаточной длины, чтобы Луна прошла
  // несколько знаков (видно работу ленты) на любом таймфрейме.
  function demoBars(symbol, period) {
    const step = periodMillis(period), count = 600;
    const start = Math.floor(Date.now() / step) * step - count * step;
    const base = symbol.pricePrecision >= 3 ? 12.5 : 90000;
    const vol = base * 0.004; let price = base; const bars = [];
    for (let i = 0; i < count; i++) {
      const ts = start + i * step;
      const open = price;
      const close = open + Math.sin(i / 40) * vol * 0.6 + (Math.random() - 0.5) * vol;
      bars.push({
        timestamp: ts, open,
        high: Math.max(open, close) + Math.random() * vol * 0.5,
        low: Math.min(open, close) - Math.random() * vol * 0.5,
        close, volume: Math.round(1000 + Math.random() * 5000),
      });
      price = close;
    }
    return bars;
  }

  function makeDataLoader() {
    return {
      getBars: async ({ type, symbol, period, callback }) => {
        if (type !== 'init') { callback([], false); return; }   // прототип: без подгрузки истории
        const tf = window.LUN.TIMEFRAMES.find((t) => t.span === period.span && t.type === period.type) || { iss: 60 };
        const bars = await loadCandles(symbol, tf);
        callback(bars || demoBars(symbol, period), false);
        if (bars) console.info('[data]', window.LUN_DATA_SOURCE);
        else console.warn('[data] демо-режим:', window.LUN_DATA_ERROR);
        window.dispatchEvent(new CustomEvent('lun:datasource'));
      },
    };
  }

  // Свечи произвольного инструмента (для наложения 2-го графика). Не трогает
  // строку статуса основного источника.
  async function fetchFor(instrument, tf) {
    const src = window.LUN_DATA_SOURCE, err = window.LUN_DATA_ERROR;
    const ticker = await resolveTicker(instrument);
    const symbol = Object.assign({}, instrument, { ticker, symbol: instrument.symbol || ticker, provider: instrument.provider || 'moex', engine: instrument.engine, market: instrument.market });
    const bars = await loadCandles(symbol, tf);
    window.LUN_DATA_SOURCE = src; window.LUN_DATA_ERROR = err;
    return bars;
  }

  window.LunData = { makeDataLoader, resolveTicker, fetchFor };
})();
