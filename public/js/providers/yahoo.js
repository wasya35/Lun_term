/* =============================================================================
 *  providers/yahoo.js — акции/ETF/индексы США через Yahoo Finance (query1)
 * =============================================================================
 *  Бесплатно, без ключа, глубокая история. CORS НЕТ → идёт через шлюзы
 *  LUN.ISS_GATEWAYS (LunFetchJSON пробует прямой, потом allorigins/corsproxy).
 *  Неофициальный API, может меняться. Данные с задержкой (~15 мин), не realtime.
 *  Внутридневная история у Yahoo ограничена (5m/15m — недели, 60m — до ~2 лет).
 *  Ответ: chart.result[0].timestamp[] (СЕКУНДЫ) + indicators.quote[0].{o,h,l,c,v};
 *  внутри бывают null — фильтруем.
 * ===========================================================================*/
(function () {
  const P = window.LunProviders; if (!P) return;
  const J = window.LunFetchJSON;

  const map = { M5: { i: '5m', r: '1mo' }, M15: { i: '15m', r: '1mo' }, H1: { i: '60m', r: '2y' }, D1: { i: '1d', r: '10y' }, W1: { i: '1wk', r: '10y' }, MN1: { i: '1mo', r: 'max' } };
  P.register({
    id: 'yahoo', title: 'Yahoo', markets: ['stocks', 'etf'], needsKey: false, hasStream: false, tfMap: map,
    resolveSymbol: async (ins) => ins.symbol || ins.ticker,
    fetchCandles: async (symbol, tf) => {
      const m = map[tf.id] || map.D1, sym = symbol.symbol || symbol.ticker;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${m.i}&range=${m.r}`;
      const j = await J(url);
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res || !res.timestamp) return [];
      const ts = res.timestamp;
      const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
      const bars = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i], v = q.volume && q.volume[i];
        if (o == null || h == null || l == null || c == null) continue;
        bars.push({ timestamp: ts[i] * 1000, open: o, high: h, low: l, close: c, volume: v || 0 });
      }
      bars.sort((a, b) => a.timestamp - b.timestamp);
      return bars;
    },
  });
})();
