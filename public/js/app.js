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

  const state = {
    chart: null,
    instrument: window.LUN.INSTRUMENTS[0],
    tf: window.LUN.TIMEFRAMES.find((t) => t.id === window.LUN.DEFAULT_TIMEFRAME),
    signPane: null,
    signPanes: {},          // body -> paneId (ленты знаков Луна/Меркурий/Солнце)
    volumePane: null,
    aspectPanes: {},        // body -> paneId (полосы ☉/планета)
    allAspectPane: null,    // сводная полоса всех аспектов
    deltaPane: null,        // дневная кумулятивная дельта
    cyclePanes: {},         // cycleId -> paneId
    overlayIds: {},         // EMA/SMA/VWAP на ценовой панели
  };

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
  const paneWish = {};                 // paneId -> { height, minHeight, order }
  function applyPaneWishes() {
    Object.entries(paneWish).forEach(([pid, o]) => {
      try { state.chart.setPaneOptions({ id: pid, ...o }); }
      catch (e) { console.warn('[pane] setPaneOptions failed', pid, e.message); }
    });
  }
  // Загрузка данных пересобирает раскладку, поэтому применяем желаемые размеры
  // на нескольких тиках — последний (после укладки данных) закрепляет результат.
  function scheduleApply() { [0, 150, 400].forEach((ms) => setTimeout(applyPaneWishes, ms)); }
  function wishPane(id, opts) { if (id) { paneWish[id] = opts; scheduleApply(); } }

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
      const host = document.getElementById('chart'); host.style.position = 'relative';
      if (!el) { el = document.createElement('div'); el.id = 'markov-panel'; el.className = 'markov-panel'; host.appendChild(el); }
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
  async function load() {
    const c = state.chart, ins = state.instrument, tf = state.tf;
    const ticker = await window.LunData.resolveTicker(ins);
    c.setSymbol({
      ticker, pricePrecision: ins.pricePrecision, volumePrecision: ins.volumePrecision,
      engine: ins.engine || 'futures', market: ins.market || 'forts', type: ins.type || 'futures',
    });
    c.setPeriod({ span: tf.span, type: tf.type });
    c.setDataLoader(window.LunData.makeDataLoader());
    document.getElementById('sym-title').textContent = `${ins.title}  ·  ${ticker}  ·  ${tf.title}`;
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
      if (btn) btn.title = 'Прогноз до аспекта ☉–♅: ' + new Date(until).toISOString().slice(0, 10) + ' (F)';
    } else {
      window.LUN_FORECAST = { enabled: false };
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
    window.LUN.INSTRUMENTS.forEach((ins) => mkBtn(insWrap, ins.title, (b) => {
      state.instrument = ins; load(); closeMenus();
      [...insWrap.children].forEach((x) => x.classList.remove('active')); b.classList.add('active');
    }, ins === state.instrument, ins.title));
    // поиск любого инструмента MOEX (акции/фьючерсы)
    const findBtn = mkBtn(insWrap, '🔍 Поиск инструмента…', () => { closeMenus(); window.LunInstruments.open((instr) => {
      state.instrument = instr; load();
      [...insWrap.children].forEach((x) => x.classList.remove('active'));
    }); }, false, 'Поиск любой акции или фьючерса MOEX');
    findBtn.classList.add('find-btn');

    const tfWrap = document.getElementById('timeframes');
    window.LUN.TIMEFRAMES.forEach((tf, i) => {
      const b = mkBtn(tfWrap, tf.title, (bb) => {
        state.tf = tf; load(); closeMenus();
        [...tfWrap.children].forEach((x) => x.classList.remove('active')); bb.classList.add('active');
      }, tf === state.tf, tf.title + ' (' + (i + 1) + ')');
      regHotkey(String(i + 1), () => b.click());   // 1..4 → ТФ
    });

    const indWrap = document.getElementById('indicators');
    ['SMA', 'EMA', 'VWAP'].forEach((k) => mkBtn(indWrap, k, (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleOverlay(k, on);
    }));
    // объём — включён по умолчанию, можно убрать
    mkBtn(indWrap, 'Объём', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createVolumePane(); else if (state.volumePane) { state.chart.removeIndicator({ paneId: state.volumePane }); state.volumePane = null; }
    }, true);
    // дневная кумулятивная дельта — по умолчанию выключена (полное отключение)
    mkBtn(indWrap, 'Δ дельта', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createDeltaPane(); else if (state.deltaPane) { state.chart.removeIndicator({ paneId: state.deltaPane }); state.deltaPane = null; }
    }, false, 'Дневная кумулятивная дельта (аппрокс. по OHLC)');
    // марковский режим: лента BEAR/SIDE/BULL + панель сигнала + матрица
    const mkBtnRef = mkBtn(indWrap, 'Марков', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createMarkov(); else removeMarkov();
    }, false, 'Марковский режим: лента BEAR/SIDE/BULL + сигнал + матрица переходов (M)');
    regHotkey('m', () => mkBtnRef.click());
    // узлы Луны (0°/15°) и сильные бары на цене — для поиска «сильный бар в узле»
    [['MoonNodes', 'Узлы ☾', 'Ингрессии (0°) и середины (15°) знаков Луны на цене'],
     ['StrongBars', 'Сильбары', 'Сила: всплеск объёма ≥2× среднего · силища (двойной знак): объём держится'],
     ['Sessions', 'Сессии', 'Сессии Азия/Лондон/Нью-Йорк/Сидней фоном (UTC, только интрадей)']].forEach(([name, label, tip]) =>
      mkBtn(indWrap, label, (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) state.chart.createIndicator({ name, paneId: 'candle_pane' }, true);
        else state.chart.removeIndicator({ paneId: 'candle_pane', name });
      }, false, tip));
    // положения Меркурия и Солнца в знаках (словами)
    [['Mercury', '☿ знак', 25], ['Sun', '☉ знак', 26]].forEach(([body, label, order]) => mkBtn(indWrap, label, (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createSignPane(body, order); else if (state.signPanes[body]) { state.chart.removeIndicator({ paneId: state.signPanes[body] }); delete state.signPanes[body]; }
    }, false, `Положение ${BODY_LABEL[body]} в знаках`));

    buildAspectButtons();

    buildCycleButtons();

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
    state.forecastBtn = fcBtn;
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

    // Экраны (мультичарт — следующий этап ТЗ; пока один график)
    const layWrap = document.getElementById('layouts');
    [['1', '1 график'], ['2', '1×2'], ['4', '2×2'], ['6', '3×2'], ['8', '4×2']].forEach(([k, label]) => {
      mkBtn(layWrap, label, () => { closeMenus(); if (k !== '1') alert('Мультичарт (' + label + ') — следующий этап (ТЗ мультибиржа/мультичарт). Сейчас один график.'); }, k === '1');
    });
  }

  // тумблеры аспектов: по планете (☉/планета) + сводная «∀ все»
  function buildAspectButtons() {
    const aspWrap = document.getElementById('aspects');
    aspWrap.innerHTML = '';
    window.LUN.ASPECT_PLANETS.forEach((pl, i) => mkBtn(aspWrap, pl.glyph, (b) => {
      pl.enabled = !b.classList.contains('active'); b.classList.toggle('active', pl.enabled);
      if (pl.enabled) createSunAspect(pl, 15 + i);
      else if (state.aspectPanes[pl.body]) { state.chart.removeIndicator({ paneId: state.aspectPanes[pl.body] }); delete state.aspectPanes[pl.body]; }
    }, pl.enabled, `Аспекты ☉/${pl.glyph} (${pl.body})`));
    mkBtn(aspWrap, '∀ все', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); window.LUN.ALL_ASPECTS.enabled = on;
      if (on) createAllAspect(); else if (state.allAspectPane) { state.chart.removeIndicator({ paneId: state.allAspectPane }); state.allAspectPane = null; }
    }, window.LUN.ALL_ASPECTS.enabled, 'Сводная полоса всех аспектов всех пар (детально на M5/M15)');
    // отдельная полоса: Уран — все планеты (мажорные аспекты)
    const urBtn = mkBtn(aspWrap, '♅∀', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createUranusStrip(); else if (state.uranusPane) { state.chart.removeIndicator({ paneId: state.uranusPane }); state.uranusPane = null; }
    }, !!state.uranusPane, 'Аспекты Урана ко всем планетам (U)');
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
    window.LUN.CYCLES.forEach((cy, i) => mkBtn(cycWrap, String(i + 1), (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) { if (!state.cyclePanes[cy.id]) createCyclePane(cy, 11 + i); }
      else if (state.cyclePanes[cy.id]) { state.chart.removeIndicator({ paneId: state.cyclePanes[cy.id] }); delete state.cyclePanes[cy.id]; }
    }, cy.enabled, cy.title));
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
    state.chart = kc.init('chart', { styles: THEME });
    window.LUN_CHART = state.chart;        // доступ из консоли для отладки
    addMarkovCss();
    buildPanes();
    buildUI();
    // выпадающие меню: клик по пункту открывает/закрывает, клик вне — закрывает
    document.querySelectorAll('.menubar .menu-btn').forEach((btn) => {
      btn.onclick = (e) => { e.stopPropagation(); const menu = btn.parentElement, open = menu.classList.contains('open'); closeMenus(); if (!open) menu.classList.add('open'); };
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(); });
    load();
    updateMoonStatus();
    setInterval(updateMoonStatus, 60000);
    window.addEventListener('lun:datasource', () => {
      const el = document.getElementById('datasource');
      el.textContent = window.LUN_DATA_SOURCE || '';
      el.title = window.LUN_DATA_ERROR || '';
      el.style.color = window.LUN_DATA_ERROR ? '#e0a030' : '#26a69a';
      scheduleApply();      // данные загружены — закрепляем высоты панелей
      if (state.markovPanes) setTimeout(refreshMarkovPanel, 200);   // пересчёт панели Маркова на новых данных
      // смена инструмента/ТФ сбрасывает данные — прогноз выключаем (шаг ТФ иной)
      if (window.LUN_FORECAST && window.LUN_FORECAST.enabled) {
        window.LUN_FORECAST = { enabled: false };
        if (state.forecastBtn) state.forecastBtn.classList.remove('active');
        try { state.chart.setOffsetRightDistance(80); } catch (e) {}
      }
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
