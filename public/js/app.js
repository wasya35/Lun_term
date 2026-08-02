/* =============================================================================
 *  app.js — сборка терминала Lun_term
 * =============================================================================*/
(function () {
  const kc = window.klinecharts;

  const state = {
    chart: null,
    instrument: window.LUN.INSTRUMENTS[0],
    tf: window.LUN.TIMEFRAMES.find((t) => t.id === window.LUN.DEFAULT_TIMEFRAME),
    panes: {},          // paneId лунных панелей / объёма
    overlayIds: {},     // включённые ценовые индикаторы (EMA/SMA/VWAP)
  };

  /* ---------- тёмная тема KLineChart ---------- */
  const THEME = {
    grid: { horizontal: { color: '#1c2230' }, vertical: { color: '#1c2230' } },
    candle: {
      bar: {
        upColor: '#26a69a', downColor: '#ef5350',
        upBorderColor: '#26a69a', downBorderColor: '#ef5350',
        upWuckColor: '#26a69a', downWuckColor: '#ef5350',
      },
      tooltip: { rect: { color: 'rgba(20,26,38,0.9)' } },
      priceMark: { last: { text: { color: '#0b0e14' } } },
    },
    xAxis: { axisLine: { color: '#2a3242' }, tickText: { color: '#8b93a7' } },
    yAxis: { axisLine: { color: '#2a3242' }, tickText: { color: '#8b93a7' } },
    crosshair: {
      horizontal: { line: { color: '#6b7280' }, text: { backgroundColor: '#334155' } },
      vertical: { line: { color: '#6b7280' }, text: { backgroundColor: '#334155' } },
    },
  };

  /* ---------- индикаторы: лунные панели + объём ---------- */
  function buildPanes() {
    const c = state.chart, H = window.LUN.PANE_HEIGHTS;
    state.panes.moonSign = c.createIndicator({ name: 'MoonSign' }, false);
    state.panes.moonCycle = c.createIndicator({ name: 'MoonCycle' }, false);
    state.panes.volume = c.createIndicator({ name: 'VOL' }, false);
    if (state.panes.moonSign) c.setPaneOptions({ id: state.panes.moonSign, height: H.moonSign, minHeight: 24 });
    if (state.panes.moonCycle) c.setPaneOptions({ id: state.panes.moonCycle, height: H.moonCycle, minHeight: 20 });
    if (state.panes.volume) c.setPaneOptions({ id: state.panes.volume, height: H.volume });
  }

  /* ---------- ценовые индикаторы на основной панели (тумблеры) ---------- */
  function toggleOverlay(kind, on) {
    const c = state.chart, IND = window.LUN.INDICATORS;
    if (on) {
      let name, calcParams;
      if (kind === 'SMA') { name = 'MA';  calcParams = IND.sma.periods; }
      if (kind === 'EMA') { name = 'EMA'; calcParams = IND.ema.periods; }
      if (kind === 'VWAP') { name = 'VWAP_BANDS'; }
      const id = c.createIndicator(
        { name, calcParams, paneId: 'candle_pane' }, true);
      state.overlayIds[kind] = id || name;
    } else {
      c.removeIndicator({ paneId: 'candle_pane', name: state.overlayIds[kind] || kind });
      delete state.overlayIds[kind];
    }
  }

  /* ---------- загрузка инструмента/таймфрейма ---------- */
  function load() {
    const c = state.chart, ins = state.instrument, tf = state.tf;
    c.setSymbol({ ticker: ins.ticker, pricePrecision: ins.pricePrecision, volumePrecision: ins.volumePrecision });
    c.setPeriod({ span: tf.span, type: tf.type });
    c.setDataLoader(window.LunData.makeDataLoader());
    document.getElementById('sym-title').textContent = ins.title + '  ·  ' + tf.title;
  }

  /* ---------- инструменты рисования ---------- */
  const DRAW_TOOLS = [
    { id: 'horizontalStraightLine', label: 'Уровень' },
    { id: 'segment',                label: 'Трендовая' },
    { id: 'rect',                   label: 'Прямоугольник' },
    { id: 'circle',                 label: 'Овал' },
    { id: 'simpleAnnotation',       label: 'Стрелка/текст' },
  ];

  /* ---------- статус-строка: текущая Луна ---------- */
  function updateMoonStatus() {
    const info = window.LunAstro.moonInfo(Date.now());
    const s = window.LUN.SIGNS[info.signIndex];
    const z = info.zone;
    document.getElementById('moon-now').innerHTML =
      `☾ <b style="color:${s.color}">${s.glyph} ${s.name}</b> ${info.degInSign.toFixed(1)}°` +
      (z ? ` · <span style="color:${window.LUN.BIAS_COLORS[z.bias]}">${z.label}</span>` : '');
  }

  /* ---------- UI ---------- */
  function buildUI() {
    // инструменты
    const insWrap = document.getElementById('instruments');
    window.LUN.INSTRUMENTS.forEach((ins) => {
      const b = document.createElement('button');
      b.textContent = ins.id; b.title = ins.title;
      b.onclick = () => {
        state.instrument = ins; load();
        [...insWrap.children].forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      };
      if (ins === state.instrument) b.classList.add('active');
      insWrap.appendChild(b);
    });
    // таймфреймы
    const tfWrap = document.getElementById('timeframes');
    window.LUN.TIMEFRAMES.forEach((tf) => {
      const b = document.createElement('button');
      b.textContent = tf.title;
      b.onclick = () => {
        state.tf = tf; load();
        [...tfWrap.children].forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      };
      if (tf === state.tf) b.classList.add('active');
      tfWrap.appendChild(b);
    });
    // индикаторы
    const indWrap = document.getElementById('indicators');
    ['SMA', 'EMA', 'VWAP'].forEach((k) => {
      const b = document.createElement('button');
      b.textContent = k;
      b.onclick = () => { const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleOverlay(k, on); };
      indWrap.appendChild(b);
    });
    // рисование
    const drawWrap = document.getElementById('drawtools');
    DRAW_TOOLS.forEach((t) => {
      const b = document.createElement('button');
      b.textContent = t.label;
      b.onclick = () => state.chart.createOverlay(t.id);
      drawWrap.appendChild(b);
    });
    const clr = document.createElement('button');
    clr.textContent = '✕ очистить'; clr.className = 'danger';
    clr.onclick = () => state.chart.removeOverlay();
    drawWrap.appendChild(clr);
  }

  /* ---------- init ---------- */
  function init() {
    state.chart = kc.init('chart', { styles: THEME });
    buildPanes();
    buildUI();
    load();
    updateMoonStatus();
    setInterval(updateMoonStatus, 60000);
    window.addEventListener('lun:datasource', () => {
      document.getElementById('datasource').textContent = window.LUN_DATA_SOURCE || '';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
