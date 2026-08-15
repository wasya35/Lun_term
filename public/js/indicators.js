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
    { name: 'соединение', sym: '☌', angle: 0,   kind: 'hard', color: '#c0392b' },
    { name: 'секстиль',   sym: '⚹', angle: 60,  kind: 'soft', color: '#2c6fb0' },
    { name: 'квадрат',    sym: '□', angle: 90,  kind: 'hard', color: '#c0392b' },
    { name: 'трин',       sym: '△', angle: 120, kind: 'soft', color: '#2c6fb0' },
    { name: 'оппозиция',  sym: '☍', angle: 180, kind: 'hard', color: '#c0392b' },
  ];
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
})();
