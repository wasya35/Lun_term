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
    signPanes: {},          // body -> paneId (ленты знаков Луна/Меркурий/Солнце)
    volumePane: null,
    aspectPanes: {},        // body -> paneId (полосы ☉/планета)
    allAspectPane: null,    // сводная полоса всех аспектов
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

  function buildPanes() {
    const H = window.LUN.PANE_HEIGHTS;
    state.signPane = 'pane_sign_Moon';
    state.chart.createIndicator({ name: 'SignStrip', paneId: state.signPane, shortName: BODY_LABEL.Moon, extendData: { body: 'Moon', frame: 'geo' } }, false);
    state.signPanes.Moon = state.signPane;
    wishPane(state.signPane, { height: H.moonSign, minHeight: 26, order: 10 });
    window.LUN.CYCLES.forEach((cy, i) => { if (cy.enabled) createCyclePane(cy, 20 + i); });
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
    } else if (toolId === 'lun_gann') {
      // фиксируем угол/режим на момент рисования — каждая линия независима
      const G = window.LUN.GANN;
      state.chart.createOverlay({ name: 'lun_gann', extendData: { unitPerBar: G.unitPerBar, extendRight: G.extendRight } });
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
    // поиск любого инструмента MOEX (акции/фьючерсы) — крупная кнопка
    const findBtn = mkBtn(insWrap, '🔍 Инструменты', () => window.LunInstruments.open((instr) => {
      state.instrument = instr; load();
      [...insWrap.children].forEach((x) => x.classList.remove('active'));
    }), false, 'Поиск любой акции или фьючерса MOEX');
    findBtn.classList.add('find-btn');

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
    // положения Меркурия и Солнца в знаках (словами)
    [['Mercury', '☿ знак', 12], ['Sun', '☉ знак', 13]].forEach(([body, label, order]) => mkBtn(indWrap, label, (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createSignPane(body, order); else if (state.signPanes[body]) { state.chart.removeIndicator({ paneId: state.signPanes[body] }); delete state.signPanes[body]; }
    }, false, `Положение ${BODY_LABEL[body]} в знаках`));

    buildAspectButtons();

    buildCycleButtons();

    const drawWrap = document.getElementById('drawtools');
    DRAW_TOOLS.forEach((t) => mkBtn(drawWrap, t.label, () => startDraw(t.id)));
    mkBtn(drawWrap, '✕ очистить', () => state.chart.removeOverlay()).className = 'danger';

    const setWrap = document.getElementById('settings');
    mkBtn(setWrap, '⚙ Настройки', () => window.LunSettings.open(applySettings), false,
      'Цвета знаков и торговые зоны циклов');
    mkBtn(setWrap, '📊 Бэктест', () => window.LunBacktest.run(8), false,
      'Сверка лунных зон с историей USD/RUB за 8 лет');
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
    const openBodies = Object.keys(state.signPanes);
    openBodies.forEach((body) => c.removeIndicator({ paneId: state.signPanes[body] }));
    state.signPanes = {};
    Object.values(state.cyclePanes).forEach((pid) => c.removeIndicator({ paneId: pid }));
    state.cyclePanes = {};
    // заново создаём открытые ленты знаков (Луна всегда) и включённые циклы
    const orderOf = { Moon: 10, Mercury: 12, Sun: 13, Venus: 14, Mars: 15, Jupiter: 16, Saturn: 17 };
    (openBodies.length ? openBodies : ['Moon']).forEach((body) => createSignPane(body, orderOf[body] || 15));
    state.signPane = state.signPanes.Moon;
    window.LUN.CYCLES.forEach((cy, i) => { if (cy.enabled) createCyclePane(cy, 20 + i); });
    buildCycleButtons();
    // пересоздать активные индикаторы (SMA/EMA/VWAP) с новыми параметрами
    Object.keys(state.overlayIds).forEach((kind) => { toggleOverlay(kind, false); toggleOverlay(kind, true); });
    // аспекты: орб/включённость могли смениться — пересобрать
    Object.keys(state.aspectPanes).forEach((k) => c.removeIndicator({ paneId: state.aspectPanes[k] }));
    state.aspectPanes = {};
    if (state.allAspectPane) { c.removeIndicator({ paneId: state.allAspectPane }); state.allAspectPane = null; }
    window.LUN.ASPECT_PLANETS.forEach((pl, i) => { if (pl.enabled) createSunAspect(pl, 15 + i); });
    if (window.LUN.ALL_ASPECTS.enabled) createAllAspect();
    buildAspectButtons();
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
