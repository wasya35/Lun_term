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

  function contentHTML(res, asp) {
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
      <div class="lun-sec"><h3 style="margin:4px 0">Итог</h3><ul class="bt-recs">${summary(res, asp).map((r) => `<li>${r}</li>`).join('')}</ul></div>`;
  }

  function summary(res, asp) {
    const out = [];
    const good = res.zoneStats.filter((z) => z.bias !== 'range' && z.z >= 1.6 && z.winRate > 0.5);
    const bad = res.zoneStats.filter((z) => z.bias !== 'range' && z.winRate < 0.5);
    out.push(good.length ? `Отрабатывают: ${good.map((z) => z.label + ' (' + wpct(z.winRate, 0) + ')').join(', ')}.` : 'Ни одна зона не даёт значимого перевеса винрейта на этом периоде.');
    if (bad.length) out.push(`Не отрабатывают (винрейт <50%): ${bad.map((z) => z.label).join(', ')} — на этом периоде против направления.`);
    if (asp.hard.n >= 8) out.push(`Красные аспекты ☉/☿: разворот в ${wpct(asp.hard.revRate, 0)} случаев (${asp.hard.rev} из ${asp.hard.rev + asp.hard.cont}) — ${asp.hard.revRate >= 0.65 ? 'гипотеза про разворот подтверждается ✓' : 'до 3/4 не дотягивает на этом периоде'}.`);
    if (asp.soft.n >= 8) out.push(`Голубые аспекты: продолжение в ${wpct(asp.soft.contRate, 0)} случаев.`);
    const flips = res.signStats.filter((s) => Math.sign(s.h1) !== Math.sign(s.h2) && s.n > 40).map((s) => s.name);
    if (flips.length) out.push(`Слом направления на 15° заметен в знаках: ${flips.join(', ')}.`);
    out.push('Меняй период кнопками сверху (последние 2–3 года / без 2022) — сравни, где склонность чётче.');
    return out;
  }

  function openReport() {
    addCss();
    const bg = document.createElement('div'); bg.className = 'lun-modal-bg';
    const modal = document.createElement('div'); modal.className = 'lun-modal';
    modal.innerHTML = `<h2>Бэктест: зоны Луны и аспекты ☉/☿ · USD/RUB<span class="x" title="закрыть">×</span></h2>
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
      modal.querySelector('#bt-content').innerHTML = contentHTML(res, asp);
      lastText = plainReport(res, asp);
    };
    const now = Date.now(), yr = 365 * 86400000;
    const optsFor = (p) => p === 'no2022' ? { exclude2022: true } : (p === 'all' ? {} : { fromTs: now - (+p) * yr });
    modal.querySelectorAll('.bt-ctrl .lun-btn').forEach((btn) => { btn.onclick = () => refresh(optsFor(btn.dataset.p), btn); });
    modal.querySelector('#bt-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(lastText); modal.querySelector('#bt-copy').textContent = 'скопировано ✓'; };
    refresh({ fromTs: now - 3 * yr }, modal.querySelector('[data-p="3"]'));   // по умолчанию 3 года
  }

  function plainReport(res, asp) {
    let t = `Бэктест USD/RUB · ${dstr(res.from)}…${dstr(res.to)} · дней ${res.days} · базовый винрейт ${wpct(res.baseUp, 1)} · стратегия зон(интрадей) ${pct(res.strategyIntraday, 0)}\n\nЗОНЫ (винрейт направления):\n`;
    res.zoneStats.forEach((z) => { t += `  ${z.label} [${z.from}-${z.to}° ${z.bias}] n=${z.nDir} винрейт=${wpct(z.winRate, 1)} z=${z.z.toFixed(1)} ср=${pct(z.tradeMean, 3)}\n`; });
    t += '\nЗНАКИ (дни↑ | 0-15↑ | 15-30↑):\n';
    res.signStats.forEach((s) => { t += `  ${s.name} n=${s.n} ${wpct(s.up, 0)} | ${wpct(s.h1up, 0)} | ${wpct(s.h2up, 0)}\n`; });
    t += `\nАСПЕКТЫ ☉/☿ (${asp.frame}, орб ${asp.orb}, гор ${asp.H}д):\n`;
    t += `  красные: разворот ${wpct(asp.hard.revRate, 0)} (${asp.hard.rev}/${asp.hard.rev + asp.hard.cont}), вбок ${asp.hard.flat}\n`;
    t += `  голубые: продолжение ${wpct(asp.soft.contRate, 0)} (${asp.soft.cont}/${asp.soft.rev + asp.soft.cont}), вбок ${asp.soft.flat}\n`;
    return t;
  }

  async function run() {
    const status = document.getElementById('datasource');
    const prev = status ? status.textContent : '';
    if (status) status.textContent = 'бэктест: загрузка истории USD/RUB…';
    try {
      if (!state.bars) {
        const till = new Date(), from = new Date(till.getTime() - 9 * 366 * 86400000);
        const fmt = (d) => d.toISOString().slice(0, 10);
        const bars = await window.LunISS.fetchCandlesFrom('currency', 'selt', 'USD000UTSTOM', 24, fmt(from), fmt(till));
        if (!bars || bars.length < 100) throw new Error('мало данных (' + (bars ? bars.length : 0) + ')');
        bars.sort((a, b) => a.timestamp - b.timestamp);
        state.bars = bars;
      }
      openReport();
    } catch (e) {
      alert('Бэктест не удался: ' + e.message + '\nНужны живые данные MOEX (проверь строку данных).');
    } finally { if (status) status.textContent = prev; }
  }

  window.LunBacktest = { analyze, analyzeAspects, run };
})();
