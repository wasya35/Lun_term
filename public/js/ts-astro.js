/* =============================================================================
 *  ts-astro.js — «астро-фит»: что из астрологии реально работает на инструменте
 * =============================================================================
 *  Идея Timing Solutions «из 42000 линий ложится дюжина»: перебираем астро-
 *  события (ингрессии, станции ретро, фазы Луны, жёсткие аспекты пар, затмения)
 *  и честно считаем, насколько они совпадают с РАЗВОРОТАМИ цены этого
 *  инструмента — против случайного ожидания (охват времени).
 *    hit%    — доля разворотов рядом с событием (в пределах орба по времени)
 *    охват   — доля времени в окне ±орб от событий (базовая вероятность p)
 *    lift    — hit% / охват  (>1 = событие «притягивает» развороты)
 *    z       — биномиальная значимость (hits − n·p)/√(n·p(1−p))
 *  Малая выборка (мало разворотов/событий) — честно помечается «мало данных».
 * ===========================================================================*/
(function () {
  const DAY = 86400000;
  const G = (b) => ((window.LUN.ASTROGANN && window.LUN.ASTROGANN.planets[b]) || { g: b }).g;

  // развороты: локальные экстремумы окна ±k баров (свинг-хай/лоу)
  function detectPivots(bars, k) {
    k = k || 3; const out = [];
    for (let i = k; i < bars.length - k; i++) {
      let hi = true, lo = true;
      for (let j = 1; j <= k; j++) {
        if (bars[i].high < bars[i - j].high || bars[i].high < bars[i + j].high) hi = false;
        if (bars[i].low > bars[i - j].low || bars[i].low > bars[i + j].low) lo = false;
      }
      if (hi || lo) out.push(bars[i].timestamp);
    }
    return out;
  }

  function sep(a, b) { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  const distHard = (a, b) => { const s = sep(a, b); return Math.min(s, Math.abs(s - 90), Math.abs(s - 180)); };

  // все астро-события в [t0,t1] по дневной сетке → { имя: [ts,...] }
  function scanEvents(t0, t1) {
    const AS = window.LunAstro;
    const days = []; for (let t = t0; t <= t1; t += DAY) days.push(t);
    const bodies = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus'];
    const lon = {}, sign = {};
    bodies.forEach((b) => { lon[b] = []; sign[b] = []; for (let i = 0; i < days.length; i++) { const info = AS.bodyInfo(b, days[i], 'geo'); lon[b][i] = info.lon; sign[b][i] = info.signIndex; } });
    const F = {}; const push = (name, ts) => { (F[name] = F[name] || []).push(ts); };
    // ингрессии (смена знака)
    ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].forEach((b) => {
      for (let i = 1; i < days.length; i++) if (sign[b][i] !== sign[b][i - 1]) push('Ингрессии ' + G(b), days[i]);
    });
    // станции (разворот директ↔ретро — смена знака скорости)
    ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].forEach((b) => {
      for (let i = 2; i < days.length; i++) {
        let v1 = lon[b][i] - lon[b][i - 1]; if (v1 > 180) v1 -= 360; else if (v1 < -180) v1 += 360;
        let v0 = lon[b][i - 1] - lon[b][i - 2]; if (v0 > 180) v0 -= 360; else if (v0 < -180) v0 += 360;
        if (v0 * v1 < 0) push('Станции ' + G(b), days[i]);
      }
    });
    // фазы Луны
    for (let i = 1; i < days.length; i++) {
      const e0 = ((lon.Moon[i - 1] - lon.Sun[i - 1]) % 360 + 360) % 360, e1 = ((lon.Moon[i] - lon.Sun[i]) % 360 + 360) % 360;
      if (e0 > 300 && e1 < 60) push('Новолуния ☾', days[i]);
      if (e0 < 180 && e1 >= 180) push('Полнолуния ☾', days[i]);
    }
    // жёсткие аспекты пар (0/90/180) — локальный минимум орб-дистанции < 1.5°
    const pairs = [['Sun', 'Mars'], ['Sun', 'Jupiter'], ['Sun', 'Saturn'], ['Sun', 'Uranus'], ['Mars', 'Jupiter'], ['Mars', 'Saturn'], ['Jupiter', 'Saturn']];
    pairs.forEach(([a, b]) => {
      for (let i = 1; i < days.length - 1; i++) {
        const dm = distHard(lon[a][i], lon[b][i]), dl = distHard(lon[a][i - 1], lon[b][i - 1]), dr = distHard(lon[a][i + 1], lon[b][i + 1]);
        if (dm <= dl && dm < dr && dm < 1.5) push('Аспект ' + G(a) + '–' + G(b), days[i]);
      }
    });
    // затмения
    if (AS.eclipsesBetween) AS.eclipsesBetween(t0, t1).forEach((e) => push(e.kind === 'solar' ? 'Затмения ☉' : 'Затмения ☾', e.ts));
    return F;
  }

  function nearestDist(sorted, tp) {
    let lo = 0, hi = sorted.length - 1, best = Infinity;
    while (lo <= hi) { const m = (lo + hi) >> 1, d = sorted[m] - tp; if (Math.abs(d) < best) best = Math.abs(d); if (d < 0) lo = m + 1; else hi = m - 1; }
    return best;
  }

  function computeAstroFit(bars, opts) {
    opts = opts || {}; const orbDays = opts.orbDays || 3, k = opts.pivotK || 3;
    if (!bars || bars.length < 40 || !window.LunAstro) return { pivots: 0, features: [] };
    const t0 = bars[0].timestamp, t1 = bars[bars.length - 1].timestamp, span = t1 - t0;
    const orbMs = orbDays * DAY;
    const pivots = detectPivots(bars, k), n = pivots.length;
    const F = scanEvents(t0, t1);
    const feats = Object.keys(F).map((name) => {
      const ev = F[name].slice().sort((a, b) => a - b);
      // охват: слияние окон [e−orb, e+orb]
      let cov = 0, curS = -Infinity, curE = -Infinity;
      ev.forEach((e) => { const s = e - orbMs, en = e + orbMs; if (s > curE) { if (curE > curS) cov += curE - curS; curS = s; curE = en; } else curE = Math.max(curE, en); });
      if (curE > curS) cov += curE - curS;
      const p = Math.min(0.99, Math.max(1e-6, cov / span));
      let hits = 0; for (const tp of pivots) if (nearestDist(ev, tp) <= orbMs) hits++;
      const hitRate = n ? hits / n : 0, lift = p > 0 ? hitRate / p : 0;
      const z = n > 0 ? (hits - n * p) / Math.sqrt(n * p * (1 - p)) : 0;
      const enough = n >= 20 && ev.length >= 4;
      const verdict = !enough ? 'мало данных' : (z >= 2 ? 'значимо' : (z >= 1 ? 'слабо' : 'шум'));
      return { name, count: ev.length, hits, hitRate, coverage: p, lift, z, verdict, enough, events: ev };
    });
    feats.sort((a, b) => (b.enough - a.enough) || (b.z - a.z));
    return { pivots: n, from: t0, till: t1, orbDays, features: feats };
  }

  /* --- Прогнозная линия из доминирующих циклов (спектр цены) ---
   * Линейный детренд → периодограмма (наименьшие квадраты по cos/sin для каждого
   * периода P) → топ-K непохожих периодов → сумма синусоид + тренд, продлённая
   * вперёд на projBars. Честно: это модель прошлого ритма, не гарантия. */
  function cycleProjection(bars, opts) {
    opts = opts || {}; const K = opts.k || 4, projBars = opts.projBars || 120, n = bars.length;
    if (n < 40) return null;
    const x = bars.map((b) => b.close);
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += x[i]; sxx += i * i; sxy += i * x[i]; }
    const den = n * sxx - sx * sx, m = den ? (n * sxy - sx * sy) / den : 0, c = (sy - m * sx) / n;
    const resid = x.map((v, i) => v - (m * i + c));
    const pmax = Math.floor(n / 2), comps = [];
    for (let P = 6; P <= pmax; P++) {
      const w = 2 * Math.PI / P; let a = 0, b = 0;
      for (let i = 0; i < n; i++) { a += resid[i] * Math.cos(w * i); b += resid[i] * Math.sin(w * i); }
      a = a * 2 / n; b = b * 2 / n; comps.push({ P, a, b, power: a * a + b * b });
    }
    comps.sort((u, v) => v.power - u.power);
    const top = [];
    for (const cp of comps) { if (top.length >= K) break; if (top.some((t) => Math.abs(t.P - cp.P) / cp.P < 0.12)) continue; top.push(cp); }
    const recon = (i) => { let s = m * i + c; for (const cp of top) { const w = 2 * Math.PI / cp.P; s += cp.a * Math.cos(w * i) + cp.b * Math.sin(w * i); } return s; };
    return { m, c, n, projBars, recon, top: top.map((t) => ({ period: t.P, amp: Math.sqrt(t.a * t.a + t.b * t.b), power: t.power })) };
  }

  /* --- Композит: среднее движение вперёд по астро-состоянию (сезонность) --- */
  function lunarComposite(bars, opts) {
    opts = opts || {}; const H = opts.horizon || 5, mode = opts.mode || 'phase', planet = opts.planet || 'Mercury';
    const AS = window.LunAstro, SIGNS = window.LUN.SIGNS;
    const PH = ['Новолуние', 'Растущий серп', 'I четверть', 'Растущая горбатая', 'Полнолуние', 'Убывающая горбатая', 'III четверть', 'Убывающий серп'];
    const label = (ts) => {
      if (mode === 'phase') { const e = ((AS.bodyInfo('Moon', ts, 'geo').lon - AS.bodyInfo('Sun', ts, 'geo').lon) % 360 + 360) % 360; return (Math.floor(e / 45)) + '·' + PH[Math.floor(e / 45)]; }
      const body = mode === 'moonsign' ? 'Moon' : planet;
      const si = AS.bodyInfo(body, ts, 'geo').signIndex; return (si < 10 ? '0' : '') + si + '·' + SIGNS[si].glyph + ' ' + SIGNS[si].name;
    };
    const groups = {};
    for (let i = 0; i < bars.length - H; i++) {
      const k = label(bars[i].timestamp), r = bars[Math.min(bars.length - 1, i + H)].close / bars[i].close - 1;
      const g = groups[k] || (groups[k] = { sum: 0, cnt: 0, pos: 0 }); g.sum += r; g.cnt++; if (r > 0) g.pos++;
    }
    const rows = Object.keys(groups).sort().map((k) => { const g = groups[k]; return { key: k.split('·').slice(1).join('·'), avg: g.sum / g.cnt, cnt: g.cnt, winRate: g.pos / g.cnt }; });
    return { horizon: H, mode, rows };
  }

  /* --- Merriman FAR: взвешенные астро-значения на экстремумах Filtered Wave ---
   * ZigZag выделяет вершины/основания движения ≥pct%. На каждом экстремуме
   * фиксируем астро-факторы (фаза Луны, знаки Луны/планет). Считаем их частоту
   * на вершинах и основаниях против базовой (по всей истории) → lift. */
  function zigzag(closes, th) {
    const piv = []; let dir = 0, extIdx = 0, extVal = closes[0];
    for (let i = 1; i < closes.length; i++) {
      const p = closes[i];
      if (dir > 0) { if (p > extVal) { extVal = p; extIdx = i; } else if (p <= extVal * (1 - th)) { piv.push({ i: extIdx, kind: 'top' }); dir = -1; extVal = p; extIdx = i; } }
      else if (dir < 0) { if (p < extVal) { extVal = p; extIdx = i; } else if (p >= extVal * (1 + th)) { piv.push({ i: extIdx, kind: 'bottom' }); dir = 1; extVal = p; extIdx = i; } }
      else { if (p >= extVal * (1 + th)) { dir = 1; extVal = p; extIdx = i; } else if (p <= extVal * (1 - th)) { dir = -1; extVal = p; extIdx = i; } }
    }
    return piv;
  }
  const PH8 = ['новолуние', 'раст.серп', 'I четв', 'раст.горб', 'полнолуние', 'уб.горб', 'III четв', 'уб.серп'];
  function factorsAt(ts) {
    const AS = window.LunAstro, S = window.LUN.SIGNS, P = window.LUN.ASTROGANN.planets, out = [];
    const ml = AS.bodyInfo('Moon', ts, 'geo'), sl = AS.bodyInfo('Sun', ts, 'geo');
    out.push('Фаза: ' + PH8[Math.floor((((ml.lon - sl.lon) % 360 + 360) % 360) / 45)]);
    out.push('☾ в ' + S[ml.signIndex].name);
    ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].forEach((p) => { out.push(((P[p] || {}).g || p) + ' в ' + S[AS.bodyInfo(p, ts, 'geo').signIndex].name); });
    return out;
  }
  function computeFAR(bars, opts) {
    opts = opts || {}; const pct = opts.pct || 3;
    if (!bars || bars.length < 60 || !window.LunAstro) return { tops: [], bottoms: [], nTops: 0, nBottoms: 0, pct };
    const closes = bars.map((b) => b.close), piv = zigzag(closes, pct / 100);
    const step = bars.length > 3000 ? 2 : 1, base = {}; let baseTot = 0;
    for (let i = 0; i < bars.length; i += step) { baseTot++; factorsAt(bars[i].timestamp).forEach((f) => { base[f] = (base[f] || 0) + 1; }); }
    const topC = {}, botC = {}; let nT = 0, nB = 0;
    piv.forEach((p) => { const fs = factorsAt(bars[p.i].timestamp); if (p.kind === 'top') { nT++; fs.forEach((f) => topC[f] = (topC[f] || 0) + 1); } else { nB++; fs.forEach((f) => botC[f] = (botC[f] || 0) + 1); } });
    const rank = (cnt, n) => Object.keys(cnt).map((f) => { const rate = cnt[f] / n, br = (base[f] || 0.5) / baseTot; return { factor: f, count: cnt[f], lift: br > 0 ? rate / br : 0 }; })
      .filter((x) => x.count >= Math.max(3, Math.round(n * 0.12))).sort((a, b) => b.lift - a.lift).slice(0, 12);
    return { pct, nTops: nT, nBottoms: nB, tops: rank(topC, nT), bottoms: rank(botC, nB) };
  }

  window.LunTS = { computeAstroFit, detectPivots, cycleProjection, lunarComposite, computeFAR };
})();
