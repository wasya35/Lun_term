/* =============================================================================
 *  moex-futoi.js — MOEX AlgoPack FUTOI: позиционирование физ/юр (лист «F&Y»)
 * =============================================================================
 *  Данные грузятся через window.LunISS.fetchFUTOI (онлайн AlgoPack с фолбэком на
 *  отложенный публичный ISS). Здесь: нормализация снимков в физ/юр × лонг/шорт
 *  (гросс-контракты + число лиц) + дельты «бар-к-бару» и накопительно; панель
 *  «Поток физ/юр» (FutoiFlow) и окно «Данные» (по бару / накопительно), как в
 *  референс-терминале.
 *
 *  window.LunFutoi = { normalize, openWindow }
 *  Индикатор: FutoiFlow (нижняя панель со столбиками потока по включённым сериям)
 * ===========================================================================*/
(function () {
  const kc = window.klinecharts;

  // --- строка futoi -> момент (МСК, UTC+3) ---
  function rowTs(r) {
    const d = r.tradedate || r.TRADEDATE || '';
    const t = r.tradetime || r.TRADETIME || '00:00:00';
    if (!d) return null;
    const ms = Date.parse(String(d) + 'T' + String(t) + '+03:00');
    return Number.isFinite(ms) ? ms : null;
  }
  const numOf = (r, keys) => { for (const k of keys) if (r[k] != null) return +r[k] || 0; return 0; };
  const fmtInt = (n) => { const s = Math.abs(Math.round(n)).toLocaleString('ru-RU'); return (n > 0 ? '+' : n < 0 ? '−' : '') + s; };

  /* Нормализация: сырые строки futoi -> отсортированные снимки.
   * У каждого снимка: fizL/fizS (гросс лонг/шорт, положительные), fizLn/fizSn
   * (число лиц), yur*; нетто fizNet/yurNet; ОИ oi. Плюс дельты к предыдущему
   * снимку (dFizL, dFizLn, ...) и накопительные суммы дельт (cFizL, ...). */
  function normalize(rows) {
    const byTs = new Map();
    for (const r of rows || []) {
      const ts = rowTs(r); if (ts == null) continue;
      const g = String(r.clgroup || r.CLGROUP || '').toUpperCase();
      if (g !== 'FIZ' && g !== 'YUR') continue;
      let s = byTs.get(ts);
      if (!s) { s = { ts, date: r.tradedate || r.TRADEDATE || '', time: (r.tradetime || r.TRADETIME || '').slice(0, 8) }; byTs.set(ts, s); }
      const p = g === 'FIZ' ? 'fiz' : 'yur';
      s[p + 'L'] = Math.abs(numOf(r, ['pos_long', 'POS_LONG']));
      s[p + 'S'] = Math.abs(numOf(r, ['pos_short', 'POS_SHORT']));
      s[p + 'Ln'] = numOf(r, ['pos_long_num', 'POS_LONG_NUM']);
      s[p + 'Sn'] = numOf(r, ['pos_short_num', 'POS_SHORT_NUM']);
    }
    const snaps = [...byTs.values()].sort((a, b) => a.ts - b.ts);
    const FLD = ['fizL', 'fizS', 'yurL', 'yurS', 'fizLn', 'fizSn', 'yurLn', 'yurSn'];
    const cum = {}; FLD.forEach((f) => (cum[f] = 0));
    for (let i = 0; i < snaps.length; i++) {
      const c = snaps[i], prev = snaps[i - 1] || null;
      FLD.forEach((f) => {
        const d = i === 0 ? 0 : ((c[f] || 0) - (prev[f] || 0));
        c['d' + f[0].toUpperCase() + f.slice(1)] = d;   // dFizL, dFizLn, ...
        cum[f] += d; c['c' + f[0].toUpperCase() + f.slice(1)] = cum[f];
      });
      c.fizNet = (c.fizL || 0) - (c.fizS || 0);
      c.yurNet = (c.yurL || 0) - (c.yurS || 0);
      c.oi = (c.fizL || 0) + (c.yurL || 0);   // одна сторона (лонги физ+юр) ≈ ОИ
    }
    return snaps;
  }

  // Разложить снимки по индексам баров графика: для каждого снимка ищем бар,
  // в чей интервал [ts_i, ts_{i+1}) он попадает; суммируем дельты в этом баре.
  function bucketByBar(snaps, list) {
    const out = new Map();      // barIndex -> {dFizL,dFizS,dYurL,dYurS,...}
    if (!snaps.length || !list.length) return out;
    const ts = list.map((b) => b.timestamp);
    const lo = (t) => { // индекс бара: последний с ts<=t
      let a = 0, b = ts.length - 1, r = -1;
      while (a <= b) { const m = (a + b) >> 1; if (ts[m] <= t) { r = m; a = m + 1; } else b = m - 1; }
      return r;
    };
    for (const s of snaps) {
      const i = lo(s.ts); if (i < 0) continue;
      let a = out.get(i); if (!a) { a = { dFizL: 0, dFizS: 0, dYurL: 0, dYurS: 0, dFizLn: 0, dFizSn: 0, dYurLn: 0, dYurSn: 0 }; out.set(i, a); }
      a.dFizL += s.dFizL || 0; a.dFizS += s.dFizS || 0; a.dYurL += s.dYurL || 0; a.dYurS += s.dYurS || 0;
      a.dFizLn += s.dFizLn || 0; a.dFizSn += s.dFizSn || 0; a.dYurLn += s.dYurLn || 0; a.dYurSn += s.dYurSn || 0;
    }
    return out;
  }

  /* --- Панель «Поток физ/юр» -------------------------------------------------
   * extendData: { snaps, show } где show — множество включённых серий из:
   *   'fizL+','fizL-','fizS+','fizS-','yurL+','yurL-','yurS+','yurS-'
   * '+' = открытие (положительная дельта), '-' = закрытие (отрицательная).
   * Столбики от нулевой линии: открытие вверх, закрытие вниз. Высота нормируется
   * по максимуму |дельты| в видимом диапазоне. */
  const SERIES = {
    fizL: { label: 'Ф.Лонг', col: '#26a69a' },
    fizS: { label: 'Ф.Шорт', col: '#ef5350' },
    yurL: { label: 'Ю.Лонг', col: '#4b9be6' },
    yurS: { label: 'Ю.Шорт', col: '#e0a030' },
  };
  kc.registerIndicator({
    name: 'FutoiFlow',
    shortName: 'Поток физ/юр',
    series: 'normal',
    figures: [],
    calc: (dataList) => dataList.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const ed = indicator.extendData || {};
      const snaps = ed.snaps || [];
      const show = ed.show || {};
      const H = bounding.height, W = bounding.width, mid = Math.round(H / 2);
      // нулевая линия
      ctx.strokeStyle = '#2a3242'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      if (!snaps.length) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '11px system-ui, sans-serif';
        ctx.fillText('нет данных FUTOI за период', W / 2, H / 2);
        return true;
      }
      const list = chart.getDataList();
      const buckets = bucketByBar(snaps, list);
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from | 0), to = Math.min(list.length, Math.ceil(range.to) + 1);
      // какие ключи серий активны и с каким знаком
      const active = [];   // {ser, sign}
      for (const k of Object.keys(show)) {
        if (!show[k]) continue;
        const ser = k.slice(0, -1), sign = k.slice(-1) === '+' ? 1 : -1;
        if (SERIES[ser]) active.push({ ser, sign, key: k });
      }
      if (!active.length) return true;
      // масштаб: максимум |значения| среди видимых баров и активных серий
      let maxV = 1;
      for (let i = from; i < to; i++) {
        const a = buckets.get(i); if (!a) continue;
        for (const s of active) {
          const v = a['d' + s.ser[0].toUpperCase() + s.ser.slice(1)] || 0;
          if ((s.sign > 0 && v > 0) || (s.sign < 0 && v < 0)) maxV = Math.max(maxV, Math.abs(v));
        }
      }
      let bw = 6; try { bw = chart.getBarSpace().bar; } catch (e) {}
      const group = active.length;
      const slotW = Math.max(1, (bw * 0.8) / group);
      for (let i = from; i < to; i++) {
        const a = buckets.get(i); if (!a) continue;
        const xc = xAxis.convertToPixel(i);
        let gi = 0;
        for (const s of active) {
          const v = a['d' + s.ser[0].toUpperCase() + s.ser.slice(1)] || 0;
          const take = (s.sign > 0 && v > 0) || (s.sign < 0 && v < 0);
          if (take) {
            const h = Math.max(1, (Math.abs(v) / maxV) * (mid - 2));
            const x = xc - (bw * 0.4) + gi * slotW;
            const base = SERIES[s.ser].col;
            ctx.fillStyle = s.sign > 0 ? base : (base + '88');   // закрытие — полупрозрачнее
            if (s.sign > 0) ctx.fillRect(x, mid - h, Math.max(1, slotW * 0.9), h);      // открытие вверх
            else ctx.fillRect(x, mid, Math.max(1, slotW * 0.9), h);                     // закрытие вниз
          }
          gi++;
        }
      }
      // легенда серий (сверху слева)
      ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.font = '10px system-ui, sans-serif';
      let lx = 4;
      for (const s of active) {
        const label = SERIES[s.ser].label + (s.sign > 0 ? '+' : '−');
        ctx.fillStyle = s.sign > 0 ? SERIES[s.ser].col : SERIES[s.ser].col + 'aa';
        ctx.fillText(label, lx, 2); lx += ctx.measureText(label).width + 8;
      }
      return true;
    },
  });

  /* --- Окно «Данные» ---------------------------------------------------------
   * Таблица по снимкам: Время | Ф.Лонг | Ф.Шорт | Ю.Лонг | Ю.Шорт.
   * Режимы: «По бару» (дельта к предыдущему снимку) и «Накопительно» (сумма
   * дельт с начала окна). В ячейке — контракты (крупно) и число лиц («сч.»). */
  function openWindow(opts) {
    opts = opts || {};
    const snaps = opts.snaps || [];
    const code = opts.code || '';
    const src = opts.src === 'online' ? 'AlgoPack · онлайн' : (opts.src === 'delayed' ? 'ISS · отложенный (T−15)' : '');
    document.getElementById('futoi-data-win')?.remove();
    // уникальные даты (новые сверху) для календаря
    const dates = [...new Set(snaps.map((s) => s.date).filter(Boolean))].sort().reverse();
    const cell = (v, n) => `<div class="fd-cell"><span class="fd-v ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${fmtInt(v)}</span><span class="fd-n">${fmtInt(n)} сч.</span></div>`;
    const win = document.createElement('div');
    win.id = 'futoi-data-win'; win.className = 'fd-float';
    win.innerHTML = `
      <div class="fd-head" data-drag="1">
        <b>Данные FUTOI · ${code || '—'}</b>
        <select class="fd-date" title="Дата">
          <option value="">Все дни</option>
          ${dates.map((d) => `<option value="${d}">${d}</option>`).join('')}
        </select>
        <span class="fd-src">${src}</span>
        <button class="fd-x" title="Закрыть">✕</button>
      </div>
      <div class="fd-sum"></div>
      <div class="fd-tabs">
        <button class="fd-tab active" data-mode="bar">По бару</button>
        <button class="fd-tab" data-mode="cum">Накопительно</button>
      </div>
      <div class="fd-tablewrap">
        <table class="fd-table">
          <thead><tr><th>Время</th><th>Ф.Лонг</th><th>Ф.Шорт</th><th>Ю.Лонг</th><th>Ю.Шорт</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>`;
    document.body.appendChild(win);
    const tbody = win.querySelector('tbody'), sumEl = win.querySelector('.fd-sum');
    const dateSel = win.querySelector('.fd-date');
    let mode = 'bar';
    const render = () => {
      const day = dateSel.value;
      const list = (day ? snaps.filter((s) => s.date === day) : snaps).slice().reverse();   // новые сверху
      const last = (day ? snaps.filter((s) => s.date === day) : snaps).slice(-1)[0] || {};
      sumEl.innerHTML =
        `<div>Ф нетто: <b class="${(last.fizNet || 0) >= 0 ? 'pos' : 'neg'}">${fmtInt(last.fizNet || 0)}</b> <span class="fd-n">(${(last.fizLn || 0).toLocaleString('ru-RU')}/${(last.fizSn || 0).toLocaleString('ru-RU')} лиц)</span></div>`
        + `<div>Ю нетто: <b class="${(last.yurNet || 0) >= 0 ? 'pos' : 'neg'}">${fmtInt(last.yurNet || 0)}</b> <span class="fd-n">(${(last.yurLn || 0).toLocaleString('ru-RU')}/${(last.yurSn || 0).toLocaleString('ru-RU')} лиц)</span></div>`
        + `<div class="fd-n">${day ? 'за ' + day : 'всего'}: ${list.length} снимк.${last.time ? ' · посл. ' + last.time : ''}</div>`;
      const pfx = mode === 'cum' ? 'c' : 'd';
      tbody.innerHTML = list.map((s) => {
        const when = day ? (s.time ? s.time.slice(0, 5) : '') : ((s.date || '') + (s.time ? ' ' + s.time.slice(0, 5) : ''));
        return `<tr><td class="fd-t">${when}</td>` +
          `<td>${cell(s[pfx + 'FizL'] || 0, s[pfx + 'FizLn'] || 0)}</td>` +
          `<td>${cell(s[pfx + 'FizS'] || 0, s[pfx + 'FizSn'] || 0)}</td>` +
          `<td>${cell(s[pfx + 'YurL'] || 0, s[pfx + 'YurLn'] || 0)}</td>` +
          `<td>${cell(s[pfx + 'YurS'] || 0, s[pfx + 'YurSn'] || 0)}</td></tr>`;
      }).join('') || '<tr><td colspan="5" class="fd-t">нет данных за дату</td></tr>';
    };
    if (dates.length) dateSel.value = dates[0];   // по умолчанию — последняя дата
    render();
    dateSel.onchange = render;
    win.querySelectorAll('.fd-tab').forEach((b) => b.onclick = () => {
      win.querySelectorAll('.fd-tab').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); mode = b.dataset.mode; render();
    });
    win.querySelector('.fd-x').onclick = () => win.remove();
    // перетаскивание за шапку
    const head = win.querySelector('.fd-head');
    head.addEventListener('mousedown', (e) => {
      if (e.target.closest('select,button')) return;
      const r = win.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      win.style.right = 'auto'; win.style.left = r.left + 'px'; win.style.top = r.top + 'px';
      const move = (ev) => { win.style.left = Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - ox)) + 'px'; win.style.top = Math.max(0, Math.min(window.innerHeight - 30, ev.clientY - oy)) + 'px'; };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
      e.preventDefault();
    });
  }

  /* =====================================================================
   *  TradeStats (AlgoPack SuperCandles) — ГОТОВЫЕ данные по каждому бару.
   *  Ничего не пересчитываем: oi_close = ОИ на бар, vol_b/vol_s = покупатели/
   *  продавцы (агрессор). Индикаторы: TradeOI (ОИ по бару) и BuySell.
   * ===================================================================== */
  const tsNum = (r, keys) => { for (const k of keys) if (r[k] != null) return +r[k] || 0; return 0; };
  // tradetime в tradestats — КОНЕЦ 5-мин интервала (сверено с минутными свечами:
  // строка 14:05:00 = сделки 14:00–14:05). Бар графика помечен началом, поэтому ts
  // сдвигаем на интервал назад — иначе покупатели/продавцы и ΔОИ ложились на бар позже.
  const TS_INTERVAL_MS = 5 * 60000;
  function normalizeTradeStats(rows) {
    const out = [];
    for (const r of rows || []) {
      const tEnd = rowTs(r); if (tEnd == null) continue;
      const ts = tEnd - TS_INTERVAL_MS;
      out.push({
        ts, date: r.tradedate || r.TRADEDATE || '', time: (r.tradetime || r.TRADETIME || '').slice(0, 8),
        oi: tsNum(r, ['oi_close', 'OI_CLOSE']),
        volB: tsNum(r, ['vol_b', 'VOL_B']), volS: tsNum(r, ['vol_s', 'VOL_S']),
        trB: tsNum(r, ['trades_b', 'TRADES_B']), trS: tsNum(r, ['trades_s', 'TRADES_S']),
        close: tsNum(r, ['pr_close', 'PR_CLOSE']),
      });
    }
    out.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < out.length; i++) out[i].doi = i ? (out[i].oi - out[i - 1].oi) : 0;
    return out;
  }
  const barIndexer = (list) => { const ts = list.map((b) => b.timestamp); return (t) => { let a = 0, b = ts.length - 1, r = -1; while (a <= b) { const m = (a + b) >> 1; if (ts[m] <= t) { r = m; a = m + 1; } else b = m - 1; } return r; }; };
  // строки tradestats -> по индексам баров: OI = последний oi_close в баре,
  // объёмы/сделки суммируются (несколько 5-мин снимков на бар старших ТФ).
  function tsByBar(rows, list) {
    const map = new Map(); if (!rows.length || !list.length) return map;
    const lo = barIndexer(list);
    for (const r of rows) {
      const i = lo(r.ts); if (i < 0) continue;
      let a = map.get(i); if (!a) { a = { oi: null, doi: 0, volB: 0, volS: 0, trB: 0, trS: 0 }; map.set(i, a); }
      if (r.oi) a.oi = r.oi; a.doi += r.doi; a.volB += r.volB; a.volS += r.volS; a.trB += r.trB; a.trS += r.trS;
    }
    return map;
  }
  const kfmt = (n) => { n = Math.abs(n); return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n)); };

  // ИЗМЕНЕНИЕ ОИ ПО БАРУ (ΔОИ = oi_close текущего − предыдущего). Столбики от нулевой
  // линии: рост ОИ вверх (зел., пришли позиции), падение вниз (красн., закрылись).
  // Высота = |ΔОИ|, нормировка по видимому окну. Крупные (по порогам 5k/10k/50k)
  // ярче и подписаны. Внизу тонкой линией — уровень ОИ (для контекста).
  kc.registerIndicator({
    name: 'TradeOI', shortName: 'ΔОИ (бар)', series: 'normal', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const ed = indicator.extendData || {};
      const rows = ed.rows || window.__troiRows || [];
      const thr = ed.thr || window.__troiThr || [5000, 10000, 50000];
      const H = bounding.height, W = bounding.width, list = chart.getDataList();
      ctx.textBaseline = 'top';
      if (!rows.length) { ctx.font = '16px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#8b93a7'; ctx.fillText('ΔОИ (бар): нет данных tradestats', 6, 4); return true; }
      const map = tsByBar(rows, list), range = chart.getVisibleRange();
      const from = Math.max(0, range.from | 0), to = Math.min(list.length, Math.ceil(range.to) + 1);
      const zeroY = Math.round(H * 0.46), maxBar = H * 0.34;
      const oiTop = H * 0.80, oiBot = H * 0.98;
      let maxAbs = 1, oiMn = Infinity, oiMx = -Infinity;
      for (let i = from; i < to; i++) { const a = map.get(i); if (!a) continue; if (Math.abs(a.doi) > maxAbs) maxAbs = Math.abs(a.doi); if (a.oi != null) { if (a.oi < oiMn) oiMn = a.oi; if (a.oi > oiMx) oiMx = a.oi; } }
      ctx.strokeStyle = '#2a3242'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(W, zeroY); ctx.stroke();
      const tierOf = (ab) => ab >= thr[2] ? 3 : (ab >= thr[1] ? 2 : (ab >= thr[0] ? 1 : 0)), ALPHA = [0.42, 0.62, 0.82, 1];
      let bw = 6; try { bw = chart.getBarSpace().bar; } catch (e) {} bw = Math.max(1, bw * 0.72);
      // уровень ОИ снизу — линия
      const yOI = (v) => (oiMx > oiMn) ? oiBot - ((v - oiMn) / (oiMx - oiMn)) * (oiBot - oiTop) : (oiTop + oiBot) / 2;
      ctx.strokeStyle = 'rgba(120,140,180,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); let started = false;
      for (let i = from; i < to; i++) { const a = map.get(i); if (!a || a.oi == null) continue; const x = xAxis.convertToPixel(i), y = yOI(a.oi); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }
      if (started) ctx.stroke();
      // столбики ΔОИ — БЕЗ подписей на барах
      for (let i = from; i < to; i++) {
        const a = map.get(i); if (!a) continue; const d = a.doi || 0; if (!d) continue;
        const up = d > 0, tier = tierOf(Math.abs(d)), x = xAxis.convertToPixel(i);
        const h = Math.max(1, (Math.abs(d) / maxAbs) * maxBar);
        ctx.fillStyle = (up ? 'rgba(38,166,154,' : 'rgba(239,83,80,') + ALPHA[tier] + ')';
        if (up) ctx.fillRect(x - bw / 2, zeroY - h, bw, h); else ctx.fillRect(x - bw / 2, zeroY, bw, h);
      }
      // СПРАВА: ОИ и ΔОИ бара под курсором (ed.hoverIdx) — или последнего. Со знаком.
      let hi = (ed.hoverIdx != null && ed.hoverIdx >= 0 && ed.hoverIdx < list.length) ? ed.hoverIdx : (list.length - 1);
      let a = map.get(hi); for (let i = hi; i >= 0 && !a; i--) a = map.get(i);
      ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textBaseline = 'top';
      if (a) {
        const doi = a.doi || 0, up = doi >= 0;
        const s2 = 'ΔОИ ' + (up ? '+' : '−') + kfmt(doi);
        const s1 = 'ОИ ' + kfmt(a.oi || 0) + '   ';
        ctx.textAlign = 'right';
        ctx.fillStyle = up ? '#34c98a' : '#ef5c6a'; ctx.fillText(s2, W - 8, 5);
        const w2 = ctx.measureText(s2).width;
        ctx.fillStyle = '#c8d0de'; ctx.fillText(s1, W - 8 - w2, 5);
      }
      return true;
    },
  });

  // Покупатели/Продавцы ПО БАРУ (готовые vol_b/vol_s, агрессор): покупатели вверх
  // (зел.), продавцы вниз (красн.) от нуля; нормировка по видимому окну.
  kc.registerIndicator({
    name: 'BuySell', shortName: 'Покуп/Прод', series: 'normal', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, indicator }) => {
      const ed = indicator.extendData || {}, rows = ed.rows || [];
      const H = bounding.height, W = bounding.width, mid = Math.round(H / 2), list = chart.getDataList();
      ctx.strokeStyle = '#2a3242'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
      ctx.font = '14px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      if (!rows.length) { ctx.fillStyle = '#8b93a7'; ctx.fillText('Покуп/Прод: нет данных tradestats', 6, 3); return true; }
      const map = tsByBar(rows, list), range = chart.getVisibleRange();
      const from = Math.max(0, range.from | 0), to = Math.min(list.length, Math.ceil(range.to) + 1);
      let mxv = 1; for (let i = from; i < to; i++) { const a = map.get(i); if (!a) continue; mxv = Math.max(mxv, a.volB, a.volS); }
      let bw = 6; try { bw = chart.getBarSpace().bar; } catch (e) {} bw = Math.max(1, bw * 0.72);
      for (let i = from; i < to; i++) {
        const a = map.get(i); if (!a) continue; const x = xAxis.convertToPixel(i);
        const hb = (a.volB / mxv) * (mid - 2), hs = (a.volS / mxv) * (mid - 2);
        ctx.fillStyle = 'rgba(38,166,154,0.85)'; ctx.fillRect(x - bw / 2, mid - hb, bw, hb);
        ctx.fillStyle = 'rgba(239,83,80,0.85)'; ctx.fillRect(x - bw / 2, mid, bw, hs);
      }
      ctx.fillStyle = '#26a69a'; ctx.fillText('покупатели ▲', 6, 3);
      ctx.fillStyle = '#ef5350'; ctx.fillText('продавцы ▼', 118, 3);
      return true;
    },
  });

  /* --- Физ/Юр НА СВЕЧАХ ------------------------------------------------------
   * Стрелки = счета (число лиц): лонг+/− (открытие/закрытие лонга), шорт+/−.
   * Кружки = бид/аск по контрактам: бид (лонг-сторона) зелёный, аск (шорт) красный,
   * с буквой Ф/Ю. Показываем событие на баре, если |дельта| ≥ порога (счета — лиц,
   * бид/аск — контрактов). Бычьи (лонг/бид) — под свечой, медвежьи (шорт/аск) — над.
   * extendData: { snaps, show, thAcc, thCon }. show — включённые ключи. */
  // ФИЛЬТР — по РАЗМЕРУ ПОЗИЦИИ (контракты, mc): физ и юр в одном масштабе, поэтому
  // юрики (мало лиц, но крупные объёмы) больше не пропадают. mn — число лиц (счета).
  // Стрелки: порог thArrow, подпись = счета (лица). Кружки бид/аск («ФАС»): порог
  // thCircle, подпись = контракты. Физ — зелёный/красный, Юр — голубой/оранжевый.
  const YB = '#3d8bdb', YBd = '#7fb3e6', YO = '#e8942e', YOd = '#f0bd7a';   // юрики: синий / оранжевый
  const MARK_DEFS = [
    { key: 'fizLong+', kind: 'arrow', mc: 'dFizL', mn: 'dFizLn', sign: 1,  side: 'below', up: true,  col: '#26a69a', tag: 'Ф', who: 'Физики', sd: 'лонг' },
    { key: 'fizLong-', kind: 'arrow', mc: 'dFizL', mn: 'dFizLn', sign: -1, side: 'below', up: false, col: '#7ec9b6', tag: 'Ф', who: 'Физики', sd: 'лонг' },
    { key: 'fizShort+', kind: 'arrow', mc: 'dFizS', mn: 'dFizSn', sign: 1,  side: 'above', up: false, col: '#ef5350', tag: 'Ф', who: 'Физики', sd: 'шорт' },
    { key: 'fizShort-', kind: 'arrow', mc: 'dFizS', mn: 'dFizSn', sign: -1, side: 'above', up: true,  col: '#f0a6a6', tag: 'Ф', who: 'Физики', sd: 'шорт' },
    { key: 'yurLong+', kind: 'arrow', mc: 'dYurL', mn: 'dYurLn', sign: 1,  side: 'below', up: true,  col: YB,  tag: 'Ю', who: 'Юрики', sd: 'лонг' },
    { key: 'yurLong-', kind: 'arrow', mc: 'dYurL', mn: 'dYurLn', sign: -1, side: 'below', up: false, col: YBd, tag: 'Ю', who: 'Юрики', sd: 'лонг' },
    { key: 'yurShort+', kind: 'arrow', mc: 'dYurS', mn: 'dYurSn', sign: 1,  side: 'above', up: false, col: YO,  tag: 'Ю', who: 'Юрики', sd: 'шорт' },
    { key: 'yurShort-', kind: 'arrow', mc: 'dYurS', mn: 'dYurSn', sign: -1, side: 'above', up: true,  col: YOd, tag: 'Ю', who: 'Юрики', sd: 'шорт' },
    { key: 'fizBid+', kind: 'circle', mc: 'dFizL', mn: 'dFizLn', sign: 1,  side: 'below', col: '#1e9e86', tag: 'Ф', who: 'Физики', sd: 'бид' },
    { key: 'fizBid-', kind: 'circle', mc: 'dFizL', mn: 'dFizLn', sign: -1, side: 'below', col: '#1e9e86', dim: true, tag: 'Ф', who: 'Физики', sd: 'бид' },
    { key: 'fizAsk+', kind: 'circle', mc: 'dFizS', mn: 'dFizSn', sign: 1,  side: 'above', col: '#e0453f', tag: 'Ф', who: 'Физики', sd: 'аск' },
    { key: 'fizAsk-', kind: 'circle', mc: 'dFizS', mn: 'dFizSn', sign: -1, side: 'above', col: '#e0453f', dim: true, tag: 'Ф', who: 'Физики', sd: 'аск' },
    { key: 'yurBid+', kind: 'circle', mc: 'dYurL', mn: 'dYurLn', sign: 1,  side: 'below', col: YB, tag: 'Ю', who: 'Юрики', sd: 'бид' },
    { key: 'yurBid-', kind: 'circle', mc: 'dYurL', mn: 'dYurLn', sign: -1, side: 'below', col: YB, dim: true, tag: 'Ю', who: 'Юрики', sd: 'бид' },
    { key: 'yurAsk+', kind: 'circle', mc: 'dYurS', mn: 'dYurSn', sign: 1,  side: 'above', col: YO, tag: 'Ю', who: 'Юрики', sd: 'аск' },
    { key: 'yurAsk-', kind: 'circle', mc: 'dYurS', mn: 'dYurSn', sign: -1, side: 'above', col: YO, dim: true, tag: 'Ю', who: 'Юрики', sd: 'аск' },
  ];
  function markTriangle(ctx, x, y, s, up) { ctx.beginPath(); if (up) { ctx.moveTo(x, y); ctx.lineTo(x - s, y + s * 1.6); ctx.lineTo(x + s, y + s * 1.6); } else { ctx.moveTo(x, y); ctx.lineTo(x - s, y - s * 1.6); ctx.lineTo(x + s, y - s * 1.6); } ctx.closePath(); ctx.fill(); }
  const numLbl = (n) => (n > 0 ? '+' : '−') + Math.abs(Math.round(n)).toLocaleString('ru-RU');
  kc.registerIndicator({
    name: 'FutoiOnPrice', shortName: 'Физ/Юр на свечах', series: 'price', figures: [],
    calc: (dl) => dl.map((d) => d.timestamp),
    draw: ({ ctx, chart, bounding, xAxis, yAxis, indicator }) => {
      const ed = indicator.extendData || {}, snaps = ed.snaps || [], show = ed.show || {};
      // Пороги по РАЗМЕРУ ПОЗИЦИИ (контракты) — своя настройка на каждую группу:
      // {физ|юр}×{стрелки|кружки}×{откр|закр}. Ключ: fizArrOpen … yurCircClose.
      const marks = ed.marks || {};
      const th4 = (d) => {
        const gk = (d.who === 'Физики' ? 'fiz' : 'yur') + (d.kind === 'arrow' ? 'Arr' : 'Circ') + (d.sign > 0 ? 'Open' : 'Close');
        const v = marks[gk]; return v != null ? v : (d.kind === 'arrow' ? 500 : 4000);
      };
      window.LUN_FUTOI_HITS = [];   // сбрасываем зоны клика (для тултипа по клику)
      if (!snaps.length) return true;
      const active = MARK_DEFS.filter((d) => show[d.key]); if (!active.length) return true;
      const list = chart.getDataList(), buckets = bucketByBar(snaps, list);
      const range = chart.getVisibleRange();
      const from = Math.max(0, range.from | 0), to = Math.min(list.length, Math.ceil(range.to) + 1);
      const R = 14;   // радиус кружка (крупный)
      for (let i = from; i < to; i++) {
        const a = buckets.get(i); if (!a) continue; const bar = list[i]; if (!bar) continue;
        const x = xAxis.convertToPixel(i);
        let offBelow = 8, offAbove = 8;
        for (const d of active) {
          const vol = a[d.mc] || 0, schet = a[d.mn] || 0;            // контракты / лица
          const th = th4(d);
          const pass = d.sign > 0 ? (vol >= th) : (vol <= -th); if (!pass) continue;
          const vl = d.kind === 'arrow' ? schet : vol;              // стрелки — лица, кружки — контракты
          const below = d.side === 'below';
          const baseY = below ? yAxis.convertToPixel(bar.low) : yAxis.convertToPixel(bar.high);
          ctx.globalAlpha = d.dim ? 0.55 : 1;
          if (d.kind === 'arrow') {
            const ty = below ? baseY + offBelow : baseY - offAbove;
            ctx.fillStyle = d.col; markTriangle(ctx, x, ty, 7, d.up);
            const ly = below ? ty + 12 : ty - 12;
            ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = below ? 'top' : 'bottom';
            ctx.fillStyle = d.col; ctx.fillText(numLbl(vl), x, ly);
            window.LUN_FUTOI_HITS.push({ x, y: ty, r: 12, who: d.who, sd: d.sd, schet, vol });
            offBelow += below ? 34 : 0; offAbove += below ? 0 : 34;
          } else {
            const cy = below ? baseY + offBelow + R : baseY - offAbove - R;
            ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(x, cy, R, 0, 6.283); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(d.tag, x, cy + 1);
            const ly = below ? cy + R + 2 : cy - R - 2;
            ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textBaseline = below ? 'top' : 'bottom';
            ctx.fillStyle = d.col; ctx.fillText(numLbl(vl), x, ly);
            window.LUN_FUTOI_HITS.push({ x, y: cy, r: R + 2, who: d.who, sd: d.sd, schet, vol });
            offBelow += below ? R * 2 + 20 : 0; offAbove += below ? 0 : R * 2 + 20;
          }
          ctx.globalAlpha = 1;
        }
      }
      return true;
    },
  });

  // Агрегат FUTOI по бару (для тултипа при клике): дельты счетов/контрактов и время.
  function barAgg(snaps, list, index) {
    const b = bucketByBar(snaps, list).get(index); if (!b) return null;
    let date = '', time = '';
    if (snaps.length && list[index]) {
      const t0 = list[index].timestamp, t1 = list[index + 1] ? list[index + 1].timestamp : Infinity;
      for (let i = snaps.length - 1; i >= 0; i--) { if (snaps[i].ts >= t0 && snaps[i].ts < t1) { date = snaps[i].date; time = snaps[i].time; break; } }
    }
    return Object.assign({ date, time }, b);
  }
  window.LunFutoi = { normalize, normalizeTradeStats, openWindow, SERIES, MARK_DEFS, barAgg };
})();
