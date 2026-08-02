/* =============================================================================
 *  app.js — сборка терминала Lun_term
 * =============================================================================*/
(function () {
  const kc = window.klinecharts;

  const state = {
    chart: null,
    instrument: window.LUN.INSTRUMENTS[0],
    tf: window.LUN.TIMEFRAMES.find((t) => t.id === window.LUN.DEFAULT_TIMEFRAME),
    signPane: null,
    volumePane: null,
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

  const ASPECT_PANE = 'pane_aspect';
  function createAspectPane() {
    state.chart.createIndicator({ name: 'AspectStrip', paneId: ASPECT_PANE }, false);
    state.aspectPane = ASPECT_PANE;
    wishPane(ASPECT_PANE, { height: window.LUN.PANE_HEIGHTS.cycle, minHeight: 18, order: 30 });
  }
  function createVolumePane() {
    state.volumePane = 'pane_volume';
    // calcParams: [] — объём без скользящих средних
    state.chart.createIndicator({ name: 'VOL', calcParams: [], paneId: state.volumePane }, false);
    wishPane(state.volumePane, { height: window.LUN.PANE_HEIGHTS.volume, order: 90 });
  }

  function buildPanes() {
    const c = state.chart, H = window.LUN.PANE_HEIGHTS;
    state.signPane = 'pane_moon_sign';
    c.createIndicator({ name: 'MoonSign', paneId: state.signPane }, false);
    wishPane(state.signPane, { height: H.moonSign, minHeight: 26, order: 10 });
    window.LUN.CYCLES.forEach((cy, i) => { if (cy.enabled) createCyclePane(cy, 20 + i); });
    if (window.LUN.ASPECTS.enabled) createAspectPane();
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
    c.setSymbol({ ticker, pricePrecision: ins.pricePrecision, volumePrecision: ins.volumePrecision });
    c.setPeriod({ span: tf.span, type: tf.type });
    c.setDataLoader(window.LunData.makeDataLoader());
    document.getElementById('sym-title').textContent = `${ins.title}  ·  ${ticker}  ·  ${tf.title}`;
  }

  /* ---------- инструменты рисования ---------- */
  const DRAW_TOOLS = [
    { id: 'horizontalStraightLine', label: 'Уровень' },
    { id: 'segment',                label: 'Трендовая' },
    { id: 'lun_rect',               label: 'Прямоугольник' },
    { id: 'lun_arrow',              label: 'Стрелка' },
    { id: 'lun_text',               label: 'Текст' },
    { id: 'lun_gann',               label: 'Ган 1×1' },
  ];
  function startDraw(toolId) {
    if (toolId === 'lun_text') {
      const t = window.prompt('Текст метки:', '');
      if (t === null) return;
      state.chart.createOverlay({ name: 'lun_text', extendData: t });
    } else {
      state.chart.createOverlay(toolId);
    }
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
    window.LUN.INSTRUMENTS.forEach((ins) => mkBtn(insWrap, ins.id, (b) => {
      state.instrument = ins; load();
      [...insWrap.children].forEach((x) => x.classList.remove('active')); b.classList.add('active');
    }, ins === state.instrument, ins.title));

    const tfWrap = document.getElementById('timeframes');
    window.LUN.TIMEFRAMES.forEach((tf) => mkBtn(tfWrap, tf.title, (b) => {
      state.tf = tf; load();
      [...tfWrap.children].forEach((x) => x.classList.remove('active')); b.classList.add('active');
    }, tf === state.tf));

    const indWrap = document.getElementById('indicators');
    ['SMA', 'EMA', 'VWAP'].forEach((k) => mkBtn(indWrap, k, (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleOverlay(k, on);
    }));
    // объём — включён по умолчанию, можно убрать
    mkBtn(indWrap, 'Объём', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createVolumePane(); else if (state.volumePane) { state.chart.removeIndicator({ paneId: state.volumePane }); state.volumePane = null; }
    }, true);
    // аспекты Солнце–Меркурий (полоса)
    mkBtn(indWrap, 'Аспекты', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createAspectPane(); else if (state.aspectPane) { state.chart.removeIndicator({ paneId: state.aspectPane }); state.aspectPane = null; }
    }, window.LUN.ASPECTS.enabled);

    buildCycleButtons();

    const drawWrap = document.getElementById('drawtools');
    DRAW_TOOLS.forEach((t) => mkBtn(drawWrap, t.label, () => startDraw(t.id)));
    mkBtn(drawWrap, '✕ очистить', () => state.chart.removeOverlay()).className = 'danger';

    const setWrap = document.getElementById('settings');
    mkBtn(setWrap, '⚙ Настройки', () => window.LunSettings.open(applySettings), false,
      'Цвета знаков и торговые зоны циклов');
  }

  // тумблеры циклов (пересобираются после изменения настроек)
  function buildCycleButtons() {
    const cycWrap = document.getElementById('cycles');
    cycWrap.innerHTML = '';
    window.LUN.CYCLES.forEach((cy, i) => mkBtn(cycWrap, String(i + 1), (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) { if (!state.cyclePanes[cy.id]) createCyclePane(cy, 20 + i); }
      else if (state.cyclePanes[cy.id]) { state.chart.removeIndicator({ paneId: state.cyclePanes[cy.id] }); delete state.cyclePanes[cy.id]; }
    }, cy.enabled, cy.title));
  }

  // применить настройки: пересобрать ленту знаков и полосы циклов
  function applySettings() {
    const c = state.chart;
    if (state.signPane) c.removeIndicator({ paneId: state.signPane });
    Object.values(state.cyclePanes).forEach((pid) => c.removeIndicator({ paneId: pid }));
    state.cyclePanes = {};
    // заново создаём ленту знаков и включённые циклы (над объёмом)
    c.createIndicator({ name: 'MoonSign', paneId: state.signPane }, false);
    wishPane(state.signPane, { height: window.LUN.PANE_HEIGHTS.moonSign, minHeight: 26, order: 10 });
    window.LUN.CYCLES.forEach((cy, i) => { if (cy.enabled) createCyclePane(cy, 20 + i); });
    buildCycleButtons();
    // пересоздать активные индикаторы (SMA/EMA/VWAP) с новыми параметрами
    Object.keys(state.overlayIds).forEach((kind) => { toggleOverlay(kind, false); toggleOverlay(kind, true); });
    // обновить полосу аспектов (новый орб/тела)
    if (state.aspectPane) { c.removeIndicator({ paneId: state.aspectPane }); createAspectPane(); }
    updateMoonStatus();
  }

  /* ---------- init ---------- */
  function init() {
    state.chart = kc.init('chart', { styles: THEME });
    window.LUN_CHART = state.chart;        // доступ из консоли для отладки
    buildPanes();
    buildUI();
    load();
    updateMoonStatus();
    setInterval(updateMoonStatus, 60000);
    window.addEventListener('lun:datasource', () => {
      const el = document.getElementById('datasource');
      el.textContent = window.LUN_DATA_SOURCE || '';
      el.title = window.LUN_DATA_ERROR || '';
      el.style.color = window.LUN_DATA_ERROR ? '#e0a030' : '#26a69a';
      scheduleApply();      // данные загружены — закрепляем высоты панелей
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
