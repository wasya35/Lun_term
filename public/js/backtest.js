/* =============================================================================
 *  backtest.js — сверка лунных зон с историей USD/RUB
 * =============================================================================
 *  Берёт дневные свечи USD/RUB (валютный рынок MOEX, USD000UTSTOM — годы истории),
 *  для каждого дня считает долготу Луны → знак/декан/зону, и оценивает:
 *    • работают ли зоны (лонг реально растёт, шорт падает);
 *    • средняя дневная доходность по каждому знаку и декану (где разворот);
 *    • P&L стратегии «лонг в лонг-зонах, шорт в шорт-зонах» vs buy&hold;
 *    • авто-рекомендации по уточнению границ зон.
 *  Считает LONG как ставку на РОСТ USD/RUB (= лонг Si).
 * ===========================================================================*/
(function () {
  const SIGNS = () => window.LUN.SIGNS;

  function biasSign(b) { return b === 'long' ? 1 : (b === 'short' ? -1 : 0); }

  function newBucket() { return { n: 0, sum: 0, sum2: 0, up: 0, down: 0, cum: 1 }; }
  function push(b, r) { b.n++; b.sum += r; b.sum2 += r * r; if (r > 0) b.up++; else if (r < 0) b.down++; b.cum *= (1 + r); }
  function stat(b) {
    const mean = b.n ? b.sum / b.n : 0;
    const varr = b.n > 1 ? Math.max(0, b.sum2 / b.n - mean * mean) * b.n / (b.n - 1) : 0;
    const sd = Math.sqrt(varr);
    const t = (b.n > 1 && sd > 0) ? mean / (sd / Math.sqrt(b.n)) : 0;
    return { n: b.n, mean, sd, t, cum: b.cum - 1, winUp: b.n ? b.up / b.n : 0, winDown: b.n ? b.down / b.n : 0 };
  }

  /* --- основной анализ (чистая функция) ---
   * bars: [{timestamp, close}] по возрастанию; zones: LUN.CYCLES[0].zones;
   * moonFn(ts) -> {lon, signIndex, degInSign} (по умолчанию LunAstro.moonInfo). */
  function analyze(bars, zones, moonFn) {
    moonFn = moonFn || window.LunAstro.moonInfo;
    const zoneOf = (lon) => window.LunAstro.zoneOf(lon, zones);
    const bySign = Array.from({ length: 12 }, newBucket);
    const byDecan = Array.from({ length: 36 }, newBucket);
    const byZone = new Map();               // label -> {bucket, bias, from, to}
    zones.forEach((z) => byZone.set(z.label + '|' + z.from, { bucket: newBucket(), bias: z.bias, from: z.from, to: z.to, label: z.label }));
    let stratCum = 1, bhCum = 1, days = 0;

    for (let i = 1; i < bars.length; i++) {
      const c0 = bars[i - 1].close, c1 = bars[i].close;
      if (!(c0 > 0) || !(c1 > 0)) continue;
      const r = c1 / c0 - 1;
      if (!isFinite(r) || Math.abs(r) > 0.5) continue;      // отбрасываем аномалии/разрывы контракта
      const m = moonFn(bars[i].timestamp);
      days++; bhCum *= (1 + r);
      push(bySign[m.signIndex], r);
      push(byDecan[m.signIndex * 3 + Math.min(2, Math.floor(m.degInSign / 10))], r);
      const z = zoneOf(m.lon);
      if (z) {
        const key = z.label + '|' + z.from;
        const rec = byZone.get(key); if (rec) push(rec.bucket, r);
        stratCum *= (1 + biasSign(z.bias) * r);
      }
    }

    const signs = SIGNS();
    const signStats = bySign.map((b, i) => ({ i, name: signs[i].name, glyph: signs[i].glyph, ...stat(b) }));
    const decanStats = byDecan.map((b, i) => ({ i, signIndex: (i / 3) | 0, decan: i % 3, from: (i * 10), ...stat(b) }));
    const zoneStats = [...byZone.values()].map((z) => {
      const s = stat(z.bucket);
      const edge = s.mean * biasSign(z.bias);          // >0 — зона работает в свою сторону
      return { label: z.label, from: z.from, to: z.to, bias: z.bias, ...s, edge };
    });

    return {
      days, from: bars[1] ? bars[1].timestamp : null, to: bars[bars.length - 1] ? bars[bars.length - 1].timestamp : null,
      strategyReturn: stratCum - 1, buyHoldReturn: bhCum - 1,
      signStats, decanStats, zoneStats,
      recommendations: recommend(signStats, decanStats, zoneStats),
    };
  }

  /* --- авто-рекомендации --- */
  function recommend(signStats, decanStats, zoneStats) {
    const recs = [];
    // 1) оценка каждой зоны
    zoneStats.forEach((z) => {
      const strong = Math.abs(z.t) >= 2;
      if (z.bias === 'range') {
        recs.push(`Зона «${z.label}» (${z.from}–${z.to}°): средняя ${(z.mean * 100).toFixed(3)}%/день — ${Math.abs(z.mean) < 0.0007 ? 'действительно близко к рэнджу ✓' : 'есть уклон, возможно это лонг/шорт'}.`);
      } else {
        const works = z.edge > 0;
        recs.push(`Зона «${z.label}» (${z.from}–${z.to}°, ${z.bias === 'long' ? 'ЛОНГ' : 'ШОРТ'}): ${(z.mean * 100).toFixed(3)}%/день, накопл. ${(z.cum * 100).toFixed(1)}% — ${works ? (strong ? 'подтверждается ✓ (значимо)' : 'подтверждается, но слабо') : (strong ? 'ПРОТИВ ✗ (значимо в обратную сторону — рассмотреть инверсию)' : 'не подтверждается (слабо)')}.`);
      }
    });
    // 2) знаки с явным уклоном
    const bull = signStats.filter((s) => s.mean > 0 && s.t > 1.3).sort((a, b) => b.mean - a.mean);
    const bear = signStats.filter((s) => s.mean < 0 && s.t < -1.3).sort((a, b) => a.mean - b.mean);
    if (bull.length) recs.push('Наиболее «лонговые» знаки USD/RUB (рост): ' + bull.map((s) => `${s.glyph}${s.name} (${(s.mean * 100).toFixed(3)}%)`).join(', ') + '.');
    if (bear.length) recs.push('Наиболее «шортовые» знаки (падение): ' + bear.map((s) => `${s.glyph}${s.name} (${(s.mean * 100).toFixed(3)}%)`).join(', ') + '.');
    // 3) границы по деканам: где средняя доходность меняет знак
    const sign = (x) => (x > 0 ? '+' : (x < 0 ? '−' : '0'));
    let flips = [];
    for (let i = 0; i < 36; i++) {
      const a = decanStats[i], b = decanStats[(i + 1) % 36];
      if (sign(a.mean) !== sign(b.mean) && a.n > 10 && b.n > 10) flips.push(((i + 1) * 10) % 360);
    }
    if (flips.length) recs.push('Смена знака средней доходности (кандидаты в границы зон, °): ' + flips.join(', ') + '. Сравни со своими 75/135/195/240/285.');
    recs.push('⚠️ Статистика: ~2000 дней на 12 знаков ≈ по 170 дней; на 36 деканов ≈ по 55. Доверяй прежде всего знакам/зонам с |t|≥2. Период включает аномалию 2022 (сильные движения рубля) — держи это в уме при трактовке.');
    return recs;
  }

  /* ------------------------------- отчёт (UI) ------------------------------- */
  const css = `
  .bt-wrap{padding:0}
  .bt-sum{display:flex;gap:18px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid #1c2230}
  .bt-sum b{color:#d7deea}
  .bt-tbl{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}
  .bt-tbl th,.bt-tbl td{padding:3px 8px;text-align:right;border-bottom:1px solid #1c2230}
  .bt-tbl th:first-child,.bt-tbl td:first-child{text-align:left}
  .bt-tbl th{color:#8b93a7;font-weight:400}
  .bt-pos{color:#26a69a}.bt-neg{color:#ef5350}.bt-mut{color:#6b7280}
  .bt-recs li{margin:4px 0;font-size:12.5px}
  .bt-note{color:#8b93a7;font-size:11px}`;
  let cssAdded = false;
  function addCss() { if (cssAdded) return; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); cssAdded = true; }
  const pct = (x, d = 2) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
  const cls = (x) => x > 0 ? 'bt-pos' : (x < 0 ? 'bt-neg' : 'bt-mut');
  const dstr = (ts) => new Date(ts).toISOString().slice(0, 10);

  function signChart(signStats) {
    const w = 720, h = 150, pad = 18;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.style.maxWidth = '100%';
    const ctx = cv.getContext('2d');
    const max = Math.max(...signStats.map((s) => Math.abs(s.mean)), 1e-4);
    const bw = (w - pad * 2) / 12, zero = h / 2;
    ctx.strokeStyle = '#2a3242'; ctx.beginPath(); ctx.moveTo(0, zero); ctx.lineTo(w, zero); ctx.stroke();
    signStats.forEach((s, i) => {
      const x = pad + i * bw, bh = (s.mean / max) * (h / 2 - pad);
      ctx.fillStyle = s.mean >= 0 ? '#26a69a' : '#ef5350';
      ctx.fillRect(x + 3, zero - Math.max(0, bh), bw - 6, Math.abs(bh));
      ctx.fillStyle = '#8b93a7'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(s.glyph, x + bw / 2, h - 4);
    });
    return cv;
  }

  function render(res, meta) {
    addCss();
    const bg = document.createElement('div'); bg.className = 'lun-modal-bg';
    const modal = document.createElement('div'); modal.className = 'lun-modal';
    const zoneRows = res.zoneStats.map((z) => {
      const v = z.bias === 'range' ? (Math.abs(z.mean) < 0.0007 ? 'рэндж ✓' : 'есть уклон') : (z.edge > 0 ? (Math.abs(z.t) >= 2 ? 'работает ✓' : 'слабо +') : (Math.abs(z.t) >= 2 ? 'против ✗' : 'слабо −'));
      return `<tr><td>${z.label}</td><td>${z.from}–${z.to}°</td><td>${z.bias}</td><td>${z.n}</td>
        <td class="${cls(z.mean)}">${pct(z.mean, 3)}</td><td class="${cls(z.cum)}">${pct(z.cum, 1)}</td>
        <td>${(z.winUp * 100).toFixed(0)}%↑</td><td>${z.t.toFixed(1)}</td><td>${v}</td></tr>`;
    }).join('');
    const signRows = res.signStats.map((s) => `<tr><td>${s.glyph} ${s.name}</td><td>${s.n}</td>
      <td class="${cls(s.mean)}">${pct(s.mean, 3)}</td><td class="${cls(s.cum)}">${pct(s.cum, 1)}</td>
      <td>${s.t.toFixed(1)}</td><td>${s.t > 1.3 ? 'бычий' : (s.t < -1.3 ? 'медвежий' : '—')}</td></tr>`).join('');

    modal.innerHTML = `
      <h2>Бэктест лунных зон · ${meta.title}<span class="x" title="закрыть">×</span></h2>
      <div class="bt-wrap">
        <div class="bt-sum">
          <span>Период: <b>${res.from ? dstr(res.from) : '—'} … ${res.to ? dstr(res.to) : '—'}</b></span>
          <span>Дней: <b>${res.days}</b></span>
          <span>Стратегия (лонг/шорт по зонам): <b class="${cls(res.strategyReturn)}">${pct(res.strategyReturn, 0)}</b></span>
          <span>Buy&Hold: <b class="${cls(res.buyHoldReturn)}">${pct(res.buyHoldReturn, 0)}</b></span>
        </div>
        <div class="lun-sec"><h3 style="margin:4px 0">Зоны</h3>
          <table class="bt-tbl"><thead><tr><th>зона</th><th>°</th><th>bias</th><th>дней</th><th>сред/день</th><th>накопл.</th><th>дни↑</th><th>t</th><th>вывод</th></tr></thead><tbody>${zoneRows}</tbody></table>
        </div>
        <div class="lun-sec"><h3 style="margin:4px 0">Средняя дневная доходность USD/RUB по знакам Луны</h3>
          <div id="bt-chart"></div>
          <table class="bt-tbl"><thead><tr><th>знак</th><th>дней</th><th>сред/день</th><th>накопл.</th><th>t</th><th>склонность</th></tr></thead><tbody>${signRows}</tbody></table>
        </div>
        <div class="lun-sec"><h3 style="margin:4px 0">Рекомендации</h3>
          <ul class="bt-recs">${res.recommendations.map((r) => `<li>${r}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="lun-foot"><button class="lun-btn" id="bt-copy">Скопировать отчёт</button><span style="flex:1"></span><button class="lun-btn primary" id="bt-close">Закрыть</button></div>`;
    bg.appendChild(modal); document.body.appendChild(bg);
    modal.querySelector('#bt-chart').appendChild(signChart(res.signStats));
    const close = () => bg.remove();
    modal.querySelector('.x').onclick = close;
    modal.querySelector('#bt-close').onclick = close;
    bg.onclick = (e) => { if (e.target === bg) close(); };
    modal.querySelector('#bt-copy').onclick = () => {
      const txt = plainReport(res, meta);
      navigator.clipboard && navigator.clipboard.writeText(txt);
      modal.querySelector('#bt-copy').textContent = 'скопировано ✓';
    };
  }

  function plainReport(res, meta) {
    let t = `Бэктест лунных зон — ${meta.title}\nПериод ${dstr(res.from)}…${dstr(res.to)}, дней ${res.days}\nСтратегия ${pct(res.strategyReturn, 0)} · Buy&Hold ${pct(res.buyHoldReturn, 0)}\n\nЗОНЫ:\n`;
    res.zoneStats.forEach((z) => { t += `  ${z.label} [${z.from}-${z.to}° ${z.bias}] n=${z.n} сред=${pct(z.mean, 3)} накопл=${pct(z.cum, 1)} t=${z.t.toFixed(1)}\n`; });
    t += '\nЗНАКИ:\n';
    res.signStats.forEach((s) => { t += `  ${s.name} n=${s.n} сред=${pct(s.mean, 3)} накопл=${pct(s.cum, 1)} t=${s.t.toFixed(1)}\n`; });
    t += '\nРЕКОМЕНДАЦИИ:\n' + res.recommendations.map((r) => '  - ' + r).join('\n');
    return t;
  }

  /* ------------------------------- запуск ------------------------------- */
  async function run(years) {
    years = years || 8;
    const status = document.getElementById('datasource');
    const prev = status ? status.textContent : '';
    if (status) status.textContent = 'бэктест: загрузка истории USD/RUB…';
    try {
      const till = new Date();
      const from = new Date(till.getTime() - years * 366 * 86400000);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const bars = await window.LunISS.fetchCandlesFrom('currency', 'selt', 'USD000UTSTOM', 24, fmt(from), fmt(till));
      if (!bars || bars.length < 100) throw new Error('мало данных (' + (bars ? bars.length : 0) + ')');
      bars.sort((a, b) => a.timestamp - b.timestamp);
      const res = analyze(bars, window.LUN.CYCLES[0].zones);
      render(res, { title: 'USD/RUB · ' + years + ' лет' });
    } catch (e) {
      alert('Бэктест не удался: ' + e.message + '\nНужны живые данные MOEX (проверь строку данных).');
    } finally {
      if (status) status.textContent = prev;
    }
  }

  window.LunBacktest = { analyze, render, run };
})();

