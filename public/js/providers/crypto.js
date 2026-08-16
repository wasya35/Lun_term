/* =============================================================================
 *  providers/crypto.js — крипто-биржи Bybit и Binance (спот)
 * =============================================================================
 *  Публичный REST, без ключей, CORS открыт → работают прямо из браузера.
 *  Bybit: result.list в ОБРАТНОМ порядке (новые первыми) — разворачиваем.
 *  Binance: массив массивов [openTime,o,h,l,c,v,...]. Числа приходят строками.
 *  tfMap: наши id ТФ -> нативный интервал биржи. Квартал/неделя/месяц —
 *  крипта нативно даёт 1w/1M (квартал пока не маплю; добавим агрегацией).
 * ===========================================================================*/
(function () {
  const P = window.LunProviders; if (!P) return;
  const J = window.LunFetchJSON, N = window.LunNormBars;

  const bybitTf = { M5: '5', M15: '15', H1: '60', D1: 'D', W1: 'W', MN1: 'M' };
  P.register({
    id: 'bybit', title: 'Bybit', markets: ['spot'], needsKey: false, hasStream: true, tfMap: bybitTf,
    resolveSymbol: async (ins) => ins.symbol || ins.ticker,
    fetchCandles: async (symbol, tf) => {
      const iv = bybitTf[tf.id] || '60';
      const sym = symbol.symbol || symbol.ticker;
      const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${encodeURIComponent(sym)}&interval=${iv}&limit=1000`;
      const j = await J(url);
      const list = (j && j.result && j.result.list) || [];
      // [start, open, high, low, close, volume, turnover] — новые первыми
      const bars = list.map((r) => ({ timestamp: +r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
      return N(bars);
    },
  });

  const binTf = { M5: '5m', M15: '15m', H1: '1h', D1: '1d', W1: '1w', MN1: '1M' };
  P.register({
    id: 'binance', title: 'Binance', markets: ['spot'], needsKey: false, hasStream: true, tfMap: binTf,
    resolveSymbol: async (ins) => ins.symbol || ins.ticker,
    fetchCandles: async (symbol, tf) => {
      const iv = binTf[tf.id] || '1h';
      const sym = symbol.symbol || symbol.ticker;
      const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(sym)}&interval=${iv}&limit=1000`;
      const j = await J(url);   // [[openTime,o,h,l,c,v,...], ...]
      const bars = (j || []).map((r) => ({ timestamp: +r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] }));
      return N(bars);
    },
  });
})();
