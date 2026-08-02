/* =============================================================================
 *  indicators.js — кастомные индикаторы KLineChart
 * =============================================================================
 *   MoonSign  — лента знаков зодиака (цвет по знаку + глиф + пройденный градус)
 *   MoonCycle — полоса торговых зон лунного цикла (лонг/шорт/рэндж)
 *   VWAP_BANDS — сессионный VWAP с полосами ±1σ / ±2σ
 *
 *  Ленты рисуются целиком вручную (registerIndicator + draw), поэтому идеально
 *  синхронизированы с осью времени графика при зуме/прокрутке.
 * ===========================================================================*/
(function () {
  const kc = window.klinecharts;
  const MSK_OFFSET = 3 * 3600 * 1000;   // MOEX торгует по московскому времени

  /* ---- утилита: пробежать по видимым свечам и вызвать fn(i, x, halfBar) ---- */
  function forEachVisibleBar(chart, xAxis, fn) {
    const range = chart.getVisibleRange();
    const bs = chart.getBarSpace();
    const list = chart.getDataList();
    const from = Math.max(0, range.from);
    const to = Math.min(list.length, range.to);
    for (let i = from; i < to; i++) {
      fn(i, xAxis.convertToPixel(i), bs.halfBar, list[i]);
    }
  }

  /* ---- утилита: разбить видимый диапазон на «прогоны» с одинаковым ключом --
   * keyFn(barData) -> сравнимый ключ; cb(startI, endI, midX, leftX, rightX). */
  function runsOverVisible(chart, xAxis, keyFn, cb) {
    const range = chart.getVisibleRange();
    const bs = chart.getBarSpace();
    const list = chart.getDataList();
    const from = Math.max(0, range.from);
    const to = Math.min(list.length, range.to);
    if (to <= from) return;
    let runStart = from, runKey = keyFn(list[from]);
    const flush = (endExcl) => {
      const leftX = xAxis.convertToPixel(runStart) - bs.halfBar;
      const rightX = xAxis.convertToPixel(endExcl - 1) + bs.halfBar;
      cb(runStart, endExcl - 1, (leftX + rightX) / 2, leftX, rightX);
    };
    for (let i = from + 1; i < to; i++) {
      const k = keyFn(list[i]);
      if (k !== runKey) { flush(i); runStart = i; runKey = k; }
    }
    flush(to);
  }

  /* ======================= 1. Лента знаков зодиака ======================= */
  kc.registerIndicator({
    name: 'MoonSign',
    shortName: 'Луна ☾',
    series: 'normal',
    figures: [],
    // calc держит индикатор «живым»; сама отрисовка — во draw
    calc: (dataList) => dataList.map((d) => window.LunAstro.moonInfo(d.timestamp)),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const SIGNS = window.LUN.SIGNS;
      const H = bounding.height;

      // 1) фон-полосы: цвет каждой свечи по знаку Луны
      forEachVisibleBar(chart, xAxis, (i, x, half, bar) => {
        const info = window.LunAstro.moonInfo(bar.timestamp);
        ctx.fillStyle = SIGNS[info.signIndex].color;
        ctx.fillRect(x - half, 0, half * 2 + 0.6, H);   // +0.6 — бесшовная стыковка
      });

      // 2) глиф знака + пройденный градус на каждом «прогоне» одного знака
      ctx.textBaseline = 'middle';
      runsOverVisible(chart, xAxis,
        (bar) => window.LunAstro.moonInfo(bar.timestamp).signIndex,
        (startI, endI, midX, leftX, rightX) => {
          const list = chart.getDataList();
          const info = window.LunAstro.moonInfo(list[endI].timestamp);
          const width = rightX - leftX;
          const label = `${SIGNS[info.signIndex].glyph} ${Math.floor(info.degInSign)}°`;
          ctx.font = '12px system-ui, sans-serif';
          if (width < ctx.measureText(label).width + 8) return;   // не влезает — пропускаем
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.textAlign = 'right';
          ctx.fillText(label, rightX - 5, H / 2);                 // градус у «конца» знака
        });
      return true;
    },
  });

  /* =================== 2. Полоса торговых зон цикла Луны =================== */
  kc.registerIndicator({
    name: 'MoonCycle',
    shortName: 'Цикл',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => window.LunAstro.moonInfo(d.timestamp)),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const H = bounding.height;
      forEachVisibleBar(chart, xAxis, (i, x, half, bar) => {
        const z = window.LunAstro.moonInfo(bar.timestamp).zone;
        ctx.fillStyle = z ? z.color : '#2a2a2a';
        ctx.fillRect(x - half, 0, half * 2 + 0.6, H);
      });
      ctx.textBaseline = 'middle';
      ctx.font = '11px system-ui, sans-serif';
      runsOverVisible(chart, xAxis,
        (bar) => { const z = window.LunAstro.moonInfo(bar.timestamp).zone; return z ? z.label : '—'; },
        (startI, endI, midX, leftX, rightX) => {
          const list = chart.getDataList();
          const z = window.LunAstro.moonInfo(list[endI].timestamp).zone;
          if (!z) return;
          const width = rightX - leftX;
          if (width < ctx.measureText(z.label).width + 10) return;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.textAlign = 'center';
          ctx.fillText(z.label, midX, H / 2);
        });
      return true;
    },
  });

  /* ===================== 3. Сессионный VWAP ± σ ===================== */
  kc.registerIndicator({
    name: 'VWAP_BANDS',
    shortName: 'VWAP',
    series: 'price',                 // накладывается на ценовую панель
    precision: 2,
    figures: [
      { key: 'up2', title: '+2σ: ', type: 'line' },
      { key: 'up1', title: '+1σ: ', type: 'line' },
      { key: 'vwap', title: 'VWAP: ', type: 'line' },
      { key: 'dn1', title: '-1σ: ', type: 'line' },
      { key: 'dn2', title: '-2σ: ', type: 'line' },
    ],
    styles: () => {
      const c = window.LUN.INDICATORS.vwap;
      const band = { color: c.bandColor };
      return {
        lines: [
          { ...band }, { ...band },
          { color: c.color, size: 1.4 },
          { ...band }, { ...band },
        ],
      };
    },
    calc: (dataList) => {
      const cfg = window.LUN.INDICATORS.vwap;
      const [k1, k2] = cfg.sigma;
      let curDay = null, cumV = 0, cumPV = 0, cumP2V = 0;
      return dataList.map((d) => {
        const day = cfg.reset === 'day'
          ? Math.floor((d.timestamp + MSK_OFFSET) / 86400000) : 0;
        if (day !== curDay) { curDay = day; cumV = cumPV = cumP2V = 0; }
        const tp = (d.high + d.low + d.close) / 3;
        const v = d.volume || 1;
        cumV += v; cumPV += tp * v; cumP2V += tp * tp * v;
        const vwap = cumPV / cumV;
        const variance = Math.max(0, cumP2V / cumV - vwap * vwap);
        const sd = Math.sqrt(variance);
        return {
          vwap,
          up1: vwap + k1 * sd, dn1: vwap - k1 * sd,
          up2: vwap + k2 * sd, dn2: vwap - k2 * sd,
        };
      });
    },
  });
})();
