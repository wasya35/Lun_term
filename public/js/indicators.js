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
      const G = window.LUN.BODY_GLYPH, H = bounding.height, list = chart.getDataList();
      const period = chart.getPeriod ? chart.getPeriod() : null;
      const detailed = period && period.type === 'minute';       // подробно на M5/M15
      const memo = new Map();
      const actsAt = (ts) => { const k = Math.floor(ts / 60000); let v = memo.get(k); if (!v) { v = allActiveAspects(ts, bodies, orb); memo.set(k, v); } return v; };

      // фон + цветные метки аспектов сверху
      forEachVisibleBar(chart, xAxis, (i, x, half, bar) => {
        const acts = actsAt(bar.timestamp);
        ctx.fillStyle = acts.some((z) => z.asp.kind === 'hard') ? '#33202b' : (acts.length ? '#1e2a3a' : '#191d26');
        ctx.fillRect(x - half, 0, half * 2 + 0.6, H);
        if (acts.length) { const seg = (half * 2) / acts.length; acts.forEach((z, k) => { ctx.fillStyle = z.asp.color; ctx.fillRect(x - half + k * seg, 0, seg + 0.5, 4); }); }
      });

      if (detailed) {                                            // подписи только на минутках
        ctx.textBaseline = 'middle'; ctx.font = '10px system-ui, sans-serif';
        const sig = (ts) => actsAt(ts).map((z) => G[z.a] + z.asp.sym + G[z.b]).sort().join(' ');
        runsOverVisible(chart, xAxis, (bar) => sig(bar.timestamp),
          (startI, endI, midX, leftX, rightX) => {
            const acts = actsAt(list[endI].timestamp); if (!acts.length) return;
            const parts = acts.map((z) => `${G[z.a]}${z.asp.sym}${G[z.b]}`);
            let label = parts.join(' ');
            if (rightX - leftX < ctx.measureText(label).width + 6) label = parts[0];   // не влезло — первый
            if (rightX - leftX < ctx.measureText(label).width + 4) return;
            ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.textAlign = 'center';
            ctx.fillText(label, midX, H / 2);
          });
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
})();
