/* =============================================================================
 *  indicators.js — кастомные индикаторы KLineChart
 * =============================================================================
 *   MoonSign   — лента знаков: цвет по знаку, деканы по 10°, текущий градус цифрой
 *   CycleStrip — полоса торгового цикла (создаётся до 6 раз, цикл берётся из
 *                extendData.cycle); зоны лонг/шорт/рэндж по долготе тела
 *   VWAP_BANDS — сессионный VWAP с полосами ±1σ / ±2σ
 *
 *  Ленты рисуются вручную (registerIndicator + draw) — идеальная синхронизация
 *  с осью времени при зуме/прокрутке.
 * ===========================================================================*/
(function () {
  const kc = window.klinecharts;
  const MSK_OFFSET = 3 * 3600 * 1000;

  /* пробежать по видимым свечам: fn(i, x, halfBar, barData) */
  function forEachVisibleBar(chart, xAxis, fn) {
    const range = chart.getVisibleRange();
    const bs = chart.getBarSpace();
    const list = chart.getDataList();
    const from = Math.max(0, range.from);
    const to = Math.min(list.length, range.to);
    for (let i = from; i < to; i++) fn(i, xAxis.convertToPixel(i), bs.halfBar, list[i]);
  }

  /* разбить видимый диапазон на «прогоны» с одинаковым keyFn(bar):
   * cb(startI, endI, midX, leftX, rightX) */
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

  /* ======================= Лента знаков зодиака ======================= */
  kc.registerIndicator({
    name: 'MoonSign',
    shortName: 'Луна ☾',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => window.LunAstro.moonInfo(d.timestamp)),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const SIGNS = window.LUN.SIGNS;
      const SUB = window.LUN.SIGN_SUBDIVISION || 10;      // размер декана, °
      const H = bounding.height;
      const list = chart.getDataList();

      // 1) фон-полосы по знаку
      forEachVisibleBar(chart, xAxis, (i, x, half, bar) => {
        const info = window.LunAstro.moonInfo(bar.timestamp);
        ctx.fillStyle = SIGNS[info.signIndex].color;
        ctx.fillRect(x - half, 0, half * 2 + 0.6, H);
      });

      // 2) разделители деканов (каждые SUB°) — тонкие; границы знаков — ярче
      runsOverVisible(chart, xAxis,
        (bar) => {
          const info = window.LunAstro.moonInfo(bar.timestamp);
          return info.signIndex * 100 + Math.floor(info.degInSign / SUB);   // ключ декана
        },
        (startI, endI, midX, leftX, rightX) => {
          const info = window.LunAstro.moonInfo(list[endI].timestamp);
          const isSignEnd = info.degInSign >= 30 - SUB;   // последний декан знака
          ctx.strokeStyle = isSignEnd ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.16)';
          ctx.lineWidth = isSignEnd ? 1.4 : 1;
          ctx.beginPath(); ctx.moveTo(rightX, 0); ctx.lineTo(rightX, H); ctx.stroke();
        });

      // 3) текущий градус цифрой в каждом декане + глиф знака в его начале
      ctx.textBaseline = 'middle';
      // глиф — один раз на знак
      runsOverVisible(chart, xAxis,
        (bar) => window.LunAstro.moonInfo(bar.timestamp).signIndex,
        (startI, endI, midX, leftX, rightX) => {
          const info = window.LunAstro.moonInfo(list[startI].timestamp);
          ctx.font = '13px system-ui, sans-serif';
          if (rightX - leftX < 16) return;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.textAlign = 'left';
          ctx.fillText(SIGNS[info.signIndex].glyph, leftX + 4, H * 0.32);
        });
      // градус — на конце каждого декана (видно ход 9°→19°→29°)
      runsOverVisible(chart, xAxis,
        (bar) => {
          const info = window.LunAstro.moonInfo(bar.timestamp);
          return info.signIndex * 100 + Math.floor(info.degInSign / SUB);
        },
        (startI, endI, midX, leftX, rightX) => {
          const info = window.LunAstro.moonInfo(list[endI].timestamp);
          const label = Math.floor(info.degInSign) + '°';
          ctx.font = '11px system-ui, sans-serif';
          if (rightX - leftX < ctx.measureText(label).width + 6) return;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.textAlign = 'right';
          ctx.fillText(label, rightX - 4, H * 0.72);
        });
      return true;
    },
  });

  /* ======================= Полоса торгового цикла ======================= */
  kc.registerIndicator({
    name: 'CycleStrip',
    shortName: 'Цикл',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const cycle = indicator.extendData && indicator.extendData.cycle;
      const H = bounding.height;
      const list = chart.getDataList();
      // пустой цикл — подсказка, чтобы включённая полоса была видна
      if (!cycle || !cycle.zones || cycle.zones.length === 0) {
        ctx.fillStyle = '#242a36'; ctx.fillRect(0, 0, bounding.width, H);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText('нет зон — добавьте в ⚙ Настройки', 8, H / 2);
        return true;
      }
      const zonesOf = (ts) => {
        const info = window.LunAstro.bodyInfo(cycle ? cycle.body : 'Moon', ts);
        return window.LunAstro.zoneOf(info.lon, cycle ? cycle.zones : []);
      };
      forEachVisibleBar(chart, xAxis, (i, x, half, bar) => {
        const z = zonesOf(bar.timestamp);
        ctx.fillStyle = z ? z.color : '#242a36';
        ctx.fillRect(x - half, 0, half * 2 + 0.6, H);
      });
      ctx.textBaseline = 'middle';
      ctx.font = '11px system-ui, sans-serif';
      runsOverVisible(chart, xAxis,
        (bar) => { const z = zonesOf(bar.timestamp); return z ? z.label : '—'; },
        (startI, endI, midX, leftX, rightX) => {
          const z = zonesOf(list[endI].timestamp);
          if (!z) return;
          if (rightX - leftX < ctx.measureText(z.label).width + 10) return;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.textAlign = 'center';
          ctx.fillText(z.label, midX, H / 2);
        });
      return true;
    },
  });

  /* ===================== Сессионный VWAP ± σ ===================== */
  kc.registerIndicator({
    name: 'VWAP_BANDS',
    shortName: 'VWAP',
    series: 'price',
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
      return { lines: [{ ...band }, { ...band }, { color: c.color, size: 1.4 }, { ...band }, { ...band }] };
    },
    calc: (dataList) => {
      const cfg = window.LUN.INDICATORS.vwap;
      const [k1, k2] = cfg.sigma;
      let curDay = null, cumV = 0, cumPV = 0, cumP2V = 0;
      return dataList.map((d) => {
        const day = cfg.reset === 'day' ? Math.floor((d.timestamp + MSK_OFFSET) / 86400000) : 0;
        if (day !== curDay) { curDay = day; cumV = cumPV = cumP2V = 0; }
        const tp = (d.high + d.low + d.close) / 3;
        const v = d.volume || 1;
        cumV += v; cumPV += tp * v; cumP2V += tp * tp * v;
        const vwap = cumPV / cumV;
        const sd = Math.sqrt(Math.max(0, cumP2V / cumV - vwap * vwap));
        return { vwap, up1: vwap + k1 * sd, dn1: vwap - k1 * sd, up2: vwap + k2 * sd, dn2: vwap - k2 * sd };
      });
    },
  });
})();
