/* =============================================================================
 *  research.js — исследование сигналов (window.LunResearch)
 * =============================================================================
 *  Единый бэктест-фреймворк: каждый сигнал = функция(bars, ctx) → [{i, dir}]
 *  (dir +1 лонг / −1 шорт). Считаем доходность вперёд на нескольких горизонтах:
 *    win%  — доля входов, где dir·движение > 0
 *    ср%   — среднее dir·(доходность в %)
 *    t     — t-стат (ср / (σ/√n)); |t|≥2 ≈ значимо
 *  Малая выборка (n<30) честно помечается. Считается на ЗАГРУЖЕННЫХ данных —
 *  меняй инструмент/ТФ/период и сравнивай. Легко добавить свой сигнал в SIGNALS.
 * ===========================================================================*/
(function () {
  function ema(vals, n) { const k = 2 / (n + 1), out = []; let e = vals[0]; for (let i = 0; i < vals.length; i++) { e = i ? vals[i] * k + e * (1 - k) : vals[i]; out[i] = e; } return out; }
  function smaAt(arr, i, n) { if (i < n - 1) return null; let s = 0; for (let k = 0; k < n; k++) s += arr[i - k]; return s / n; }
  function rsi(closes, n) {
    const out = new Array(closes.length).fill(null); let ag = 0, al = 0;
    for (let i = 1; i < closes.length; i++) {
      const ch = closes[i] - closes[i - 1], up = Math.max(0, ch), dn = Math.max(0, -ch);
      if (i <= n) { ag += up; al += dn; if (i === n) { ag /= n; al /= n; out[i] = 100 - 100 / (1 + (al === 0 ? 100 : ag / al)); } }
      else { ag = (ag * (n - 1) + up) / n; al = (al * (n - 1) + dn) / n; out[i] = 100 - 100 / (1 + (al === 0 ? 100 : ag / al)); }
    }
    return out;
  }

  const SIGNALS = [
    { key: 'vol2x', name: 'Объём ≥2× среднего(10)', group: 'Объём', gen: (b, c) => { const o = []; for (let i = 10; i < b.length; i++) { const m = smaAt(c.vols, i - 1, 10); if (m && b[i].volume >= 2 * m) o.push({ i, dir: b[i].close >= b[i].open ? 1 : -1 }); } return o; } },
    { key: 'vol3x', name: 'Объём ≥3× среднего(10) (силища)', group: 'Объём', gen: (b, c) => { const o = []; for (let i = 10; i < b.length; i++) { const m = smaAt(c.vols, i - 1, 10); if (m && b[i].volume >= 3 * m) o.push({ i, dir: b[i].close >= b[i].open ? 1 : -1 }); } return o; } },
    { key: 'emaCross', name: 'EMA9 × EMA21 (пересечение)', group: 'Тренд', gen: (b, c) => { const o = []; for (let i = 1; i < b.length; i++) { const a0 = c.ema9[i - 1] - c.ema21[i - 1], a1 = c.ema9[i] - c.ema21[i]; if (a0 <= 0 && a1 > 0) o.push({ i, dir: 1 }); else if (a0 >= 0 && a1 < 0) o.push({ i, dir: -1 }); } return o; } },
    { key: 'ema50', name: 'Цена пересекает EMA50', group: 'Тренд', gen: (b, c) => { const o = []; for (let i = 1; i < b.length; i++) { const p = b[i - 1].close - c.ema50[i - 1], n = b[i].close - c.ema50[i]; if (p <= 0 && n > 0) o.push({ i, dir: 1 }); else if (p >= 0 && n < 0) o.push({ i, dir: -1 }); } return o; } },
    { key: 'rsi', name: 'RSI(14) выход из 30/70', group: 'Осцилляторы', gen: (b, c) => { const o = []; for (let i = 1; i < b.length; i++) { const p = c.rsi[i - 1], n = c.rsi[i]; if (p == null || n == null) continue; if (p < 30 && n >= 30) o.push({ i, dir: 1 }); else if (p > 70 && n <= 70) o.push({ i, dir: -1 }); } return o; } },
    { key: 'breakout20', name: 'Пробой макс/мин 20 баров', group: 'Пробой', gen: (b) => { const o = []; for (let i = 20; i < b.length; i++) { let hh = -Infinity, ll = Infinity; for (let k = 1; k <= 20; k++) { hh = Math.max(hh, b[i - k].high); ll = Math.min(ll, b[i - k].low); } if (b[i].close > hh) o.push({ i, dir: 1 }); else if (b[i].close < ll) o.push({ i, dir: -1 }); } return o; } },
    { key: 'moonZone', name: 'Смена лунной зоны цикла (лонг/шорт)', group: 'Астро', gen: (b) => {
      const o = []; const c1 = window.LUN.CYCLES && window.LUN.CYCLES[0]; if (!c1 || !window.LunAstro) return o;
      let prev = null;
      for (let i = 0; i < b.length; i++) { const lon = window.LunAstro.bodyInfo(c1.body || 'Moon', b[i].timestamp, 'geo').lon; const z = window.LunAstro.zoneOf(lon, c1.zones); const bias = z ? z.bias : null; if (bias && bias !== prev && (bias === 'long' || bias === 'short')) o.push({ i, dir: bias === 'long' ? 1 : -1 }); prev = bias; } return o; } },
  ];

  function statFor(closes, entries, H) {
    const rs = [];
    for (const e of entries) { const j = e.i + H; if (j >= closes.length) continue; const r = e.dir * (closes[j] - closes[e.i]) / closes[e.i]; if (isFinite(r)) rs.push(r); }
    const n = rs.length; if (!n) return { n: 0 };
    const avg = rs.reduce((a, x) => a + x, 0) / n;
    const win = rs.filter((x) => x > 0).length / n;
    const sd = Math.sqrt(rs.reduce((a, x) => a + (x - avg) * (x - avg), 0) / n) || 1e-9;
    const t = avg / (sd / Math.sqrt(n));
    return { n, avg, win, t };
  }

  function run(bars, keys, horizons) {
    horizons = horizons || [1, 3, 5, 10];
    if (!bars || bars.length < 40) return { rows: [], horizons };
    const closes = bars.map((b) => b.close), vols = bars.map((b) => b.volume || 0);
    const ctx = { closes, vols, ema9: ema(closes, 9), ema21: ema(closes, 21), ema50: ema(closes, 50), rsi: rsi(closes, 14) };
    const rows = SIGNALS.filter((s) => !keys || keys.indexOf(s.key) >= 0).map((s) => {
      let entries = []; try { entries = s.gen(bars, ctx) || []; } catch (e) { entries = []; }
      const perH = {}; horizons.forEach((H) => { perH[H] = statFor(closes, entries, H); });
      return { key: s.key, name: s.name, group: s.group, count: entries.length, perH };
    });
    return { rows, horizons, bars: bars.length };
  }

  window.LunResearch = { SIGNALS, run };
})();
