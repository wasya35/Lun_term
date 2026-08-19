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
      return { name, count: ev.length, hits, hitRate, coverage: p, lift, z, verdict, enough };
    });
    feats.sort((a, b) => (b.enough - a.enough) || (b.z - a.z));
    return { pivots: n, from: t0, till: t1, orbDays, features: feats };
  }

  window.LunTS = { computeAstroFit, detectPivots };
})();
