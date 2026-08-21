/* =============================================================================
 *  montecarlo.js — движок честной проверки гипотез (window.LunMC)
 * =============================================================================
 *  Отвечает на один вопрос: «разворачивается ли цена вблизи дат события чаще,
 *  чем при случайности?» — через event-study lift + перестановочный p-value.
 *
 *    lift = P(разворот | окно события) / P(разворот вообще)
 *    p    = доля из N случайных выборок дат той же численности, давших lift
 *           не меньше наблюдаемого. Устойчив к автокорреляции (в отличие от t).
 *
 *  Ничего не «предсказывает» — только измеряет, отличается ли ряд от шума.
 *  Малый n и p≈1 — честный ответ «не отличается». ЭКСПЕРИМЕНТ, не сигнал.
 * ===========================================================================*/
(function () {
  // зигзаг-пивоты: индексы вершин/оснований при развороте ≥ pct% от экстремума
  function detectPivots(bars, pct) {
    pct = (pct || 3) / 100; const piv = [];
    if (!bars || bars.length < 3) return piv;
    let dir = 1, extI = 0, extP = bars[0].close;          // старт: ищем вершину
    for (let i = 1; i < bars.length; i++) {
      const p = bars[i].close;
      if (dir >= 0) {                                      // тренд вверх: обновляем максимум
        if (p >= extP) { extP = p; extI = i; }
        else if (p <= extP * (1 - pct)) { piv.push(extI); dir = -1; extP = p; extI = i; }
      } else {                                             // тренд вниз: обновляем минимум
        if (p <= extP) { extP = p; extI = i; }
        else if (p >= extP * (1 + pct)) { piv.push(extI); dir = 1; extP = p; extI = i; }
      }
    }
    return piv;
  }

  // булева маска «бар рядом с пивотом» (±win)
  function nearMask(N, pivotIdx, win) {
    const m = new Array(N).fill(false);
    pivotIdx.forEach((p) => { for (let k = -win; k <= win; k++) { const j = p + k; if (j >= 0 && j < N) m[j] = true; } });
    return m;
  }

  // случайные k различных индексов из [0,N)
  function sample(N, k) {
    const s = new Set(); while (s.size < k && s.size < N) s.add(Math.floor(Math.random() * N)); return [...s];
  }

  // основной тест: eventIdx — индексы баров-событий, near — маска близости к пивоту
  function liftTest(N, eventIdx, near, sims) {
    sims = sims || 2000;
    const nE = eventIdx.length;
    if (!nE || !N) return { n: nE, lift: null, p: null, base: null, hitRate: null };
    let base = 0; for (let i = 0; i < N; i++) if (near[i]) base++; base /= N;
    if (base <= 0 || base >= 1) return { n: nE, lift: null, p: null, base: base, hitRate: null };
    let hits = 0; eventIdx.forEach((i) => { if (near[i]) hits++; });
    const hitRate = hits / nE, lift = hitRate / base;
    let ge = 0;
    for (let s = 0; s < sims; s++) {
      const idx = sample(N, nE); let h = 0;
      for (let j = 0; j < idx.length; j++) if (near[idx[j]]) h++;
      if ((h / nE) >= hitRate) ge++;
    }
    const p = (ge + 1) / (sims + 1);
    return { n: nE, hits: hits, hitRate: hitRate, base: base, lift: lift, p: p, sims: sims };
  }

  // событие = экстремумы скалярного ряда series[] (верхний/нижний хвост по |z|)
  // frac — доля баров, попадающих в «событие» (напр. 0.1 = верхний+нижний дециль)
  function eventsFromSeries(series, frac, twoSided) {
    const vals = series.map((v, i) => [v, i]).filter((x) => isFinite(x[0]));
    if (!vals.length) return [];
    const n = Math.max(1, Math.round(vals.length * (frac || 0.1)));
    if (twoSided === false) { // только максимумы
      vals.sort((a, b) => b[0] - a[0]); return vals.slice(0, n).map((x) => x[1]);
    }
    const byAbs = vals.slice().sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
    return byAbs.slice(0, n).map((x) => x[1]);
  }

  // высокоуровневая обёртка: ряд + бары → полный вердикт
  function testSeries(bars, series, opts) {
    opts = opts || {};
    const N = bars.length;
    const piv = detectPivots(bars, opts.pct || 3);
    const near = nearMask(N, piv, opts.win || 2);
    const ev = eventsFromSeries(series, opts.frac || 0.1, opts.twoSided);
    const r = liftTest(N, ev, near, opts.sims || 2000);
    r.pivots = piv.length; return r;
  }

  window.LunMC = { detectPivots, nearMask, liftTest, eventsFromSeries, testSeries, sample };
})();
