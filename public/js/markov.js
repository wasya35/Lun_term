/* =============================================================================
 *  markov.js — марковский режимный движок (window.LunMarkov)
 * =============================================================================
 *  Этап 1 (ядро): классификация ценового режима BEAR/SIDE/BULL, матрица
 *  переходов СТРОГО по прошлому, матричная алгебра (P^n — единственный способ
 *  многошагового прогноза), сигнал с интервалом Уилсона, walk-forward и
 *  астро-ось как второе измерение состояния.
 *
 *  Подключать ПОСЛЕ astro.js и ДО indicators.js. Ошибки первоисточника (см. ТЗ)
 *  не воспроизводим: только матричное возведение в степень, стационарное
 *  распределение считаем отдельно, малая выборка глушит сигнал.
 * ===========================================================================*/
(function () {
  const LUN = window.LUN || {};
  const cfg = () => (LUN.MARKOV) || {};

  /* ------------------------------------------------------------------ *
   *  4.1 Классификация состояний
   * ------------------------------------------------------------------ */

  // Ценовой режим по каждому бару: 0=BEAR, 1=SIDE, 2=BULL, -1=не определено.
  // Пороги для бара i считаются по доходностям баров [i-thrLookback .. i-1] —
  // текущий бар в оценку порога НЕ входит (дисциплина walk-forward).
  function priceStates(bars, opt) {
    const O = Object.assign({ window: 20, thrMode: 'sigma', sigmaK: 1.0, qLow: 33, qHigh: 67, fixedPct: 5, thrLookback: 500 }, cfg(), opt || {});
    const W = O.window, mode = O.thrMode, k = O.sigmaK, LB = O.thrLookback;
    const fixed = O.fixedPct / 100, qLo = O.qLow, qHi = O.qHigh;
    const N = bars.length;
    const st = new Int8Array(N).fill(-1);
    // ряд доходностей окна: r[i] = close[i]/close[i-W] - 1
    const r = new Float64Array(N), has = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (i - W < 0) continue;
      const c0 = bars[i - W].close, c1 = bars[i].close;
      if (c0 > 0 && c1 > 0) { r[i] = c1 / c0 - 1; has[i] = 1; }
    }
    for (let i = 0; i < N; i++) {
      if (!has[i]) continue;
      let thrLo, thrHi;
      if (mode === 'fixed') { thrLo = -fixed; thrHi = fixed; }
      else {
        const lo = Math.max(0, i - LB);
        if (mode === 'quantile') {
          const arr = [];
          for (let j = lo; j < i; j++) if (has[j]) arr.push(r[j]);
          if (arr.length < 10) continue;
          arr.sort((a, b) => a - b);
          thrLo = arr[Math.floor((qLo / 100) * (arr.length - 1))];
          thrHi = arr[Math.floor((qHi / 100) * (arr.length - 1))];
        } else { // sigma (по умолчанию), центр в 0
          let sum = 0, sq = 0, cnt = 0;
          for (let j = lo; j < i; j++) { if (!has[j]) continue; sum += r[j]; sq += r[j] * r[j]; cnt++; }
          if (cnt < 10) continue;
          const mean = sum / cnt, varr = Math.max(0, sq / cnt - mean * mean), sd = Math.sqrt(varr);
          thrLo = -k * sd; thrHi = k * sd;
        }
      }
      const v = r[i];
      st[i] = v > thrHi ? 2 : (v < thrLo ? 0 : 1);
    }
    return st;
  }

  // Астро-ось. provider: 'none'|'cycleZone'|'moonSign'|'moonElement'|'moonHalf'|'aspect'.
  function astroStates(bars, opt) {
    opt = opt || {};
    const provider = opt.provider || 'none';
    const N = bars.length;
    const labels = new Int8Array(N).fill(-1);
    const A = window.LunAstro;
    if (provider === 'none' || !A) return { labels, size: 1, names: ['·'] };
    if (provider === 'cycleZone') {
      const cyc = (LUN.CYCLES || []).find((c) => c.id === (opt.cycleId || 'cycle1'));
      const zones = cyc ? cyc.zones : [];
      const biasIdx = { short: 0, range: 1, long: 2 };
      for (let i = 0; i < N; i++) { const z = A.zoneOf(A.moonInfo(bars[i].timestamp).lon, zones); labels[i] = z ? biasIdx[z.bias] : -1; }
      return { labels, size: 3, names: ['шорт-зона', 'рэндж', 'лонг-зона'] };
    }
    if (provider === 'moonElement') {           // стихия = signIndex % 4
      for (let i = 0; i < N; i++) labels[i] = A.moonInfo(bars[i].timestamp).signIndex % 4;
      return { labels, size: 4, names: ['огонь', 'земля', 'воздух', 'вода'] };
    }
    if (provider === 'moonHalf') {
      for (let i = 0; i < N; i++) labels[i] = A.moonInfo(bars[i].timestamp).degInSign < 15 ? 0 : 1;
      return { labels, size: 2, names: ['0–15°', '15–30°'] };
    }
    if (provider === 'aspect') {
      const B = LUN.ASPECTS || {};
      const acfg = { bodyA: B.bodyA || 'Sun', bodyB: B.bodyB || 'Mercury', frame: B.frame || 'helio', orb: B.orb || 3 };
      for (let i = 0; i < N; i++) { const r = window.LUN_ASPECT_AT ? window.LUN_ASPECT_AT(bars[i].timestamp, acfg) : null; labels[i] = (r && r.asp) ? 1 : 0; }
      return { labels, size: 2, names: ['без аспекта', 'аспект в орбе'] };
    }
    if (provider === 'moonSign') {
      for (let i = 0; i < N; i++) labels[i] = A.moonInfo(bars[i].timestamp).signIndex;
      return { labels, size: 12, names: (LUN.SIGNS || []).map((s) => s.name) };
    }
    return { labels, size: 1, names: ['·'] };
  }

  // Композиция: k = price*astroSize + astro. Астро отключено -> k = price.
  const PNAMES = ['BEAR', 'SIDE', 'BULL'];
  function composeStates(price, astro) {
    const N = price.length;
    const aSize = astro ? astro.size : 1, aLab = (astro && astro.size > 1) ? astro.labels : null;
    const size = 3 * aSize;
    const labels = new Int16Array(N).fill(-1);
    const names = [];
    const aNames = astro ? astro.names : ['·'];
    for (let p = 0; p < 3; p++) for (let a = 0; a < aSize; a++) names.push(aSize > 1 ? PNAMES[p] + '·' + aNames[a] : PNAMES[p]);
    for (let i = 0; i < N; i++) {
      const p = price[i], a = aLab ? aLab[i] : 0;
      labels[i] = (p < 0 || (aLab && a < 0)) ? -1 : p * aSize + a;
    }
    return { labels, size, names };
  }

  /* ------------------------------------------------------------------ *
   *  4.2 Матрица переходов (строго по прошлому)
   * ------------------------------------------------------------------ */
  function transitionMatrix(states, opt) {
    const size = opt.size, step = opt.step || 1, grid = opt.sampleMode === 'grid';
    const upTo = opt.upTo != null ? opt.upTo : states.length - 1;
    const counts = new Float64Array(size * size);
    const add = (a, b) => { const s = states[a], e = states[b]; if (s >= 0 && e >= 0) counts[s * size + e]++; };
    if (grid) { for (let t = 0; t + step <= upTo; t += step) add(t, t + step); }
    else { for (let t = 0; t + step <= upTo; t++) add(t, t + step); }
    const { prob, rowN, rowNeff } = finalize(counts, size, step, grid);
    return { counts, prob, rowN, rowNeff };
  }

  // counts -> нормированные вероятности + сырое/эффективное число наблюдений.
  function finalize(counts, size, step, grid) {
    const prob = new Float64Array(size * size), rowN = new Float64Array(size), rowNeff = new Float64Array(size);
    for (let r = 0; r < size; r++) {
      let sum = 0; for (let c = 0; c < size; c++) sum += counts[r * size + c];
      rowN[r] = sum;
      rowNeff[r] = grid ? sum : sum / (step || 1);       // перекрытие allLag: n_эфф = n/step
      if (sum > 0) for (let c = 0; c < size; c++) prob[r * size + c] = counts[r * size + c] / sum;
      else for (let c = 0; c < size; c++) prob[r * size + c] = 1 / size;   // пустая строка -> равномерно
    }
    return { prob, rowN, rowNeff };
  }

  /* ------------------------------------------------------------------ *
   *  4.3 Матричная алгебра — P^n единственный способ многошагового прогноза
   * ------------------------------------------------------------------ */
  function matMul(a, b, size) {
    const o = new Float64Array(size * size);
    for (let i = 0; i < size; i++) for (let k = 0; k < size; k++) {
      const aik = a[i * size + k]; if (aik === 0) continue;
      for (let j = 0; j < size; j++) o[i * size + j] += aik * b[k * size + j];
    }
    return o;
  }
  function identity(size) { const o = new Float64Array(size * size); for (let i = 0; i < size; i++) o[i * size + i] = 1; return o; }
  function matPow(p, n, size) {
    if (n <= 0) return identity(size);
    let result = identity(size), base = p.slice(), e = n;
    while (e > 0) { if (e & 1) result = matMul(result, base, size); e >>= 1; if (e > 0) base = matMul(base, base, size); }
    return result;
  }
  function stationary(p, size) { const pn = matPow(p, 256, size); const out = new Float64Array(size); for (let c = 0; c < size; c++) out[c] = pn[c]; return out; }

  /* ------------------------------------------------------------------ *
   *  4.4 Сигнал (с интервалом Уилсона)
   * ------------------------------------------------------------------ */
  const Z = 1.959964;
  function wilsonHalf(p, n) {
    if (!(n > 0)) return 1;
    const z2 = Z * Z;
    return (Z / (1 + z2 / n)) * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n));
  }
  // Pbull/Pbear по строке через ЦЕНОВУЮ компоненту (price-часть 2 = BULL, 0 = BEAR).
  function priceProb(row, size, priceSize) {
    const aSize = size / priceSize; let bull = 0, bear = 0;
    for (let j = 0; j < size; j++) { const pc = Math.floor(j / aSize); if (pc === priceSize - 1) bull += row[j]; else if (pc === 0) bear += row[j]; }
    return { bull, bear };
  }
  function signalAt(m, stateIdx, opt) {
    const size = opt.size, priceSize = opt.priceSize || 3, horizon = opt.horizon || 5, minObs = opt.minObs || 20, deadZone = opt.deadZone || 0;
    const prob = m.prob, rowNeff = m.rowNeff;
    const row = prob.subarray(stateIdx * size, stateIdx * size + size);
    const pp = priceProb(row, size, priceSize);
    const signal = pp.bull - pp.bear;
    const pn = matPow(prob, horizon, size);
    const ppN = priceProb(pn.subarray(stateIdx * size, stateIdx * size + size), size, priceSize);
    const signalN = ppN.bull - ppN.bear;
    const stickiness = row[stateIdx];
    const neff = rowNeff[stateIdx];
    const hb = wilsonHalf(pp.bull, neff), hbear = wilsonHalf(pp.bear, neff);
    const ci = Math.sqrt(hb * hb + hbear * hbear);
    const reliable = neff >= minObs;
    const significant = Math.abs(signal) > ci;
    const tradable = reliable && significant && Math.abs(signal) >= deadZone;
    const dir = signal > 0 ? 'ЛОНГ' : (signal < 0 ? 'ШОРТ' : '—');
    const verdict = !reliable ? ('мало данных (n_эфф ' + neff.toFixed(0) + ')')
      : (!significant ? 'в пределах шума' : (!tradable ? 'слабый сигнал' : ('РАЗРЕШЁН ' + dir)));
    return { signal, signalN, stickiness, neff, ci, reliable, significant, tradable, verdict };
  }

  /* ------------------------------------------------------------------ *
   *  4.5 Walk-forward (инкрементально, без заглядывания вперёд)
   * ------------------------------------------------------------------ */
  function walkForward(bars, opt) {
    const O = Object.assign({
      window: 20, step: 0, thrMode: 'sigma', sigmaK: 1.0, qLow: 33, qHigh: 67, fixedPct: 5, thrLookback: 500,
      astroProvider: 'none', cycleId: 'cycle1', sampleMode: 'allLag', minObs: 20, horizon: 5, deadZone: 0.10,
    }, cfg(), opt || {});
    const W = O.window, step = O.step > 0 ? O.step : W, grid = O.sampleMode === 'grid';
    const price = priceStates(bars, O);
    const astro = astroStates(bars, { provider: O.astroProvider, cycleId: O.cycleId });
    const comp = composeStates(price, astro);
    const states = comp.labels, size = comp.size, N = bars.length;
    const counts = new Float64Array(size * size);
    const signal = new Float64Array(N), signalN = new Float64Array(N), neff = new Float64Array(N), tradable = new Uint8Array(N);
    const sigOpt = { size, priceSize: 3, horizon: O.horizon, minObs: O.minObs, deadZone: O.deadZone };
    for (let i = 0; i < N; i++) {
      // переход, ЗАКАНЧИВАЮЩИЙСЯ на i, становится доступен именно сейчас
      const t = i - step;
      if (t >= 0 && (!grid || i % step === 0)) { const s = states[t], e = states[i]; if (s >= 0 && e >= 0) counts[s * size + e]++; }
      const st = states[i];
      if (st < 0) { continue; }
      const m = finalize(counts, size, step, grid);
      const r = signalAt(m, st, sigOpt);
      signal[i] = r.signal; signalN[i] = r.signalN; neff[i] = r.neff; tradable[i] = r.tradable ? 1 : 0;
    }
    return { signal, signalN, state: Int16Array.from(states), neff, tradable, size, names: comp.names, priceStates: price };
  }

  /* ------------------------------------------------------------------ *
   *  Самопроверки (критерии приёмки 1–3, 5). Вызов: LunMarkov.selfTest()
   * ------------------------------------------------------------------ */
  function selfTest() {
    const out = [];
    const ok = (name, cond) => { out.push((cond ? 'PASS ✓' : 'FAIL ✗') + ' — ' + name); return cond; };
    const size = 3;
    const states = new Int16Array(300); for (let i = 0; i < 300; i++) states[i] = i % 3;
    const m = transitionMatrix(states, { size, step: 1, sampleMode: 'allLag', upTo: 299 });
    let rs = true; for (let r = 0; r < size; r++) { let s = 0; for (let c = 0; c < size; c++) s += m.prob[r * size + c]; if (Math.abs(s - 1) > 1e-9) rs = false; }
    ok('строки матрицы суммируются в 1 (1e-9)', rs);
    // эргодическая (апериодичная, неприводимая) матрица — сходится к стационару
    const P = Float64Array.from([0.70, 0.20, 0.10, 0.15, 0.70, 0.15, 0.10, 0.30, 0.60]);
    let e1 = true; const p1 = matPow(P, 1, size); for (let x = 0; x < size * size; x++) if (Math.abs(p1[x] - P[x]) > 1e-12) e1 = false; ok('matPow(P,1) == P', e1);
    let e2 = true; const p2 = matPow(P, 2, size), pm = matMul(P, P, size); for (let x = 0; x < size * size; x++) if (Math.abs(p2[x] - pm[x]) > 1e-12) e2 = false; ok('matPow(P,2) == P·P', e2);
    const p256 = matPow(P, 256, size); let e3 = true; for (let c = 0; c < size; c++) for (let r = 1; r < size; r++) if (Math.abs(p256[r * size + c] - p256[c]) > 1e-6) e3 = false; ok('P^256 строки равны (стационарность 1e-6)', e3);
    // нет заглядывания вперёд: walkForward[i] == batch(upTo=i)
    const bars = []; let price = 100; for (let i = 0; i < 600; i++) { price *= (1 + Math.sin(i / 15) * 0.01); bars.push({ timestamp: i * 86400000, open: price, high: price * 1.01, low: price * 0.99, close: price, volume: 1000 }); }
    const opt = { window: 10, step: 10, thrMode: 'sigma', sigmaK: 1, thrLookback: 200, astroProvider: 'none', sampleMode: 'allLag', minObs: 5, horizon: 3, deadZone: 0 };
    const wf = walkForward(bars, opt);
    const ps = priceStates(bars, opt); const i = 500;
    const mb = transitionMatrix(Int16Array.from(ps), { size: 3, step: 10, sampleMode: 'allLag', upTo: i });
    const idx = ps[i] < 0 ? 1 : ps[i];
    const rb = signalAt(mb, idx, { size: 3, priceSize: 3, horizon: 3, minObs: 5, deadZone: 0 });
    ok('нет заглядывания вперёд (walkForward[i] == batch@i)', ps[i] < 0 || Math.abs(rb.signal - wf.signal[i]) < 1e-9);
    // малая выборка глушит сигнал
    const mSmall = transitionMatrix(Int16Array.from([0, 2, 0, 2]), { size: 3, step: 1, sampleMode: 'allLag', upTo: 3 });
    const rSmall = signalAt(mSmall, 0, { size: 3, priceSize: 3, horizon: 2, minObs: 20, deadZone: 0 });
    ok('малая выборка глушит сигнал (tradable=false)', rSmall.tradable === false);
    const pass = out.every((l) => l.indexOf('PASS') === 0);
    (typeof console !== 'undefined') && console.log('[LunMarkov.selfTest] ' + (pass ? 'ВСЁ PASS' : 'ЕСТЬ FAIL') + '\n' + out.join('\n'));
    return { pass, lines: out };
  }

  // Кэш walkForward: рисование полосы/панели зовётся на каждый кадр — считаем
  // один раз на (длина+последний ts+конфиг), пока данные/настройки не сменились.
  let _wf = null, _wfKey = '';
  function walkForwardCached(bars, opt) {
    if (!bars || !bars.length) return walkForward(bars || [], opt);
    const key = bars.length + ':' + bars[bars.length - 1].timestamp + ':' + JSON.stringify(opt || cfg());
    if (_wfKey === key && _wf) return _wf;
    _wf = walkForward(bars, opt); _wfKey = key; return _wf;
  }

  window.LunMarkov = {
    priceStates, astroStates, composeStates,
    transitionMatrix, matMul, matPow, stationary,
    signalAt, walkForward, walkForwardCached, selfTest,
  };
})();
