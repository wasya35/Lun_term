/* =============================================================================
 *  providers/base.js — реестр провайдеров данных (window.LunProviders)
 * =============================================================================
 *  Контракт провайдера (см. ТЗ мультибиржа):
 *    id, title, markets[], needsKey, hasStream, tfMap
 *    resolveSymbol(instrument) -> Promise<string>   // нативный символ биржи
 *    fetchCandles(symbol, tf)  -> Promise<Bar[]>     // ВСЕГДА UTC epoch ms,
 *                                                    // по возрастанию, без дублей
 *  Провайдер не знает про klinecharts/DOM. Только сеть и нормализация.
 *  Новая биржа = один файл + один register(). Правки в app.js/data.js не нужны.
 * ===========================================================================*/
(function () {
  const reg = {};
  window.LunProviders = {
    register(p) { if (p && p.id) reg[p.id] = p; },
    get(id) { return reg[id]; },
    has(id) { return !!reg[id]; },
    list() { return Object.keys(reg).map((k) => reg[k]); },
  };

  // CORS-терпимый JSON-GET: прямой запрос, затем публичные шлюзы LUN.ISS_GATEWAYS.
  // Крипто-биржи отдают CORS напрямую; шлюзы — на случай блокировки по IP или
  // источников без CORS (Yahoo). Первый рабочий не запоминаем (разные хосты).
  window.LunFetchJSON = async function (url, opts) {
    const gws = (window.LUN && window.LUN.ISS_GATEWAYS) || [{ wrap: (u) => u }];
    let lastErr;
    for (const g of gws) {
      try {
        const res = await fetch(g.wrap(url), opts);
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
        return await res.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('нет доступа к ' + url);
  };

  /* Глубина истории графика. window.LUN_HISTORY:
   *   null            — авто (дефолтная глубина по ТФ)
   *   { days: N }      — последние N дней
   *   { from, till }   — явный диапазон 'YYYY-MM-DD'
   * bounds(defDays) — границы в ms; провайдеры и data.js читают отсюда. */
  window.LUN_HISTORY = null;
  window.LunHist = {
    bounds(defDays) {
      const H = window.LUN_HISTORY, till = Date.now();
      if (H && H.from && H.till) {
        const f = Date.parse(H.from + 'T00:00:00Z'), t = Date.parse(H.till + 'T23:59:59Z');
        if (f && t && t > f) return { fromMs: f, tillMs: t };
      }
      const days = (H && H.days) ? H.days : defDays;
      return { fromMs: till - days * 86400000, tillMs: till };
    },
    active() { return !!window.LUN_HISTORY; },
  };

  // нормализация: сортировка по времени + удаление дублей по timestamp
  window.LunNormBars = function (bars) {
    bars.sort((a, b) => a.timestamp - b.timestamp);
    const out = []; let last = -1;
    for (const b of bars) {
      if (!Number.isFinite(b.timestamp) || !Number.isFinite(b.close)) continue;
      if (b.timestamp !== last) { out.push(b); last = b.timestamp; }
    }
    return out;
  };
})();
