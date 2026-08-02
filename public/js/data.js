/* =============================================================================
 *  data.js — источник свечей для KLineChart (DataLoader)
 * =============================================================================
 *  Порядок: сначала пробуем живой MOEX ISS через локальный прокси (/api/candles);
 *  если недоступен (нет сети/биржа закрыта/запуск в облаке) — генерируем
 *  демо-свечи, чтобы интерфейс и лунная лента всё равно отрисовались.
 * ===========================================================================*/
(function () {
  const PERIOD_MS = { minute: 60000, hour: 3600000, day: 86400000 };

  function periodMillis(period) {
    return (PERIOD_MS[period.type] || 3600000) * period.span;
  }

  // Прокси может быть развёрнут двумя способами: Node-сервер (/api/...) или
  // PHP на шаред-хостинге (api.php?fn=...). Пробуем оба, берём первый рабочий.
  async function apiFetch(endpoint, qs) {
    const candidates = [`/api/${endpoint}?${qs}`, `api.php?fn=${endpoint}&${qs}`];
    let lastErr;
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          // вытащим сообщение об ошибке из тела ответа прокси (JSON {error} или текст)
          let detail = '';
          try { const j = await res.clone().json(); detail = j && j.error ? j.error : ''; }
          catch (e) { try { detail = (await res.text()).slice(0, 120); } catch (_) {} }
          lastErr = new Error(`${endpoint} HTTP ${res.status}${detail ? ': ' + detail : ''}`);
          continue;
        }
        return await res.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('нет прокси (api.php недоступен)');
  }

  async function fetchISS(symbol, period, tf) {
    const till = new Date();
    const back = tf.type === 'day' ? 500 : (tf.type === 'hour' ? 45 : 7); // дней истории
    const from = new Date(till.getTime() - back * 86400000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const qs = `secid=${encodeURIComponent(symbol.ticker)}&iss=${tf.iss}&from=${fmt(from)}&till=${fmt(till)}`;
    const bars = await apiFetch('candles', qs);
    if (!Array.isArray(bars) || bars.length === 0) throw new Error('ISS empty');
    return bars;
  }

  // Демо-свечи: случайное блуждание, достаточно длинное, чтобы Луна прошла
  // несколько знаков (видно работу ленты) на любом таймфрейме.
  function demoBars(symbol, period) {
    const step = periodMillis(period);
    const count = 600;
    const now = Date.now();
    const start = Math.floor(now / step) * step - count * step;
    const base = symbol.pricePrecision >= 3 ? 12.5 : 90000; // CNY ~12.5, Si ~90000
    const vol = base * 0.004;
    let price = base;
    const bars = [];
    for (let i = 0; i < count; i++) {
      const ts = start + i * step;
      const drift = Math.sin(i / 40) * vol * 0.6;
      const open = price;
      const close = open + drift + (Math.random() - 0.5) * vol;
      const high = Math.max(open, close) + Math.random() * vol * 0.5;
      const low = Math.min(open, close) - Math.random() * vol * 0.5;
      const volume = Math.round(1000 + Math.random() * 5000);
      bars.push({ timestamp: ts, open, high, low, close, volume });
      price = close;
    }
    return bars;
  }

  // Ближний контракт: спрашиваем сервер (/api/front), иначе — тикер из конфига.
  const frontCache = new Map();
  async function resolveTicker(instrument) {
    if (!instrument.assetCode) return instrument.ticker;
    if (frontCache.has(instrument.assetCode)) return frontCache.get(instrument.assetCode);
    let ticker = instrument.ticker;
    try {
      const j = await apiFetch('front', 'asset=' + encodeURIComponent(instrument.assetCode));
      if (j && j.ticker) ticker = j.ticker;
    } catch (e) { /* нет прокси/сети — остаёмся на запасном тикере */ }
    frontCache.set(instrument.assetCode, ticker);
    return ticker;
  }

  function makeDataLoader() {
    return {
      getBars: async ({ type, symbol, period, callback }) => {
        const tf = window.LUN.TIMEFRAMES.find(
          (t) => t.span === period.span && t.type === period.type);
        if (type !== 'init') { callback([], false); return; }   // прототип: без подгрузки истории
        try {
          const bars = await fetchISS(symbol, period, tf || { iss: 60 });
          window.LUN_DATA_SOURCE = 'MOEX ISS';
          callback(bars, false);
        } catch (e) {
          console.warn('[data] ISS недоступен, демо-режим:', e.message);
          window.LUN_DATA_ERROR = e.message;
          window.LUN_DATA_SOURCE = 'ДЕМО — ' + e.message;
          callback(demoBars(symbol, period), false);
        }
        window.dispatchEvent(new CustomEvent('lun:datasource'));
      },
    };
  }

  window.LunData = { makeDataLoader, resolveTicker };
})();
