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

  /* Прогноз вперёд: астро-полосы можно продлить ВПРАВО за последнюю свечу до
   * LUN_FORECAST.untilTs. Для будущих индексов синтезируем бар только с
   * timestamp (астро от времени — этого достаточно). Возвращает предел индекса
   * (cap) и функцию barAt(i). Если прогноз выключен — обычные границы. */
  function forecastInfo(chart) {
    const list = chart.getDataList();
    const F = window.LUN_FORECAST;
    const realLen = list.length;
    if (!(F && F.enabled && F.stepMs > 0 && F.untilTs) || !realLen) {
      return { cap: realLen, realLen, barAt: (i) => list[i] };
    }
    const lastTs = list[realLen - 1].timestamp;
    const extra = Math.max(0, Math.min(F.maxBars || 500, Math.ceil((F.untilTs - lastTs) / F.stepMs)));
    return {
      cap: realLen + extra, realLen,
      barAt: (i) => (i < realLen ? list[i] : { timestamp: lastTs + (i - (realLen - 1)) * F.stepMs, forecast: true }),
    };
  }

  // правый видимый индекс: realTo включает поле офсета справа (для прогноза),
  // range.to обрезан числом свечей.
  const visRight = (range) => Math.ceil(range.realTo != null ? range.realTo : range.to);

  /* пробежать по видимым свечам (+ прогноз): fn(i, x, halfBar, barData) */
  function forEachVisibleBar(chart, xAxis, fn) {
    const range = chart.getVisibleRange();
    const bs = chart.getBarSpace();
    const fc = forecastInfo(chart);
    const from = Math.max(0, range.from);
    const to = Math.min(fc.cap, visRight(range));
    for (let i = from; i < to; i++) fn(i, xAxis.convertToPixel(i), bs.halfBar, fc.barAt(i));
  }

  /* разбить видимый диапазон (+ прогноз) на «прогоны» с одинаковым keyFn(bar):
   * cb(startI, endI, midX, leftX, rightX) */
  function runsOverVisible(chart, xAxis, keyFn, cb) {
    const range = chart.getVisibleRange();
    const bs = chart.getBarSpace();
    const fc = forecastInfo(chart);
    const from = Math.max(0, range.from);
    const to = Math.min(fc.cap, visRight(range));
    if (to <= from) return;
    let runStart = from, runKey = keyFn(fc.barAt(from));
    const flush = (endExcl) => {
      const leftX = xAxis.convertToPixel(runStart) - bs.halfBar;
      const rightX = xAxis.convertToPixel(endExcl - 1) + bs.halfBar;
      cb(runStart, endExcl - 1, (leftX + rightX) / 2, leftX, rightX);
    };
    for (let i = from + 1; i < to; i++) {
      const k = keyFn(fc.barAt(i));
      if (k !== runKey) { flush(i); runStart = i; runKey = k; }
    }
    flush(to);
  }
  window.LUN_FORECAST_INFO = forecastInfo;   // для полос со своим циклом (аспекты)

  /* ======================= Лента знаков (любое тело) ======================= */
  kc.registerIndicator({
    name: 'SignStrip',
    shortName: 'Знак',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const ed = indicator.extendData || {};
      const body = ed.body || 'Moon', frame = ed.frame || 'geo';
      const info = (ts) => window.LunAstro.bodyInfo(body, ts, frame);
      const SIGNS = window.LUN.SIGNS;
      const SUB = window.LUN.SIGN_SUBDIVISION || 10;      // размер декана, °
      const H = bounding.height;
      const list = chart.getDataList();

      // 1) фон-полосы по знаку
      forEachVisibleBar(chart, xAxis, (i, x, half, bar) => {
        ctx.fillStyle = SIGNS[info(bar.timestamp).signIndex].color;
        ctx.fillRect(x - half, 0, half * 2 + 0.6, H);
      });

      // 2) разделители деканов (каждые SUB°) — тонкие; границы знаков — ярче
      runsOverVisible(chart, xAxis,
        (bar) => { const d = info(bar.timestamp); return d.signIndex * 100 + Math.floor(d.degInSign / SUB); },
        (startI, endI, midX, leftX, rightX) => {
          const d = info(list[endI].timestamp);
          const isSignEnd = d.degInSign >= 30 - SUB;
          ctx.strokeStyle = isSignEnd ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.16)';
          ctx.lineWidth = isSignEnd ? 1.4 : 1;
          ctx.beginPath(); ctx.moveTo(rightX, 0); ctx.lineTo(rightX, H); ctx.stroke();
        });

      // 3) название знака в начале + градус в конце каждого декана
      ctx.textBaseline = 'middle';
      runsOverVisible(chart, xAxis,
        (bar) => info(bar.timestamp).signIndex,
        (startI, endI, midX, leftX, rightX) => {
          const s = SIGNS[info(list[startI].timestamp).signIndex];
          const width = rightX - leftX;
          ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.textAlign = 'left'; ctx.font = '12px system-ui, sans-serif';
          if (width > ctx.measureText(s.glyph + ' ' + s.name).width + 8) ctx.fillText(s.glyph + ' ' + s.name, leftX + 5, H * 0.32);
          else if (width > ctx.measureText(s.name).width + 6) ctx.fillText(s.name, leftX + 5, H * 0.32);
          else if (width > 16) ctx.fillText(s.glyph, leftX + 4, H * 0.32);
        });
      runsOverVisible(chart, xAxis,
        (bar) => { const d = info(bar.timestamp); return d.signIndex * 100 + Math.floor(d.degInSign / SUB); },
        (startI, endI, midX, leftX, rightX) => {
          const label = Math.floor(info(list[endI].timestamp).degInSign) + '°';
          ctx.font = '11px system-ui, sans-serif';
          if (rightX - leftX < ctx.measureText(label).width + 6) return;
          ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'right';
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
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText('нет зон — добавьте в ⚙ Настройки', bounding.width / 2, H / 2);
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

  /* ============ Сводная полоса «все аспекты всех пар» (11-я) ============ */
  kc.registerIndicator({
    name: 'AllAspectStrip',
    shortName: '∀ аспекты',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const ed = indicator.extendData || {};
      const bodies = ed.bodies || ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
      const orb = ed.orb || (window.LUN.ASPECTS.orb || 3);
      const H = bounding.height, list = chart.getDataList();
      ctx.fillStyle = '#191d26'; ctx.fillRect(0, 0, bounding.width, H);   // нейтральный фон

      // пары тел
      const pairs = [];
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        pairs.push([a, b, (a === 'Moon' || b === 'Moon') ? 'geo' : 'helio']);
      }
      // орб-дистанция до ближайшего аспекта пары на момент ts (мемоизация по минуте)
      const memo = new Map();
      const nearest = (a, b, frame, ts) => {
        const key = a + b + Math.floor(ts / 60000);
        let v = memo.get(key); if (v) return v;
        const la = window.LunAstro.bodyInfo(a, ts, frame).lon, lb = window.LunAstro.bodyInfo(b, ts, frame).lon;
        const sep = separation(la, lb);
        let best = null, bd = 1e9; for (const A of ASPECTS) { const dd = Math.abs(sep - A.angle); if (dd < bd) { bd = dd; best = A; } }
        v = { d: bd, asp: best }; memo.set(key, v); return v;
      };

      const range = chart.getVisibleRange();
      const fc = window.LUN_FORECAST_INFO(chart);
      const tsAt = (i) => fc.barAt(i).timestamp;
      const rTo = Math.ceil(range.realTo != null ? range.realTo : range.to);
      const from = Math.max(1, range.from), to = Math.min(fc.cap - 2, rTo);
      // риска на всю высоту в ТОЧНОМ центре аспекта (локальный минимум орб-дистанции)
      for (const [a, b, frame] of pairs) {
        for (let i = from; i <= to; i++) {
          const cur = nearest(a, b, frame, tsAt(i));
          if (cur.d > orb) continue;
          const prev = nearest(a, b, frame, tsAt(i - 1));
          const next = nearest(a, b, frame, tsAt(i + 1));
          if (cur.d <= prev.d && cur.d < next.d) {
            const x = xAxis.convertToPixel(i);
            ctx.strokeStyle = cur.asp.color; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
          }
        }
      }
      return true;
    },
  });

  /* ============ Полоса «Уран — все планеты» (мажорные аспекты) ============
   * Отметка на всю высоту в точный момент аспекта Урана с каждой планетой +
   * глиф планеты и символ аспекта над риской. Уран движется медленно, поэтому
   * такие аспекты — редкие «якорные» события. Гелио (с Луной — гео). */
  kc.registerIndicator({
    name: 'UranusAspects',
    shortName: '♅ ко всем',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const ed = indicator.extendData || {};
      const orb = ed.orb || (window.LUN.ASPECTS.orb || 3);
      const GL = window.LUN.BODY_GLYPH || {};
      const others = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Neptune', 'Pluto'];
      const H = bounding.height, list = chart.getDataList();
      ctx.fillStyle = '#191d26'; ctx.fillRect(0, 0, bounding.width, H);

      const memo = new Map();
      const nearest = (other, frame, ts) => {
        const key = other + Math.floor(ts / 60000);
        let v = memo.get(key); if (v) return v;
        const la = window.LunAstro.bodyInfo('Uranus', ts, frame).lon, lb = window.LunAstro.bodyInfo(other, ts, frame).lon;
        const sep = separation(la, lb);
        let best = null, bd = 1e9; for (const A of ASPECTS) { const dd = Math.abs(sep - A.angle); if (dd < bd) { bd = dd; best = A; } }
        v = { d: bd, asp: best }; memo.set(key, v); return v;
      };

      const range = chart.getVisibleRange();
      const fc = window.LUN_FORECAST_INFO(chart);
      const tsAt = (i) => fc.barAt(i).timestamp;
      const rTo = Math.ceil(range.realTo != null ? range.realTo : range.to);
      const from = Math.max(1, range.from), to = Math.min(fc.cap - 2, rTo);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = '10px system-ui, sans-serif';
      for (const other of others) {
        const frame = (other === 'Moon') ? 'geo' : 'helio';
        for (let i = from; i <= to; i++) {
          const cur = nearest(other, frame, tsAt(i));
          if (cur.d > orb) continue;
          const prev = nearest(other, frame, tsAt(i - 1)), next = nearest(other, frame, tsAt(i + 1));
          if (cur.d <= prev.d && cur.d < next.d) {
            const x = xAxis.convertToPixel(i);
            ctx.strokeStyle = cur.asp.color; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, H); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillText((GL[other] || other[0]) + cur.asp.sym, x, 1);
          }
        }
      }
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
      let curKey = null, cumV = 0, cumPV = 0, cumP2V = 0;
      const sessionKey = (ts) => {
        const t = ts + MSK_OFFSET;
        if (cfg.reset === 'month') { const dt = new Date(t); return dt.getUTCFullYear() * 12 + dt.getUTCMonth(); }
        if (cfg.reset === 'day') return Math.floor(t / 86400000);
        return 0;
      };
      return dataList.map((d) => {
        const day = sessionKey(d.timestamp);
        if (day !== curKey) { curKey = day; cumV = cumPV = cumP2V = 0; }
        const tp = (d.high + d.low + d.close) / 3;
        const v = d.volume || 1;
        cumV += v; cumPV += tp * v; cumP2V += tp * tp * v;
        const vwap = cumPV / cumV;
        const sd = Math.sqrt(Math.max(0, cumP2V / cumV - vwap * vwap));
        return { vwap, up1: vwap + k1 * sd, dn1: vwap - k1 * sd, up2: vwap + k2 * sd, dn2: vwap - k2 * sd };
      });
    },
  });

  /* ============ Мульти-VWAP: до 3 якорей (день/неделя/месяц/все) ============ */
  function vwapSessionKey(ts, reset) {
    const t = ts + MSK_OFFSET;
    if (reset === 'month') { const dt = new Date(t); return dt.getUTCFullYear() * 12 + dt.getUTCMonth(); }
    if (reset === 'week') return Math.floor((Math.floor(t / 86400000) + 3) / 7);   // ISO-недели (пн)
    if (reset === 'day') return Math.floor(t / 86400000);
    return 0;   // 'all' / 'none' — сплошной, один якорь на всю историю
  }
  function vwapCalcFor(i) {
    return (dataList) => {
      const cfg = (window.LUN.INDICATORS.vwapList || [])[i];
      if (!cfg || !cfg.on) return dataList.map(() => ({}));
      const k1 = (cfg.sigma && cfg.sigma[0]) || 1, k2 = (cfg.sigma && cfg.sigma[1]) || 2;
      let curKey = null, cumV = 0, cumPV = 0, cumP2V = 0;
      return dataList.map((d) => {
        const key = vwapSessionKey(d.timestamp, cfg.reset);
        if (key !== curKey) { curKey = key; cumV = cumPV = cumP2V = 0; }
        const tp = (d.high + d.low + d.close) / 3, v = d.volume || 1;
        cumV += v; cumPV += tp * v; cumP2V += tp * tp * v;
        const vwap = cumPV / cumV;
        if (!cfg.bands) return { vwap };
        const sd = Math.sqrt(Math.max(0, cumP2V / cumV - vwap * vwap));
        return { vwap, up1: vwap + k1 * sd, dn1: vwap - k1 * sd, up2: vwap + k2 * sd, dn2: vwap - k2 * sd };
      });
    };
  }
  // осветление цвета к белому на долю t (0..1). t=0.5 — «вдвое светлее».
  function vwapLighten(hex, t) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
    if (!m) return hex || '#f0c040';
    let r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    r = Math.round(r + (255 - r) * t); g = Math.round(g + (255 - g) * t); b = Math.round(b + (255 - b) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  const VW_MARK = ['①', '②', '③'];
  for (let i = 0; i < 3; i++) {
    kc.registerIndicator({
      name: 'VWAP_' + (i + 1),
      shortName: 'VWAP ' + VW_MARK[i],
      series: 'price',
      precision: 2,
      figures: [
        { key: 'up2', title: '+2σ: ', type: 'line' },
        { key: 'up1', title: '+1σ: ', type: 'line' },
        { key: 'vwap', title: 'VWAP: ', type: 'line' },
        { key: 'dn1', title: '−1σ: ', type: 'line' },
        { key: 'dn2', title: '−2σ: ', type: 'line' },
      ],
      styles: () => {
        const cfg = (window.LUN.INDICATORS.vwapList || [])[i] || {};
        const axis = cfg.color || '#f0c040';
        const s1 = vwapLighten(axis, 0.5);            // 1σ — вдвое светлее оси
        const s2 = vwapLighten(axis, 0.75);           // 2σ — вдвое светлее 1σ
        const b1 = { color: s1, style: 'dashed', dashedValue: [6, 4], size: 1 };
        const b2 = { color: s2, style: 'dashed', dashedValue: [6, 4], size: 1 };
        // порядок: up2, up1, vwap(ось), dn1, dn2
        return { lines: [{ ...b2 }, { ...b1 }, { color: axis, size: 1.6 }, { ...b1 }, { ...b2 }] };
      },
      calc: vwapCalcFor(i),
    });
  }

  /* =============== Дневная кумулятивная дельта (по OHLC) =============== */
  // Точных данных покупок/продаж у ISS нет — дельта аппроксимируется из свечи:
  // доля дня = (close-open)/(high-low), знак = направление; накопление за сутки (МСК).
  kc.registerIndicator({
    name: 'CumDelta',
    shortName: 'Δ кум · день',
    series: 'normal',
    figures: [{ key: 'cd', title: 'Δ: ', type: 'line' }],
    styles: () => ({ lines: [{ color: '#4aa3df', size: 1.4 }] }),
    calc: (dataList) => {
      let day = null, cum = 0;
      return dataList.map((d) => {
        const dk = Math.floor((d.timestamp + MSK_OFFSET) / 86400000);
        if (dk !== day) { day = dk; cum = 0; }
        const rng = (d.high - d.low) || 0;
        let f = rng > 0 ? (d.close - d.open) / rng : Math.sign(d.close - d.open);
        f = Math.max(-1, Math.min(1, f));
        cum += (d.volume || 0) * f;
        return { cd: cum };
      });
    },
  });

  /* ============ Узлы Луны на цене: 0° (ингрессия) и 15° (середина) ============ */
  kc.registerIndicator({
    name: 'MoonNodes',
    shortName: 'Узлы ☾',
    series: 'price',                 // накладывается на ценовую панель
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const H = bounding.height, list = chart.getDataList();
      const range = chart.getVisibleRange();
      const from = Math.max(1, range.from), to = Math.min(list.length, range.to);
      for (let i = from; i < to; i++) {
        const a = window.LunAstro.moonInfo(list[i - 1].timestamp), b = window.LunAstro.moonInfo(list[i].timestamp);
        const ka = a.signIndex * 2 + (a.degInSign >= 15 ? 1 : 0);
        const kb = b.signIndex * 2 + (b.degInSign >= 15 ? 1 : 0);
        if (ka === kb) continue;
        const x = xAxis.convertToPixel(i);
        const ingress = a.signIndex !== b.signIndex;      // смена знака = 0°
        ctx.strokeStyle = ingress ? 'rgba(230,160,60,0.45)' : 'rgba(110,160,220,0.30)';
        ctx.lineWidth = 1; ctx.setLineDash(ingress ? [] : [3, 3]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = ingress ? 'rgba(230,160,60,0.9)' : 'rgba(120,160,220,0.75)';
        ctx.font = '9px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(ingress ? window.LUN.SIGNS[b.signIndex].glyph + ' 0°' : '15°', x + 2, 2);
      }
      return true;
    },
  });

  /* ============ Сильные бары (всплеск объёма: «сила» / «силища») ============
   * Сила    = объём бара ≥ forceMult × среднего объёма предыдущих lookback
   *           (мелких) баров — импульс пришёл.
   * Силища  = сила, после которой объём ДЕРЖИТСЯ высоким: среднее объёма
   *           следующих sustainBars ≥ sustainMult × базового среднего.
   * Рисуем: сила — маленький треугольник; силища — крупный двойной. */
  function forceAt(list, i, cfg) {
    if (i < cfg.lookback) return null;
    let sv = 0, n = 0;
    for (let j = i - cfg.lookback; j < i; j++) { sv += (list[j].volume || 0); n++; }
    if (!n) return null;
    const base = sv / n;
    if (base <= 0) return null;
    const vol = list[i].volume || 0;
    if (vol < cfg.forceMult * base) return null;
    // силища: держится ли объём высоким на следующих барах
    let ss = 0, sn = 0;
    for (let j = i + 1; j <= i + cfg.sustainBars && j < list.length; j++) { ss += (list[j].volume || 0); sn++; }
    const sustained = sn > 0 && (ss / sn) >= cfg.sustainMult * base;
    return { ratio: vol / base, sustained };
  }
  window.LUN_FORCE_AT = forceAt;   // для бэктеста

  kc.registerIndicator({
    name: 'StrongBars',
    shortName: 'Сильбары',
    series: 'price',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, xAxis, yAxis }) => {
      const cfg = window.LUN.STRONGBAR || { lookback: 12, forceMult: 2, sustainBars: 5, sustainMult: 1.5 };
      const list = chart.getDataList();
      const range = chart.getVisibleRange();
      const from = Math.max(cfg.lookback, range.from), to = Math.min(list.length, range.to);
      for (let i = from; i < to; i++) {
        const f = forceAt(list, i, cfg);
        if (!f) continue;
        const bar = list[i], up = bar.close >= bar.open, x = xAxis.convertToPixel(i);
        ctx.fillStyle = up ? '#26e0b0' : '#ff5c7a';
        const s = f.sustained ? 6 : 4;           // силища крупнее
        if (up) {
          const y = yAxis.convertToPixel(bar.low) + 3;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s, y + s + 3); ctx.lineTo(x + s, y + s + 3); ctx.closePath(); ctx.fill();
          if (f.sustained) { ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x - s, y + 2 * s + 5); ctx.lineTo(x + s, y + 2 * s + 5); ctx.closePath(); ctx.fill(); }
        } else {
          const y = yAxis.convertToPixel(bar.high) - 3;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s, y - s - 3); ctx.lineTo(x + s, y - s - 3); ctx.closePath(); ctx.fill();
          if (f.sustained) { ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x - s, y - 2 * s - 5); ctx.lineTo(x + s, y - 2 * s - 5); ctx.closePath(); ctx.fill(); }
        }
      }
      return true;
    },
  });

  /* ======================= Полоса аспектов ======================= */
  const BODY_SYM = { Sun: '☉', Moon: '☾', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄' };
  // голубые (soft) = продолжение движения; красные (hard) = разворот/коррекция
  const ASPECTS = [
    { name: 'соединение', sym: '☌', angle: 0,   kind: 'hard', color: '#e0a030' },
    { name: 'секстиль',   sym: '⚹', angle: 60,  kind: 'soft', color: '#4bb4e6' },
    { name: 'квадрат',    sym: '□', angle: 90,  kind: 'hard', color: '#ef5350' },
    { name: 'трин',       sym: '△', angle: 120, kind: 'soft', color: '#26a69a' },
    { name: 'оппозиция',  sym: '☍', angle: 180, kind: 'hard', color: '#9b6bff' },
  ];
  // цвета аспектов берём из общих настроек (LUN.ASPECT_COLORS), с живым обновлением
  function syncAspectColors() { ASPECTS.forEach((A) => { const c = window.LUN.ASPECT_COLORS && window.LUN.ASPECT_COLORS[A.angle]; if (c) A.color = c; }); }
  syncAspectColors();
  window.LUN_SYNC_ASPECTS = syncAspectColors;
  window.LUN_ASPECT_DEFS = ASPECTS;
  function separation(a, b) { let d = Math.abs(a - b) % 360; if (d > 180) d = 360 - d; return d; }
  function aspectCfg(indicator) {
    const ed = indicator && indicator.extendData;
    const base = window.LUN.ASPECTS;
    return {
      bodyA: (ed && ed.bodyA) || base.bodyA || 'Sun',
      bodyB: (ed && ed.bodyB) || base.bodyB || 'Mercury',
      frame: (ed && ed.frame) || base.frame || 'helio',
      orb: (ed && ed.orb) || base.orb || 3,
    };
  }
  function aspectAt(ts, cfg) {
    const la = window.LunAstro.bodyInfo(cfg.bodyA, ts, cfg.frame).lon;
    const lb = window.LunAstro.bodyInfo(cfg.bodyB, ts, cfg.frame).lon;
    const sep = separation(la, lb);
    for (const A of ASPECTS) if (Math.abs(sep - A.angle) <= cfg.orb) return { asp: A, sep };
    return { asp: null, sep };
  }
  window.LUN_ASPECT_AT = aspectAt;   // для бэктеста

  // все активные аспекты всех пар набора тел на момент ts
  function allActiveAspects(ts, bodies, orb) {
    const out = [];
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const frame = (a === 'Moon' || b === 'Moon') ? 'geo' : 'helio';
      const la = window.LunAstro.bodyInfo(a, ts, frame).lon, lb = window.LunAstro.bodyInfo(b, ts, frame).lon;
      const sep = separation(la, lb);
      for (const A of ASPECTS) if (Math.abs(sep - A.angle) <= orb) { out.push({ a, b, asp: A }); break; }
    }
    return out;
  }

  kc.registerIndicator({
    name: 'AspectStrip',
    shortName: 'Аспекты',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const cfg = aspectCfg(indicator);
      const H = bounding.height, list = chart.getDataList();
      const symA = BODY_SYM[cfg.bodyA] || cfg.bodyA, symB = BODY_SYM[cfg.bodyB] || cfg.bodyB;
      forEachVisibleBar(chart, xAxis, (i, x, half, bar) => {
        const r = aspectAt(bar.timestamp, cfg);
        ctx.fillStyle = r.asp ? r.asp.color : '#20252f';
        ctx.fillRect(x - half, 0, half * 2 + 0.6, H);
      });
      ctx.textBaseline = 'middle'; ctx.font = '11px system-ui, sans-serif';
      runsOverVisible(chart, xAxis,
        (bar) => { const a = aspectAt(bar.timestamp, cfg).asp; return a ? a.name : '—'; },
        (startI, endI, midX, leftX, rightX) => {
          const r = aspectAt(list[endI].timestamp, cfg);
          const label = r.asp ? `${symA}${symB} ${r.asp.name}` : `${symA}${symB} ${Math.round(r.sep)}°`;
          if (rightX - leftX < ctx.measureText(label).width + 8) return;
          ctx.fillStyle = r.asp ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.4)';
          ctx.textAlign = 'center';
          ctx.fillText(label, midX, H / 2);
        });
      return true;
    },
  });

  /* ============ Марков: лента режима (BEAR/SIDE/BULL цветом) ============
   * В стиле астро-лент: заливка по ценовому режиму бара + точка сверху там, где
   * марковский сигнал разрешён (tradable) — зелёная в лонг, красная в шорт. */
  const REGIME_COL = ['#7a2b2b', '#3a3f2f', '#1f6f43'];   // bear / side / bull (приглушённые)
  kc.registerIndicator({
    name: 'MarkovStrip',
    shortName: 'Марков-режим',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const bars = chart.getDataList(); if (!bars.length || !window.LunMarkov) return true;
      const wf = window.LunMarkov.walkForwardCached(bars, window.LUN.MARKOV);
      const H = bounding.height;
      forEachVisibleBar(chart, xAxis, (i, x, half) => {
        if (i >= bars.length) return;                      // будущее (прогноз) — состояний нет
        const ps = wf.priceStates[i];
        ctx.fillStyle = ps < 0 ? '#20252f' : REGIME_COL[ps];
        ctx.fillRect(x - half, 0, half * 2 + 0.6, H);
        if (wf.tradable[i]) {
          ctx.fillStyle = wf.signal[i] > 0 ? '#26e0b0' : '#ff5c7a';
          ctx.beginPath(); ctx.arc(x, 4.5, 2, 0, 6.283); ctx.fill();
        }
      });
      return true;
    },
  });

  /* ============ Марков: панель сигнала (бар сигнала + линия прогноза) ============
   * Бар = signal (−1..+1) от нуля: зелёный лонг / красный шорт / серый —
   * не торговый (малая выборка/шум). Жёлтая линия = прогноз на horizon (P^n). */
  kc.registerIndicator({
    name: 'MarkovRegime',
    shortName: 'Марков',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const bars = chart.getDataList(); if (!bars.length || !window.LunMarkov) return true;
      const wf = window.LunMarkov.walkForwardCached(bars, window.LUN.MARKOV);
      const H = bounding.height, mid = H / 2;
      ctx.strokeStyle = '#2a3242'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(bounding.width, mid); ctx.stroke();
      forEachVisibleBar(chart, xAxis, (i, x, half) => {
        if (i >= bars.length) return;
        const s = wf.signal[i], y = mid - s * mid * 0.92;
        ctx.fillStyle = wf.tradable[i] ? (s > 0 ? '#26a69a' : '#ef5350') : 'rgba(120,130,150,0.30)';
        ctx.fillRect(x - half, Math.min(mid, y), half * 2 + 0.6, Math.max(1, Math.abs(mid - y)));
      });
      // линия прогноза signalN
      ctx.strokeStyle = '#f0c040'; ctx.lineWidth = 1.2; ctx.beginPath(); let started = false;
      forEachVisibleBar(chart, xAxis, (i, x) => {
        if (i >= bars.length) return;
        const y = mid - wf.signalN[i] * mid * 0.92;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      return true;
    },
  });

  /* ============ Торговые сессии (фон на цене) ============
   * Полупрозрачные полосы по часам UTC каждого бара. Перекрытия сессий
   * складывают альфу → зона ликвидности (Лондон+Нью-Йорк) заметно темнее.
   * Только интрадей: на дневках/неделях выходим. */
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  const sessActive = (ts, s) => { const h = ((ts % 86400000) / 3600000 + 24) % 24; return s.from <= s.to ? (h >= s.from && h < s.to) : (h >= s.from || h < s.to); };
  kc.registerIndicator({
    name: 'Sessions',
    shortName: 'Сессии',
    series: 'price',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, yAxis }) => {
      const S = (window.LUN.SESSIONS) || []; if (!S.length) return true;
      const bars = chart.getDataList(); if (bars.length < 2) return true;
      if ((bars[1].timestamp - bars[0].timestamp) >= 12 * 3600000) return true;  // дневка+ — не рисуем
      const bs = chart.getBarSpace(), W = bounding.width;
      ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      // каждая сессия — прямоугольная зона от первого до последнего бара сессии,
      // по цене — диапазон high..low этой сессии (session-range box).
      for (const s of S) {
        let start = -1, hi = -Infinity, lo = Infinity;
        const flush = (end) => {
          const xL = xAxis.convertToPixel(start) - bs.halfBar, xR = xAxis.convertToPixel(end) + bs.halfBar;
          if (xR < 0 || xL > W || !(hi > lo)) return;
          const yT = yAxis.convertToPixel(hi), yB = yAxis.convertToPixel(lo);
          ctx.fillStyle = hexA(s.color, 0.07); ctx.fillRect(xL, yT, xR - xL, yB - yT);
          ctx.strokeStyle = hexA(s.color, 0.5); ctx.lineWidth = 1; ctx.strokeRect(xL, yT, xR - xL, yB - yT);
          if (xR - xL > 34) { ctx.fillStyle = hexA(s.color, 0.95); ctx.fillText(s.name, Math.max(2, xL) + 2, yT - 2); }
        };
        for (let i = 0; i <= bars.length; i++) {
          const a = i < bars.length && sessActive(bars[i].timestamp, s);
          if (a) { if (start < 0) { start = i; hi = -Infinity; lo = Infinity; } if (bars[i].high > hi) hi = bars[i].high; if (bars[i].low < lo) lo = bars[i].low; }
          else if (start >= 0) { flush(i - 1); start = -1; }
        }
      }
      return true;
    },
  });

  /* ============ Наложение 2-го инструмента линией ============
   * Второй инструмент рисуется линией поверх цены, нормируясь в высоту панели
   * по видимому диапазону (сравниваем ФОРМУ движения, а не абсолют). Данные —
   * в extendData.bars ([{timestamp,close}], возр.). */
  kc.registerIndicator({
    name: 'Compare',
    shortName: 'Сравнение',
    series: 'price',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const ed = indicator.extendData || {}; const cb = ed.bars;
      if (!cb || cb.length < 2) return true;
      const H = bounding.height, list = chart.getDataList(), range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.realTo != null ? range.realTo : range.to));
      const closeAt = (ts) => { let lo = 0, hi = cb.length - 1, res = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (cb[m].timestamp <= ts) { res = cb[m]; lo = m + 1; } else hi = m - 1; } return res ? res.close : null; };
      let mn = Infinity, mx = -Infinity; const pts = [];
      for (let i = from; i < to; i++) { const bar = list[i]; if (!bar) continue; const c = closeAt(bar.timestamp); if (c == null) continue; pts.push([i, c]); if (c < mn) mn = c; if (c > mx) mx = c; }
      if (pts.length < 2 || !(mx > mn)) return true;
      const yOf = (c) => H * 0.92 - ((c - mn) / (mx - mn)) * H * 0.84;
      ctx.strokeStyle = ed.color || '#e07bd0'; ctx.lineWidth = 1.4; ctx.beginPath();
      pts.forEach(([i, c], k) => { const x = xAxis.convertToPixel(i), y = yOf(c); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      ctx.fillStyle = ed.color || '#e07bd0'; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText((ed.label || 'сравнение') + ' · линия (норм.)', 6, 4);
      return true;
    },
  });

  /* ============ Открытый интерес + физики/юрики (FUTOI) ============
   * Дневной ряд: byDate['YYYY-MM-DD'] = { fizNet, yurNet, oi }. При split —
   * чистые позиции физлиц (синяя) и юрлиц (оранжевая) от нуля; иначе — линия
   * общего ОИ (нормировка по видимому диапазону). Дата бара — по МСК. */
  kc.registerIndicator({
    name: 'OpenInterest',
    shortName: 'ОИ',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const ed = indicator.extendData || {}, bd = ed.byDate; if (!bd) return true;
      const H = bounding.height, list = chart.getDataList(), range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.realTo != null ? range.realTo : range.to));
      const dOf = (ts) => new Date(ts + MSK_OFFSET).toISOString().slice(0, 10);
      const bs = chart.getBarSpace(), halfW = Math.max(1, bs.halfBar), thr = ed.thr || null;
      // диапазон видимого ОИ для нормировки гистограммы
      let mn = Infinity, mx = -Infinity;
      for (let i = from; i < to; i++) { const bar = list[i]; if (!bar) continue; const r = bd[dOf(bar.timestamp)]; if (!r || r.oi == null) continue; if (r.oi < mn) mn = r.oi; if (r.oi > mx) mx = r.oi; }
      ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      if (!(mx > mn)) { ctx.fillStyle = '#8b93a7'; ctx.fillText('ОИ: нет данных в окне', 6, 3); return true; }
      const top = H * 0.16, bot = H * 0.96, yOf = (v) => bot - ((v - mn) / (mx - mn)) * (bot - top);
      const tierOf = (ab) => !thr ? 0 : (ab >= thr[2] ? 3 : (ab >= thr[1] ? 2 : (ab >= thr[0] ? 1 : 0)));
      const ALPHA = [0.5, 0.62, 0.8, 1];
      let lastDate = null; const labels = [];
      // гистограмма ОИ: столбик = уровень ОИ, цвет = знак ΔОИ, яркость = уровень экстремума
      for (let i = from; i < to; i++) {
        const bar = list[i]; if (!bar) continue; const date = dOf(bar.timestamp), r = bd[date]; if (!r || r.oi == null) continue;
        const up = (r.dOI == null) ? true : r.dOI >= 0, tier = tierOf(Math.abs(r.dOI || 0));
        const x = xAxis.convertToPixel(i), y = yOf(r.oi);
        ctx.fillStyle = (up ? 'rgba(38,166,154,' : 'rgba(239,83,80,') + ALPHA[tier] + ')';
        ctx.fillRect(x - halfW, y, halfW * 2 + 0.4, bot - y);
        if (r.cot) { ctx.fillStyle = r.cot > 0 ? '#ef5350' : '#26a69a'; ctx.beginPath(); ctx.arc(x, y - 3, 2.6, 0, 6.283); ctx.fill(); }
        if (tier >= 2 && date !== lastDate) labels.push({ x, y, up, ab: Math.abs(r.dOI), tier });
        lastDate = date;
      }
      // подписи крупных ΔОИ поверх столбиков
      ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
      labels.forEach((l) => { ctx.fillStyle = l.up ? '#26a69a' : '#ef5350'; ctx.font = (l.tier === 3 ? 'bold ' : '') + '10px system-ui, sans-serif'; ctx.fillText((l.up ? '+' : '−') + oiKfmt(l.ab) + (l.tier === 3 ? '!' : ''), l.x, Math.max(11, l.y - 4)); });
      // шапка
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = '10px system-ui, sans-serif';
      const L = ed.latest || {};
      ctx.fillStyle = '#8b93a7'; ctx.fillText('ОИ ' + (L.oi || 0), 6, 3);
      if (L.dOI != null) { ctx.fillStyle = L.dOI >= 0 ? '#26a69a' : '#ef5350'; ctx.fillText('ΔОИ ' + (L.dOI >= 0 ? '+' : '') + L.dOI, 92, 3); }
      if (ed.split) { ctx.fillStyle = '#3aa0ff'; ctx.fillText('физ ' + ((L.fizNet >= 0 ? '+' : '') + (L.fizNet || 0)), 200, 3); ctx.fillStyle = '#e0a030'; ctx.fillText('юр ' + ((L.yurNet >= 0 ? '+' : '') + (L.yurNet || 0)), 300, 3); }
      return true;
    },
  });

  /* ============ Экстремальные ΔОИ на цене (вертикальные метки) ============
   * Читает window.LUN_OI_EXTREMES = { byDate: {d:{dOI}}, thresholds:[t1,t2,t3] }.
   * Дни с |ΔОИ| ≥ порога — вертикаль на цене: приток ОИ (+) зелёным, отток (−)
   * красным; яркость и толщина по уровню; на 2–3 уровне — подпись величины. */
  const oiKfmt = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
  kc.registerIndicator({
    name: 'OIExtremes', shortName: 'ΔОИ-экстремумы', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const D = window.LUN_OI_EXTREMES; if (!D || !D.byDate || !D.thresholds) return true;
      const list = chart.getDataList(); if (list.length < 2) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      const thr = D.thresholds, H = bounding.height, W = bounding.width;
      const dOf = (ts) => new Date(ts + MSK_OFFSET).toISOString().slice(0, 10);
      const ALPHA = [0, 0.28, 0.55, 0.9], WID = [0, 1, 1.6, 2.4];
      let lastDate = null;
      for (let i = from; i < to; i++) {
        const bar = list[i]; if (!bar) continue; const date = dOf(bar.timestamp);
        if (date === lastDate) continue; lastDate = date;
        const rec = D.byDate[date]; if (!rec || rec.dOI == null) continue;
        const ab = Math.abs(rec.dOI); const tier = ab >= thr[2] ? 3 : (ab >= thr[1] ? 2 : (ab >= thr[0] ? 1 : 0));
        if (!tier) continue;
        const up = rec.dOI > 0, x = xAxis.convertToPixel(i); if (x < -2 || x > W + 2) continue;
        ctx.strokeStyle = (up ? 'rgba(38,166,154,' : 'rgba(239,83,80,') + ALPHA[tier] + ')';
        ctx.lineWidth = WID[tier]; ctx.setLineDash(tier === 1 ? [3, 4] : []);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
        if (tier >= 2) {
          ctx.fillStyle = up ? '#26a69a' : '#ef5350'; ctx.font = (tier === 3 ? 'bold ' : '') + '10px system-ui, sans-serif';
          ctx.textBaseline = 'top'; ctx.textAlign = 'left';
          ctx.fillText((up ? '+' : '−') + oiKfmt(ab) + (tier === 3 ? '!' : ''), x + 2, 2);
        }
      }
      ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      ctx.fillText('ΔОИ: приток ▲ / отток ▼ (пороги ' + thr.map(oiKfmt).join('·') + ')', 6, H - 2);
      return true;
    },
  });

  /* ============ Арбитражный спред + z-score ============
   * byTs[ts] = значение спреда; mean/std — по всей серии; линия спреда +
   * среднее (пунктир) + полосы ±2σ; текущий z и метка расхождения. */
  kc.registerIndicator({
    name: 'ArbSpread',
    shortName: 'Спред',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const ed = indicator.extendData || {}, bt = ed.byTs; if (!bt) return true;
      const H = bounding.height, list = chart.getDataList(), range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      const pts = []; let mn = Infinity, mx = -Infinity;
      for (let i = from; i < to; i++) { const b = list[i]; if (!b) continue; const v = bt[b.timestamp]; if (v == null) continue; pts.push([i, v]); mn = Math.min(mn, v); mx = Math.max(mx, v); }
      const mean = ed.mean, up = mean + 2 * ed.std, dn = mean - 2 * ed.std;
      mn = Math.min(mn, dn); mx = Math.max(mx, up);
      if (pts.length < 2 || !(mx > mn)) return true;
      const yOf = (v) => H * 0.9 - ((v - mn) / (mx - mn)) * H * 0.8;
      const band = (v, color, dash) => { ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, yOf(v)); ctx.lineTo(bounding.width, yOf(v)); ctx.stroke(); ctx.setLineDash([]); };
      band(mean, '#6b7280', [4, 3]); band(up, '#ef5350', [3, 3]); band(dn, '#26a69a', [3, 3]);
      ctx.strokeStyle = '#e0d060'; ctx.lineWidth = 1.4; ctx.beginPath();
      pts.forEach((p, k) => { const x = xAxis.convertToPixel(p[0]), y = yOf(p[1]); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      const z = ed.std ? (ed.last - mean) / ed.std : 0;
      ctx.fillStyle = '#cdd3df'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const val = Math.abs(ed.last) < 10 ? ed.last.toFixed(4) : ed.last.toFixed(1);
      ctx.fillText(ed.title + '  спред ' + val + '  z=' + z.toFixed(2) + (Math.abs(z) > 2 ? '  ⚠ расхождение' : ''), 6, 3);
      return true;
    },
  });

  /* ============ Ганн: ретрейсменты (доли диапазона видимого окна) ============
   * Горизонтали на 1/8·1/3·1/2 и т.д. между минимумом и максимумом видимых
   * баров. Авто-диапазон (без клика): при прокрутке пересчитывается. 0/50/100 —
   * жирные, остальные пунктиром. */
  kc.registerIndicator({
    name: 'GannRetr', shortName: 'Ганн-ретр.', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, yAxis }) => {
      const list = chart.getDataList(); if (!list.length) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      let hi = -Infinity, lo = Infinity, prec = 1;
      for (let i = from; i < to; i++) { const b = list[i]; if (!b) continue; if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
      if (!(hi > lo)) return true;
      prec = hi < 10 ? 4 : (hi < 1000 ? 2 : 1);
      const cfg = (window.LUN.GANNTOOLS && window.LUN.GANNTOOLS.retr) || { levels: [12.5, 25, 37.5, 50, 62.5, 75, 87.5] };
      const GS = window.LUN.GSTYLE || {}, tsz = GS.textSize || 10, lw = GS.lineWidth || 1, lc = GS.levelColor || '#e0d060', dashed = GS.lineStyle === 'dashed';
      const W = bounding.width;
      const drawLvl = (pct, price, strong) => {
        const y = yAxis.convertToPixel(price); if (y < 0 || y > bounding.height) return;
        ctx.strokeStyle = strong ? lc : 'rgba(120,150,200,0.28)';
        ctx.lineWidth = lw; ctx.setLineDash((strong && !dashed) ? [] : [4, 3]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = strong ? lc : '#8aa0c8'; ctx.font = tsz + 'px system-ui, sans-serif';
        ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
        ctx.fillText(pct + '%  ' + price.toFixed(prec), 4, y - 1);
      };
      drawLvl(0, lo, true); drawLvl(100, hi, true);
      cfg.levels.forEach((p) => drawLvl(p, lo + (hi - lo) * p / 100, Math.abs(p - 50) < 0.01));
      return true;
    },
  });

  /* ============ Ганн: уровни квадрата (из калькулятора) ============
   * Рисует горизонтали по уровням из extendData.levels (считает app.js).
   * Кардинальные углы (0/90/180/270) — красные сплошные, диагонали — синие
   * пунктиром. Уровни вне видимой области пропускаются. */
  kc.registerIndicator({
    name: 'GannSquareLevels', shortName: 'Квадрат Ганна', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, yAxis, indicator }) => {
      const ed = indicator.extendData || {}, lv = ed.levels; if (!lv || !lv.length) return true;
      const prec = ed.prec != null ? ed.prec : 1, W = bounding.width, H = bounding.height;
      const GS = window.LUN.GSTYLE || {}, tsz = GS.textSize || 10, lw = GS.lineWidth || 1, dashed = GS.lineStyle === 'dashed';
      if (ed.anchor != null) {
        const y = yAxis.convertToPixel(ed.anchor);
        if (y >= 0 && y <= H) { ctx.strokeStyle = GS.levelColor || 'rgba(224,208,96,0.85)'; ctx.setLineDash([2, 2]); ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]); }
      }
      lv.forEach((L) => {
        const y = yAxis.convertToPixel(L.price); if (y < 0 || y > H) return;
        const card = (L.deg % 90 === 0);
        ctx.strokeStyle = card ? 'rgba(239,83,80,0.55)' : 'rgba(58,160,255,0.40)';
        ctx.lineWidth = card ? Math.max(lw, 1.2) : lw; ctx.setLineDash((card && !dashed) ? [] : [5, 3]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = card ? '#ef8a88' : '#7fb2ff'; ctx.font = tsz + 'px system-ui, sans-serif';
        ctx.textBaseline = 'bottom'; ctx.textAlign = 'right';
        ctx.fillText((L.tag || (L.deg + '°')) + '  ' + L.price.toFixed(prec), W - 4, y - 1);
      });
      return true;
    },
  });

  /* ============ Ганн: мастер-циклы времени (вертикали от пивота) ============
   * Пивот = более свежий из видимых экстремумов (макс/мин). Вправо от него —
   * вертикали через N баров (30·45·60·90·120·144·180·270·360). Циклы за пределы
   * данных появляются по мере прокрутки/офсета вправо. */
  kc.registerIndicator({
    name: 'GannCycles', shortName: 'Мастер-циклы', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const list = chart.getDataList(); if (list.length < 5) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      let hiI = from, loI = from;
      for (let i = from; i < to; i++) { if (list[i].high > list[hiI].high) hiI = i; if (list[i].low < list[loI].low) loI = i; }
      const pivotI = Math.max(hiI, loI);
      const nums = (window.LUN.GANNTOOLS && window.LUN.GANNTOOLS.cycles && window.LUN.GANNTOOLS.cycles.nums) || [30, 60, 90, 144, 180, 360];
      const H = bounding.height, W = bounding.width;
      const drawV = (i, color, dash, label) => {
        const x = xAxis.convertToPixel(i); if (x < -2 || x > W + 2) return;
        ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
        if (label) { ctx.fillStyle = color; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(label, x + 2, 2); }
      };
      drawV(pivotI, 'rgba(224,208,96,0.85)', [], 'пивот');
      nums.forEach((n) => drawV(pivotI + n, 'rgba(58,160,255,0.42)', [4, 3], '+' + n));
      return true;
    },
  });

  /* ============ Астро-Ганн: планетарные линии → цена ============
   * Долгота планеты (0..360°) переводится в цену: price = lon·scale + m·(360·scale).
   * scale берётся из LUN.ASTROGANN.pricePerDeg, либо авто — так, что полный оборот
   * (360°) укладывается в видимый ценовой диапазон (линия всегда на экране).
   * Линия «ползёт» вместе с планетой; рисуем гармоники m-1..m+1 вокруг центра. */
  const AGmeta = (p) => (window.LUN.ASTROGANN.planets[p] || { g: '?', c: '#8aa0c8' });
  kc.registerIndicator({
    name: 'PlanetLines', shortName: 'Планетарные линии', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, yAxis }) => {
      const AG = window.LUN.ASTROGANN, list = chart.getDataList(); if (!list.length || !window.LunAstro) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      if (to - from < 2) return true;
      let hi = -Infinity, lo = Infinity;
      for (let i = from; i < to; i++) { const b = list[i]; if (!b) continue; if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
      if (!(hi > lo)) return true;
      const pad = (hi - lo) * 0.08; hi += pad; lo -= pad;
      const spacing = AG.pricePerDeg ? AG.pricePerDeg * 360 : (hi - lo);
      if (!(spacing > 0)) return true;
      const scaleP = spacing / 360, mid = (lo + hi) / 2, W = bounding.width;
      (AG.linePlanets || []).forEach((p) => {
        const meta = AGmeta(p), lons = [];
        for (let i = from; i < to; i++) lons[i] = window.LunAstro.bodyInfo(p, list[i].timestamp, AG.frame).lon;
        const midI = (from + to) >> 1, baseMid = lons[midI] * scaleP;
        const mCenter = Math.round((mid - baseMid) / spacing);
        for (let m = mCenter - 1; m <= mCenter + 1; m++) {
          ctx.strokeStyle = meta.c; ctx.globalAlpha = 0.75; ctx.lineWidth = 1;
          ctx.beginPath(); let started = false, lastX = 0, lastY = 0;
          for (let i = from; i < to; i++) {
            const price = lons[i] * scaleP + m * spacing;
            if (price < lo || price > hi) { if (started) { ctx.stroke(); ctx.beginPath(); started = false; } continue; }
            const x = xAxis.convertToPixel(i), y = yAxis.convertToPixel(price);
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            lastX = x; lastY = y;
          }
          ctx.stroke(); ctx.globalAlpha = 1;
          if (started) { ctx.fillStyle = meta.c; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(meta.g, Math.min(lastX + 3, W - 12), lastY); }
        }
      });
      return true;
    },
  });

  /* ============ Астро-Ганн: ингрессии планет (вход в знак) ============
   * Вертикаль, когда планета пересекает границу знака (каждые 30°). Подпись —
   * глиф планеты + глиф нового знака. */
  kc.registerIndicator({
    name: 'PlanetIngress', shortName: 'Ингрессии', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const AG = window.LUN.ASTROGANN, list = chart.getDataList(); if (list.length < 2 || !window.LunAstro) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(1, range.from), to = Math.min(list.length, Math.ceil(range.to));
      const H = bounding.height, W = bounding.width, SIGNS = window.LUN.SIGNS;
      (AG.ingressPlanets || []).forEach((p) => {
        const meta = AGmeta(p);
        for (let i = from; i < to; i++) {
          const s0 = window.LunAstro.bodyInfo(p, list[i - 1].timestamp, AG.frame).signIndex;
          const s1 = window.LunAstro.bodyInfo(p, list[i].timestamp, AG.frame).signIndex;
          if (s0 === s1) continue;
          const x = xAxis.convertToPixel(i); if (x < -2 || x > W + 2) continue;
          ctx.strokeStyle = meta.c; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
          ctx.fillStyle = meta.c; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
          ctx.fillText(meta.g + (SIGNS[s1] ? SIGNS[s1].glyph : ''), x + 2, 2);
        }
      });
      return true;
    },
  });

  /* ============ Астро-Ганн: ретроградности (панель, строка на планету) ============
   * Красный сегмент = планета движется попятно (долгота убывает бар-к-бару).
   * Ретро-периоды Ганн считал точками разворота настроения рынка. */
  kc.registerIndicator({
    name: 'RetroStrip', shortName: 'Ретроградности', series: 'normal', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const AG = window.LUN.ASTROGANN, list = chart.getDataList(); if (list.length < 3 || !window.LunAstro) return true;
      const range = chart.getVisibleRange(), bs = chart.getBarSpace();
      const from = Math.max(1, range.from), to = Math.min(list.length, Math.ceil(range.to));
      const ps = AG.retroPlanets || [], H = bounding.height, W = bounding.width, rowH = H / Math.max(1, ps.length);
      ps.forEach((p, ri) => {
        const meta = AGmeta(p), y0 = ri * rowH;
        for (let i = from; i < to; i++) {
          let d = window.LunAstro.bodyInfo(p, list[i].timestamp, AG.frame).lon - window.LunAstro.bodyInfo(p, list[i - 1].timestamp, AG.frame).lon;
          if (d > 180) d -= 360; else if (d < -180) d += 360;
          const x = xAxis.convertToPixel(i);
          ctx.fillStyle = d < 0 ? 'rgba(239,83,80,0.85)' : 'rgba(90,100,120,0.16)';
          ctx.fillRect(x - bs.halfBar, y0 + 2, bs.halfBar * 2 + 0.6, rowH - 4);
        }
        ctx.fillStyle = meta.c; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(meta.g + ' ' + p, 4, y0 + rowH / 2);
      });
      return true;
    },
  });

  /* ============ Астро-Ганн: барометр Bradley (сидерограф) ============
   * Взвешенная сумма аспектов между планетами: мягкие (60/120) — плюс, жёсткие
   * (90/180) — минус, соединение — плюс; вес = сумма потенциалов пары × близость
   * к точному аспекту. Экстремумы кривой — потенциальные даты разворота. Это
   * композит «в стиле Bradley», а не проприетарная формула CRB. */
  kc.registerIndicator({
    name: 'BradleyStrip', shortName: 'Барометр аспектов', series: 'normal', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const list = chart.getDataList(); if (list.length < 3 || !window.LunAstro) return true;
      const B = window.LUN.ASTROGANN.bradley, range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      if (to - from < 2) return true;
      const SIGNED = [{ a: 0, s: 1 }, { a: 60, s: 1 }, { a: 90, s: -1 }, { a: 120, s: 1 }, { a: 180, s: -1 }];
      // раздельно: гармония (pos, зелёная) и напряжение (neg, красная) — по Свиридову
      const val = (ts) => {
        const lon = {}; B.planets.forEach((p) => { lon[p] = window.LunAstro.bodyInfo(p, ts, 'geo').lon; });
        let pos = 0, neg = 0;
        for (let i = 0; i < B.planets.length; i++) for (let j = i + 1; j < B.planets.length; j++) {
          const a = B.planets[i], b = B.planets[j]; let d = Math.abs(lon[a] - lon[b]) % 360; if (d > 180) d = 360 - d;
          for (const A of SIGNED) { const off = Math.abs(d - A.a); if (off <= B.orb) { const w = ((B.pot[a] || 1) + (B.pot[b] || 1)) * (1 - off / B.orb); if (A.s > 0) pos += w; else neg += w; break; } }
        }
        return { pos: pos, neg: neg, sig: pos - neg };
      };
      const mode = (window.LUN.BAR && window.LUN.BAR.mode) || 'signed';
      const P = [], N = [], S = []; let mx = 1e-9, mxp = 1e-9;
      for (let i = from; i < to; i++) { const v = val(list[i].timestamp); P[i] = v.pos; N[i] = v.neg; S[i] = v.sig; if (Math.abs(v.sig) > mx) mx = Math.abs(v.sig); if (v.pos > mxp) mxp = v.pos; if (v.neg > mxp) mxp = v.neg; }
      const H = bounding.height, mid = H / 2, W = bounding.width;
      ctx.strokeStyle = '#2a3242'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      const line = (arr, yfn, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); let st = false; for (let i = from; i < to; i++) { const x = xAxis.convertToPixel(i), y = yfn(arr[i]); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); } ctx.stroke(); };
      if (mode === 'polar') {
        // две полярности от нуля вверх (поддержка 🟢 / напряжение 🔴), как у Свиридова
        line(P, (v) => H - (v / mxp) * (H - 4), '#26a69a', 1.4);
        line(N, (v) => H - (v / mxp) * (H - 4), '#ef5350', 1.4);
      } else {
        line(S, (v) => mid - (v / mx) * mid * 0.9, '#e0c040', 1.4);
        for (let i = from + 1; i < to - 1; i++) {
          if ((S[i] - S[i - 1]) * (S[i + 1] - S[i]) < 0) {
            const x = xAxis.convertToPixel(i), y = mid - (S[i] / mx) * mid * 0.9;
            ctx.fillStyle = (S[i] > S[i - 1]) ? '#ef5350' : '#26a69a';
            ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#0b0e14'; ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
      ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText('Барометр аспектов (гео)' + (mode === 'polar' ? ' · 2 полярности' : ' · 1 линия'), 4, 2);
      return true;
    },
  });

  /* ============ Синастрия: динамика взаимоотношений (RI во времени) ============
   * window.LUN_SYNASTRY = { points:[долготы обеих карт], title }.
   * Режим LUN.SYN.mode: 'signed' — одна знаковая кривая (гармония+/напряжение−);
   * 'polar' — две полярности (🟢 поддержка / 🔴 напряжение) по Свиридову;
   * 'both' — знаковая линия + фон полярностей.
   * Гейт Луны: на длинных горизонтах (> ~45 дней видимого окна) транзитная Луна
   * исключается, иначе даёт «лунную рябь» с шагом ~2.5 дня.
   * ВАЖНО: это НАПРЯЖЕНИЕ/ПОДДЕРЖКА, а НЕ направление цены. ЭКСПЕРИМЕНТ. */
  kc.registerIndicator({
    name: 'RelationshipDyn', shortName: 'Синастрия-динамика', series: 'normal', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const S = window.LUN_SYNASTRY;
      const list = chart.getDataList(); if (list.length < 3 || !window.LunSynastry || !S || !S.points || !S.points.length) {
        ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        ctx.fillText('Синастрия: задайте пару в «Личные данные»', 4, 2); return true;
      }
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      if (to - from < 2) return true;
      const mode = (window.LUN.SYN && window.LUN.SYN.mode) || 'both';
      const spanDays = (list[to - 1].timestamp - list[from].timestamp) / 86400000;
      const noMoon = spanDays > 45;                     // гейт Луны на длинных окнах
      const pts = S.points, sig = [], pos = [], neg = []; let mx = 1e-9, mxp = 1e-9;
      for (let i = from; i < to; i++) {
        const r = window.LunSynastry.riSplit(list[i].timestamp, pts, 6, noMoon);
        pos[i] = r.pos; neg[i] = r.neg; sig[i] = r.pos - r.neg;
        if (Math.abs(sig[i]) > mx) mx = Math.abs(sig[i]);
        if (r.pos > mxp) mxp = r.pos; if (r.neg > mxp) mxp = r.neg;
      }
      const H = bounding.height, mid = H / 2, W = bounding.width;
      ctx.strokeStyle = '#2a3242'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      const line = (arr, norm, refY, col, lw) => {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); let st = false;
        for (let i = from; i < to; i++) { const x = xAxis.convertToPixel(i), y = refY(arr[i], norm); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
        ctx.stroke();
      };
      if (mode === 'polar' || mode === 'both') {
        // две полярности от нуля вверх: зелёная (поддержка) и красная (напряжение)
        line(pos, mxp, (v) => H - (v / mxp) * (H - 4), '#26a69a', 1.3);
        line(neg, mxp, (v) => H - (v / mxp) * (H - 4), '#ef5350', 1.3);
      }
      if (mode === 'signed' || mode === 'both') {
        line(sig, mx, (v) => mid - (v / mx) * mid * 0.9, '#59c3d0', mode === 'both' ? 1.0 : 1.5);
        for (let i = from + 1; i < to - 1; i++) {
          if ((sig[i] - sig[i - 1]) * (sig[i + 1] - sig[i]) < 0) {
            const x = xAxis.convertToPixel(i), y = mid - (sig[i] / mx) * mid * 0.9;
            ctx.fillStyle = (sig[i] > 0) ? '#26a69a' : '#ef5350';
            ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.283); ctx.fill();
            ctx.strokeStyle = '#0b0e14'; ctx.lineWidth = 1; ctx.stroke();
          }
        }
      }
      ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText('Синастрия ' + (S.title || '') + ' · напряжение/поддержка, не направление' + (noMoon ? ' · без Луны' : ''), 4, 2);
      return true;
    },
  });

  /* ============ Свиридов: двухполярная динамика аспектов ============
   * Две кривые на ОДНОЙ шкале от общей базовой линии: 🟢 поддержка и 🔴
   * напряжение (суммы гармоничных/напряжённых аспектов). Пересекаются там, где
   * баланс смещается — как у П. Свиридова. Набор планет/аспектов — LUN.SVIR. */
  kc.registerIndicator({
    name: 'SviridovDyn', shortName: 'Аспекты 🟢🔴', series: 'normal', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const list = chart.getDataList(); if (list.length < 3 || !window.LunSvir) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      if (to - from < 2) return true;
      const grn = [], red = []; let mx = 1e-9;
      for (let i = from; i < to; i++) { const r = window.LunSvir.dynAt(list[i].timestamp); grn[i] = r.green; red[i] = r.red; if (r.green > mx) mx = r.green; if (r.red > mx) mx = r.red; }
      const H = bounding.height, W = bounding.width, base = H - 3;
      ctx.strokeStyle = '#2a3242'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(W, base); ctx.stroke();
      const line = (arr, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); let st = false; for (let i = from; i < to; i++) { const x = xAxis.convertToPixel(i), y = base - (arr[i] / mx) * (H - 8); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); } ctx.stroke(); };
      line(grn, '#26a69a'); line(red, '#ef5350');
      // подсветка «красный выше зелёного» = напряжённые окна
      for (let i = from + 1; i < to; i++) { if (red[i] > grn[i] && red[i - 1] <= grn[i - 1]) { const x = xAxis.convertToPixel(i); ctx.strokeStyle = 'rgba(239,83,80,0.25)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } }
      ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText('Динамика аспектов · 🟢 поддержка / 🔴 напряжение (пересечение = смена баланса)', 4, 2);
      return true;
    },
  });

  /* ============ Прогностика: цикл Меркурий–Солнце (каркас Маслова) ============
   * window.LUN_MASLOV = { cycle:'merc'|'moon' }. Вертикали на 4 событиях этапа
   * + чередующийся фон между ними. Направление НЕ постулируется (чередование);
   * проверяется Монте-Карло. Рисуется на ценовой панели. */
  kc.registerIndicator({
    name: 'MercSunCycle', shortName: 'Цикл ☿–☉', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const list = chart.getDataList(); const n = list.length; if (n < 3 || !window.LunCycle) return true;
      const cycle = (window.LUN_MASLOV && window.LUN_MASLOV.cycle) || 'merc';
      const horizonQ = (window.LUN_MASLOV && window.LUN_MASLOV.horizonQ) || 0;   // кварталы прогноза вперёд
      const H = bounding.height, W = bounding.width;
      const firstTs = list[0].timestamp, lastTs = list[n - 1].timestamp;
      const tfMs = (lastTs - firstTs) / Math.max(1, n - 1);                       // мс на бар
      let barSpace = 6; try { barSpace = chart.getBarSpace().bar || 6; } catch (e) {}
      // Этапы считаем по ПОЛНОМУ диапазону данных (+ прогноз) — границы стабильны
      // при любом зуме (раньше считались по видимому окну и «плыли» у краёв).
      const t1 = lastTs + horizonQ * 91 * 86400000;
      const ev = window.LunCycle.stages(cycle, firstTs, t1); if (!ev.length) return true;
      // ts → пиксель X (прошлое — по индексу бара; будущее — экстраполяция по barSpace)
      const xOf = (ts) => {
        if (ts <= lastTs) {
          let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].timestamp < ts) lo = m + 1; else hi = m; }
          const i = Math.max(1, lo), a = list[i - 1].timestamp, b = list[i].timestamp;
          const frac = b > a ? (ts - a) / (b - a) : 0; return xAxis.convertToPixel(i - 1 + frac);
        }
        return xAxis.convertToPixel(n - 1) + ((ts - lastTs) / tfMs) * barSpace;
      };
      const LAB = { retro: '☿ᴿ', direct: '☿ᴰ', inferior: '☿☌☉↓', superior: '☿☌☉↑', new: '🌑', fq: '🌓', full: '🌕', lq: '🌗' };
      // номер этапа сегмента ПОСЛЕ события (по Маслову этапы 1–4)
      const STAGE_AFTER = { retro: 1, inferior: 2, direct: 3, superior: 4 };
      const CIRC = ['', '①', '②', '③', '④'];
      // чередующийся фон + номер этапа + подсветка текущего
      for (let k = 0; k < ev.length - 1; k++) {
        const x1 = xOf(ev[k].ts), x2 = xOf(ev[k + 1].ts); if (x2 < 0 || x1 > W) continue;
        const cur = ev[k].ts <= lastTs && lastTs < ev[k + 1].ts;                 // текущий этап
        ctx.fillStyle = (k % 2 === 0) ? 'rgba(38,166,154,0.06)' : 'rgba(239,83,80,0.06)';
        ctx.fillRect(x1, 0, Math.max(0, x2 - x1), H);
        if (cur) { ctx.fillStyle = 'rgba(240,192,64,0.10)'; ctx.fillRect(x1, 0, Math.max(0, x2 - x1), H); }
        const st = STAGE_AFTER[ev[k].kind]; const mid = (Math.max(0, x1) + Math.min(W, x2)) / 2;
        if (st && cycle !== 'moon' && (x2 - x1) > 24) { ctx.fillStyle = cur ? '#f0c040' : '#5a6274'; ctx.font = (cur ? 'bold ' : '') + '18px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(CIRC[st], mid, H / 2); }
      }
      ev.forEach((e) => {
        const x = xOf(e.ts); if (x < -20 || x > W + 20) return;
        const isStage = e.kind in STAGE_AFTER;
        const future = e.ts > lastTs;
        ctx.strokeStyle = isStage ? 'rgba(200,162,75,0.6)' : 'rgba(155,107,255,0.45)'; ctx.lineWidth = future ? 1.6 : 1; ctx.setLineDash(future ? [2, 3] : (isStage ? [] : [3, 3]));
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = future ? '#e0a030' : '#c7d0e0'; ctx.font = 'bold 17px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
        ctx.fillText(LAB[e.kind] || '', x, 2);
      });
      ctx.fillStyle = '#8b93a7'; ctx.font = '13px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      ctx.fillText((cycle === 'moon' ? 'Цикл Луна–Солнце (валюты)' : 'Цикл Меркурий–Солнце') + ' · этапы 1–4' + (horizonQ ? ' · прогноз ' + horizonQ + ' кв.' : '') + ' · направление проверяйте МК', 4, H - 2);
      return true;
    },
  });

  /* ============ Прогностика: СБЧ (Сарватобхадра-чакра) ведха-скаляр ============
   * window.LUN_SBC = { janma, title, sunVedha }. Гладкий скаляр SBC(t) ≈ −5…+5
   * (как барометр): бенефик-ведхи в чувствительные накшатры инструмента +,
   * малефик −. НЕ сигнал — проверяется Монте-Карло. Сидерика (Лахири). */
  kc.registerIndicator({
    name: 'SBCStrip', shortName: 'СБЧ', series: 'normal', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const S = window.LUN_SBC, list = chart.getDataList();
      if (list.length < 3 || !window.LunSBC || !S || !S.janma) {
        ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        ctx.fillText('СБЧ: задайте инструмент в «Прогностика → СБЧ»', 4, 2); return true;
      }
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      if (to - from < 2) return true;
      const cfg = { janma: S.janma, sunVedha: S.sunVedha || 'all3' };
      const vals = []; let mx = 1e-9;
      for (let i = from; i < to; i++) { const v = window.LunSBC.scoreAt(list[i].timestamp, cfg); vals[i] = v; if (Math.abs(v) > mx) mx = Math.abs(v); }
      const H = bounding.height, mid = H / 2, W = bounding.width;
      ctx.strokeStyle = '#2a3242'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      ctx.strokeStyle = '#c8a24b'; ctx.lineWidth = 1.4; ctx.beginPath(); let st = false;
      for (let i = from; i < to; i++) { const x = xAxis.convertToPixel(i), y = mid - (vals[i] / mx) * mid * 0.9; if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); }
      ctx.stroke();
      // экстремумы (|score|>3) — крупные точки
      for (let i = from; i < to; i++) {
        if (Math.abs(vals[i]) > 3) { const x = xAxis.convertToPixel(i), y = mid - (vals[i] / mx) * mid * 0.9; ctx.fillStyle = vals[i] > 0 ? '#26a69a' : '#ef5350'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.283); ctx.fill(); }
      }
      ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText('СБЧ ' + (S.title || '') + ' · джанма ' + S.janma + ' · не сигнал, проверьте Монте-Карло', 4, 2);
      return true;
    },
  });

  /* ============ Аспекты по выбору (пользовательский аспектариум) ============
   * window.LUN.ASPSEL.blocks = [{who, whom:[…до 3]}, …до 5]. Для каждой пары —
   * своя лента: точки в дни, когда пара в мажорном аспекте (0/60/90/120/180) в
   * пределах орба; цвет = аспект (LUN.ASPECT_COLORS), крупная точка = точный
   * аспект. Узлы Луны (☊/☋) поддержаны. */
  kc.registerIndicator({
    name: 'AspectSelect', shortName: 'Аспекты по выбору', series: 'normal', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const SEL = window.LUN.ASPSEL || {}, blocks = SEL.blocks || [];
      const glyph = (id) => { const b = (SEL.bodies || []).find((x) => x.id === id); return b ? b.g : id; };
      const list = chart.getDataList();
      const pairs = [];
      blocks.forEach((bl) => (bl.whom || []).forEach((w) => { if (bl.who && w && bl.who !== w) pairs.push({ a: bl.who, b: w }); }));
      if (list.length < 2 || !window.LunAstro || !pairs.length) {
        ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        ctx.fillText('Аспекты по выбору: задайте пары (Астро → Аспекты по выбору)', 4, 2); return true;
      }
      const lanes = pairs.slice(0, 12);
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      const orb = SEL.orb || 5, frame = SEL.frame || 'geo';
      const H = bounding.height, W = bounding.width, rowH = H / lanes.length;
      const sep = (x, y) => { let d = Math.abs(x - y) % 360; return d > 180 ? 360 - d : d; };
      lanes.forEach((pr, li) => {
        const yc = li * rowH + rowH / 2;
        ctx.strokeStyle = '#1c2230'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(W, yc); ctx.stroke();
        for (let i = from; i < to; i++) {
          const ts = list[i].timestamp;
          const la = window.LunAstro.lonOf(pr.a, ts, frame), lb = window.LunAstro.lonOf(pr.b, ts, frame);
          const s = sep(la, lb);
          for (const A of ASPECTS) {
            const off = Math.abs(s - A.angle);
            if (off <= orb) {
              const x = xAxis.convertToPixel(i), exact = off < 0.6;
              ctx.fillStyle = A.color; ctx.globalAlpha = exact ? 1 : 0.5; ctx.beginPath(); ctx.arc(x, yc, exact ? 4 : 2.4, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
              // знак аспекта над точным аспектом (☌⚹□△☍)
              if (exact) { ctx.fillStyle = A.color; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'center'; ctx.fillText(A.sym, x, yc - 4); }
              break;
            }
          }
        }
        ctx.fillStyle = '#c7d0e0'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(glyph(pr.a) + '–' + glyph(pr.b), 4, yc);
      });
      return true;
    },
  });

  /* ============ Астро-Ганн: веер долготы (Price & Longitude Angles) ============
   * Из пивота (свежий видимый экстремум) веер линий: цена движется со скоростью
   * долготы планеты — price = P0 ± scale·Δlon(накопл.). Ретро планеты дают изгиб. */
  kc.registerIndicator({
    name: 'PlanetFan', shortName: 'Веер долготы', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, yAxis }) => {
      const AG = window.LUN.ASTROGANN, list = chart.getDataList(); if (list.length < 3 || !window.LunAstro) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      if (to - from < 2) return true;
      let hi = -Infinity, lo = Infinity, hiI = from, loI = from;
      for (let i = from; i < to; i++) { const b = list[i]; if (!b) continue; if (b.high > hi) { hi = b.high; hiI = i; } if (b.low < lo) { lo = b.low; loI = i; } }
      if (!(hi > lo)) return true;
      const pivotI = Math.max(hiI, loI), P0 = list[pivotI].close, W = bounding.width;
      const scaleF = AG.pricePerDeg ? AG.pricePerDeg : (hi - lo) / 90;
      (AG.fanPlanets || []).forEach((p) => {
        const meta = AGmeta(p);
        // накопленная (развёрнутая) долгота от пивота
        const acc = []; let prev = window.LunAstro.bodyInfo(p, list[pivotI].timestamp, AG.frame).lon, a = 0; acc[pivotI] = 0;
        for (let i = pivotI + 1; i < to; i++) { const cur = window.LunAstro.bodyInfo(p, list[i].timestamp, AG.frame).lon; let d = cur - prev; if (d > 180) d -= 360; else if (d < -180) d += 360; a += d; acc[i] = a; prev = cur; }
        [1, -1].forEach((dir) => {
          ctx.strokeStyle = meta.c; ctx.globalAlpha = dir > 0 ? 0.8 : 0.4; ctx.lineWidth = 1; ctx.beginPath(); let started = false, lx = 0, ly = 0;
          for (let i = pivotI; i < to; i++) {
            const price = P0 + dir * scaleF * acc[i];
            if (price < lo || price > hi) { if (started) { ctx.stroke(); ctx.beginPath(); started = false; } continue; }
            const x = xAxis.convertToPixel(i), y = yAxis.convertToPixel(price);
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); lx = x; ly = y;
          }
          ctx.stroke(); ctx.globalAlpha = 1;
          if (started && dir > 0) { ctx.fillStyle = meta.c; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(meta.g, Math.min(lx + 3, W - 12), ly); }
        });
      });
      const px = xAxis.convertToPixel(pivotI), py = yAxis.convertToPixel(P0);
      ctx.fillStyle = '#e0d060'; ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.283); ctx.fill();
      return true;
    },
  });

  /* ============ Астро-Ганн: Sq9 в градусах планет ============
   * Горизонтали на ценах, где угол колеса Квадрата-9 равен долготе планеты:
   * √price·180 = долгота + 360·оборот  →  price = ((L+360r)/180)². */
  kc.registerIndicator({
    name: 'PlanetSq9', shortName: 'Sq9 планет', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, yAxis }) => {
      const AG = window.LUN.ASTROGANN, list = chart.getDataList(); if (!list.length || !window.LunAstro) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      let hi = -Infinity, lo = Infinity;
      for (let i = from; i < to; i++) { const b = list[i]; if (!b) continue; if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
      if (!(hi > lo)) return true;
      const pad = (hi - lo) * 0.1; hi += pad; lo = Math.max(0, lo - pad);
      const prec = hi < 10 ? 4 : (hi < 1000 ? 2 : 1), W = bounding.width, H = bounding.height, ts = list[to - 1].timestamp;
      (AG.sq9Planets || []).forEach((p) => {
        const meta = AGmeta(p), L = window.LunAstro.bodyInfo(p, ts, AG.frame).lon;
        const rMin = Math.floor((180 * Math.sqrt(Math.max(0, lo)) - L) / 360) - 1;
        const rMax = Math.ceil((180 * Math.sqrt(hi) - L) / 360) + 1;
        for (let r = rMin; r <= rMax; r++) {
          const s = (L + 360 * r) / 180; if (s <= 0) continue; const price = s * s;
          if (price < lo || price > hi) continue;
          const y = yAxis.convertToPixel(price); if (y < 0 || y > H) continue;
          ctx.strokeStyle = meta.c; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
          ctx.fillStyle = meta.c; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
          ctx.fillText(meta.g + ' ' + price.toFixed(prec), 4, y - 1);
        }
      });
      return true;
    },
  });

  /* ============ Астро-Ганн: затмения (вертикали) ============ */
  kc.registerIndicator({
    name: 'Eclipses', shortName: 'Затмения', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const list = chart.getDataList(); if (list.length < 2 || !window.LunAstro || !window.LunAstro.eclipsesBetween) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      if (to - from < 2) return true;
      const t0 = list[from].timestamp, t1 = list[to - 1].timestamp; if (!(t1 > t0)) return true;
      const ecl = window.LunAstro.eclipsesBetween(t0, t1); if (!ecl.length) return true;
      const H = bounding.height, W = bounding.width;
      const idxOf = (ts) => { let a = from, b = to - 1; while (a < b) { const m = (a + b) >> 1; if (list[m].timestamp < ts) a = m + 1; else b = m; } return a; };
      ecl.forEach((e) => {
        const x = xAxis.convertToPixel(idxOf(e.ts)); if (x < -2 || x > W + 2) return;
        const solar = e.kind === 'solar', col = solar ? '#f0c040' : '#cfd6e6';
        ctx.strokeStyle = col; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.2; ctx.setLineDash([5, 3]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.fillStyle = col; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        ctx.fillText((solar ? '☉' : '☾') + '⊘', x + 2, 2);
      });
      return true;
    },
  });

  /* ============ Ганн: сквоузинг цены и времени (1×1) ============
   * Из пивота (свежий видимый экстремум) линии 1×1 вверх/вниз с наклоном
   * unitPerBar (цена на бар; ручной из LUN.GANNTOOLS.scale или авто = диапазон/
   * бары). Точки, где свеча касается линии 1×1 — «сквоузинг» (цена прошла
   * столько же, сколько время). */
  kc.registerIndicator({
    name: 'GannSquaring', shortName: 'Сквоузинг', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, yAxis }) => {
      const list = chart.getDataList(); if (list.length < 5) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      if (to - from < 2) return true;
      let hi = -Infinity, lo = Infinity, hiI = from, loI = from;
      for (let i = from; i < to; i++) { const b = list[i]; if (!b) continue; if (b.high > hi) { hi = b.high; hiI = i; } if (b.low < lo) { lo = b.low; loI = i; } }
      if (!(hi > lo)) return true;
      const pivotI = Math.max(hiI, loI), P0 = list[pivotI].close;
      const cfg = window.LUN.GANNTOOLS.scale || {};
      const scale = cfg.unitPerBar || ((hi - lo) / Math.max(1, to - from));
      [1, -1].forEach((dir) => {
        ctx.strokeStyle = dir > 0 ? '#26a69a' : '#ef5350'; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.2; ctx.beginPath(); let started = false;
        for (let i = pivotI; i < to; i++) { const price = P0 + dir * scale * (i - pivotI), y = yAxis.convertToPixel(price), x = xAxis.convertToPixel(i); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
        ctx.stroke(); ctx.globalAlpha = 1;
      });
      for (let i = pivotI + 1; i < to; i++) {
        const up = P0 + scale * (i - pivotI), dn = P0 - scale * (i - pivotI), b = list[i];
        const hitUp = b.low <= up && b.high >= up, hitDn = b.low <= dn && b.high >= dn;
        if (hitUp || hitDn) { const x = xAxis.convertToPixel(i), y = yAxis.convertToPixel(hitUp ? up : dn); ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 6.283); ctx.fill(); }
      }
      const px = xAxis.convertToPixel(pivotI), py = yAxis.convertToPixel(P0);
      ctx.fillStyle = '#e0d060'; ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText('1×1: ' + (scale < 10 ? scale.toFixed(3) : scale.toFixed(1)) + ' /бар' + (cfg.unitPerBar ? ' (ручн.)' : ' (авто)'), 4, 2);
      return true;
    },
  });

  /* ============ Прогностика: прогнозная линия из циклов ============
   * Сумма доминирующих синусоид цены + тренд, продлённая вправо на projBars.
   * Тяжёлый расчёт кэшируется по длине/времени данных. */
  let projCache = null, projKey = '';
  kc.registerIndicator({
    name: 'CycleProjection', shortName: 'Прогноз циклов', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, yAxis }) => {
      const list = chart.getDataList(); if (list.length < 40 || !window.LunTS) return true;
      const key = list.length + ':' + list[list.length - 1].timestamp;
      if (projKey !== key) { projCache = window.LunTS.cycleProjection(list, { k: (window.LUN.TS && window.LUN.TS.cycleK) || 4, projBars: (window.LUN.TS && window.LUN.TS.projBars) || 120 }); projKey = key; }
      const pr = projCache; if (!pr) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(pr.n + pr.projBars, Math.ceil(range.realTo != null ? range.realTo : range.to));
      ctx.strokeStyle = '#c77dff'; ctx.lineWidth = 1.4; ctx.beginPath(); let started = false;
      for (let i = from; i < to; i++) { const y = yAxis.convertToPixel(pr.recon(i)), x = xAxis.convertToPixel(i); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
      ctx.stroke();
      const xNow = xAxis.convertToPixel(pr.n - 1);
      ctx.strokeStyle = 'rgba(199,125,255,0.4)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xNow, 0); ctx.lineTo(xNow, bounding.height); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#c77dff'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillText('прогноз циклов: ' + pr.top.map((t) => t.period).join('·') + ' бар', xNow + 3, 2);
      return true;
    },
  });

  /* ============ Прогностика: метки выбранного астро-события ============ */
  kc.registerIndicator({
    name: 'AstroEventMarks', shortName: 'Астро-метки', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis }) => {
      const M = window.LUN_ASTRO_MARKS; if (!M || !M.events || !M.events.length) return true;
      const list = chart.getDataList(); if (list.length < 2) return true;
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
      if (to - from < 2) return true;
      const H = bounding.height, W = bounding.width, t0 = list[from].timestamp, t1 = list[to - 1].timestamp;
      const idxOf = (ts) => { let a = 0, b = list.length - 1; while (a < b) { const m = (a + b) >> 1; if (list[m].timestamp < ts) a = m + 1; else b = m; } return a; };
      M.events.forEach((ts) => { if (ts < t0 || ts > t1) return; const x = xAxis.convertToPixel(idxOf(ts)); if (x < -2 || x > W + 2) return; ctx.strokeStyle = 'rgba(199,125,255,0.6)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]); });
      ctx.fillStyle = '#c77dff'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText('◆ ' + (M.name || 'событие'), 4, 2);
      return true;
    },
  });
})();
