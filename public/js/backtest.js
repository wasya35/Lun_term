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

  function simulateTrades(bars, signals, rr) {
    let wins = 0, losses = 0, open = 0, sumR = 0;
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
      if (res === 1) { wins++; sumR += rr; } else if (res === -1) { losses++; sumR -= 1; } else open++;
    }
    const n = wins + losses;
    return { n, wins, losses, open, winRate: n ? wins / n : 0, breakeven: 1 / (1 + rr), expR: n ? sumR / n : 0 };
  }

  function analyzeForceTrades(allBars, opts) {
    opts = opts || {};
    const cfg = Object.assign({ lookback: 12, forceMult: 2, sustainBars: 5, sustainMult: 1.5 }, window.LUN.STRONGBAR || {});
    const bars = filterBars(allBars, opts).slice().sort((a, b) => a.timestamp - b.timestamp);
    const forceAt = window.LUN_FORCE_AT;
    const sig = { forceEng: [], forceEngS: [], forceAll: [], engOnly: [] };
    for (let i = cfg.lookback; i < bars.length; i++) {
      const b = bars[i], dir = b.close >= b.open ? 1 : -1;
      const f = forceAt ? forceAt(bars, i, cfg) : null;
      const eng = engulfing(bars, i);
      if (f) sig.forceAll.push({ i, dir });
      if (eng && !f) sig.engOnly.push({ i, dir });
      if (f && eng) { sig.forceEng.push({ i, dir }); if (f.sustained) sig.forceEngS.push({ i, dir }); }
    }
    const R = (set, rr) => simulateTrades(bars, set, rr);
    return {
      cfg, days: bars.length, nForceEng: sig.forceEng.length, nForceEngS: sig.forceEngS.length,
      rows: [
        { key: 'Сила + поглощение', rr2: R(sig.forceEng, 2), rr3: R(sig.forceEng, 3), hl: true },
        { key: 'Силища + поглощение (постфактум)', rr2: R(sig.forceEngS, 2), rr3: R(sig.forceEngS, 3), hl: true, note: true },
        { key: 'Сила без поглощения (базлайн)', rr2: R(sig.forceAll, 2), rr3: R(sig.forceAll, 3) },
        { key: 'Поглощение без силы (базлайн)', rr2: R(sig.engOnly, 2), rr3: R(sig.engOnly, 3) },
      ],
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

  function trdCell(t) {
    const beat = t.n >= 5 && t.winRate > t.breakeven;
    return `<td>${t.n}</td>
      <td class="${cls(t.winRate - t.breakeven)}">${wpct(t.winRate, 0)}<span class="bt-mut"> /${wpct(t.breakeven, 0)}</span></td>
      <td class="${cls(t.expR)}">${(t.expR >= 0 ? '+' : '') + t.expR.toFixed(2)}R${beat ? ' ✓' : ''}</td>`;
  }
  function tradesHTML(trd) {
    const rows = trd.rows.map((r) => `<tr${r.hl ? ' style="background:#141b26"' : ''}>
      <td>${r.key}${r.note ? ' <span class="bt-mut">*</span>' : ''}</td>${trdCell(r.rr2)}${trdCell(r.rr3)}</tr>`).join('');
    return `
      <div class="lun-sec"><h3 style="margin:4px 0">Автоторговля: сила/силища + поглощение → вход/стоп/тейк (R:R)</h3>
        <table class="bt-tbl"><thead>
          <tr><th rowspan="2">сетап</th><th colspan="3">R:R 1:2</th><th colspan="3">R:R 1:3</th></tr>
          <tr><th>сделок</th><th>винрейт /BE</th><th>ожид.</th><th>сделок</th><th>винрейт /BE</th><th>ожид.</th></tr>
        </thead><tbody>${rows}</tbody></table>
        <p class="bt-recs" style="color:#8b93a7">Вход = открытие следующего бара, стоп = за сигнальным баром, тейк = вход ± R:R × риск. Что раньше задето (стоп конс. первым). <b>BE</b> — безубыточный винрейт (33% для 1:2, 25% для 1:3): винрейт выше BE = плюсовое ожидание. <b>ожид.</b> — среднее в R на сделку (главная метрика). * силища видна только через ${trd.cfg.sustainBars} баров — вход по ней постфактум, для справки.</p>
      </div>`;
  }

  function contentHTML(res, asp, frc, trd) {
    const zoneRows = res.zoneStats.map((z) => `<tr><td>${z.label}</td><td>${z.from}–${z.to}°</td><td>${z.bias}</td>
      <td>${z.nDir}</td><td class="${cls(z.winRate - 0.5)}">${wpct(z.winRate, 1)}</td><td>${z.z.toFixed(1)}</td>
      <td class="${cls(z.tradeMean)}">${pct(z.tradeMean, 3)}</td><td>${z.bias === 'range' ? 'рэндж' : zoneVerdict(z, res.baseUp)}</td></tr>`).join('');
    const signRows = res.signStats.map((s) => `<tr><td>${s.glyph} ${s.name}</td><td>${s.n}</td>
      <td class="${cls(s.up - 0.5)}">${wpct(s.up, 0)}</td><td class="${cls(s.mean)}">${pct(s.mean, 3)}</td>
      <td class="${cls(s.h1)}">${wpct(s.h1up, 0)}</td><td class="${cls(s.h2)}">${wpct(s.h2up, 0)}</td>
      <td>${Math.sign(s.h1) !== Math.sign(s.h2) && s.n > 40 ? 'слом на 15° ↔' : ''}</td></tr>`).join('');
    const ah = asp.hard, as = asp.soft;
    return `
      <div class="bt-sum">
        <span>Период: <b>${dstr(res.from)} … ${dstr(res.to)}</b></span>
        <span>Дней: <b>${res.days}</b></span>
        <span>Базовый винрейт (дни↑): <b>${wpct(res.baseUp, 1)}</b></span>
        <span>Стратегия зон (интрадей): <b class="${cls(res.strategyIntraday)}">${pct(res.strategyIntraday, 0)}</b></span>
      </div>
      <div class="lun-sec"><h3 style="margin:4px 0">Зоны — отрабатываемость направления (интрадей open→close)</h3>
        <table class="bt-tbl"><thead><tr><th>зона</th><th>°</th><th>bias</th><th>дней</th><th>винрейт</th><th>z</th><th>ср. в сторону</th><th>вывод</th></tr></thead><tbody>${zoneRows}</tbody></table>
        <p class="bt-recs" style="color:#8b93a7">Винрейт = доля дней, где внутридневное движение совпало с направлением зоны. Значимо при |z|≥1.6–2.</p>
      </div>
      <div class="lun-sec"><h3 style="margin:4px 0">Знаки Луны: дни↑ и «слом на 15°» (1-я половина 0–15° vs 2-я 15–30°)</h3>
        <table class="bt-tbl"><thead><tr><th>знак</th><th>дней</th><th>дни↑</th><th>ср/день</th><th>0–15°↑</th><th>15–30°↑</th><th></th></tr></thead><tbody>${signRows}</tbody></table>
      </div>
      <div class="lun-sec"><h3 style="margin:4px 0">Аспекты ☉/☿ (${asp.frame}, орб ${asp.orb}°, горизонт ${asp.H} дн.)</h3>
        <table class="bt-tbl"><thead><tr><th>тип</th><th>событий</th><th>разворот</th><th>продолжение</th><th>вбок</th><th>доля</th></tr></thead>
        <tbody>
          <tr><td>🔴 красные (соед./квадрат/оппоз.)</td><td>${ah.n}</td><td>${ah.rev}</td><td>${ah.cont}</td><td>${ah.flat}</td><td class="${cls(ah.revRate - 0.5)}">разворот ${wpct(ah.revRate, 0)}</td></tr>
          <tr><td>🔵 голубые (секстиль/трин)</td><td>${as.n}</td><td>${as.rev}</td><td>${as.cont}</td><td>${as.flat}</td><td class="${cls(as.contRate - 0.5)}">продолжение ${wpct(as.contRate, 0)}</td></tr>
        </tbody></table>
        <p class="bt-recs" style="color:#8b93a7">Твоя гипотеза: красные → разворот ~3/4, голубые → продолжение. «вбок» = движение за горизонт меньше ${wpct(asp.minMove, 1)}.</p>
      </div>
      ${frc ? forceHTML(frc) : ''}
      ${trd ? tradesHTML(trd) : ''}
      <div class="lun-sec"><h3 style="margin:4px 0">Итог</h3><ul class="bt-recs">${summary(res, asp, frc, trd).map((r) => `<li>${r}</li>`).join('')}</ul></div>`;
  }

  function summary(res, asp, frc, trd) {
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
      const fe = trd.rows[0], b2 = fe.rr2, b3 = fe.rr3;
      if (b2.n >= 5) {
        const best = b2.expR >= b3.expR ? { rr: '1:2', t: b2 } : { rr: '1:3', t: b3 };
        out.push(`Сила + поглощение (${trd.nForceEng} сделок): при ${best.rr} винрейт ${wpct(best.t.winRate, 0)} при безубытке ${wpct(best.t.breakeven, 0)}, ожидание ${(best.t.expR >= 0 ? '+' : '') + best.t.expR.toFixed(2)}R — ${best.t.expR > 0.05 ? 'сетап плюсовой ✓, лучше брать ' + best.rr : 'на этом периоде без перевеса'}.`);
        const eng = trd.rows[3].rr2, fa = trd.rows[2].rr2;
        out.push(`Фильтр помогает? поглощение+сила ${(b2.expR >= 0 ? '+' : '') + b2.expR.toFixed(2)}R vs сила без поглощения ${(fa.expR >= 0 ? '+' : '') + fa.expR.toFixed(2)}R vs поглощение без силы ${(eng.expR >= 0 ? '+' : '') + eng.expR.toFixed(2)}R (все 1:2).`);
      } else out.push('Сила + поглощение — сделок мало для вывода, расширь период.');
    }
    out.push('Меняй период кнопками сверху (последние 2–3 года / без 2022) — сравни, где склонность чётче.');
    return out;
  }

  function openReport() {
    addCss();
    const bg = document.createElement('div'); bg.className = 'lun-modal-bg';
    const modal = document.createElement('div'); modal.className = 'lun-modal';
    modal.innerHTML = `<h2>Бэктест: зоны Луны и аспекты · ${state.title || 'USD/RUB'}<span class="x" title="закрыть">×</span></h2>
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
    let lastText = '';
    const refresh = (opts, btn) => {
      modal.querySelectorAll('.bt-ctrl .lun-btn').forEach((x) => x.classList.remove('active')); if (btn) btn.classList.add('active');
      const res = analyze(state.bars, window.LUN.CYCLES[0].zones, opts);
      const asp = analyzeAspects(state.bars, opts);
      const frc = analyzeForce(state.bars, window.LUN.CYCLES[0].zones, opts);
      const trd = analyzeForceTrades(state.bars, opts);
      modal.querySelector('#bt-content').innerHTML = contentHTML(res, asp, frc, trd);
      lastText = plainReport(res, asp, frc, trd);
    };
    const now = Date.now(), yr = 365 * 86400000;
    const optsFor = (p) => p === 'no2022' ? { exclude2022: true } : (p === 'all' ? {} : { fromTs: now - (+p) * yr });
    modal.querySelectorAll('.bt-ctrl .lun-btn').forEach((btn) => { btn.onclick = () => refresh(optsFor(btn.dataset.p), btn); });
    modal.querySelector('#bt-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(lastText); modal.querySelector('#bt-copy').textContent = 'скопировано ✓'; };
    refresh({ fromTs: now - 3 * yr }, modal.querySelector('[data-p="3"]'));   // по умолчанию 3 года
  }

  function plainReport(res, asp, frc, trd) {
    let t = `Бэктест ${state.title || 'USD/RUB'} · ${dstr(res.from)}…${dstr(res.to)} · дней ${res.days} · базовый винрейт ${wpct(res.baseUp, 1)} · стратегия зон(интрадей) ${pct(res.strategyIntraday, 0)}\n\nЗОНЫ (винрейт направления):\n`;
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
      const cell = (t2) => `винрейт ${wpct(t2.winRate, 0)}/BE ${wpct(t2.breakeven, 0)}, ожид ${(t2.expR >= 0 ? '+' : '') + t2.expR.toFixed(2)}R (${t2.n} сд.)`;
      t += `\nАВТОТОРГОВЛЯ (вход=откр.след.бара, стоп за бар):\n`;
      trd.rows.forEach((r) => { t += `  ${r.key}${r.note ? ' *' : ''}:\n    1:2 — ${cell(r.rr2)}\n    1:3 — ${cell(r.rr3)}\n`; });
    }
    return t;
  }

  // sym: { engine, market, ticker, title } — инструмент с графика; иначе USD/RUB спот.
  async function run(sym) {
    const status = document.getElementById('datasource');
    const prev = status ? status.textContent : '';
    const src = sym && sym.ticker
      ? { engine: sym.engine || 'futures', market: sym.market || 'forts', ticker: sym.ticker, title: sym.title || sym.ticker }
      : { engine: 'currency', market: 'selt', ticker: 'USD000UTSTOM', title: 'USD/RUB спот' };
    const futures = src.engine === 'futures';
    const prefix = futures ? src.ticker.replace(/[FGHJKMNQUVXZ]\d$/, '') : null;   // SiU6 -> Si
    if (status) status.textContent = 'бэктест: загрузка ' + (futures ? 'непрерывного ' + prefix + ' (склейка 5 лет)' : src.title) + '…';
    try {
      const key = futures ? 'cont/' + prefix : src.engine + '/' + src.market + '/' + src.ticker;
      if (state.barsKey !== key) {
        let bars;
        if (futures) {
          bars = await window.LunISS.fetchContinuousFutures(prefix, 5);
        } else {
          const till = new Date(), from = new Date(till.getTime() - 9 * 366 * 86400000);
          const fmt = (d) => d.toISOString().slice(0, 10);
          bars = await window.LunISS.fetchCandlesFrom(src.engine, src.market, src.ticker, 24, fmt(from), fmt(till));
        }
        if (!bars || bars.length < 60) throw new Error('мало данных (' + (bars ? bars.length : 0) + ')');
        bars.sort((a, b) => a.timestamp - b.timestamp);
        state.bars = bars; state.barsKey = key;
        state.title = futures ? prefix + ' (непрерывный, склейка)' : src.title;
      }
      openReport();
    } catch (e) {
      alert('Бэктест не удался: ' + e.message + '\nНужны живые данные MOEX (проверь строку данных).');
    } finally { if (status) status.textContent = prev; }
  }

  window.LunBacktest = { analyze, analyzeAspects, analyzeForce, analyzeForceTrades, run };
})();
