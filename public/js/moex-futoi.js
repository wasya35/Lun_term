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
    const bg = document.createElement('div');
    bg.id = 'futoi-data-win';
    bg.className = 'lun-modal-bg';
    const last = snaps[snaps.length - 1] || {};
    const cell = (v, n) => `<div class="fd-cell"><span class="fd-v ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${fmtInt(v)}</span><span class="fd-n">${fmtInt(n)} сч.</span></div>`;
    bg.innerHTML = `
      <div class="lun-modal fd-modal">
        <div class="fd-head">
          <b>Данные FUTOI — ${code || '—'}</b>
          <span class="fd-src">${src}</span>
          <button class="fd-x" title="Закрыть">✕</button>
        </div>
        <div class="fd-sum">
          <div>Ф нетто: <b class="${(last.fizNet||0)>=0?'pos':'neg'}">${fmtInt(last.fizNet||0)}</b> <span class="fd-n">(${(last.fizLn||0).toLocaleString('ru-RU')}/${(last.fizSn||0).toLocaleString('ru-RU')} лиц)</span></div>
          <div>Ю нетто: <b class="${(last.yurNet||0)>=0?'pos':'neg'}">${fmtInt(last.yurNet||0)}</b> <span class="fd-n">(${(last.yurLn||0).toLocaleString('ru-RU')}/${(last.yurSn||0).toLocaleString('ru-RU')} лиц)</span></div>
          <div class="fd-n">снимков: ${snaps.length}${last.date ? ' · посл. ' + last.date + ' ' + (last.time||'') : ''}</div>
        </div>
        <div class="fd-tabs">
          <button class="fd-tab active" data-mode="bar">По бару</button>
          <button class="fd-tab" data-mode="cum">Накопительно</button>
        </div>
        <div class="fd-tablewrap">
          <table class="fd-table">
            <thead><tr><th>Время</th><th>Ф.Лонг</th><th>Ф.Шорт</th><th>Ю.Лонг</th><th>Ю.Шорт</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const tbody = bg.querySelector('tbody');
    const render = (mode) => {
      const pfx = mode === 'cum' ? 'c' : 'd';
      const rows = snaps.slice().reverse();   // новые сверху
      tbody.innerHTML = rows.map((s) => {
        const when = (s.date || '') + (s.time ? ' ' + s.time.slice(0, 5) : '');
        return `<tr><td class="fd-t">${when}</td>` +
          `<td>${cell(s[pfx + 'FizL'] || 0, s[pfx + 'FizLn'] || 0)}</td>` +
          `<td>${cell(s[pfx + 'FizS'] || 0, s[pfx + 'FizSn'] || 0)}</td>` +
          `<td>${cell(s[pfx + 'YurL'] || 0, s[pfx + 'YurLn'] || 0)}</td>` +
          `<td>${cell(s[pfx + 'YurS'] || 0, s[pfx + 'YurSn'] || 0)}</td></tr>`;
      }).join('') || '<tr><td colspan="5" class="fd-t">нет данных</td></tr>';
    };
    render('bar');
    bg.querySelectorAll('.fd-tab').forEach((b) => b.onclick = () => {
      bg.querySelectorAll('.fd-tab').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); render(b.dataset.mode);
    });
    const close = () => bg.remove();
    bg.querySelector('.fd-x').onclick = close;
    bg.onclick = (e) => { if (e.target === bg) close(); };
  }

  window.LunFutoi = { normalize, openWindow, SERIES };
})();
