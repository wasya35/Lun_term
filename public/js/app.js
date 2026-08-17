/* =============================================================================
 *  app.js — сборка терминала Lun_term
 * =============================================================================*/
(function () {
  const kc = window.klinecharts;

  const PERIOD_MS = { minute: 60000, hour: 3600000, day: 86400000 };
  const periodMillis = (tf) => (PERIOD_MS[tf.type] || 3600000) * tf.span;

  /* горячие клавиши: key(lower) -> fn. Регистрируем при сборке кнопок,
   * срабатывают, если не набираем текст и не открыта модалка. */
  const hotkeys = {};
  const regHotkey = (k, fn) => { if (k) hotkeys[k.toLowerCase()] = fn; };
  // канонический токен по ФИЗИЧЕСКОЙ клавише (e.code) — работает на любой
  // раскладке (рус/eng): KeyL->'l', Digit1->'1', Equal->'=', Minus->'-'.
  function keyFromEvent(e) {
    const c = e.code || '';
    if (c.indexOf('Key') === 0) return c.slice(3).toLowerCase();
    if (c.indexOf('Digit') === 0) return c.slice(5);
    if (c.indexOf('Numpad') === 0) { const n = c.slice(6); if (n === 'Add') return '+'; if (n === 'Subtract') return '-'; if (/^\d$/.test(n)) return n; }
    if (c === 'Equal') return '=';
    if (c === 'Minus') return '-';
    return (e.key || '').toLowerCase();
  }

  function closeMenus() { document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); }

  // простая модалка (класс lun-modal-bg — чтобы хоткеи глушились, пока открыта)
  function openModal(title, html) {
    const bg = document.createElement('div'); bg.className = 'lun-modal-bg';
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
    const m = document.createElement('div');
    m.style.cssText = 'background:#121722;border:1px solid #232b3a;border-radius:10px;max-width:760px;width:100%;max-height:84vh;overflow:auto;color:#d7deea;box-shadow:0 12px 40px rgba(0,0,0,.55)';
    m.innerHTML = '<h2 style="margin:0;padding:12px 16px;border-bottom:1px solid #232b3a;font-size:15px;display:flex;justify-content:space-between;align-items:center">' + title + '<span class="x" style="cursor:pointer;font-size:20px;color:#8b93a7">×</span></h2><div style="padding:14px 18px;font-size:13px;line-height:1.55">' + html + '</div>';
    bg.appendChild(m); document.body.appendChild(bg);
    const close = () => bg.remove();
    m.querySelector('.x').onclick = close; bg.onclick = (e) => { if (e.target === bg) close(); };
  }
  function helpModal() {
    openModal('Справка — Lun_term', `
      <p><b>Lun_term</b> — астро-трейдинг терминал по инструментам MOEX с лунной лентой и марковскими режимами.</p>
      <p><b>Инструменты</b> — избранное (Si, CNY, золото, Brent, EUR/USD, серебро) + поиск любого тикера MOEX.</p>
      <p><b>Астро:</b> лента знаков Луны (цвет по знаку, градус), торговые циклы (зоны лонг/шорт по долготе), полосы аспектов планет к Солнцу, узлы 0°/15°, прогноз шкал вперёд до аспекта ☉–♅.</p>
      <p><b>Индикаторы:</b> SMA/EMA/VWAP, объём, кумулятивная дельта, сильные бары (всплеск объёма «сила/силища»), торговые сессии (Азия/Лондон/Нью-Йорк), марковский режим (BEAR/SIDE/BULL) с сигналом и матрицей переходов.</p>
      <p><b>Рисование:</b> уровень, трендовая, прямоугольник, стрелка, текст, линия Ганна (луч из т1 через т2), горизонтальный луч с обрезкой по пересечениям, профиль объёма (горизонтальный объём по диапазону).</p>
      <p><b>Бэктест</b> (в «Настройки») — сверка зон/знаков/аспектов, сила+поглощение с издержками и out-of-sample, марковские режимы и синтез «зона × режим».</p>
      <p style="color:#8b93a7">Данные: MOEX ISS прямо из браузера (с задержкой ~15 мин). Настройки цветов/зон — в «⚙ Настройки».</p>`);
  }
  function hotkeysModal() {
    const row = (k, d) => `<tr><td style="padding:3px 12px 3px 0;color:#3aa0ff;white-space:nowrap"><b>${k}</b></td><td style="padding:3px 0">${d}</td></tr>`;
    openModal('Горячие клавиши', `
      <p style="color:#8b93a7;margin-top:0">Работают на русской и английской раскладке (по физической клавише).</p>
      <table style="border-collapse:collapse">
        ${row('1 · 2 · 3 · 4', 'таймфрейм M5 / M15 / H1 / D1')}
        ${row('+ / −', 'приблизить / отдалить график')}
        ${row('T', 'уровень')}${row('L', 'трендовая')}${row('R', 'прямоугольник')}
        ${row('A', 'стрелка')}${row('X', 'текст')}${row('G', 'линия Ганна')}
        ${row('H', 'горизонтальный луч ⨯N')}${row('D', 'профиль объёма (гор. объём)')}
        ${row('клик', 'выделить объект')}${row('Delete', 'удалить выделенный объект')}
        ${row('Ctrl+C / Ctrl+V', 'копировать / вставить объект')}
        ${row('Ctrl+перетаскивание', 'копия объекта на новое место')}
        ${row('Ctrl+S', 'скрин графика (PNG)')}
        ${row('F', 'прогноз шкал вперёд')}${row('M', 'марковский режим')}
        ${row('U', 'аспекты Урана ко всем')}
        ${row('S', 'настройки')}${row('B', 'бэктест')}
      </table>`);
  }

  const DEFAULT_TF = window.LUN.TIMEFRAMES.find((t) => t.id === window.LUN.DEFAULT_TIMEFRAME);
  // Каждая ячейка сетки — независимый слот со своей копией структуры. `state`
  // всегда указывает на АКТИВНЫЙ слот, поэтому весь тулбар работает как раньше.
  function makeSlot(i) {
    return {
      slotId: i, chart: null, cellEl: null, loader: null,
      instrument: window.LUN.INSTRUMENTS[0], tf: DEFAULT_TF,
      signPane: null, signPanes: {}, volumePane: null, aspectPanes: {}, allAspectPane: null,
      deltaPane: null, cyclePanes: {}, uranusPane: null, markovPanes: null, markovTimer: null,
      overlayIds: {}, candleInds: {}, selectedOverlayId: null, forecastOn: false, paneWish: {},
      compareInstrument: null, comparePane: false, oiPane: null, arbPane: null, arbBundle: null,
      retroPane: null, bradleyPane: null,
    };
  }
  let slots = [];
  let activeIdx = 0;
  let state = makeSlot(0);   // переустанавливается при активации ячейки

  const THEME = {
    grid: { horizontal: { color: '#1c2230' }, vertical: { color: '#1c2230' } },
    candle: {
      bar: {
        upColor: '#26a69a', downColor: '#ef5350',
        upBorderColor: '#26a69a', downBorderColor: '#ef5350',
        upWuckColor: '#26a69a', downWuckColor: '#ef5350',
      },
      priceMark: { last: { text: { color: '#0b0e14' } } },
    },
    xAxis: { axisLine: { color: '#2a3242' }, tickText: { color: '#8b93a7' } },
    yAxis: { axisLine: { color: '#2a3242' }, tickText: { color: '#8b93a7' } },
    crosshair: {
      horizontal: { line: { color: '#6b7280' }, text: { backgroundColor: '#334155' } },
      vertical: { line: { color: '#6b7280' }, text: { backgroundColor: '#334155' } },
    },
  };

  /* ---------- панели ----------
   * KLineChart раскладывает новую панель асинхронно, поэтому setPaneOptions
   * сразу после createIndicator не срабатывает — копим параметры и применяем
   * их отложенно (и повторно после загрузки данных). */
  function applyPaneWishes(slot) {
    slot = slot || state; if (!slot || !slot.chart) return;
    Object.entries(slot.paneWish).forEach(([pid, o]) => {
      try { slot.chart.setPaneOptions({ id: pid, ...o }); } catch (e) { /* панель ещё не готова */ }
    });
  }
  // Загрузка данных пересобирает раскладку — применяем размеры на нескольких
  // тиках, привязываясь к КОНКРЕТНОМУ слоту (важно для нескольких графиков).
  function scheduleApply(slot) { slot = slot || state; [0, 150, 400].forEach((ms) => setTimeout(() => applyPaneWishes(slot), ms)); }
  function wishPane(id, opts) { if (id && state) { state.paneWish[id] = opts; scheduleApply(state); } }

  // ВАЖНО: createIndicator возвращает id индикатора, а НЕ id панели. Поэтому
  // задаём paneId явно — тогда мы знаем панель и можем управлять её высотой.
  function createCyclePane(cycle, order) {
    const paneId = 'pane_' + cycle.id;
    state.chart.createIndicator(
      { name: 'CycleStrip', shortName: cycle.title, extendData: { cycle }, paneId }, false);
    state.cyclePanes[cycle.id] = paneId;
    wishPane(paneId, { height: window.LUN.PANE_HEIGHTS.cycle, minHeight: 18, order });
    return paneId;
  }

  const BODY_LABEL = { Moon: '☾ Луна', Mercury: '☿ Меркурий', Sun: '☉ Солнце', Venus: '♀ Венера', Mars: '♂ Марс', Jupiter: '♃ Юпитер', Saturn: '♄ Сатурн' };
  function createSignPane(body, order) {
    const id = 'pane_sign_' + body;
    state.chart.createIndicator({ name: 'SignStrip', paneId: id, shortName: BODY_LABEL[body] || body, extendData: { body, frame: 'geo' } }, false);
    state.signPanes[body] = id;
    wishPane(id, { height: window.LUN.PANE_HEIGHTS.moonSign, minHeight: 24, order });
    return id;
  }

  // --- аспекты планета→Солнце (по полосе на планету) + сводная «все» ---
  const clampOrb = () => Math.min(6, Math.max(2, +window.LUN.ASPECTS.orb || 3));
  function createSunAspect(pl, order) {
    const id = 'pane_asp_' + pl.body;
    state.chart.createIndicator({
      name: 'AspectStrip', paneId: id, shortName: '☉/' + pl.glyph,
      extendData: { bodyA: 'Sun', bodyB: pl.body, frame: pl.frame, orb: clampOrb() },
    }, false);
    state.aspectPanes[pl.body] = id;
    wishPane(id, { height: window.LUN.PANE_HEIGHTS.cycle, minHeight: 18, order });
  }
  const ALL_ASPECT_PANE = 'pane_asp_all';
  function createAllAspect() {
    const bodies = ['Sun'].concat(window.LUN.ASPECT_PLANETS.map((p) => p.body));
    state.chart.createIndicator({
      name: 'AllAspectStrip', paneId: ALL_ASPECT_PANE, shortName: '∀ все аспекты',
      extendData: { bodies, orb: clampOrb() },
    }, false);
    state.allAspectPane = ALL_ASPECT_PANE;
    wishPane(ALL_ASPECT_PANE, { height: window.LUN.PANE_HEIGHTS.cycle + 4, minHeight: 20, order: 29 });
  }
  function createVolumePane() {
    state.volumePane = 'pane_volume';
    // calcParams: [] — объём без скользящих средних
    state.chart.createIndicator({ name: 'VOL', calcParams: [], paneId: state.volumePane }, false);
    wishPane(state.volumePane, { height: window.LUN.PANE_HEIGHTS.volume, order: 90 });
  }
  function createDeltaPane() {
    state.deltaPane = 'pane_delta';
    state.chart.createIndicator({ name: 'CumDelta', paneId: state.deltaPane }, false);
    wishPane(state.deltaPane, { height: 72, order: 91 });
  }

  /* ---------- Марков: лента режима + панель сигнала + матрица ---------- */
  const MARKOV_STRIP = 'pane_markov_strip', MARKOV_SIG = 'pane_markov_sig';
  function createMarkov() {
    state.chart.createIndicator({ name: 'MarkovStrip', paneId: MARKOV_STRIP, shortName: 'Марков-режим' }, false);
    wishPane(MARKOV_STRIP, { height: window.LUN.PANE_HEIGHTS.cycle, minHeight: 18, order: 27 });
    state.chart.createIndicator({ name: 'MarkovRegime', paneId: MARKOV_SIG, shortName: 'Марков' }, false);
    wishPane(MARKOV_SIG, { height: 64, order: 89 });
    state.markovPanes = [MARKOV_STRIP, MARKOV_SIG];
    showMarkovPanel(true);
  }
  function removeMarkov() {
    (state.markovPanes || []).forEach((p) => { try { state.chart.removeIndicator({ paneId: p }); } catch (e) {} });
    state.markovPanes = null; showMarkovPanel(false);
  }
  function markovPanelHTML() {
    const bars = state.chart.getDataList();
    if (!bars || !bars.length || !window.LunMarkov) return '<div>нет данных</div>';
    const O = window.LUN.MARKOV, step = O.step > 0 ? O.step : O.window;
    const wf = window.LunMarkov.walkForwardCached(bars, O);
    const last = bars.length - 1, price = wf.priceStates, curPrice = price[last] < 0 ? 1 : price[last];
    const pm = window.LunMarkov.transitionMatrix(price, { size: 3, step, sampleMode: O.sampleMode, upTo: last });
    const sig = window.LunMarkov.signalAt(pm, curPrice, { size: 3, priceSize: 3, horizon: O.horizon, minObs: O.minObs, deadZone: O.deadZone });
    const stat = window.LunMarkov.stationary(pm.prob, 3);
    const PN = ['BEAR', 'SIDE', 'BULL'], PCOL = ['#ef5350', '#8a8f3a', '#26a69a'];
    const pct = (x) => (x * 100).toFixed(1) + '%';
    let rows = '';
    for (let r = 0; r < 3; r++) {
      const hl = r === price[last], neff = pm.rowNeff[r], dim = neff < O.minObs;
      rows += `<tr style="${hl ? 'background:#1b2431;' : ''}${dim ? 'opacity:.5;' : ''}">
        <td style="color:${PCOL[r]}">${PN[r]}</td><td>${pct(pm.prob[r * 3])}</td><td>${pct(pm.prob[r * 3 + 1])}</td><td>${pct(pm.prob[r * 3 + 2])}</td>
        <td style="color:#8b93a7">${neff.toFixed(0)}</td><td>${hl ? '←' : ''}</td></tr>`;
    }
    const astroName = O.astroProvider === 'none' ? 'нет' : O.astroProvider;
    const curName = wf.names[wf.state[last]] || '—';
    const trad = wf.tradable[last], s = wf.signal[last];
    return `<div style="font-weight:600;margin-bottom:3px">МАРКОВ · W=${O.window} · шаг=${step} · ${O.thrMode} · астро: ${astroName}</div>
      <div style="margin-bottom:3px">Сейчас: <b style="color:${PCOL[curPrice]}">${curName}</b></div>
      <table class="mk-tbl"><thead><tr><th>сег.\\зав.</th><th>BEAR</th><th>SIDE</th><th>BULL</th><th>n_эфф</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div style="margin-top:3px">Сигнал: <b style="color:${sig.signal > 0 ? '#26a69a' : '#ef5350'}">${(sig.signal >= 0 ? '+' : '') + pct(sig.signal)}</b> ±${pct(sig.ci)} · липкость ${pct(sig.stickiness)}</div>
      <div>Прогноз ${O.horizon} шагов: ${(sig.signalN >= 0 ? '+' : '') + pct(sig.signalN)}</div>
      <div>Вердикт (с астро): <b>${trad ? (s > 0 ? 'РАЗРЕШЁН ЛОНГ' : 'РАЗРЕШЁН ШОРТ') : 'нет сигнала'}</b></div>
      <div style="color:#8b93a7">Стационарное: bear ${pct(stat[0])} / side ${pct(stat[1])} / bull ${pct(stat[2])}</div>`;
  }
  function refreshMarkovPanel() {
    const el = document.getElementById('markov-panel');
    if (el && el.style.display !== 'none') { try { el.innerHTML = markovPanelHTML(); } catch (e) { el.innerHTML = 'Марков: ' + e.message; } }
  }
  function showMarkovPanel(on) {
    let el = document.getElementById('markov-panel');
    if (on) {
      const host = state.cellEl || document.getElementById('chart'); host.style.position = 'relative';
      if (!el) { el = document.createElement('div'); el.id = 'markov-panel'; el.className = 'markov-panel'; }
      if (el.parentElement !== host) host.appendChild(el);   // панель следует за активной ячейкой
      el.style.display = 'block'; refreshMarkovPanel();
      if (!state.markovTimer) state.markovTimer = setInterval(refreshMarkovPanel, 4000);
    } else {
      if (el) el.style.display = 'none';
      if (state.markovTimer) { clearInterval(state.markovTimer); state.markovTimer = null; }
    }
  }
  function addMarkovCss() {
    if (document.getElementById('markov-css')) return;
    const s = document.createElement('style'); s.id = 'markov-css';
    s.textContent = `.markov-panel{position:absolute;top:8px;right:8px;z-index:20;background:rgba(12,16,22,.92);border:1px solid #2a3242;border-radius:6px;padding:8px 10px;font:11px/1.35 system-ui,sans-serif;color:#cdd3df;max-width:340px}
    .markov-panel .mk-tbl{border-collapse:collapse;margin:2px 0;font-size:11px}
    .markov-panel .mk-tbl th,.markov-panel .mk-tbl td{padding:1px 6px;text-align:right}
    .markov-panel .mk-tbl th:first-child,.markov-panel .mk-tbl td:first-child{text-align:left}
    .markov-panel .mk-tbl th{color:#8b93a7;font-weight:400}`;
    document.head.appendChild(s);
  }

  function buildPanes() {
    const H = window.LUN.PANE_HEIGHTS;
    state.signPane = 'pane_sign_Moon';
    state.chart.createIndicator({ name: 'SignStrip', paneId: state.signPane, shortName: BODY_LABEL.Moon, extendData: { body: 'Moon', frame: 'geo' } }, false);
    state.signPanes.Moon = state.signPane;
    wishPane(state.signPane, { height: H.moonSign, minHeight: 26, order: 10 });
    window.LUN.CYCLES.forEach((cy, i) => { if (cy.enabled) createCyclePane(cy, 11 + i); });
    window.LUN.ASPECT_PLANETS.forEach((pl, i) => { if (pl.enabled) createSunAspect(pl, 15 + i); });  // ☉/☿ по умолчанию
    if (window.LUN.ALL_ASPECTS.enabled) createAllAspect();
    createVolumePane();
  }

  /* ---------- наложение 2-го инструмента линией ---------- */
  async function refreshCompare(slot) {
    slot = slot || state; const instr = slot.compareInstrument; if (!instr || !window.LunData.fetchFor) return;
    let bars = null; try { bars = await window.LunData.fetchFor(instr, slot.tf); } catch (e) {}
    if (!bars || !bars.length) return;
    const cb = bars.map((b) => ({ timestamp: b.timestamp, close: b.close }));
    try { slot.chart.removeIndicator({ paneId: 'candle_pane', name: 'Compare' }); } catch (e) {}
    slot.chart.createIndicator({ name: 'Compare', paneId: 'candle_pane', extendData: { bars: cb, label: instr.title || instr.ticker || instr.id, color: '#e07bd0' } }, true);
    slot.comparePane = true;
  }
  async function addCompare(instr) { if (!instr) return; state.compareInstrument = instr; await refreshCompare(state); }

  /* ---------- открытый интерес + физики/юрики (FUTOI, MOEX) ---------- */
  async function rebuildOI(slot) {
    slot = slot || state; const ins = slot.instrument;
    if ((ins.provider || 'moex') !== 'moex') { alert('Открытый интерес — только для фьючерсов MOEX.'); return false; }
    const ticker = await window.LunData.resolveTicker(ins);
    const code = ticker.replace(/[FGHJKMNQUVXZ]\d$/, '');   // SiU6 -> Si, GDU6 -> GD
    const till = new Date(), from = new Date(till.getTime() - 400 * 86400000), fmt = (d) => d.toISOString().slice(0, 10);
    const byDate = {}; let latest = null, split = false;
    try {
      const rows = await window.LunISS.fetchFUTOI(code, fmt(from), fmt(till));
      const perDate = {};
      for (const r of rows) {
        const d = r.tradedate || r.TRADEDATE; if (!d) continue;
        const g = String(r.clgroup || r.CLGROUP || '').toUpperCase();
        const L = +(r.pos_long != null ? r.pos_long : r.POS_LONG) || 0, S = +(r.pos_short != null ? r.pos_short : r.POS_SHORT) || 0;
        (perDate[d] = perDate[d] || {})[g] = { L, S };
      }
      Object.keys(perDate).sort().forEach((d) => {
        const o = perDate[d], fiz = o.FIZ || { L: 0, S: 0 }, yur = o.YUR || { L: 0, S: 0 };
        const rec = { fizNet: fiz.L - fiz.S, yurNet: yur.L - yur.S, oi: fiz.L + yur.L };
        byDate[d] = rec; latest = Object.assign({ date: d }, rec);
      });
      split = !!latest;
    } catch (e) { /* ниже фолбэк */ }
    if (!split) {
      try { const rows = await window.LunISS.fetchOIHistory(ticker, fmt(from), fmt(till)); rows.forEach((r) => { byDate[r.date] = { oi: r.oi }; latest = { date: r.date, oi: r.oi }; }); } catch (e) {}
    }
    if (!Object.keys(byDate).length) { alert('ОИ не получен для ' + code + ' (проверь строку данных / коды).'); return false; }
    const paneId = 'pane_oi';
    try { slot.chart.removeIndicator({ paneId }); } catch (e) {}
    slot.chart.createIndicator({ name: 'OpenInterest', paneId, shortName: 'ОИ ' + code + (split ? ' физ/юр' : ''), extendData: { byDate, latest, split } }, false);
    slot.oiPane = paneId; wishPane(paneId, { height: 84, order: 92 });
    return true;
  }
  function removeOI(slot) { slot = slot || state; if (slot.oiPane) { try { slot.chart.removeIndicator({ paneId: slot.oiPane }); } catch (e) {} slot.oiPane = null; } }

  /* ---------- арбитражная связка: синтетика + спред + z-score ---------- */
  async function buildArb(slot, bundle) {
    slot = slot || state; if (!bundle) return false;
    const keys = Object.keys(bundle.legs), data = {};
    for (const k of keys) { try { data[k] = await window.LunData.fetchFor(bundle.legs[k], slot.tf); } catch (e) { data[k] = null; } }
    if (keys.some((k) => !data[k] || !data[k].length)) { alert('Арбитраж «' + bundle.title + '»: не все ноги загрузились (проверь коды/данные).'); return false; }
    const maps = {}; keys.forEach((k) => { const m = new Map(); data[k].forEach((b) => m.set(b.timestamp, b.close)); maps[k] = m; });
    const series = [];
    for (const b of data[keys[0]]) {
      const ts = b.timestamp, cl = {}; let ok = true;
      for (const k of keys) { const v = maps[k].get(ts); if (v == null || !(v > 0)) { ok = false; break; } cl[k] = v; }
      if (!ok) continue;
      let spread;
      if (bundle.formula === 'triangle') spread = cl.C - (cl.A / cl.B) * (bundle.scale || 1);
      else if (bundle.formula === 'ratio') spread = (cl.A / cl.B) * (bundle.scale || 1);
      else if (bundle.formula === 'diff') spread = cl.A - cl.B;
      else spread = cl.A;
      series.push({ ts, spread });
    }
    if (series.length < 20) { alert('Арбитраж: мало общих точек по времени.'); return false; }
    const vals = series.map((s) => s.spread), mean = vals.reduce((a, x) => a + x, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, x) => a + (x - mean) * (x - mean), 0) / vals.length) || 1e-9;
    const byTs = {}; series.forEach((s) => { byTs[s.ts] = s.spread; });
    const paneId = 'pane_arb';
    try { slot.chart.removeIndicator({ paneId }); } catch (e) {}
    slot.chart.createIndicator({ name: 'ArbSpread', paneId, shortName: bundle.title, extendData: { byTs, mean, std, title: bundle.title, formula: bundle.formula, last: series[series.length - 1].spread } }, false);
    slot.arbPane = paneId; slot.arbBundle = bundle; wishPane(paneId, { height: 92, order: 93 });
    return true;
  }
  function removeArb(slot) { slot = slot || state; if (slot.arbPane) { try { slot.chart.removeIndicator({ paneId: slot.arbPane }); } catch (e) {} slot.arbPane = null; slot.arbBundle = null; } }
  function removeCompare() {
    if (state.comparePane) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'Compare' }); } catch (e) {} state.comparePane = false; }
    state.compareInstrument = null;
  }

  /* ---------- инструменты Ганна ---------- */
  function removeCandInd(name) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name }); } catch (e) {} delete state.candleInds[name]; }

  // Уровни квадрата Ганна. √-спираль: полный оборот (360°) = +2 к √цены.
  // base: '9'→8 делений (крест 45°), 'hex'→6 (60°), '360'→24 (15°),
  // 'natural'→квадраты натуральных чисел n² и серединные точки n²+n.
  function gannSquareLevels(price, base, turns) {
    price = +price; turns = Math.max(1, Math.min(8, +turns || 3));
    if (!(price > 0)) return [];
    const out = [];
    if (base === 'natural') {
      const n = Math.round(Math.sqrt(price));
      for (let j = -turns; j <= turns; j++) {
        const m = n + j; if (m <= 0) continue;
        out.push({ price: m * m, deg: 0, tag: m + '²' });
        out.push({ price: m * m + m, deg: 45, tag: m + '²+' + m });
      }
      return out.sort((a, b) => a.price - b.price);
    }
    const divs = base === 'hex' ? 6 : (base === '360' ? 24 : 8);
    const stepDeg = 360 / divs, root = Math.sqrt(price), dRoot = 2 / divs;
    for (let k = -turns * divs; k <= turns * divs; k++) {
      if (k === 0) continue;
      const r = root + k * dRoot; if (r <= 0) continue;
      out.push({ price: r * r, deg: ((k * stepDeg) % 360 + 360) % 360, k });
    }
    return out.sort((a, b) => a.price - b.price);
  }
  function applyGannSquare(levels, anchor, prec) {
    try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'GannSquareLevels' }); } catch (e) {}
    state.chart.createIndicator({ name: 'GannSquareLevels', paneId: 'candle_pane', extendData: { levels, anchor, prec } }, true);
    state.candleInds['GannSquareLevels'] = true;
  }
  function gannSquareModal() {
    let last = 0; try { const l = state.chart.getDataList(); last = l.length ? l[l.length - 1].close : 0; } catch (e) {}
    const prec = state.instrument.pricePrecision != null ? state.instrument.pricePrecision : 1;
    const S = window.LUN.GANNTOOLS.square || { base: '9', turns: 3 };
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const opt = (v, t) => `<option value="${v}"${v === S.base ? ' selected' : ''}>${t}</option>`;
    openModal('Калькулятор квадратов Ганна', `
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
        <label>Цена (пивот)<br><input id="gsq-price" type="number" step="any" value="${last}" style="${inp};width:130px"></label>
        <label>База<br><select id="gsq-base" style="${inp}">
          ${opt('9', 'Квадрат 9 · крест 45°')}${opt('hex', 'Шестиугольник · 60°')}${opt('360', 'Круг 360° · 15°')}${opt('natural', 'Натуральные квадраты')}
        </select></label>
        <label>Оборотов (колец)<br><input id="gsq-turns" type="number" min="1" max="8" value="${S.turns}" style="${inp};width:80px"></label>
        <button id="gsq-calc" style="${btn}">Рассчитать</button>
      </div>
      <div id="gsq-out"></div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button id="gsq-apply" style="${btn};border-color:#26a69a">Нанести на график</button>
        <button id="gsq-clear" style="${btn};border-color:#8b93a7">Убрать уровни</button>
      </div>
      <p style="color:#8b93a7;margin:10px 0 0">Кардинальные углы (0/90/180/270°) — сильнейшие поддержки/сопротивления. Квадрат 144, Box и сквоузинг (нужен масштаб цена/бар) — следующим этапом.</p>`);
    const $ = (id) => document.getElementById(id);
    let levels = [];
    const recalc = () => {
      const price = +$('gsq-price').value, base = $('gsq-base').value, turns = +$('gsq-turns').value;
      window.LUN.GANNTOOLS.square = { base, turns };
      levels = gannSquareLevels(price, base, turns);
      if (!levels.length) { $('gsq-out').innerHTML = '<p style="color:#e0a030">Введите положительную цену.</p>'; return; }
      const rows = levels.map((L) => {
        const dist = (L.price - price) / price * 100, up = L.price >= price;
        return `<tr><td style="padding:2px 10px 2px 0;font-variant-numeric:tabular-nums">${L.price.toFixed(prec)}</td>`
          + `<td style="padding:2px 10px 2px 0;color:#8b93a7">${L.tag || (L.deg + '°')}</td>`
          + `<td style="padding:2px 10px 2px 0;color:${up ? '#ef5350' : '#26a69a'}">${up ? 'сопр.' : 'подд.'}</td>`
          + `<td style="padding:2px 0;color:#8b93a7">${dist > 0 ? '+' : ''}${dist.toFixed(2)}%</td></tr>`;
      }).join('');
      $('gsq-out').innerHTML = `<div style="max-height:330px;overflow:auto"><table style="border-collapse:collapse;font-size:12px">`
        + `<thead><tr style="color:#8b93a7;text-align:left"><th style="padding-right:10px">Уровень</th><th style="padding-right:10px">Угол</th><th style="padding-right:10px">Тип</th><th>Δ</th></tr></thead>`
        + `<tbody>${rows}</tbody></table></div>`;
    };
    $('gsq-calc').onclick = recalc;
    $('gsq-base').onchange = recalc; $('gsq-turns').onchange = recalc; $('gsq-price').onchange = recalc;
    $('gsq-apply').onclick = () => { if (!levels.length) recalc(); if (levels.length) applyGannSquare(levels, +$('gsq-price').value, prec); };
    $('gsq-clear').onclick = () => removeCandInd('GannSquareLevels');
    recalc();
  }

  /* --- Астро-Ганн: панель ретроградностей + настройка планетарных линий --- */
  function createRetroPane() {
    state.retroPane = 'pane_retro';
    state.chart.createIndicator({ name: 'RetroStrip', paneId: state.retroPane }, false);
    wishPane(state.retroPane, { height: 84, order: 40 });
  }
  function removeRetroPane() { if (state.retroPane) { try { state.chart.removeIndicator({ paneId: state.retroPane }); } catch (e) {} state.retroPane = null; } }
  function createBradleyPane() {
    state.bradleyPane = 'pane_bradley';
    state.chart.createIndicator({ name: 'BradleyStrip', paneId: state.bradleyPane }, false);
    wishPane(state.bradleyPane, { height: 96, order: 41 });
  }
  function removeBradleyPane() { if (state.bradleyPane) { try { state.chart.removeIndicator({ paneId: state.bradleyPane }); } catch (e) {} state.bradleyPane = null; } }

  // Космограмма: колесо зодиака с планетами и аспектами на выбранную дату.
  function cosmogramModal() {
    const AG = window.LUN.ASTROGANN, SIGNS = window.LUN.SIGNS;
    let ts = Date.now(); try { const l = state.chart.getDataList(); if (l.length) ts = l[l.length - 1].timestamp; } catch (e) {}
    const bodies = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const ASP = [{ a: 0, sym: '☌', c: '#c0392b' }, { a: 60, sym: '⚹', c: '#2c6fb0' }, { a: 90, sym: '□', c: '#c0392b' }, { a: 120, sym: '△', c: '#2c6fb0' }, { a: 180, sym: '☍', c: '#c0392b' }];
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    openModal('Космограмма', `
      <div style="display:flex;gap:14px;align-items:flex-end;margin-bottom:10px">
        <label>Дата/время (UTC)<br><input id="cg-date" type="datetime-local" style="${inp}"></label>
        <span style="color:#8b93a7">гео · знаки зодиака</span>
      </div>
      <div id="cg-body" style="display:flex;gap:18px;flex-wrap:wrap"></div>`);
    const dEl = document.getElementById('cg-date');
    dEl.value = new Date(ts).toISOString().slice(0, 16);
    const R = 150, cx = 170, cy = 170, rPlanet = 118, rSign = 138;
    const P = (ang, r) => [cx + r * Math.cos((90 - ang) * Math.PI / 180), cy - r * Math.sin((90 - ang) * Math.PI / 180)];
    const render = () => {
      const t = dEl.value ? new Date(dEl.value + ':00Z').getTime() : ts;
      const pos = {}; bodies.forEach((b) => { pos[b] = window.LunAstro.bodyInfo(b, t, 'geo').lon; });
      let svg = `<svg width="${cx * 2}" height="${cy * 2}" style="flex:0 0 auto">`;
      svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#0b0e14" stroke="#232b3a"/>`;
      for (let s = 0; s < 12; s++) {
        const a = s * 30, [x1, y1] = P(a, R), mid = P(a + 15, rSign);
        svg += `<line x1="${cx}" y1="${cy}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#1c2432"/>`;
        svg += `<text x="${mid[0].toFixed(1)}" y="${mid[1].toFixed(1)}" fill="${SIGNS[s].color}" font-size="13" text-anchor="middle" dominant-baseline="middle">${SIGNS[s].glyph}</text>`;
      }
      // аспектные линии
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        let d = Math.abs(pos[bodies[i]] - pos[bodies[j]]) % 360; if (d > 180) d = 360 - d;
        const A = ASP.find((x) => Math.abs(d - x.a) <= 5); if (!A || A.a === 0) continue;
        const p1 = P(pos[bodies[i]], rPlanet - 10), p2 = P(pos[bodies[j]], rPlanet - 10);
        svg += `<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="${A.c}" stroke-width="1" opacity="0.5"/>`;
      }
      bodies.forEach((b) => { const m = AG.planets[b], pt = P(pos[b], rPlanet); svg += `<text x="${pt[0].toFixed(1)}" y="${pt[1].toFixed(1)}" fill="${m.c}" font-size="14" text-anchor="middle" dominant-baseline="middle">${m.g}</text>`; });
      svg += `</svg>`;
      // таблица позиций
      let tbl = '<table style="border-collapse:collapse;font-size:12px">';
      bodies.forEach((b) => { const lon = pos[b], si = Math.floor(lon / 30) % 12, m = AG.planets[b];
        tbl += `<tr><td style="padding:2px 10px 2px 0;color:${m.c}">${m.g} ${b}</td><td style="padding:2px 8px 2px 0">${SIGNS[si].glyph} ${SIGNS[si].name}</td><td style="padding:2px 0;color:#8b93a7">${(lon - si * 30).toFixed(1)}°</td></tr>`; });
      tbl += '</table>';
      document.getElementById('cg-body').innerHTML = svg + '<div>' + tbl + '</div>';
    };
    dEl.onchange = render; render();
  }

  // редрав активных астро-индикаторов после смены планет/фрейма/масштаба
  function refreshAstroGann() {
    ['PlanetLines', 'PlanetIngress'].forEach((n) => { if (state.candleInds[n]) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: n }); state.chart.createIndicator({ name: n, paneId: 'candle_pane' }, true); } catch (e) {} } });
    if (state.retroPane) { try { state.chart.removeIndicator({ paneId: state.retroPane }); state.chart.createIndicator({ name: 'RetroStrip', paneId: state.retroPane }, false); } catch (e) {} }
  }
  function astroGannModal() {
    const AG = window.LUN.ASTROGANN;
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const order = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const checks = order.map((p) => { const m = AG.planets[p]; const on = AG.linePlanets.indexOf(p) >= 0;
      return `<label style="display:inline-flex;align-items:center;gap:4px;margin:0 10px 6px 0;color:${m.c}"><input type="checkbox" data-p="${p}"${on ? ' checked' : ''}> ${m.g} ${p}</label>`; }).join('');
    openModal('Астро-Ганн — планетарные линии', `
      <div style="margin-bottom:10px">Планеты для линий:<br>${checks}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">
        <label>Система<br><select id="ag-frame" style="${inp}">
          <option value="geo"${AG.frame === 'geo' ? ' selected' : ''}>Геоцентр (зодиак)</option>
          <option value="helio"${AG.frame === 'helio' ? ' selected' : ''}>Гелиоцентр</option></select></label>
        <label>Цена на 1° (пусто = авто)<br><input id="ag-scale" type="number" step="any" value="${AG.pricePerDeg != null ? AG.pricePerDeg : ''}" placeholder="авто" style="${inp};width:130px"></label>
        <button id="ag-apply" style="${btn};border-color:#26a69a">Применить</button>
      </div>
      <p style="color:#8b93a7;margin:10px 0 0">Долгота планеты переводится в цену. «Авто» разворачивает полный круг (360°) на видимый диапазон — линия всегда на экране. Задай цену на 1° для классического масштаба Ганна. Система (гео/гелио) действует и на ингрессии/ретро.</p>`);
    document.getElementById('ag-apply').onclick = () => {
      const chosen = order.filter((p) => { const el = document.querySelector('input[data-p="' + p + '"]'); return el && el.checked; });
      if (chosen.length) AG.linePlanets = chosen;
      AG.frame = document.getElementById('ag-frame').value;
      const sc = document.getElementById('ag-scale').value.trim();
      AG.pricePerDeg = sc === '' ? null : (+sc || null);
      refreshAstroGann();
    };
  }

  /* ---------- ценовые индикаторы (тумблеры) ---------- */
  function toggleOverlay(kind, on) {
    const c = state.chart, IND = window.LUN.INDICATORS;
    if (on) {
      let name, calcParams, styles;
      if (kind === 'SMA') { name = 'MA';  calcParams = IND.sma.periods; styles = { lines: IND.sma.colors.map((color) => ({ color })) }; }
      if (kind === 'EMA') { name = 'EMA'; calcParams = IND.ema.periods; styles = { lines: IND.ema.colors.map((color) => ({ color })) }; }
      if (kind === 'VWAP') { name = 'VWAP_BANDS'; }
      c.createIndicator({ name, calcParams, styles, paneId: 'candle_pane' }, true);
      state.overlayIds[kind] = name;      // удаляем по имени индикатора
    } else {
      c.removeIndicator({ paneId: 'candle_pane', name: state.overlayIds[kind] });
      delete state.overlayIds[kind];
    }
  }

  /* ---------- загрузка инструмента/ТФ ---------- */
  async function load(slot) {
    slot = slot || state;
    const c = slot.chart, ins = slot.instrument, tf = slot.tf;
    const ticker = await window.LunData.resolveTicker(ins);
    c.setSymbol({
      ticker, symbol: ticker, provider: ins.provider || 'moex',
      pricePrecision: ins.pricePrecision, volumePrecision: ins.volumePrecision,
      engine: ins.engine || 'futures', market: ins.market || 'forts', type: ins.type || 'futures',
    });
    c.setPeriod({ span: tf.span, type: tf.type });
    slot.loader = window.LunData.makeDataLoader();   // держим ссылку — через неё поток толкает свечи
    c.setDataLoader(slot.loader);
    if (slot === state) document.getElementById('sym-title').textContent = `${ins.title}  ·  ${ticker}  ·  ${tf.title}`;
    // подключить/переподключить поток после подгрузки истории
    if (window.LunStream) setTimeout(() => window.LunStream.attach(slot), 700);
    // обновить наложение 2-го графика под новый ТФ/инструмент
    if (slot.compareInstrument) setTimeout(() => refreshCompare(slot), 800);
    // обновить ОИ под новый инструмент
    if (slot.oiPane) setTimeout(() => rebuildOI(slot), 900);
    // пересчитать арбитражный спред под новый ТФ
    if (slot.arbBundle) setTimeout(() => buildArb(slot, slot.arbBundle), 1000);
  }

  /* ---------- инструменты рисования ---------- */
  const DRAW_TOOLS = [
    { id: 'horizontalStraightLine', label: 'Уровень',       key: 't' },
    { id: 'segment',                label: 'Трендовая',     key: 'l' },
    { id: 'lun_rect',               label: 'Прямоугольник', key: 'r' },
    { id: 'lun_arrow',              label: 'Стрелка',       key: 'a' },
    { id: 'lun_text',               label: 'Текст',         key: 'x' },
    { id: 'lun_gann',               label: 'Ган 1×1',       key: 'g' },
    { id: 'lun_hray',               label: 'Луч ⨯N',        key: 'h' },
    { id: 'lun_vprofile',           label: 'Об.профиль',    key: 'd' },
  ];
  /* Ctrl + перетаскивание = скопировать оверлей: в начале переноса при зажатом
   * Ctrl создаём дубликат на СТАРОМ месте, а сам оверлей уносится мышью в новое.
   * Клон получает те же обработчики — его тоже можно копировать. */
  let ctrlDown = false;
  const clonePoints = (pts) => (pts || []).map((p) => ({ timestamp: p.timestamp, dataIndex: p.dataIndex, value: p.value }));
  const ovOf = (event) => event && (event.overlay || event.currentOverlay);
  function overlayEvents() {
    const sel = (event) => { const ov = ovOf(event); if (ov) state.selectedOverlayId = ov.id; return false; };
    return {
      onSelected: sel, onClick: sel,
      onDeselected: () => { state.selectedOverlayId = null; return false; },
      onPressedMoveStart: (event) => {
        sel(event);
        const ov = ovOf(event);
        if (!ctrlDown || !ov) return false;
        try { state.chart.createOverlay(Object.assign({ name: ov.name, points: clonePoints(ov.points), styles: ov.styles, extendData: ov.extendData }, overlayEvents())); }
        catch (e) { /* клонирование не должно ломать перенос */ }
        return false;   // не перехватываем — оригинал продолжает тянуться мышью
      },
    };
  }
  // Delete — удалить выделенный оверлей; Ctrl+C/V — копия в буфер и вставка со сдвигом.
  // ВАЖНО: removeOverlay без объекта-фильтра сносит ВСЕ фигуры. Удаляем строго
  // по id одной выделенной ({ id }).
  function deleteSelected() {
    const id = state.selectedOverlayId;
    if (!id || typeof id !== 'string') return;
    try { state.chart.removeOverlay({ id }); } catch (e) {}
    state.selectedOverlayId = null;
  }
  function copySelected() {
    if (!state.selectedOverlayId || !state.chart.getOverlayById) return false;
    const ov = state.chart.getOverlayById(state.selectedOverlayId);
    if (ov) { state.clipboardOverlay = { name: ov.name, points: clonePoints(ov.points), styles: ov.styles, extendData: ov.extendData }; return true; }
    return false;
  }
  function pasteOverlay() {
    const c = state.clipboardOverlay; if (!c) return false;
    const pts = c.points.map((p) => ({ timestamp: p.timestamp, dataIndex: p.dataIndex, value: (p.value != null ? p.value * 1.004 : p.value) }));  // сдвиг ↑0.4%, чтобы копия была видна
    try { state.chart.createOverlay(Object.assign({ name: c.name, points: pts, styles: c.styles, extendData: c.extendData }, overlayEvents())); return true; } catch (e) { return false; }
  }
  // Ctrl+S — скрин графика (PNG). +/- — зум.
  function screenshot() {
    const c = state.chart; let url = null;
    try { if (c.getConvertPictureUrl) url = c.getConvertPictureUrl(true, 'png', '#0b0e14'); } catch (e) {}
    if (!url) { alert('Скрин не поддерживается этой версией графика.'); return; }
    const a = document.createElement('a'); a.href = url; a.download = 'lun_term_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function zoomChart(inn) {
    const c = state.chart;
    try { if (c.zoomAtCoordinate) { c.zoomAtCoordinate(inn ? 1.15 : 0.87); return; } } catch (e) {}
    try { const bs = c.getBarSpace().bar; if (c.setBarSpace) c.setBarSpace(Math.max(1, bs * (inn ? 1.15 : 0.87))); } catch (e) {}
  }

  function startDraw(toolId) {
    closeMenus();
    const ev = overlayEvents();
    if (toolId === 'lun_text') {
      const t = window.prompt('Текст метки:', '');
      if (t === null) return;
      state.chart.createOverlay(Object.assign({ name: 'lun_text', extendData: t }, ev));
    } else if (toolId === 'lun_hray') {
      const n = (window.LUN.HRAY && window.LUN.HRAY.maxCrossings) || 2;
      state.chart.createOverlay(Object.assign({ name: 'lun_hray', extendData: { maxCrossings: n } }, ev));
    } else {
      state.chart.createOverlay(Object.assign({ name: toolId }, ev));
    }
  }

  /* прогноз вперёд: продлить астро-полосы до следующего аспекта ☉–♅ */
  function setForecast(on, btn) {
    const c = state.chart, list = c.getDataList();
    if (on && list && list.length) {
      const F = window.LUN.FORECAST || { bodyA: 'Sun', bodyB: 'Uranus', frame: 'helio', maxBars: 500 };
      const lastTs = list[list.length - 1].timestamp;
      const until = window.LunAstro.nextAspect(F.bodyA, F.bodyB, lastTs, F.frame);
      if (!until) { if (btn) btn.classList.remove('active'); alert('Ближайший аспект ' + F.bodyA + '–' + F.bodyB + ' не найден в горизонте.'); return; }
      const stepMs = periodMillis(state.tf);
      const extra = Math.min(F.maxBars || 500, Math.max(1, Math.ceil((until - lastTs) / stepMs)));
      window.LUN_FORECAST = { enabled: true, untilTs: until, stepMs, maxBars: F.maxBars || 500 };
      try { const bar = c.getBarSpace().bar || 6; c.setOffsetRightDistance(Math.max(80, extra * bar)); } catch (e) {}
      state.forecastOn = true;
      if (btn) btn.title = 'Прогноз до аспекта ☉–♅: ' + new Date(until).toISOString().slice(0, 10) + ' (F)';
    } else {
      window.LUN_FORECAST = { enabled: false };
      state.forecastOn = false;
      try { c.setOffsetRightDistance(80); } catch (e) {}
    }
    try { c.resize(); } catch (e) {}
  }

  /* ---------- статус-строка ---------- */
  function updateMoonStatus() {
    const info = window.LunAstro.moonInfo(Date.now());
    const s = window.LUN.SIGNS[info.signIndex];
    const c1 = window.LUN.CYCLES[0];
    const z = window.LunAstro.zoneOf(info.lon, c1.zones);
    document.getElementById('moon-now').innerHTML =
      `☾ <b style="color:${s.color}">${s.glyph} ${s.name}</b> ${info.degInSign.toFixed(1)}°` +
      (z ? ` · <span style="color:${window.LUN.BIAS_COLORS[z.bias]}">${z.label}</span>` : '');
  }

  /* ---------- UI ---------- */
  function mkBtn(wrap, text, onClick, active, title) {
    const b = document.createElement('button');
    b.textContent = text; if (title) b.title = title;
    if (active) b.classList.add('active');
    b.onclick = () => onClick(b);
    wrap.appendChild(b); return b;
  }

  function buildUI() {
    const insWrap = document.getElementById('instruments');
    const MARKET = { moex: 'MOEX', bybit: 'Крипта', binance: 'Крипта', yahoo: 'США' };
    let curMarket = null;
    const clearActive = () => [...insWrap.querySelectorAll('button')].forEach((x) => x.classList.remove('active'));
    window.LUN.INSTRUMENTS.forEach((ins) => {
      const grp = MARKET[ins.provider || 'moex'] || 'Прочее';
      if (grp !== curMarket) { const h = document.createElement('div'); h.className = 'menu-sub'; h.textContent = grp; insWrap.appendChild(h); curMarket = grp; }
      mkBtn(insWrap, ins.title, (b) => {
        state.instrument = ins; load(); closeMenus();
        clearActive(); b.classList.add('active');
      }, ins === state.instrument, ins.title).dataset.sync = 'ins:' + ins.id;
    });
    // поиск любого инструмента MOEX (акции/фьючерсы)
    const findBtn = mkBtn(insWrap, '🔍 Поиск инструмента…', () => { closeMenus(); window.LunInstruments.open((instr) => {
      state.instrument = instr; load();
      [...insWrap.children].forEach((x) => x.classList.remove('active'));
    }); }, false, 'Поиск любой акции или фьючерса MOEX');
    findBtn.classList.add('find-btn');
    // 2-й график линией поверх активного: выбор через окно инструментов
    mkBtn(insWrap, '➕ 2-й график (линией)', () => { closeMenus(); window.LunInstruments.open((instr) => addCompare(instr)); }, false, 'Наложить второй инструмент линией на активный график');
    mkBtn(insWrap, '✕ убрать 2-й график', () => { closeMenus(); removeCompare(); }, false, 'Убрать наложение');
    // арбитражные связки (синтетика + спред + z-score)
    (window.LUN.ARB || []).forEach((bundle) => mkBtn(insWrap, '⚖ ' + bundle.title, () => { closeMenus(); buildArb(state, bundle); }, false, 'Арбитражная связка: синтетика, спред и z-score (на ТФ активного графика)'));
    if ((window.LUN.ARB || []).length) mkBtn(insWrap, '✕ убрать спред', () => { closeMenus(); removeArb(state); }, false, 'Убрать панель спреда');

    const tfWrap = document.getElementById('timeframes');
    window.LUN.TIMEFRAMES.forEach((tf, i) => {
      const b = mkBtn(tfWrap, tf.title, (bb) => {
        state.tf = tf; load(); closeMenus();
        [...tfWrap.children].forEach((x) => x.classList.remove('active')); bb.classList.add('active');
      }, tf === state.tf, tf.title + ' (' + (i + 1) + ')');
      b.dataset.sync = 'tf:' + tf.id;
      regHotkey(String(i + 1), () => b.click());   // 1..4 → ТФ
    });

    const indWrap = document.getElementById('indicators');
    ['SMA', 'EMA', 'VWAP'].forEach((k) => { const b = mkBtn(indWrap, k, (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleOverlay(k, on);
    }); b.dataset.sync = 'ov:' + k; });
    // объём — включён по умолчанию, можно убрать
    mkBtn(indWrap, 'Объём', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createVolumePane(); else if (state.volumePane) { state.chart.removeIndicator({ paneId: state.volumePane }); state.volumePane = null; }
    }, true).dataset.sync = 'vol';
    // дневная кумулятивная дельта — по умолчанию выключена (полное отключение)
    mkBtn(indWrap, 'Δ дельта', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createDeltaPane(); else if (state.deltaPane) { state.chart.removeIndicator({ paneId: state.deltaPane }); state.deltaPane = null; }
    }, false, 'Дневная кумулятивная дельта (аппрокс. по OHLC)').dataset.sync = 'delta';
    // марковский режим: лента BEAR/SIDE/BULL + панель сигнала + матрица
    const mkBtnRef = mkBtn(indWrap, 'Марков', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createMarkov(); else removeMarkov();
    }, false, 'Марковский режим: лента BEAR/SIDE/BULL + сигнал + матрица переходов (M)');
    mkBtnRef.dataset.sync = 'markov';
    regHotkey('m', () => mkBtnRef.click());
    // открытый интерес + позиции физлиц/юрлиц (FUTOI, MOEX, дневной)
    const oiBtn = mkBtn(indWrap, 'ОИ физ/юр', (b) => {
      const on = !b.classList.contains('active');
      if (on) rebuildOI(state).then((ok) => b.classList.toggle('active', ok !== false));
      else { b.classList.remove('active'); removeOI(state); }
    }, false, 'Открытый интерес и чистые позиции физлиц/юрлиц (FUTOI, только фьючерсы MOEX, дневной)');
    oiBtn.dataset.sync = 'oi';
    // узлы Луны (0°/15°) и сильные бары на цене — для поиска «сильный бар в узле»
    [['MoonNodes', 'Узлы ☾', 'Ингрессии (0°) и середины (15°) знаков Луны на цене'],
     ['StrongBars', 'Сильбары', 'Сила: всплеск объёма ≥2× среднего · силища (двойной знак): объём держится'],
     ['Sessions', 'Сессии', 'Сессии Азия/Лондон/Нью-Йорк/Сидней фоном (UTC, только интрадей)']].forEach(([name, label, tip]) =>
      (mkBtn(indWrap, label, (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) { state.chart.createIndicator({ name, paneId: 'candle_pane' }, true); state.candleInds[name] = true; }
        else { state.chart.removeIndicator({ paneId: 'candle_pane', name }); delete state.candleInds[name]; }
      }, false, tip)).dataset.sync = 'cand:' + name);
    // положения Меркурия и Солнца в знаках (словами)
    [['Mercury', '☿ знак', 25], ['Sun', '☉ знак', 26]].forEach(([body, label, order]) => { mkBtn(indWrap, label, (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createSignPane(body, order); else if (state.signPanes[body]) { state.chart.removeIndicator({ paneId: state.signPanes[body] }); delete state.signPanes[body]; }
    }, false, `Положение ${BODY_LABEL[body]} в знаках`).dataset.sync = 'sign:' + body; });

    buildAspectButtons();

    buildCycleButtons();

    // ---- меню «📐 Ганн» ----
    const gannWrap = document.getElementById('gann');
    if (gannWrap) {
      const gsub = (t) => { const h = document.createElement('div'); h.className = 'menu-sub'; h.textContent = t; gannWrap.appendChild(h); };
      gsub('Квадраты');
      mkBtn(gannWrap, '⊞ Калькулятор квадратов…', () => { closeMenus(); gannSquareModal(); }, false, 'Квадрат 9 / шестиугольник / круг 360° / натуральные — уровни поддержки и сопротивления');
      mkBtn(gannWrap, '✕ убрать уровни квадрата', () => { closeMenus(); removeCandInd('GannSquareLevels'); }, false, 'Убрать нанесённые уровни квадрата');
      gsub('Уровни и циклы');
      [['GannRetr', '📏 Ганн-ретрейсменты', 'Горизонтали 1/8·1/3·1/2 диапазона видимого окна'],
       ['GannCycles', '⏲ Мастер-циклы времени', 'Вертикали 30·45·60·90·120·144·180·270·360 баров от последнего экстремума']].forEach(([name, label, tip]) =>
        mkBtn(gannWrap, label, (b) => {
          const on = !b.classList.contains('active'); b.classList.toggle('active', on);
          if (on) { state.chart.createIndicator({ name, paneId: 'candle_pane' }, true); state.candleInds[name] = true; }
          else removeCandInd(name);
        }, false, tip));
      gsub('Астро-Ганн');
      mkBtn(gannWrap, '🪐 Настроить планетарные линии…', () => { closeMenus(); astroGannModal(); }, false, 'Планеты, гео/гелио, масштаб цена/градус');
      [['PlanetLines', '🪐 Планетарные линии → цена', 'Долгота планеты как ценовой уровень (ползёт во времени)'],
       ['PlanetIngress', '♈ Ингрессии планет', 'Вертикали при входе планеты в новый знак (каждые 30°)']].forEach(([name, label, tip]) =>
        mkBtn(gannWrap, label, (b) => {
          const on = !b.classList.contains('active'); b.classList.toggle('active', on);
          if (on) { state.chart.createIndicator({ name, paneId: 'candle_pane' }, true); state.candleInds[name] = true; }
          else removeCandInd(name);
        }, false, tip));
      mkBtn(gannWrap, '℞ Ретроградности (панель)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) createRetroPane(); else removeRetroPane();
      }, false, 'Панель периодов попятного движения планет');
      [['PlanetFan', '🌬 Веер долготы', 'Веер от пивота: цена движется со скоростью долготы планет'],
       ['PlanetSq9', '⊞ Sq9 в градусах планет', 'Уровни, где угол колеса Квадрата-9 равен долготе планеты'],
       ['Eclipses', '⊘ Затмения', 'Вертикали солнечных (☉) и лунных (☾) затмений']].forEach(([name, label, tip]) =>
        mkBtn(gannWrap, label, (b) => {
          const on = !b.classList.contains('active'); b.classList.toggle('active', on);
          if (on) { state.chart.createIndicator({ name, paneId: 'candle_pane' }, true); state.candleInds[name] = true; }
          else removeCandInd(name);
        }, false, tip));
      mkBtn(gannWrap, '📊 Барометр Bradley (панель)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) createBradleyPane(); else removeBradleyPane();
      }, false, 'Сидерограф: взвешенная сумма аспектов, экстремумы = даты разворота');
      mkBtn(gannWrap, '🜨 Космограмма…', () => { closeMenus(); cosmogramModal(); }, false, 'Колесо зодиака с планетами и аспектами на дату');
      const gnote = document.createElement('div'); gnote.className = 'menu-note';
      gnote.textContent = 'Box, Квадрат на графике и сквоузинг цены/времени — следующий этап';
      gannWrap.appendChild(gnote);
    }

    const drawWrap = document.getElementById('drawtools');
    DRAW_TOOLS.forEach((t) => {
      const b = mkBtn(drawWrap, t.label, () => startDraw(t.id), false, t.label + (t.key ? ' (' + t.key.toUpperCase() + ')' : ''));
      if (t.key) b.innerHTML = t.label + '<span class="hk">' + t.key.toUpperCase() + '</span>';   // хоткей справа
      regHotkey(t.key, () => startDraw(t.id));
    });
    mkBtn(drawWrap, '✕ очистить всё', () => { closeMenus(); state.chart.removeOverlay(); }).className = 'danger';
    regHotkey('+', () => zoomChart(true)); regHotkey('=', () => zoomChart(true)); regHotkey('-', () => zoomChart(false));   // зум +/−

    const setWrap = document.getElementById('settings');
    const fcBtn = mkBtn(setWrap, '🔮 Прогноз', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); setForecast(on, b); closeMenus();
    }, false, 'Продлить астро-полосы вправо до следующего аспекта ☉–♅ (F)');
    fcBtn.dataset.sync = 'forecast';
    regHotkey('f', () => fcBtn.click());
    const setBtn = mkBtn(setWrap, '⚙ Настройки', () => { closeMenus(); window.LunSettings.open(applySettings); }, false,
      'Цвета знаков и торговые зоны циклов (S)');
    regHotkey('s', () => setBtn.click());
    const btBtn = mkBtn(setWrap, '📊 Бэктест', async () => {
      closeMenus();
      const ins = state.instrument;
      const ticker = await window.LunData.resolveTicker(ins);
      window.LunBacktest.run({ engine: ins.engine || 'futures', market: ins.market || 'forts', ticker, title: (ins.title || ins.id) + ' · ' + ticker });
    }, false, 'Сверка лунных зон и аспектов с историей текущего инструмента (B)');
    regHotkey('b', () => btBtn.click());
    mkBtn(setWrap, '❓ Справка', () => { closeMenus(); helpModal(); }, false, 'Что умеет терминал');
    mkBtn(setWrap, '⌨ Горячие клавиши', () => { closeMenus(); hotkeysModal(); }, false, 'Список горячих клавиш');

    // Коннекторы — реалтайм-потоки
    const conWrap = document.getElementById('connectors');
    [['crypto', 'Крипто · Bybit realtime', 'Настоящий поток (WebSocket): последняя свеча тикает вживую'],
     ['us', 'Америка · Yahoo (опрос)', 'Псевдо-реалтайм: опрос ~каждые 15–30с (без ключа Finnhub)'],
     ['moex', 'MOEX · псевдо (~15м)', 'ISS без потока: опрос; истинный realtime у биржи платный']].forEach(([name, label, tip]) => {
      mkBtn(conWrap, label, (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (window.LunStream) window.LunStream.setConnector(name, on, slots);
      }, false, tip);
    });
    const stub = mkBtn(conWrap, '➕ Свой коннектор (Finam/MOEX API)', () => alert('Свой коннектор (Finam Trade / MOEX API с ключами) — задел на будущее. Здесь появится подключение брокерского потока и торговли.'), false, 'Задел на будущее');
    stub.style.opacity = '0.6';

    // Экраны — сетка графиков
    const layWrap = document.getElementById('layouts');
    Object.keys(LAYOUTS).forEach((k) => mkBtn(layWrap, LAYOUTS[k].label, (b) => {
      closeMenus(); [...layWrap.querySelectorAll('[data-lay]')].forEach((x) => x.classList.remove('active')); b.classList.add('active'); setLayout(k);
    }, k === '1', LAYOUTS[k].label).dataset.lay = k);
    const syncBtn = mkBtn(layWrap, '🔗 Синхр. кроссхейр', (b) => {
      syncCross = !b.classList.contains('active'); b.classList.toggle('active', syncCross); if (!syncCross) hideSync();
    }, true, 'Курсор в одном окне рисует перекрестье по тому же времени во всех (и по цене — где инструмент тот же)');
    syncBtn.style.marginTop = '4px';
  }

  /* ---------- мультичарт: сетка независимых слотов ---------- */
  const LAYOUTS = {
    '1': { label: '1 график', cells: 1, rows: '1fr', cols: '1fr' },
    '2': { label: '1×2', cells: 2, rows: '1fr', cols: '1fr 1fr' },
    '4': { label: '2×2', cells: 4, rows: '1fr 1fr', cols: '1fr 1fr' },
    '6': { label: '3×2', cells: 6, rows: '1fr 1fr', cols: '1fr 1fr 1fr' },
    '8': { label: '4×2', cells: 8, rows: '1fr 1fr', cols: '1fr 1fr 1fr 1fr' },
  };
  function highlightActive() {
    slots.forEach((s, i) => { if (s.cellEl) s.cellEl.classList.toggle('cell-active', i === activeIdx && slots.length > 1); });
  }

  /* ---------- синхронизация кроссхейра между ячейками ---------- */
  let syncCross = true;                 // синхронизировать перекрестье
  let syncRaf = null;
  const idxForTs = (list, ts) => { let lo = 0, hi = list.length - 1, idx = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].timestamp <= ts) { idx = m; lo = m + 1; } else hi = m - 1; } return idx; };
  function hideSync() { slots.forEach((s) => { if (s.lines) { s.lines.v.style.display = 'none'; s.lines.h.style.display = 'none'; } }); }
  function doSync(src, clientX, clientY) {
    if (!syncCross || slots.length < 2) { hideSync(); return; }
    let coord; try { const r = src.cellEl.getBoundingClientRect(); coord = src.chart.convertFromPixel({ x: clientX - r.left, y: clientY - r.top }, { paneId: 'candle_pane' }); } catch (e) { return; }
    if (!coord) return;
    const srcList = src.chart.getDataList();
    const ts = coord.timestamp != null ? coord.timestamp : (srcList[coord.dataIndex] && srcList[coord.dataIndex].timestamp);
    const val = coord.value;
    if (ts == null) return;
    slots.forEach((s) => {
      if (!s.lines) return;
      const list = s.chart.getDataList(); const idx = idxForTs(list, ts);
      let px = null; if (idx >= 0) { try { px = s.chart.convertToPixel({ dataIndex: idx, value: val }, { paneId: 'candle_pane' }); } catch (e) {} }
      if (px && isFinite(px.x)) { s.lines.v.style.left = px.x + 'px'; s.lines.v.style.display = 'block'; } else s.lines.v.style.display = 'none';
      if (px && isFinite(px.y) && s.instrument.id === src.instrument.id) { s.lines.h.style.top = px.y + 'px'; s.lines.h.style.display = 'block'; } else s.lines.h.style.display = 'none';
    });
  }
  function wireSync(slot) {
    const cell = slot.cellEl;
    const v = document.createElement('div'); v.className = 'sync-vline';
    const h = document.createElement('div'); h.className = 'sync-hline';
    cell.appendChild(v); cell.appendChild(h); slot.lines = { v, h };
    cell.addEventListener('mousemove', (ev) => { if (syncRaf) cancelAnimationFrame(syncRaf); syncRaf = requestAnimationFrame(() => doSync(slot, ev.clientX, ev.clientY)); });
    cell.addEventListener('mouseleave', hideSync);
  }
  function slotHasSync(key) {
    const p = key.split(':'), t = p[0], arg = p[1];
    switch (t) {
      case 'ins': return state.instrument.id === arg;
      case 'tf': return state.tf.id === arg;
      case 'ov': return !!state.overlayIds[arg];
      case 'vol': return !!state.volumePane;
      case 'delta': return !!state.deltaPane;
      case 'markov': return !!state.markovPanes;
      case 'cand': return !!state.candleInds[arg];
      case 'sign': return !!state.signPanes[arg];
      case 'cyc': return !!state.cyclePanes[arg];
      case 'asp': return !!state.aspectPanes[arg];
      case 'allasp': return !!state.allAspectPane;
      case 'uranus': return !!state.uranusPane;
      case 'forecast': return !!state.forecastOn;
      case 'oi': return !!state.oiPane;
    }
    return false;
  }
  function syncToolbar() {
    document.querySelectorAll('[data-sync]').forEach((b) => b.classList.toggle('active', slotHasSync(b.dataset.sync)));
    document.getElementById('sym-title').textContent = `${state.instrument.title}  ·  ${state.tf.title}` + (slots.length > 1 ? `   [ячейка ${activeIdx + 1}/${slots.length}]` : '');
  }
  function activateSlot(i) {
    if (i < 0 || i >= slots.length || i === activeIdx) return;
    activeIdx = i; state = slots[i]; window.LUN_CHART = state.chart;
    highlightActive(); syncToolbar();
    showMarkovPanel(!!state.markovPanes);   // панель Маркова следует за активной ячейкой
  }
  function setLayout(key) {
    const L = LAYOUTS[key] || LAYOUTS['1'];
    const prev = slots.map((s) => ({ instrument: s.instrument, tf: s.tf }));
    if (window.LunStream) window.LunStream.detachAll();
    slots.forEach((s) => { if (s.markovTimer) { clearInterval(s.markovTimer); s.markovTimer = null; } try { kc.dispose(s.cellEl); } catch (e) {} });
    const mp = document.getElementById('markov-panel'); if (mp) mp.remove();
    const grid = document.getElementById('chart');
    grid.innerHTML = ''; grid.style.display = 'grid'; grid.style.gap = '2px';
    grid.style.gridTemplateRows = L.rows; grid.style.gridTemplateColumns = L.cols;
    slots = [];
    for (let i = 0; i < L.cells; i++) {
      const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.slot = i; grid.appendChild(cell);
      const slot = makeSlot(i); slot.cellEl = cell;
      if (prev[i]) { slot.instrument = prev[i].instrument; slot.tf = prev[i].tf; }
      else { slot.instrument = window.LUN.INSTRUMENTS[Math.min(i, window.LUN.INSTRUMENTS.length - 1)]; slot.tf = DEFAULT_TF; }
      slot.chart = kc.init(cell, { styles: THEME });
      cell.addEventListener('mousedown', () => activateSlot(i));
      slots.push(slot);
      if (L.cells > 1) wireSync(slot);
    }
    activeIdx = 0; state = slots[0]; window.LUN_CHART = state.chart;
    slots.forEach((s) => { state = s; buildPanes(); });   // buildPanes синхронно, по активному state
    state = slots[0];
    slots.forEach((s) => load(s));
    highlightActive(); syncToolbar();
  }

  // тумблеры аспектов: по планете (☉/планета) + сводная «∀ все»
  function buildAspectButtons() {
    const aspWrap = document.getElementById('aspects');
    aspWrap.innerHTML = '';
    window.LUN.ASPECT_PLANETS.forEach((pl, i) => { mkBtn(aspWrap, pl.glyph, (b) => {
      pl.enabled = !b.classList.contains('active'); b.classList.toggle('active', pl.enabled);
      if (pl.enabled) createSunAspect(pl, 15 + i);
      else if (state.aspectPanes[pl.body]) { state.chart.removeIndicator({ paneId: state.aspectPanes[pl.body] }); delete state.aspectPanes[pl.body]; }
    }, pl.enabled, `Аспекты ☉/${pl.glyph} (${pl.body})`).dataset.sync = 'asp:' + pl.body; });
    mkBtn(aspWrap, '∀ все', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); window.LUN.ALL_ASPECTS.enabled = on;
      if (on) createAllAspect(); else if (state.allAspectPane) { state.chart.removeIndicator({ paneId: state.allAspectPane }); state.allAspectPane = null; }
    }, window.LUN.ALL_ASPECTS.enabled, 'Сводная полоса всех аспектов всех пар (детально на M5/M15)').dataset.sync = 'allasp';
    // отдельная полоса: Уран — все планеты (мажорные аспекты)
    const urBtn = mkBtn(aspWrap, '♅∀', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createUranusStrip(); else if (state.uranusPane) { state.chart.removeIndicator({ paneId: state.uranusPane }); state.uranusPane = null; }
    }, !!state.uranusPane, 'Аспекты Урана ко всем планетам (U)');
    urBtn.dataset.sync = 'uranus';
    regHotkey('u', () => urBtn.click());
  }
  const URANUS_PANE = 'pane_asp_uranus';
  function createUranusStrip() {
    state.chart.createIndicator({ name: 'UranusAspects', paneId: URANUS_PANE, shortName: '♅ ко всем', extendData: { orb: clampOrb() } }, false);
    state.uranusPane = URANUS_PANE;
    wishPane(URANUS_PANE, { height: window.LUN.PANE_HEIGHTS.cycle + 4, minHeight: 20, order: 28 });
  }

  // тумблеры циклов (пересобираются после изменения настроек)
  function buildCycleButtons() {
    const cycWrap = document.getElementById('cycles');
    cycWrap.innerHTML = '';
    window.LUN.CYCLES.forEach((cy, i) => { mkBtn(cycWrap, String(i + 1), (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) { if (!state.cyclePanes[cy.id]) createCyclePane(cy, 11 + i); }
      else if (state.cyclePanes[cy.id]) { state.chart.removeIndicator({ paneId: state.cyclePanes[cy.id] }); delete state.cyclePanes[cy.id]; }
    }, cy.enabled, cy.title).dataset.sync = 'cyc:' + cy.id; });
  }

  // применить настройки: пересобрать ленту знаков и полосы циклов
  function applySettings() {
    const c = state.chart;
    const openBodies = Object.keys(state.signPanes);
    openBodies.forEach((body) => c.removeIndicator({ paneId: state.signPanes[body] }));
    state.signPanes = {};
    Object.values(state.cyclePanes).forEach((pid) => c.removeIndicator({ paneId: pid }));
    state.cyclePanes = {};
    // заново создаём открытые ленты знаков (Луна всегда) и включённые циклы
    const orderOf = { Moon: 10, Mercury: 12, Sun: 13, Venus: 14, Mars: 15, Jupiter: 16, Saturn: 17 };
    (openBodies.length ? openBodies : ['Moon']).forEach((body) => createSignPane(body, orderOf[body] || 15));
    state.signPane = state.signPanes.Moon;
    window.LUN.CYCLES.forEach((cy, i) => { if (cy.enabled) createCyclePane(cy, 11 + i); });
    buildCycleButtons();
    // пересоздать активные индикаторы (SMA/EMA/VWAP) с новыми параметрами
    Object.keys(state.overlayIds).forEach((kind) => { toggleOverlay(kind, false); toggleOverlay(kind, true); });
    // аспекты: орб/включённость могли смениться — пересобрать
    Object.keys(state.aspectPanes).forEach((k) => c.removeIndicator({ paneId: state.aspectPanes[k] }));
    state.aspectPanes = {};
    if (state.allAspectPane) { c.removeIndicator({ paneId: state.allAspectPane }); state.allAspectPane = null; }
    if (state.uranusPane) { c.removeIndicator({ paneId: state.uranusPane }); state.uranusPane = null; }
    window.LUN.ASPECT_PLANETS.forEach((pl, i) => { if (pl.enabled) createSunAspect(pl, 15 + i); });
    if (window.LUN.ALL_ASPECTS.enabled) createAllAspect();
    buildAspectButtons();
    updateMoonStatus();
  }

  /* ---------- init ---------- */
  function init() {
    addMarkovCss();
    buildUI();
    // выпадающие меню: клик по пункту открывает/закрывает, клик вне — закрывает
    document.querySelectorAll('.menubar .menu-btn').forEach((btn) => {
      btn.onclick = (e) => { e.stopPropagation(); const menu = btn.parentElement, open = menu.classList.contains('open'); closeMenus(); if (!open) menu.classList.add('open'); };
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(); });
    if (window.LunStream) window.LunStream.onStatus((txt, color) => { const el = document.getElementById('stream-status'); if (el) { el.textContent = txt; el.style.color = color; } });
    setLayout('1');       // создаёт график(и), панели и загрузку
    updateMoonStatus();
    setInterval(updateMoonStatus, 60000);
    window.addEventListener('lun:datasource', () => {
      const el = document.getElementById('datasource');
      el.textContent = window.LUN_DATA_SOURCE || '';
      el.title = window.LUN_DATA_ERROR || '';
      el.style.color = window.LUN_DATA_ERROR ? '#e0a030' : '#26a69a';
      slots.forEach((s) => scheduleApply(s));   // данные загружены — закрепляем высоты панелей всех слотов
      if (state.markovPanes) setTimeout(refreshMarkovPanel, 200);
      // прогноз в активном слоте выключаем при перезагрузке данных (шаг ТФ иной)
      if (state.forecastOn) { window.LUN_FORECAST = { enabled: false }; state.forecastOn = false; try { state.chart.setOffsetRightDistance(80); } catch (e) {} syncToolbar(); }
    });
    // состояние Ctrl — для Ctrl+перетаскивание = копирование оверлея
    window.addEventListener('keydown', (e) => { if (e.key === 'Control' || e.ctrlKey) ctrlDown = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Control') ctrlDown = false; });
    window.addEventListener('blur', () => { ctrlDown = false; });
    // Delete / Ctrl+C·V·S — работа с выделенным оверлеем и скрин
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.lun-modal-bg')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedOverlayId) { e.preventDefault(); deleteSelected(); return; }
      if (e.ctrlKey || e.metaKey) {
        const k = keyFromEvent(e);
        if (k === 'c') { if (copySelected()) e.preventDefault(); }
        else if (k === 'v') { if (pasteOverlay()) e.preventDefault(); }
        else if (k === 's') { e.preventDefault(); screenshot(); }
      }
    });
    // горячие клавиши (кроме ввода текста и открытых модалок)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.lun-modal-bg')) return;
      const fn = hotkeys[keyFromEvent(e)] || hotkeys[(e.key || '').toLowerCase()];
      if (fn) { e.preventDefault(); fn(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
