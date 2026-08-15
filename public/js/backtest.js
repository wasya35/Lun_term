/* =============================================================================
 *  backtest.js — сверка лунных зон и аспектов с историей USD/RUB
 * =============================================================================
 *  Зоны трактуются как СКЛОННОСТЬ направления (в лонг-зоне отрабатывают лонги,
 *  в шорт-зоне — шорты), поэтому меряем не дрейф close→close, а винрейт
 *  ВНУТРИДНЕВНОГО движения (open→close) в сторону зоны.
 *  Плюс: выбор периода (истина последних лет / без 2022), тест аспектов
 *  Меркурий–Солнце (голубые=продолжение, красные=разворот) и заметка по 15°.
 *  Данные: дневные OHLC USD/RUB (валютный рынок MOEX, USD000UTSTOM).
 * ===========================================================================*/
(function () {
  const state = { bars: null };
  const biasSign = (b) => (b === 'long' ? 1 : (b === 'short' ? -1 : 0));
  const y2022 = (ts) => new Date(ts).getUTCFullYear() === 2022;

  function filterBars(bars, opts) {
    opts = opts || {};
    return bars.filter((b) => {
      if (opts.fromTs && b.timestamp < opts.fromTs) return false;
      if (opts.toTs && b.timestamp > opts.toTs) return false;
      if (opts.exclude2022 && y2022(b.timestamp)) return false;
      return true;
    });
  }

  const zScore = (p, n) => (n > 0 ? (p - 0.5) / Math.sqrt(0.25 / n) : 0);

  /* --- анализ зон/знаков по ВИНРЕЙТУ направления (интрадей) --- */
  function analyze(allBars, zones, opts) {
    const moonFn = (opts && opts.moonFn) || window.LunAstro.moonInfo;
    const bars = filterBars(allBars, opts);
    const zoneOf = (lon) => window.LunAstro.zoneOf(lon, zones);
    const zAgg = new Map();
    zones.forEach((z) => zAgg.set(z.label + '|' + z.from, { z, nDir: 0, hit: 0, sumIo: 0, sumCC: 0, nCC: 0 }));
    const signAgg = Array.from({ length: 12 }, () => ({ n: 0, up: 0, sumIo: 0, half: [0, 0], halfN: [0, 0], halfUp: [0, 0] }));
    let stratCum = 1, bhCum = 1, baseUp = 0, baseN = 0;

    for (let i = 1; i < bars.length; i++) {
      const b = bars[i], pc = bars[i - 1].close;
      if (!(b.open > 0) || !(b.close > 0) || !(pc > 0)) continue;
      const io = b.close / b.open - 1;            // внутридневное движение
      const cc = b.close / pc - 1;                // close→close
      if (Math.abs(io) > 0.5 || Math.abs(cc) > 0.5) continue;
      const m = moonFn(b.timestamp);
      baseN++; if (io > 0) baseUp++; bhCum *= (1 + io);
      // знаки
      const s = signAgg[m.signIndex]; s.n++; if (io > 0) s.up++; s.sumIo += io;
      const h = m.degInSign < 15 ? 0 : 1; s.half[h] += io; s.halfN[h]++; if (io > 0) s.halfUp[h]++;
      // зоны
      const z = zoneOf(m.lon);
      if (z) {
        const a = zAgg.get(z.label + '|' + z.from);
        if (a) {
          const bs = biasSign(z.bias);
          a.sumCC += cc; a.nCC++;
          if (bs !== 0) { a.nDir++; if (bs * io > 0) a.hit++; a.sumIo += bs * io; stratCum *= (1 + bs * io); }
        }
      }
    }

    const signs = window.LUN.SIGNS;
    const zoneStats = [...zAgg.values()].map(({ z, nDir, hit, sumIo, sumCC, nCC }) => {
      const win = nDir ? hit / nDir : 0;
      return {
        label: z.label, from: z.from, to: z.to, bias: z.bias, nDir,
        winRate: win, z: zScore(win, nDir),
        tradeMean: nDir ? sumIo / nDir : 0,          // ср. интрадей в сторону зоны
        ccMean: nCC ? sumCC / nCC : 0,
      };
    });
    const signStats = signAgg.map((s, i) => ({
      i, name: signs[i].name, glyph: signs[i].glyph, n: s.n,
      up: s.n ? s.up / s.n : 0, mean: s.n ? s.sumIo / s.n : 0,
      // «слом на 15°»: направление первой (0–15) и второй (15–30) половины знака
      h1: s.halfN[0] ? s.half[0] / s.halfN[0] : 0, h2: s.halfN[1] ? s.half[1] / s.halfN[1] : 0,
      h1up: s.halfN[0] ? s.halfUp[0] / s.halfN[0] : 0, h2up: s.halfN[1] ? s.halfUp[1] / s.halfN[1] : 0,
    }));
    return {
      days: baseN, from: bars[1] && bars[1].timestamp, to: bars[bars.length - 1] && bars[bars.length - 1].timestamp,
      baseUp: baseN ? baseUp / baseN : 0,
      strategyIntraday: stratCum - 1, buyHoldIntraday: bhCum - 1,
      zoneStats, signStats,
    };
  }

  /* --- тест аспектов: разворот/продолжение после точного аспекта --- */
  function analyzeAspects(allBars, opts) {
    opts = opts || {};
    const bars = filterBars(allBars, opts);
    const A = window.LUN.ASPECTS, defs = window.LUN_ASPECT_DEFS;
    const frame = A.frame || 'helio', orb = A.orb || 3, H = opts.horizon || 5, minMove = opts.minMove || 0.005;
    const info = (body, ts) => window.LunAstro.bodyInfo(body, ts, frame).lon;
    const sepAt = (ts) => { let d = Math.abs(info(A.bodyA, ts) - info(A.bodyB, ts)) % 360; if (d > 180) d = 360 - d; return d; };
    // орб-дистанция до ближайшего аспекта + сам аспект
    const nearest = (sep) => { let best = null, bd = 1e9; for (const a of defs) { const dd = Math.abs(sep - a.angle); if (dd < bd) { bd = dd; best = a; } } return { a: best, d: bd }; };
    const od = bars.map((b) => nearest(sepAt(b.timestamp)));
    const res = { hard: { rev: 0, cont: 0, flat: 0 }, soft: { rev: 0, cont: 0, flat: 0 }, events: [] };
    for (let i = 1; i < bars.length - H; i++) {
      if (i - H < 0) continue;
      const cur = od[i];
      if (cur.d > orb) continue;
      // точный аспект = локальный минимум орб-дистанции
      if (!(od[i].d <= od[i - 1].d && od[i].d < od[i + 1].d)) continue;
      const prior = bars[i].close / bars[i - H].close - 1;
      const fwd = bars[i + H].close / bars[i].close - 1;
      const kind = cur.a.kind;
      let outcome;
      if (Math.abs(fwd) < minMove) { res[kind].flat++; outcome = 'flat'; }
      else if (Math.sign(fwd) !== Math.sign(prior)) { res[kind].rev++; outcome = 'reversal'; }
      else { res[kind].cont++; outcome = 'cont'; }
      res.events.push({ ts: bars[i].timestamp, aspect: cur.a.name, kind, prior, fwd, outcome });
    }
    const rate = (o) => { const denom = o.rev + o.cont; return { rev: o.rev, cont: o.cont, flat: o.flat, revRate: denom ? o.rev / denom : 0, contRate: denom ? o.cont / denom : 0, n: o.rev + o.cont + o.flat }; };
    return { H, orb, frame, minMove, hard: rate(res.hard), soft: rate(res.soft), events: res.events };
  }

  /* --- бэктест СИЛЫ: сила = всплеск объёма, силища = держится ---------------
   * Три направления проверки (винрейты по горизонтам 2/3/5 баров + «все» = пул):
   *   1) сила/силища В ЗОНАХ лонг/шорт — ставим ПО зоне, отрабатывает ли;
   *   2) сила/силища У УЗЛОВ 0°/15° знака (орб NODE_ORB) — продолжает ли бар
   *      своё направление (импульс от узла);
   *   3) КОНФЛЮЭНС (моя проверка): силища + узел 0/15 + согласованная зона —
   *      ставим по зоне, лучше ли редкий тройной сигнал одиночного.
   * Базлайны: момент (любой бар — продолжение своего направления), зона (все
   * бары в напр. зоне), узел (все бары у узла) — чтобы видеть перевес от силы. */
  function analyzeForce(allBars, zones, opts) {
    opts = opts || {};
    const cfg = Object.assign({ lookback: 12, forceMult: 2, sustainBars: 5, sustainMult: 1.5 }, window.LUN.STRONGBAR || {});
    const orb = window.LUN.NODE_ORB || 4;
    const moonFn = (opts.moonFn) || window.LunAstro.moonInfo;
    const bars = filterBars(allBars, opts).slice().sort((a, b) => a.timestamp - b.timestamp);
    const zoneOf = (lon) => window.LunAstro.zoneOf(lon, zones);
    const nodeDist = (deg) => Math.min(deg, Math.abs(deg - 15), 30 - deg);   // до ближайшего из 0/15/30
    const HS = [2, 3, 5];
    const forceAt = window.LUN_FORCE_AT;

    const mk = () => ({ nBars: 0, 2: { n: 0, hit: 0 }, 3: { n: 0, hit: 0 }, 5: { n: 0, hit: 0 } });
    const rec = (bk, i, dir) => {
      if (dir === 0) return;
      bk.nBars++;
      for (const H of HS) {
        if (i + H >= bars.length) continue;
        const fwd = bars[i + H].close / bars[i].close - 1;
        if (!fwd) continue;
        bk[H].n++; if (Math.sign(fwd) === dir) bk[H].hit++;
      }
    };
    const B = {
      momBase: mk(),
      zoneBase: mk(), zoneSila: mk(), zoneSilishcha: mk(),
      nodeBase: mk(), nodeSila: mk(), nodeSilishcha: mk(),
      conflu: mk(),
    };
    for (let i = cfg.lookback; i < bars.length; i++) {
      const b = bars[i];
      const dirOwn = b.close >= b.open ? 1 : -1;
      rec(B.momBase, i, dirOwn);
      const m = moonFn(b.timestamp);
      const z = zoneOf(m.lon);
      const bias = z ? biasSign(z.bias) : 0;
      const atNode = nodeDist(m.degInSign) <= orb;
      const f = forceAt ? forceAt(bars, i, cfg) : null;   // {ratio, sustained} | null
      if (bias !== 0) {
        rec(B.zoneBase, i, bias);
        if (f) { rec(B.zoneSila, i, bias); if (f.sustained) rec(B.zoneSilishcha, i, bias); }
      }
      if (atNode) {
        rec(B.nodeBase, i, dirOwn);
        if (f) { rec(B.nodeSila, i, dirOwn); if (f.sustained) rec(B.nodeSilishcha, i, dirOwn); }
      }
      if (f && f.sustained && atNode && bias !== 0) rec(B.conflu, i, bias);
    }
    const wr = (bk) => {
      const o = { nBars: bk.nBars }; let allN = 0, allHit = 0;
      for (const H of HS) { const c = bk[H]; o[H] = c.n ? c.hit / c.n : 0; o['n' + H] = c.n; allN += c.n; allHit += c.hit; }
      o.all = allN ? allHit / allN : 0; o.nAll = allN; o.z = zScore(o.all, allN);
      return o;
    };
    const stats = {}; for (const k in B) stats[k] = wr(B[k]);
    return { cfg, orb, days: bars.length, horizons: HS, stats };
  }

  /* --- АВТОТОРГОВЛЯ: сила/силища + поглощение, вход/стоп/тейк по R:R ---------
   * Сетап (запасной вариант, «просто так», без зон/узлов):
   *   сигнал = бар СИЛЫ, который ещё и БАР ПОГЛОЩЕНИЯ (тело перекрывает тело
   *   предыдущего бара и крупнее его);
   *   направление = направление сигнального бара (закр≥откр → лонг);
   *   вход = ОТКРЫТИЕ следующего бара (начало бара);
   *   стоп = за сигнальным баром (low для лонга / high для шорта);
   *   тейк = вход ± RR × риск (RR = 2 и 3);
   *   исход считаем по ходу баров: что раньше задето — стоп (конс.) или тейк.
   * Метрики: винрейт, безубыточный винрейт (1/(1+RR)), ожидание в R.
   * Базлайны: сила без фильтра поглощения и поглощение без силы. Силища —
   * подмножество (справочно: силища видна лишь через sustainBars, вход по ней
   * с оговоркой «постфактум»). */
  function engulfing(bars, i) {
    if (i < 1) return false;
    const c = bars[i], p = bars[i - 1];
    const ch = Math.max(c.open, c.close), cl = Math.min(c.open, c.close);
    const ph = Math.max(p.open, p.close), pl = Math.min(p.open, p.close);
    return ch >= ph && cl <= pl && (ch - cl) > (ph - pl);   // тело перекрывает и крупнее
  }

  // costPts — издержки на круг в пунктах цены; переводятся в доли риска (costR =
  // costPts/риск) и вычитаются из КАЖДОЙ сделки (плата берётся и в плюс, и в минус).
  function simulateTrades(bars, signals, rr, costPts) {
    costPts = costPts || 0;
    let wins = 0, losses = 0, open = 0, sumR = 0, sumRnet = 0, sumRisk = 0, nRisk = 0;
    for (const s of signals) {
      const entryBar = bars[s.i + 1]; if (!entryBar) continue;
      const entry = entryBar.open, dir = s.dir;
      const stop = dir > 0 ? bars[s.i].low : bars[s.i].high;
      const risk = Math.abs(entry - stop); if (!(risk > 0)) continue;
      const tp = dir > 0 ? entry + rr * risk : entry - rr * risk;
      let res = 0;
      for (let j = s.i + 1; j < bars.length; j++) {
        const b = bars[j];
        if (dir > 0) { if (b.low <= stop) { res = -1; break; } if (b.high >= tp) { res = 1; break; } }
        else { if (b.high >= stop) { res = -1; break; } if (b.low <= tp) { res = 1; break; } }
      }
      if (res === 0) { open++; continue; }
      const costR = costPts / risk; sumRisk += risk; nRisk++;
      if (res === 1) { wins++; sumR += rr; sumRnet += rr - costR; }
      else { losses++; sumR -= 1; sumRnet += -1 - costR; }
    }
    const n = wins + losses;
    return {
      n, wins, losses, open, winRate: n ? wins / n : 0, breakeven: 1 / (1 + rr),
      expR: n ? sumR / n : 0, expRnet: n ? sumRnet / n : 0, avgRisk: nRisk ? sumRisk / nRisk : 0,
    };
  }

  // Собирает сигналы на конкретном наборе баров и считает все сетапы (для OOS
  // train/test вызываем на срезах). Сильное закрытие — бар закрылся в 25% у
  // своего экстремума по направлению (близко к максимуму для лонга).
  function tradesOn(bars, cfg, costPts) {
    const forceAt = window.LUN_FORCE_AT, nodeOrb = window.LUN.NODE_ORB || 4, moonFn = window.LunAstro.moonInfo;
    const nodeDist = (deg) => Math.min(deg, Math.abs(deg - 15), 30 - deg);
    const sig = { forceEng: [], forceEngS: [], forceAll: [], engOnly: [], forceEng3x: [], forceEngClose: [], forceEngNode: [] };
    for (let i = cfg.lookback; i < bars.length; i++) {
      const b = bars[i], dir = b.close >= b.open ? 1 : -1;
      const f = forceAt ? forceAt(bars, i, cfg) : null, eng = engulfing(bars, i);
      const rng = b.high - b.low;
      const strongClose = rng > 0 && (dir > 0 ? b.close >= b.high - 0.25 * rng : b.close <= b.low + 0.25 * rng);
      const m = moonFn(b.timestamp), atNode = nodeDist(m.degInSign) <= nodeOrb;
      if (f) sig.forceAll.push({ i, dir });
      if (eng && !f) sig.engOnly.push({ i, dir });
      if (f && eng) {
        sig.forceEng.push({ i, dir });
        if (f.sustained) sig.forceEngS.push({ i, dir });
        if (f.ratio >= 3) sig.forceEng3x.push({ i, dir });
        if (strongClose) sig.forceEngClose.push({ i, dir });
        if (atNode) sig.forceEngNode.push({ i, dir });
      }
    }
    const R = (set, rr) => simulateTrades(bars, set, rr, costPts);
    return {
      nForceEng: sig.forceEng.length,
      rows: [
        { key: 'Сила + поглощение', rr2: R(sig.forceEng, 2), rr3: R(sig.forceEng, 3), hl: true },
        { key: 'Силища + поглощение (постфактум)', rr2: R(sig.forceEngS, 2), rr3: R(sig.forceEngS, 3), note: true },
        { key: '+ у узла 0/15', rr2: R(sig.forceEngNode, 2), rr3: R(sig.forceEngNode, 3), hl: true },
        { key: '+ сила ≥3×', rr2: R(sig.forceEng3x, 2), rr3: R(sig.forceEng3x, 3), hl: true },
        { key: '+ сильное закрытие', rr2: R(sig.forceEngClose, 2), rr3: R(sig.forceEngClose, 3), hl: true },
        { key: 'Сила без поглощения (базлайн)', rr2: R(sig.forceAll, 2), rr3: R(sig.forceAll, 3) },
        { key: 'Поглощение без силы (базлайн)', rr2: R(sig.engOnly, 2), rr3: R(sig.engOnly, 3) },
      ],
    };
  }

  function analyzeForceTrades(allBars, opts) {
    opts = opts || {};
    const cfg = Object.assign({ lookback: 12, forceMult: 2, sustainBars: 5, sustainMult: 1.5 }, window.LUN.STRONGBAR || {});
    const costPts = (window.LUN.TRADECOST && window.LUN.TRADECOST.pointsRoundTrip) || 0;
    const bars = filterBars(allBars, opts).slice().sort((a, b) => a.timestamp - b.timestamp);
    const full = tradesOn(bars, cfg, costPts);
    // out-of-sample: первые 2/3 — обучение, последняя 1/3 — тест (по индексу/времени)
    const cut = Math.floor(bars.length * 2 / 3);
    const trainB = bars.slice(0, cut), testB = bars.slice(cut);
    const mainRow = (t) => t.rows.find((r) => r.key === 'Сила + поглощение');
    const oos = {
      splitTs: bars[cut] ? bars[cut].timestamp : 0,
      train: mainRow(tradesOn(trainB, cfg, costPts)),
      test: mainRow(tradesOn(testB, cfg, costPts)),
    };
    return { cfg, costPts, days: bars.length, nForceEng: full.nForceEng, rows: full.rows, oos };
  }

  /* --- МАРКОВСКИЕ РЕЖИМЫ (Этап 3) ------------------------------------------
   * Стратегия по walk-forward сигналу: позиция = знак сигнала, когда он
   * разрешён (tradable), иначе флэт. PnL по close→close, издержки на смену
   * позиции (доля цены = pointsRoundTrip/цена). Три конфигурации: чистая цена
   * (astro=none), 2D (astro=провайдер), buy&hold. Плюс справочная матрица и
   * разрез астро-зон по ценовому режиму. */
  function simulateMarkovStrategy(bars, wf, costPts) {
    let eq = 1, peak = 1, maxDD = 0, pos = 0, entryEq = 1, trades = 0, wins = 0, sumRet = 0;
    for (let i = 0; i < bars.length - 1; i++) {
      const desired = wf.tradable[i] ? Math.sign(wf.signal[i]) : 0;
      if (desired !== pos) {
        if (pos !== 0) { const r = eq / entryEq - 1; trades++; if (r > 0) wins++; sumRet += r; }
        const c = Math.abs(desired - pos) * (costPts / (bars[i].close || 1)) / 2;   // смена позиции — издержки
        eq *= (1 - c); pos = desired; entryEq = eq;
      }
      const ret = bars[i + 1].close / bars[i].close - 1;
      if (Number.isFinite(ret)) eq *= (1 + pos * ret);
      if (eq > peak) peak = eq; const dd = peak > 0 ? (peak - eq) / peak : 0; if (dd > maxDD) maxDD = dd;
    }
    if (pos !== 0) { const r = eq / entryEq - 1; trades++; if (r > 0) wins++; sumRet += r; }
    return { trades, winRate: trades ? wins / trades : 0, meanRet: trades ? sumRet / trades : 0, total: eq - 1, maxDD };
  }
  function buyHold(bars) {
    let eq = 1, peak = 1, maxDD = 0;
    for (let i = 0; i < bars.length - 1; i++) { const r = bars[i + 1].close / bars[i].close - 1; if (Number.isFinite(r)) eq *= (1 + r); if (eq > peak) peak = eq; const dd = (peak - eq) / peak; if (dd > maxDD) maxDD = dd; }
    return { trades: 1, winRate: null, meanRet: eq - 1, total: eq - 1, maxDD };
  }
  // винрейт направления астро-зон, разбитый по ценовому режиму (BEAR/SIDE/BULL)
  function analyzeZonesByRegime(bars, wf) {
    const zones = window.LUN.CYCLES[0].zones, ps = wf.priceStates;
    const mk = () => ({ n: 0, hit: 0 });
    const agg = { long: [mk(), mk(), mk()], short: [mk(), mk(), mk()] };
    for (let i = 1; i < bars.length; i++) {
      const b = bars[i]; if (!(b.open > 0) || !(b.close > 0)) continue;
      const io = b.close / b.open - 1; if (Math.abs(io) > 0.5) continue;
      const r = ps[i]; if (r < 0) continue;
      const z = window.LunAstro.zoneOf(window.LunAstro.moonInfo(b.timestamp).lon, zones);
      if (!z || z.bias === 'range') continue;
      const bs = z.bias === 'long' ? 1 : -1, cell = agg[z.bias][r];
      cell.n++; if (bs * io > 0) cell.hit++;
    }
    return agg;
  }
  function analyzeMarkov(allBars, opts) {
    if (!window.LunMarkov) return null;
    const bars = filterBars(allBars, opts).slice().sort((a, b) => a.timestamp - b.timestamp);
    if (bars.length < 120) return { tooFew: true, days: bars.length };
    const base = window.LUN.MARKOV, costPts = (window.LUN.TRADECOST && window.LUN.TRADECOST.pointsRoundTrip) || 0;
    const prov = base.astroProvider === 'none' ? 'cycleZone' : base.astroProvider;
    const wfNone = window.LunMarkov.walkForward(bars, Object.assign({}, base, { astroProvider: 'none' }));
    const wfAstro = window.LunMarkov.walkForward(bars, Object.assign({}, base, { astroProvider: prov }));
    const step = base.step > 0 ? base.step : base.window;
    const mat = window.LunMarkov.transitionMatrix(wfAstro.state, { size: wfAstro.size, step, sampleMode: base.sampleMode, upTo: bars.length - 1 });
    return {
      days: bars.length, prov, costPts, step,
      none: simulateMarkovStrategy(bars, wfNone, costPts),
      astro: simulateMarkovStrategy(bars, wfAstro, costPts),
      bh: buyHold(bars),
      mat, matSize: wfAstro.size, matNames: wfAstro.names,
      zoneByRegime: analyzeZonesByRegime(bars, wfAstro),
    };
  }

  /* ------------------------------- отчёт (UI) ------------------------------- */
  const css = `
  .bt-sum{display:flex;gap:16px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid #1c2230}
  .bt-ctrl{display:flex;gap:6px;align-items:center;padding:8px 16px;border-bottom:1px solid #1c2230;flex-wrap:wrap}
  .bt-tbl{width:100%;border-collapse:collapse;font-size:12px;margin:4px 0}
  .bt-tbl th,.bt-tbl td{padding:3px 8px;text-align:right;border-bottom:1px solid #1c2230}
  .bt-tbl th:first-child,.bt-tbl td:first-child{text-align:left}
  .bt-tbl th{color:#8b93a7;font-weight:400}
  .bt-pos{color:#26a69a}.bt-neg{color:#ef5350}.bt-mut{color:#6b7280}
  .bt-recs li{margin:4px 0;font-size:12.5px}`;
  let cssAdded = false;
  function addCss() { if (cssAdded) return; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); cssAdded = true; }
  const pct = (x, d = 2) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
  const wpct = (x, d = 0) => (x * 100).toFixed(d) + '%';
  const cls = (x) => x > 0 ? 'bt-pos' : (x < 0 ? 'bt-neg' : 'bt-mut');
  const dstr = (ts) => ts ? new Date(ts).toISOString().slice(0, 10) : '—';

  function zoneVerdict(z, baseUp) {
    if (z.bias === 'range') return 'рэндж';
    const edge = z.winRate - Math.max(0.5, z.bias === 'long' ? baseUp : 1 - baseUp);
    if (z.z >= 1.6 && z.winRate > 0.5) return 'работает ✓';
    if (z.winRate > 0.5) return 'слабо +';
    return 'не отрабатывает ✗';
  }

  function frcRow(label, s, hl) {
    const c = (x) => cls(x - 0.5);
    const nm = (n) => `<span class="bt-mut"> ${n}</span>`;
    return `<tr${hl ? ' style="background:#141b26"' : ''}><td>${label}</td><td>${s.nBars}</td>
      <td class="${c(s[2])}">${wpct(s[2], 0)}${nm(s.n2)}</td>
      <td class="${c(s[3])}">${wpct(s[3], 0)}${nm(s.n3)}</td>
      <td class="${c(s[5])}">${wpct(s[5], 0)}${nm(s.n5)}</td>
      <td class="${c(s.all)}">${wpct(s.all, 0)} <span class="bt-mut">z${s.z.toFixed(1)}</span></td></tr>`;
  }

  function forceHTML(frc) {
    const S = frc.stats, c = frc.cfg;
    return `
      <div class="lun-sec"><h3 style="margin:4px 0">Сила и силища — всплеск объёма (сила ≥ ${c.forceMult}× среднего ${c.lookback} баров; силища держится ${c.sustainBars} баров)</h3>
        <table class="bt-tbl"><thead><tr><th>сценарий (ставка)</th><th>сигналов</th><th>H2</th><th>H3</th><th>H5</th><th>все · z</th></tr></thead><tbody>
          ${frcRow('Момент — любой бар, продолжение своего направления', S.momBase)}
          <tr><td colspan="6" class="bt-mut" style="padding-top:6px">① В зонах лонг/шорт (ставка ПО зоне)</td></tr>
          ${frcRow('&nbsp;&nbsp;зона — все бары (базлайн)', S.zoneBase)}
          ${frcRow('&nbsp;&nbsp;зона + сила', S.zoneSila)}
          ${frcRow('&nbsp;&nbsp;зона + силища', S.zoneSilishcha, true)}
          <tr><td colspan="6" class="bt-mut" style="padding-top:6px">② У узлов 0°/15° знака, орб ${frc.orb}° (продолжение своего направления)</td></tr>
          ${frcRow('&nbsp;&nbsp;узел — все бары (базлайн)', S.nodeBase)}
          ${frcRow('&nbsp;&nbsp;узел + сила', S.nodeSila)}
          ${frcRow('&nbsp;&nbsp;узел + силища', S.nodeSilishcha, true)}
          <tr><td colspan="6" class="bt-mut" style="padding-top:6px">③ Конфлюэнс: силища + узел + согласованная зона (ставка ПО зоне)</td></tr>
          ${frcRow('&nbsp;&nbsp;тройной сигнал', S.conflu, true)}
        </tbody></table>
        <p class="bt-recs" style="color:#8b93a7">Винрейт = доля случаев, где движение за H баров совпало со ставкой. Серые числа — размер выборки. «все» = пул всех горизонтов, z — значимость (|z|≥1.6–2 = не случайность). Сравнивай строки силы с базлайном той же группы: важен ПЕРЕВЕС, а не абсолют.</p>
      </div>`;
  }

  const sgnR = (x) => (x >= 0 ? '+' : '') + x.toFixed(2) + 'R';
  function trdCell(t) {
    const good = t.n >= 30 && t.expRnet > 0;
    return `<td>${t.n}</td>
      <td class="${cls(t.winRate - t.breakeven)}">${wpct(t.winRate, 0)}<span class="bt-mut">/${wpct(t.breakeven, 0)}</span></td>
      <td class="${cls(t.expRnet)}">${sgnR(t.expRnet)}${good ? ' ✓' : ''}<span class="bt-mut"> вал ${sgnR(t.expR)}</span></td>`;
  }
  function tradesHTML(trd) {
    const rows = trd.rows.map((r) => `<tr${r.hl ? ' style="background:#141b26"' : ''}>
      <td>${r.key}${r.note ? ' <span class="bt-mut">*</span>' : ''}</td><td class="bt-mut">${Math.round(r.rr2.avgRisk)}</td>${trdCell(r.rr2)}${trdCell(r.rr3)}</tr>`).join('');
    const o = trd.oos, tr = o.train, te = o.test;
    const oosCell = (t) => t && t.n ? `${sgnR(t.expRnet)} <span class="bt-mut">(${t.n} сд., винр ${wpct(t.winRate, 0)})</span>` : '—';
    const enoughOos = tr && te && tr.rr2.n >= 20 && te.rr2.n >= 20;
    const holds = enoughOos && tr.rr2.expRnet > 0 && te.rr2.expRnet > 0;
    const oosVerdict = !enoughOos ? '⚠ мало сделок для OOS-вывода — переключи ТФ на H1/M15' : (holds ? '✓ держится на невиданных данных' : '✗ на тесте перевес не держится — вероятна подгонка');
    return `
      <div class="lun-sec"><h3 style="margin:4px 0">Автоторговля: сила/силища + поглощение → вход/стоп/тейк (R:R), ЧИСТО за вычетом издержек</h3>
        <table class="bt-tbl"><thead>
          <tr><th rowspan="2">сетап</th><th rowspan="2">ср.риск, п.</th><th colspan="3">R:R 1:2</th><th colspan="3">R:R 1:3</th></tr>
          <tr><th>сделок</th><th>винр/BE</th><th>ожид.нетто</th><th>сделок</th><th>винр/BE</th><th>ожид.нетто</th></tr>
        </thead><tbody>${rows}</tbody></table>
        <p class="bt-recs" style="color:#8b93a7">Вход = открытие след. бара, стоп = за сигнальным баром, тейк = вход ± R:R × риск (стоп конс. первым). Издержки <b>${trd.costPts} п. на круг</b> (LUN.TRADECOST) вычтены → <b>ожид.нетто</b>, рядом «вал» — валовое. <b>BE</b> — безубыток (33%/25%). <b>✓</b> = чистое ожидание &gt;0 при n≥30. Строки «+…» — фильтры входа поверх «Сила+поглощение». * силища видна лишь через ${trd.cfg.sustainBars} баров (постфактум, не торгуемо в моменте).</p>
        <div class="bt-sum" style="border-top:1px solid #1c2230;border-bottom:none;margin-top:4px">
          <span><b>Out-of-sample</b> «Сила+поглощение» 1:2 (граница ${dstr(o.splitTs)}):</span>
          <span>обучение (2/3): <b class="${cls(tr ? tr.rr2.expRnet : 0)}">${oosCell(tr && tr.rr2)}</b></span>
          <span>тест (1/3): <b class="${cls(te ? te.rr2.expRnet : 0)}">${oosCell(te && te.rr2)}</b></span>
          <span>${oosVerdict}</span>
        </div>
      </div>`;
  }

  function markovHTML(mk) {
    if (!mk) return '';
    if (mk.tooFew) return `<div class="lun-sec"><h3 style="margin:4px 0">Марковские режимы</h3><p class="bt-recs" style="color:#8b93a7">Мало баров (${mk.days}) для матрицы — расширь период или переключи ТФ на H1/M15.</p></div>`;
    const minObs = window.LUN.MARKOV.minObs;
    const cfgRow = (name, s) => `<tr><td>${name}</td><td>${s.trades}</td><td>${s.winRate == null ? '—' : wpct(s.winRate, 0)}</td>
      <td class="${cls(s.meanRet)}">${pct(s.meanRet, 2)}</td><td class="${cls(s.total)}">${pct(s.total, 0)}</td><td class="bt-neg">${wpct(s.maxDD, 0)}</td></tr>`;
    const edge = mk.astro.total - mk.none.total;
    const N = mk.matSize, names = mk.matNames, m = mk.mat;
    let head = '<th>сег.\\зав.</th>'; for (let c = 0; c < N; c++) head += `<th>${names[c]}</th>`; head += '<th>n_эфф</th>';
    let mrows = '';
    for (let r = 0; r < N; r++) {
      const neff = m.rowNeff[r], dim = neff < minObs;
      let cells = ''; for (let c = 0; c < N; c++) cells += `<td class="${r === c ? 'bt-pos' : ''}">${(m.prob[r * N + c] * 100).toFixed(0)}%</td>`;
      mrows += `<tr style="${dim ? 'opacity:.45' : ''}"><td>${names[r]}</td>${cells}<td class="bt-mut">${neff.toFixed(0)}</td></tr>`;
    }
    const zbr = mk.zoneByRegime;
    const zrow = (bias) => { let c = ''; for (let r = 0; r < 3; r++) { const cell = zbr[bias][r], wr = cell.n ? cell.hit / cell.n : 0; c += `<td class="${cell.n < 20 ? 'bt-mut' : cls(wr - 0.5)}">${cell.n ? wpct(wr, 0) : '—'}<span class="bt-mut"> ${cell.n}</span></td>`; } return c; };
    return `
      <div class="lun-sec"><h3 style="margin:4px 0">Марковские режимы — три конфигурации (издержки ${mk.costPts}п. на смену позиции)</h3>
        <table class="bt-tbl"><thead><tr><th>конфигурация</th><th>сделок</th><th>винрейт</th><th>ср/сделку</th><th>итог</th><th>просадка</th></tr></thead><tbody>
          ${cfgRow('astro = none (чистая цена)', mk.none)}
          ${cfgRow('astro = ' + mk.prov + ' (2D)', mk.astro)}
          ${cfgRow('buy & hold', mk.bh)}
        </tbody></table>
        <p class="bt-recs" style="color:#8b93a7">Позиция = знак walk-forward сигнала (флэт, если не разрешён). <b>Прирост астро</b> = итог 2D − none = <b class="${cls(edge)}">${pct(edge, 0)}</b> — ${edge > 0.02 ? 'астро-ось добавляет к чистой цене ✓' : 'астро-ось НЕ даёт перевеса над чистой ценой на этом периоде'}.</p>
      </div>
      <div class="lun-sec"><h3 style="margin:4px 0">Матрица переходов (${mk.prov}, вся история, справочно) · шаг ${mk.step}</h3>
        <div style="overflow-x:auto"><table class="bt-tbl"><thead><tr>${head}</tr></thead><tbody>${mrows}</tbody></table></div>
        <p class="bt-recs" style="color:#8b93a7">Диагональ (зелёным) = липкость режима. Строки с n_эфф &lt; ${minObs} приглушены — ненадёжны.</p>
      </div>
      <div class="lun-sec"><h3 style="margin:4px 0">Астро-зоны Луны в разрезе ценового режима (винрейт направления)</h3>
        <table class="bt-tbl"><thead><tr><th>зона</th><th>в BEAR</th><th>в SIDE</th><th>в BULL</th></tr></thead><tbody>
          <tr><td>лонг-зоны</td>${zrow('long')}</tr>
          <tr><td>шорт-зоны</td>${zrow('short')}</tr>
        </tbody></table>
        <p class="bt-recs" style="color:#8b93a7">Гипотеза ТЗ: астро-зона отрабатывает не всегда, а внутри согласованного режима (лонг-зона в BULL, шорт-зона в BEAR). Серые числа — мало наблюдений (&lt;20).</p>
      </div>`;
  }

  function contentHTML(res, asp, frc, trd, mk) {
    const zoneRows = res.zoneStats.map((z) => `<tr><td>${z.label}</td><td>${z.from}–${z.to}°</td><td>${z.bias}</td>
      <td>${z.nDir}</td><td class="${cls(z.winRate - 0.5)}">${wpct(z.winRate, 1)}</td><td>${z.z.toFixed(1)}</td>
      <td class="${cls(z.tradeMean)}">${pct(z.tradeMean, 3)}</td><td>${z.bias === 'range' ? 'рэндж' : zoneVerdict(z, res.baseUp)}</td></tr>`).join('');
    const signRows = res.signStats.map((s) => `<tr><td>${s.glyph} ${s.name}</td><td>${s.n}</td>
      <td class="${cls(s.up - 0.5)}">${wpct(s.up, 0)}</td><td class="${cls(s.mean)}">${pct(s.mean, 3)}</td>
      <td class="${cls(s.h1)}">${wpct(s.h1up, 0)}</td><td class="${cls(s.h2)}">${wpct(s.h2up, 0)}</td>
      <td>${Math.sign(s.h1) !== Math.sign(s.h2) && s.n > 40 ? 'слом на 15° ↔' : ''}</td></tr>`).join('');
    const ah = asp.hard, as = asp.soft;
    const U = state.unit || 'дней', Uup = state.unit ? 'баров↑' : 'дни↑';
    return `
      <div class="bt-sum">
        <span>ТФ: <b>${state.tfLabel || 'D1'}</b></span>
        <span>Период: <b>${dstr(res.from)} … ${dstr(res.to)}</b></span>
        <span>${U[0].toUpperCase() + U.slice(1)}: <b>${res.days}</b></span>
        <span>Базовый винрейт (${Uup}): <b>${wpct(res.baseUp, 1)}</b></span>
        <span>Стратегия зон (интрадей): <b class="${cls(res.strategyIntraday)}">${pct(res.strategyIntraday, 0)}</b></span>
      </div>
      <div class="lun-sec"><h3 style="margin:4px 0">Зоны — отрабатываемость направления (${U === 'дней' ? 'интрадей open→close' : 'бар open→close'})</h3>
        <table class="bt-tbl"><thead><tr><th>зона</th><th>°</th><th>bias</th><th>${U}</th><th>винрейт</th><th>z</th><th>ср. в сторону</th><th>вывод</th></tr></thead><tbody>${zoneRows}</tbody></table>
        <p class="bt-recs" style="color:#8b93a7">Винрейт = доля ${U === 'дней' ? 'дней' : 'баров'}, где движение бара совпало с направлением зоны. Значимо при |z|≥1.6–2.</p>
      </div>
      <div class="lun-sec"><h3 style="margin:4px 0">Знаки Луны: ${Uup} и «слом на 15°» (1-я половина 0–15° vs 2-я 15–30°)</h3>
        <table class="bt-tbl"><thead><tr><th>знак</th><th>${U}</th><th>${Uup}</th><th>ср/бар</th><th>0–15°↑</th><th>15–30°↑</th><th></th></tr></thead><tbody>${signRows}</tbody></table>
      </div>
      <div class="lun-sec"><h3 style="margin:4px 0">Аспекты ☉/☿ (${asp.frame}, орб ${asp.orb}°, горизонт ${asp.H} ${U === 'дней' ? 'дн.' : 'баров'})</h3>
        <table class="bt-tbl"><thead><tr><th>тип</th><th>событий</th><th>разворот</th><th>продолжение</th><th>вбок</th><th>доля</th></tr></thead>
        <tbody>
          <tr><td>🔴 красные (соед./квадрат/оппоз.)</td><td>${ah.n}</td><td>${ah.rev}</td><td>${ah.cont}</td><td>${ah.flat}</td><td class="${cls(ah.revRate - 0.5)}">разворот ${wpct(ah.revRate, 0)}</td></tr>
          <tr><td>🔵 голубые (секстиль/трин)</td><td>${as.n}</td><td>${as.rev}</td><td>${as.cont}</td><td>${as.flat}</td><td class="${cls(as.contRate - 0.5)}">продолжение ${wpct(as.contRate, 0)}</td></tr>
        </tbody></table>
        <p class="bt-recs" style="color:#8b93a7">Твоя гипотеза: красные → разворот ~3/4, голубые → продолжение. «вбок» = движение за горизонт меньше ${wpct(asp.minMove, 1)}.</p>
      </div>
      ${frc ? forceHTML(frc) : ''}
      ${trd ? tradesHTML(trd) : ''}
      ${mk ? markovHTML(mk) : ''}
      <div class="lun-sec"><h3 style="margin:4px 0">Итог</h3><ul class="bt-recs">${summary(res, asp, frc, trd, mk).map((r) => `<li>${r}</li>`).join('')}</ul></div>`;
  }

  function summary(res, asp, frc, trd, mk) {
    const out = [];
    const good = res.zoneStats.filter((z) => z.bias !== 'range' && z.z >= 1.6 && z.winRate > 0.5);
    const bad = res.zoneStats.filter((z) => z.bias !== 'range' && z.winRate < 0.5);
    out.push(good.length ? `Отрабатывают: ${good.map((z) => z.label + ' (' + wpct(z.winRate, 0) + ')').join(', ')}.` : 'Ни одна зона не даёт значимого перевеса винрейта на этом периоде.');
    if (bad.length) out.push(`Не отрабатывают (винрейт <50%): ${bad.map((z) => z.label).join(', ')} — на этом периоде против направления.`);
    if (asp.hard.n >= 8) out.push(`Красные аспекты ☉/☿: разворот в ${wpct(asp.hard.revRate, 0)} случаев (${asp.hard.rev} из ${asp.hard.rev + asp.hard.cont}) — ${asp.hard.revRate >= 0.65 ? 'гипотеза про разворот подтверждается ✓' : 'до 3/4 не дотягивает на этом периоде'}.`);
    if (asp.soft.n >= 8) out.push(`Голубые аспекты: продолжение в ${wpct(asp.soft.contRate, 0)} случаев.`);
    const flips = res.signStats.filter((s) => Math.sign(s.h1) !== Math.sign(s.h2) && s.n > 40).map((s) => s.name);
    if (flips.length) out.push(`Слом направления на 15° заметен в знаках: ${flips.join(', ')}.`);
    if (frc) {
      const S = frc.stats, edge = (a, b) => (a.all - b.all);
      if (S.zoneSila.nAll >= 8) out.push(`Сила в зонах: винрейт по зоне ${wpct(S.zoneSila.all, 0)} против базлайна ${wpct(S.zoneBase.all, 0)} — перевес ${pct(edge(S.zoneSila, S.zoneBase), 0)}${S.zoneSilishcha.nAll >= 6 ? `; силища ${wpct(S.zoneSilishcha.all, 0)} (${S.zoneSilishcha.nBars} шт.)` : ''}.`);
      if (S.nodeSila.nAll >= 8) out.push(`Сила у узлов 0°/15°: продолжение ${wpct(S.nodeSila.all, 0)} против базлайна ${wpct(S.nodeBase.all, 0)} (перевес ${pct(edge(S.nodeSila, S.nodeBase), 0)}).`);
      if (S.conflu.nBars >= 4) out.push(`Конфлюэнс (силища+узел+зона): ${wpct(S.conflu.all, 0)} на ${S.conflu.nBars} сигналах, z=${S.conflu.z.toFixed(1)} — ${S.conflu.all > Math.max(S.zoneSilishcha.all, S.zoneSila.all) ? 'тройной сигнал сильнее одиночного ✓' : 'редкий, перевеса над одиночной силой не даёт'}.`);
      else if (frc) out.push('Конфлюэнс (силища+узел+зона) — сигналов мало для вывода, копи историю/расширь период.');
    }
    if (trd) {
      const row = (k) => trd.rows.find((r) => r.key === k);
      const fe = row('Сила + поглощение'), b2 = fe.rr2, b3 = fe.rr3;
      const R = (x) => (x >= 0 ? '+' : '') + x.toFixed(2) + 'R';
      if (b2.n >= 30) {
        const best = b2.expRnet >= b3.expRnet ? { rr: '1:2', t: b2 } : { rr: '1:3', t: b3 };
        out.push(`Сила + поглощение (${b2.n} сд.): ЧИСТОЕ ожидание ${best.rr} = ${R(best.t.expRnet)} (валовое ${R(best.t.expR)}, издержки ${trd.costPts}п.) — ${best.t.expRnet > 0.03 ? 'после издержек в плюсе ✓' : 'издержки съедают перевес ✗'}.`);
        const eng = row('Поглощение без силы (базлайн)').rr2, fa = row('Сила без поглощения (базлайн)').rr2;
        out.push(`Вклад фильтров (нетто 1:2): сила+поглощение ${R(b2.expRnet)} · сила без поглощ. ${R(fa.expRnet)} · поглощ. без силы ${R(eng.expRnet)} — ${eng.expRnet < b2.expRnet ? 'сила и есть источник перевеса' : 'поглощение важнее силы'}.`);
        const extras = ['+ у узла 0/15', '+ сила ≥3×', '+ сильное закрытие'].map((k) => { const r = row(k); return r && r.rr2.n >= 20 ? `${k.replace('+ ', '')} ${R(r.rr2.expRnet)} (${r.rr2.n})` : null; }).filter(Boolean);
        if (extras.length) out.push(`Доп. фильтры (нетто 1:2): ${extras.join(' · ')} — бери тот, что поднимает ожидание при живой выборке.`);
        const tr = trd.oos.train, te = trd.oos.test;
        if (tr && te && tr.rr2.n >= 20 && te.rr2.n >= 20) out.push(`Out-of-sample: обучение ${R(tr.rr2.expRnet)} → тест ${R(te.rr2.expRnet)} — ${tr.rr2.expRnet > 0 && te.rr2.expRnet > 0 ? 'перевес держится на невиданных данных ✓ (кандидат в робот)' : 'на тесте разваливается — не торговать вслепую'}.`);
        else out.push('Out-of-sample: сделок на тесте мало — вывод только на H1/M15 (где выборка сотни сделок).');
      } else out.push(`Сила + поглощение — сделок мало (${b2.n}) для вывода, переключи ТФ на H1/M15 или расширь период.`);
    }
    if (mk && !mk.tooFew) {
      const edge = mk.astro.total - mk.none.total;
      out.push(`Марков: чистая цена ${pct(mk.none.total, 0)} (просадка ${wpct(mk.none.maxDD, 0)}) · 2D (${mk.prov}) ${pct(mk.astro.total, 0)} · buy&hold ${pct(mk.bh.total, 0)}. Прирост астро ${pct(edge, 0)} — ${edge > 0.02 ? 'астро-ось добавляет ✓' : 'астро-ось не отличается от шума на этом периоде'}.`);
    }
    out.push('Меняй период кнопками сверху (последние 2–3 года / без 2022) — сравни, где склонность чётче.');
    return out;
  }

  function openReport() {
    addCss();
    const bg = document.createElement('div'); bg.className = 'lun-modal-bg';
    const modal = document.createElement('div'); modal.className = 'lun-modal';
    modal.innerHTML = `<h2>Бэктест: зоны Луны и аспекты · ${state.title || 'USD/RUB'}<span class="x" title="закрыть">×</span></h2>
      <div class="bt-ctrl bt-tf">ТФ:
        <button class="lun-btn mini" data-tf="M5">M5</button>
        <button class="lun-btn mini" data-tf="M15">M15</button>
        <button class="lun-btn mini" data-tf="H1">H1</button>
        <button class="lun-btn mini active" data-tf="D1">D1</button>
        <span class="bt-mut" style="font-size:11px">внутридневная — только фьючерсы, глубина ограничена историей ISS</span>
      </div>
      <div class="bt-ctrl">Период:
        <button class="lun-btn mini" data-p="all">всё</button>
        <button class="lun-btn mini" data-p="5">5 лет</button>
        <button class="lun-btn mini" data-p="3">3 года</button>
        <button class="lun-btn mini" data-p="2">2 года</button>
        <button class="lun-btn mini" data-p="no2022">без 2022</button>
      </div>
      <div id="bt-content"></div>
      <div class="lun-foot"><button class="lun-btn" id="bt-copy">Скопировать отчёт</button><span style="flex:1"></span><button class="lun-btn primary" id="bt-close">Закрыть</button></div>`;
    bg.appendChild(modal); document.body.appendChild(bg);
    const close = () => bg.remove();
    modal.querySelector('.x').onclick = close; modal.querySelector('#bt-close').onclick = close;
    bg.onclick = (e) => { if (e.target === bg) close(); };
    let lastText = '', curOpts = {}, curBtn = null;
    const refresh = (opts, btn) => {
      curOpts = opts; if (btn) curBtn = btn;
      modal.querySelectorAll('.bt-ctrl:not(.bt-tf) .lun-btn').forEach((x) => x.classList.remove('active')); if (curBtn) curBtn.classList.add('active');
      const res = analyze(state.bars, window.LUN.CYCLES[0].zones, opts);
      const asp = analyzeAspects(state.bars, opts);
      const frc = analyzeForce(state.bars, window.LUN.CYCLES[0].zones, opts);
      const trd = analyzeForceTrades(state.bars, opts);
      const mk = analyzeMarkov(state.bars, opts);
      modal.querySelector('#bt-content').innerHTML = contentHTML(res, asp, frc, trd, mk);
      lastText = plainReport(res, asp, frc, trd, mk);
    };
    const now = Date.now(), yr = 365 * 86400000;
    const optsFor = (p) => p === 'no2022' ? { exclude2022: true } : (p === 'all' ? {} : { fromTs: now - (+p) * yr });
    modal.querySelectorAll('.bt-ctrl:not(.bt-tf) .lun-btn').forEach((btn) => { btn.onclick = () => refresh(optsFor(btn.dataset.p), btn); });
    // переключение ТФ: догружаем бары нужного интервала и пересчитываем тот же период
    const switchTf = async (tfDef, btn) => {
      const status = document.getElementById('datasource'), prev = status ? status.textContent : '';
      modal.querySelectorAll('.bt-tf .lun-btn').forEach((x) => x.classList.remove('active')); btn.classList.add('active');
      modal.querySelector('#bt-content').innerHTML = `<div class="lun-sec" style="padding:14px;color:#8b93a7">Загрузка ${tfDef.label}…</div>`;
      try { await loadBars(tfDef); refresh(curOpts, curBtn); }
      catch (e) { modal.querySelector('#bt-content').innerHTML = `<div class="lun-sec" style="padding:14px;color:#ef5350">ТФ ${tfDef.label}: ${e.message}</div>`; }
      finally { if (status) status.textContent = prev; }
    };
    modal.querySelectorAll('.bt-tf .lun-btn').forEach((btn) => { btn.onclick = () => switchTf(TFS.find((t) => t.id === btn.dataset.tf), btn); });
    modal.querySelector('#bt-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(lastText); modal.querySelector('#bt-copy').textContent = 'скопировано ✓'; };
    refresh({ fromTs: now - 3 * yr }, modal.querySelector('[data-p="3"]'));   // по умолчанию 3 года
  }

  function plainReport(res, asp, frc, trd, mk) {
    let t = `Бэктест ${state.title || 'USD/RUB'} · ТФ ${state.tfLabel || 'D1'} · ${dstr(res.from)}…${dstr(res.to)} · ${state.unit || 'дней'} ${res.days} · базовый винрейт ${wpct(res.baseUp, 1)} · стратегия зон(интрадей) ${pct(res.strategyIntraday, 0)}\n\nЗОНЫ (винрейт направления):\n`;
    res.zoneStats.forEach((z) => { t += `  ${z.label} [${z.from}-${z.to}° ${z.bias}] n=${z.nDir} винрейт=${wpct(z.winRate, 1)} z=${z.z.toFixed(1)} ср=${pct(z.tradeMean, 3)}\n`; });
    t += '\nЗНАКИ (дни↑ | 0-15↑ | 15-30↑):\n';
    res.signStats.forEach((s) => { t += `  ${s.name} n=${s.n} ${wpct(s.up, 0)} | ${wpct(s.h1up, 0)} | ${wpct(s.h2up, 0)}\n`; });
    t += `\nАСПЕКТЫ ☉/☿ (${asp.frame}, орб ${asp.orb}, гор ${asp.H}д):\n`;
    t += `  красные: разворот ${wpct(asp.hard.revRate, 0)} (${asp.hard.rev}/${asp.hard.rev + asp.hard.cont}), вбок ${asp.hard.flat}\n`;
    t += `  голубые: продолжение ${wpct(asp.soft.contRate, 0)} (${asp.soft.cont}/${asp.soft.rev + asp.soft.cont}), вбок ${asp.soft.flat}\n`;
    if (frc) {
      const S = frc.stats;
      const line = (lbl, s) => `  ${lbl}: H2 ${wpct(s[2], 0)} · H3 ${wpct(s[3], 0)} · H5 ${wpct(s[5], 0)} · все ${wpct(s.all, 0)} (z${s.z.toFixed(1)}, ${s.nBars} шт.)\n`;
      t += `\nСИЛА/СИЛИЩА (сила ≥ ${frc.cfg.forceMult}× ср.${frc.cfg.lookback}, узлы 0/15 орб ${frc.orb}°):\n`;
      t += line('момент базлайн', S.momBase);
      t += line('зона базлайн', S.zoneBase) + line('зона+сила', S.zoneSila) + line('зона+силища', S.zoneSilishcha);
      t += line('узел базлайн', S.nodeBase) + line('узел+сила', S.nodeSila) + line('узел+силища', S.nodeSilishcha);
      t += line('КОНФЛЮЭНС силища+узел+зона', S.conflu);
    }
    if (trd) {
      const cell = (t2) => `винр ${wpct(t2.winRate, 0)}/BE ${wpct(t2.breakeven, 0)}, нетто ${(t2.expRnet >= 0 ? '+' : '') + t2.expRnet.toFixed(2)}R (вал ${(t2.expR >= 0 ? '+' : '') + t2.expR.toFixed(2)}, ${t2.n} сд., ср.риск ${Math.round(t2.avgRisk)}п.)`;
      t += `\nАВТОТОРГОВЛЯ (вход=откр.след.бара, стоп за бар, издержки ${trd.costPts}п. на круг):\n`;
      trd.rows.forEach((r) => { t += `  ${r.key}${r.note ? ' *' : ''}:\n    1:2 — ${cell(r.rr2)}\n    1:3 — ${cell(r.rr3)}\n`; });
      const tr = trd.oos.train, te = trd.oos.test;
      const oc = (t2) => t2 && t2.n ? `нетто ${(t2.expRnet >= 0 ? '+' : '') + t2.expRnet.toFixed(2)}R (${t2.n} сд.)` : '—';
      t += `  OUT-OF-SAMPLE «Сила+поглощение» 1:2 (граница ${dstr(trd.oos.splitTs)}): обучение ${oc(tr && tr.rr2)} · тест ${oc(te && te.rr2)}\n`;
    }
    if (mk && !mk.tooFew) {
      const cfg = (name, s) => `  ${name}: сделок ${s.trades}, винрейт ${s.winRate == null ? '—' : wpct(s.winRate, 0)}, ср/сделку ${pct(s.meanRet, 2)}, итог ${pct(s.total, 0)}, просадка ${wpct(s.maxDD, 0)}\n`;
      t += `\nМАРКОВСКИЕ РЕЖИМЫ (издержки ${mk.costPts}п.):\n`;
      t += cfg('astro=none', mk.none) + cfg('astro=' + mk.prov + ' (2D)', mk.astro) + cfg('buy&hold', mk.bh);
      t += `  прирост астро (2D − none): ${pct(mk.astro.total - mk.none.total, 0)}\n`;
    }
    return t;
  }

  /* Таймфреймы бэктеста. iss — нативный интервал ISS; agg — доп. агрегация из
   * минуток (M5/M15 нативно ISS не отдаёт). years — глубина склейки (внутри дня
   * держим меньше: истории 1-мин у старых контрактов нет). unit — подпись. */
  const TFS = [
    { id: 'M5',  label: 'M5',  tf: { iss: 1,  agg: 5,  maxPages: 160 }, years: 1, unit: 'баров' },
    { id: 'M15', label: 'M15', tf: { iss: 1,  agg: 15, maxPages: 160 }, years: 1, unit: 'баров' },
    { id: 'H1',  label: 'H1',  tf: { iss: 60 },                          years: 2, unit: 'баров' },
    { id: 'D1',  label: 'D1',  tf: { iss: 24 },                          years: 5, unit: 'дней' },
  ];

  // Загрузка баров текущего инструмента на выбранном ТФ (с кэшем по инстр+ТФ).
  async function loadBars(tfDef) {
    const status = document.getElementById('datasource');
    const base = state.futures ? 'cont/' + state.prefix : state.src.engine + '/' + state.src.market + '/' + state.src.ticker;
    const cacheKey = base + '@' + tfDef.id;
    state.cache = state.cache || {};
    if (!state.cache[cacheKey]) {
      let bars;
      if (state.futures) {
        const onP = (d, t, s) => { if (status) status.textContent = `бэктест ${tfDef.label}: склейка ${state.prefix} ${d}/${t} (${s})…`; };
        bars = await window.LunISS.fetchContinuousFutures(state.prefix, tfDef.years, tfDef.tf, onP);
      } else {
        if (tfDef.id !== 'D1') throw new Error('внутридневная склейка — только для фьючерсов');
        const till = new Date(), from = new Date(till.getTime() - 9 * 366 * 86400000);
        const fmt = (d) => d.toISOString().slice(0, 10);
        bars = await window.LunISS.fetchCandlesFrom(state.src.engine, state.src.market, state.src.ticker, 24, fmt(from), fmt(till));
      }
      if (!bars || bars.length < 60) throw new Error(`мало данных на ${tfDef.label} (${bars ? bars.length : 0}) — у старых контрактов внутридневной истории нет`);
      bars.sort((a, b) => a.timestamp - b.timestamp);
      state.cache[cacheKey] = bars;
    }
    state.bars = state.cache[cacheKey];
    state.tfLabel = tfDef.label; state.unit = tfDef.unit;
    state.title = state.futures ? state.prefix + ' (непрерывный)' : state.src.title;
  }

  // sym: { engine, market, ticker, title } — инструмент с графика; иначе USD/RUB спот.
  async function run(sym) {
    const status = document.getElementById('datasource');
    const prev = status ? status.textContent : '';
    const src = sym && sym.ticker
      ? { engine: sym.engine || 'futures', market: sym.market || 'forts', ticker: sym.ticker, title: sym.title || sym.ticker }
      : { engine: 'currency', market: 'selt', ticker: 'USD000UTSTOM', title: 'USD/RUB спот' };
    state.src = src;
    state.futures = src.engine === 'futures';
    state.prefix = state.futures ? src.ticker.replace(/[FGHJKMNQUVXZ]\d$/, '') : null;   // SiU6 -> Si
    try {
      await loadBars(TFS.find((t) => t.id === 'D1'));   // старт на D1, дальше переключаем в отчёте
      openReport();
    } catch (e) {
      alert('Бэктест не удался: ' + e.message + '\nНужны живые данные MOEX (проверь строку данных).');
    } finally { if (status) status.textContent = prev; }
  }

  window.LunBacktest = { analyze, analyzeAspects, analyzeForce, analyzeForceTrades, analyzeMarkov, run };
})();
