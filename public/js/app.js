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
    const h = (t) => `<h3 style="margin:14px 0 4px;color:#3aa0ff;font-size:13px">${t}</h3>`;
    openModal('Справка — как работают инструменты', `
      <p><b>Lun_term</b> — исследовательский астро-трейдинг терминал. Данные MOEX ISS / крипта Bybit / США Yahoo прямо из браузера. Меню сверху: Инструменты · ТФ · Период (глубина истории) · Индикаторы · Рисование · Ганн · Коннекторы (реалтайм) · Настройки · Экраны (мультичарт).</p>

      ${h('🌙 Астро')}
      <p><b>Луна в знаках</b> (Астро → ☾ Луна в знаках) — верхняя лента: цвет по знаку зодиака, текущий градус. Тумблер показать/скрыть.</p>
      <p><b>Циклы (1…6)</b> — торговые зоны лонг/шорт по долготе тела (Луна/Солнце/…). Зоны и цвета правятся в ⚙ Настройках (долгота 0°=Овен).</p>
      <p><b>Аспекты к Солнцу</b> — полоса на планету (☉/☿ по умолч.), Луна = фазы (соединение=новолуние, оппозиция=полнолуние). Цвета аспектов — в Настройках (соед. оранж, квадрат красн, оппоз. фиол, трин зелён, 60° голуб). Орб 2–6°.</p>
      <p><b>Узлы ☾</b> — ингрессии (0°) и середины (15°) знаков Луны на цене. <b>Прогноз</b> (F) — продлевает астро-полосы вправо до ближайшего аспекта ☉–♅.</p>

      ${h('📐 Ганн')}
      <p><b>Геометрия</b> (2 клика — угол→охват): <b>Gann Box / Квадрат</b> (единая форма — рамка с делениями 1/8·1/3·1/2 или сетка N×N: 8 = квадрат, 12 = «144»). <b>Линия Ганна</b> — луч из т1 через т2; в свойствах объекта можно задать точный <b>угол</b> (цена/бар) от закреплённой т1.</p>
      <p><b>Квадраты (калькулятор)</b> — уровни поддержки/сопротивления по √-спирали: база 9 (крест 45°), шестиугольник (60°), круг 360° (15°), натуральные. «Нанести на график» — рисует уровни.</p>
      <p><b>Уровни/циклы</b>: ретрейсменты 1/8·1/3·1/2; <b>мастер-циклы</b> — вертикали 30·45·60·90·144·180·360 баров от пивота (клик = пивот на любой экстремум, можно двигать). <b>Сквоузинг 1×1</b> — линии баланса цены и времени.</p>
      <p><b>Астро-Ганн</b>: планетарные линии→цена (долгота как ценовой уровень), ингрессии, ретроградности, веер долготы, Sq9 в градусах планет, затмения, космограмма (колесо на дату).</p>
      <p><b>Timing Solutions</b>: <b>Астро-фит</b> (какие астро-события совпадают с разворотами — lift/z), <b>прогноз циклов</b> (спектр цены вперёд), <b>композит</b> (среднее движение по фазе/знаку), <b>Merriman FAR</b> (астро-факторы на вершинах/основаниях волны), <b>Bradley</b> (барометр аспектов).</p>

      ${h('📊 Открытый интерес и поток')}
      <p><b>ОИ физ/юр</b> — открытый интерес и чистые позиции физиков/юриков (MOEX FUTOI, дневной). Красные/зелёные вертикали = экстремальный ΔОИ по порогам (Si: 5k·40k·100k). Точки на юриках = COT-экстремумы (контр-сигнал). <b>Базис к споту</b> — фьюч − спот исходного товара (регрессией) + z. <b>Арбитраж</b> (Инструменты) — синтетика/спред + z.</p>

      ${h('🔬 Бэктест и исследование')}
      <p><b>Исследование сигналов</b> (Настройки) — выбираемый бэктест на текущих данных: объём ≥2×/3×, EMA-пересечения, RSI, пробой, лунные зоны, фейд по астро/Sq9. Метрики: win%, средняя доходность, t-стат; <b>издержки %/сделку</b> и <b>out-of-sample</b> (посл. ⅓ с меткой устойчивости ✓/✗). win>55% и |t|≥2 при ≥30 входах = перевес, иначе шум.</p>
      <p><b>Бэктест</b> (B) — сверка лунных зон/аспектов, сила+поглощение с издержками и OOS, марковские режимы, синтез «зона×режим».</p>

      ${h('✏️ Рисование и прочее')}
      <p>Уровень, трендовая, прямоугольник, стрелка, текст, луч ⨯N (обрезка по пересечениям), профиль объёма. У каждого объекта — панель свойств (цвет/толщина/тип линии/заливка/🔒 замок). <b>Новости</b> (Настройки → 📰) — правая колонка по исходному товару с сентимент-метками. <b>Коннекторы</b> — реалтайм (крипта — настоящий, MOEX/США — опрос).</p>

      <p style="color:#8b93a7;margin-top:12px">Важно: все статистики — <b>исследовательские</b>. Малые выборки честно помечаются; астро/Ганн-гипотезы проверяйте бэктестом с издержками и OOS, а не на веру. Данные MOEX — с задержкой ~15 мин.</p>`);
  }
  function guideModal() {
    const h = (t) => `<h3 style="margin:16px 0 6px;color:#3aa0ff;font-size:14px">${t}</h3>`;
    const step = (rows) => '<ol style="margin:4px 0 0;padding-left:18px">' + rows.map((r) => `<li style="margin:3px 0">${r}</li>`).join('') + '</ol>';
    openModal('📚 Как пользоваться — Астро · Ганн · Бэктест', `
      <p style="color:#8b93a7;margin-top:0">Три рабочих блока. Общий принцип: <b>гипотеза → проверка бэктестом с издержками и out-of-sample → только потом доверие</b>. Малая выборка — не сигнал.</p>

      ${h('🌙 Астро — как пользоваться')}
      ${step([
        '<b>Луна в знаках</b> (Астро → ☾ Луна в знаках) — верхняя лента. Цвет = знак, цифра = градус. Смена знака Луны ≈ смена краткосрочного настроения; включай/выключай тумблером.',
        '<b>Циклы-зоны</b> (Астро → Циклы 1…6): зелёная зона = склонность к лонгу, красная = к шорту. Это <b>фон-фильтр направления</b>, а не вход. Долготы/цвета зон правишь в ⚙ Настройки.',
        '<b>Аспекты к Солнцу</b> (Астро → планета): жёсткие (□90°/☍180°) = коррекция/разворот, мягкие (⚹60°/△120°) = продолжение. Орб 2–6°, цвета — в Настройках.',
        '<b>Прогноз</b> (F) — продлевает полосы вправо до ближайшего аспекта ☉–♅: видно, где ждать следующего астро-события.',
        '<b>Проверка</b>: прежде чем верить — прогони «Астро-фит» и «Исследование сигналов» на этом инструменте.',
      ])}

      ${h('📐 Ганн — как пользоваться')}
      ${step([
        '<b>Линия Ганна</b> (Рисование → Ган 1×1): 2 клика — т1 (опора) и т2 (направление). Точный угол: выдели линию → в панели свойств поле <b>∠</b> (цена на 1 бар); т1 закреплена.',
        '<b>Gann Box / Квадрат</b> (Ганн → Геометрия): выбери Box (деления по осям) или сетку N×N (8 = квадрат, 12 = «144»), затем 2 клика — угол → охват. Линии деления = потенциальные уровни цены/времени.',
        '<b>Калькулятор квадратов</b> (Ганн → Квадраты): введи цену-пивот, база 9/шестиугольник/360/натуральные → таблица уровней S/R, «Нанести на график».',
        '<b>Мастер-циклы</b> (Ганн → Уровни/циклы → клик-пивот): поставь пивот на важный экстремум истории (можно перетаскивать). Вертикали 30·60·90·144·180·360 = кандидаты на разворот по времени.',
        '<b>Астро-Ганн</b>: планетарные линии→цена, Sq9 в градусах планет, веер долготы, затмения, Bradley — читаются вместе с астро-фитом.',
      ])}

      ${h('🔬 Бэктест и исследование — как пользоваться')}
      ${step([
        '<b>Исследование сигналов</b> (Настройки → 🔬): отметь сигналы (объём ≥2×, EMA, RSI, пробой, лунные зоны, фейд по астро/Sq9), задай горизонты и <b>издержки %/сделку</b>, включи <b>out-of-sample</b>. Читай: <b>win>55% и |t|≥2 при ≥30 входах</b> = перевес; <b>✓</b> при OOS = устойчиво на новых данных. Остальное — шум.',
        '<b>Астро-фит</b> (Ганн → Timing Solutions): какие астро-события совпадают с разворотами инструмента (lift/z). Кнопка 📍 — вынести событие на график.',
        '<b>Merriman FAR</b> (там же): взвешенные астро-факторы на вершинах/основаниях волны (Filtered Wave).',
        '<b>Бэктест</b> (B) — лунные зоны/аспекты, сила+поглощение, Марков, синтез «зона×режим».',
        '<b>Методика</b>: бери <b>D1, 2–3 года</b> (меню 🗓 Период), проверяй с издержками и OOS. Перевес считается только если он <b>устойчив вне выборки</b>.',
      ])}

      <p style="color:#8b93a7;margin-top:14px">Всё — исследовательские метрики, не гарантии. Астрология/Ганн здесь — <b>гипотезы для проверки</b>, а не догма.</p>`);
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
      overlayIds: {}, candleInds: {}, selectedOverlayId: null, selectedOverlay: null, forecastOn: false, paneWish: {},
      compareInstrument: null, comparePane: false, oiPane: null, arbPane: null, arbBundle: null,
      retroPane: null, bradleyPane: null, basisPane: null, drawings: {},
    };
  }
  let slots = [];
  let activeIdx = 0;
  let state = makeSlot(0);   // переустанавливается при активации ячейки
  let autoConnect = false;           // авто-коннектор: поток под рынок инструмента
  const connBtns = {};               // кнопки коннекторов по имени
  let autoConnBtn = null;
  function applyAutoConnect() {
    if (!autoConnect || !window.LunStream) return;
    const conn = window.LunStream.connFor(state.instrument.provider || 'moex');
    if (!conn) return;
    if (window.LunStream.enabled && window.LunStream.enabled[conn]) return;   // уже включён
    window.LunStream.setConnector(conn, true, slots);
    const b = connBtns[conn]; if (b) b.classList.add('active');
  }

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
  // светлая тема графика (chrome — через CSS class body.light)
  const THEME_LIGHT = {
    grid: { horizontal: { color: '#e7e9f0' }, vertical: { color: '#e7e9f0' } },
    candle: { bar: { upColor: '#1a9e8f', downColor: '#e5484d', upBorderColor: '#1a9e8f', downBorderColor: '#e5484d', upWuckColor: '#1a9e8f', downWuckColor: '#e5484d' }, priceMark: { last: { text: { color: '#ffffff' } } } },
    xAxis: { axisLine: { color: '#c8ccd6' }, tickText: { color: '#5b6270' } },
    yAxis: { axisLine: { color: '#c8ccd6' }, tickText: { color: '#5b6270' } },
    crosshair: { horizontal: { line: { color: '#9aa0ad' }, text: { backgroundColor: '#5b6270' } }, vertical: { line: { color: '#9aa0ad' }, text: { backgroundColor: '#5b6270' } } },
  };
  // внешний вид: тема (dark/light) + тип свечей (candle_solid/ohlc=бары)
  let LOOK = { theme: 'dark', candle: 'candle_solid' };
  try { const s = JSON.parse(localStorage.getItem('lun_look') || 'null'); if (s) LOOK = Object.assign(LOOK, s); } catch (e) {}
  function applyChartLook() {
    document.body.classList.toggle('light', LOOK.theme === 'light');
    const base = LOOK.theme === 'light' ? THEME_LIGHT : THEME;
    const styles = Object.assign({}, base, { candle: Object.assign({}, base.candle, { type: LOOK.candle }) });
    slots.forEach((s) => { try { s.chart.setStyles(styles); } catch (e) {} });
    try { localStorage.setItem('lun_look', JSON.stringify(LOOK)); } catch (e) {}
    if (typeof scheduleWsSave === 'function') scheduleWsSave();
  }
  function setTheme(t) { LOOK.theme = t; applyChartLook(); }
  function setCandleType(c) { LOOK.candle = c; applyChartLook(); }

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
    // ΔОИ день-к-дню + пороги экстремумов (по коду или авто по квантилям)
    const sortedD = Object.keys(byDate).sort(); let prevOi = null;
    sortedD.forEach((d) => { const oi = byDate[d].oi; if (oi != null && prevOi != null) byDate[d].dOI = oi - prevOi; if (oi != null) prevOi = oi; });
    if (latest && byDate[latest.date]) latest.dOI = byDate[latest.date].dOI;
    // COT-экстремумы нетто-юриков: скользящий ранг за 60 дней (0.9/0.1 = крайности)
    if (split) {
      const win = 60;
      for (let a = 0; a < sortedD.length; a++) {
        const cur = byDate[sortedD[a]].yurNet, lo0 = Math.max(0, a - win); let below = 0, cnt = 0;
        for (let x = lo0; x < a; x++) { cnt++; if (byDate[sortedD[x]].yurNet <= cur) below++; }
        if (cnt >= 20) { const pr = below / cnt; byDate[sortedD[a]].cot = pr >= 0.9 ? 1 : (pr <= 0.1 ? -1 : 0); }
      }
    }
    const T = window.LUN.OI_EXTREMES || {};
    let thr = (T.thresholds && T.thresholds[code]) || null;
    if (!thr) {
      const arr = sortedD.map((d) => Math.abs(byDate[d].dOI || 0)).filter((x) => x > 0).sort((a, b) => a - b);
      const q = (p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0;
      const pc = T.autoPct || [0.85, 0.95, 0.99]; thr = [q(pc[0]), q(pc[1]), q(pc[2])];
    }
    const paneId = 'pane_oi';
    try { slot.chart.removeIndicator({ paneId }); } catch (e) {}
    slot.chart.createIndicator({ name: 'OpenInterest', paneId, shortName: 'ОИ ' + code + (split ? ' физ/юр' : ''), extendData: { byDate, latest, split, thr } }, false);
    slot.oiPane = paneId; wishPane(paneId, { height: 92, order: 92 });
    return true;
  }
  function removeOI(slot) {
    slot = slot || state;
    if (slot.oiPane) { try { slot.chart.removeIndicator({ paneId: slot.oiPane }); } catch (e) {} slot.oiPane = null; }
    try { slot.chart.removeIndicator({ paneId: 'candle_pane', name: 'OIExtremes' }); } catch (e) {}
    delete slot.candleInds.OIExtremes; window.LUN_OI_EXTREMES = null;
  }

  /* ---------- базис к споту (фьюч − спот, регрессией) ---------- */
  async function rebuildBasis(slot) {
    slot = slot || state; const ins = slot.instrument;
    const sp = (window.LUN.SPOT_MAP || {})[ins.id];
    if ((ins.provider || 'moex') !== 'moex' || !sp) { alert('Базис доступен для фьючерсов MOEX с известным спотом (Si, CNY, золото, серебро).'); return false; }
    const list = slot.chart.getDataList(); if (!list || list.length < 20) { alert('Мало данных для базиса.'); return false; }
    const from = new Date(list[0].timestamp).toISOString().slice(0, 10), till = new Date(list[list.length - 1].timestamp).toISOString().slice(0, 10);
    let spot = [];
    try { spot = await window.LunISS.fetchCandlesFrom(sp.engine, sp.market, sp.secid, 24, from, till, 100); } catch (e) {}
    if (!spot || !spot.length) { alert('Спот ' + sp.secid + ' не получен.'); return false; }
    const dOf = (ts) => new Date(ts + 3 * 3600000).toISOString().slice(0, 10);
    const spotByDate = {}; spot.forEach((b) => { spotByDate[dOf(b.timestamp)] = b.close; });
    // точки (fut, spot) по датам → регрессия fut = k·spot + c
    const pts = [];
    for (const b of list) { const s = spotByDate[dOf(b.timestamp)]; if (s != null && s > 0) pts.push([b.close, s, b.timestamp]); }
    if (pts.length < 20) { alert('Мало общих дат фьюч/спот.'); return false; }
    let n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(([f, s]) => { sx += s; sy += f; sxx += s * s; sxy += s * f; });
    const den = n * sxx - sx * sx, k = den ? (n * sxy - sx * sy) / den : 0, c = (sy - k * sx) / n;
    const byTs = {}; const vals = [];
    pts.forEach(([f, s, ts]) => { const r = f - (k * s + c); byTs[ts] = r; vals.push(r); });
    const mean = vals.reduce((a, x) => a + x, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, x) => a + (x - mean) * (x - mean), 0) / vals.length) || 1e-9;
    const paneId = 'pane_basis';
    try { slot.chart.removeIndicator({ paneId }); } catch (e) {}
    slot.chart.createIndicator({ name: 'ArbSpread', paneId, shortName: 'Базис ' + ins.id + '−' + sp.secid, extendData: { byTs, mean, std, title: 'Базис ' + (ins.title || ins.id) + ' − ' + sp.title, formula: 'basis', last: vals[vals.length - 1] } }, false);
    slot.basisPane = paneId; wishPane(paneId, { height: 90, order: 94 });
    return true;
  }
  function removeBasis(slot) { slot = slot || state; if (slot.basisPane) { try { slot.chart.removeIndicator({ paneId: slot.basisPane }); } catch (e) {} slot.basisPane = null; } }

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
  // запустить рисование оверлея (первый клик = пивот/угол, второй = охват)
  const defOvStyle = () => Object.assign({}, window.LUN_OVERLAY_DEF_STYLE || { color: '#f0c040', size: 1.4, dash: 'solid', fill: false, fillColor: 'rgba(240,192,64,0.14)' });
  // двойной клик в правый-нижний угол осей → последняя цена в центр экрана
  function recenterLastPrice(slot) {
    slot = slot || state; const c = slot.chart;
    try { const l = c.getDataList(); if (!l.length) return; const w = (slot.cellEl && slot.cellEl.clientWidth) || 600; c.setOffsetRightDistance(Math.max(60, Math.round(w / 2))); if (c.scrollToRealTime) c.scrollToRealTime(); else if (c.scrollToTimestamp) c.scrollToTimestamp(l[l.length - 1].timestamp); } catch (e) {}
  }
  // «Ганн-режим»: фиксируем масштаб (колесо не искажает геометрию углов), пан
  // остаётся. Полная фиксация 1×1 по вертикали — отдельный этап (нужна своя ось).
  let gannSpaceOn = false;
  function toggleGannSpace(on) {
    gannSpaceOn = on;
    const c = state.chart;
    if (on) {
      // фикс поля 1×1: подгоняем ширину бара так, чтобы «цена на бар» (масштаб
      // 1×1 из настроек — расчётное соотношение от первой волны) выглядела 45°.
      try {
        const list = c.getDataList(), range = c.getVisibleRange();
        const from = Math.max(0, range.from), to = Math.min(list.length, Math.ceil(range.to));
        let hi = -Infinity, lo = Infinity; for (let i = from; i < to; i++) { const b = list[i]; if (!b) continue; if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
        const cfg = window.LUN.GANNTOOLS.scale || {}, upb = cfg.unitPerBar || ((hi - lo) / Math.max(1, to - from));
        const H = (state.cellEl && state.cellEl.clientHeight * 0.8) || 400;
        if (hi > lo && upb > 0) { const pxPerPrice = H / (hi - lo); const bs = Math.max(1, pxPerPrice * upb); if (c.setBarSpace) c.setBarSpace(bs); }
      } catch (e) {}
    }
    slots.forEach((s) => { try { if (s.chart.setZoomEnabled) s.chart.setZoomEnabled(!on); } catch (e) {} try { if (s.chart.setPaneOptions) s.chart.setPaneOptions({ id: 'candle_pane', axis: { scrollZoomEnabled: !on } }); } catch (e) {} });
  }
  // единая форма для геометрии Ганна: Box (деления) или Квадрат-сетка N×N
  function gannGeomModal() {
    const S = window.LUN.GANNTOOLS.boxChoice || (window.LUN.GANNTOOLS.boxChoice = { type: 'box', divisions: 8 });
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    openModal('Gann Box / Квадрат', `
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
        <label><input type="radio" name="gg-type" value="box"${S.type === 'box' ? ' checked' : ''}> <b>Box</b> — рамка с делениями (1/8·1/3·1/2) по цене и времени + диагонали</label>
        <label><input type="radio" name="gg-type" value="grid"${S.type === 'grid' ? ' checked' : ''}> <b>Квадрат-сетка N×N</b> — крест по центру + диагонали</label>
        <label>Делений (для сетки): <input id="gg-div" type="number" min="2" max="32" value="${S.divisions || 8}" style="${inp};width:80px"> <span style="color:#8b93a7">8 = квадрат, 12 = «144»</span></label>
      </div>
      <button id="gg-draw" style="${btn};border-color:#26a69a">Рисовать (2 клика: угол → охват)</button>`);
    document.getElementById('gg-draw').onclick = () => {
      const type = (document.querySelector('input[name="gg-type"]:checked') || {}).value || 'box';
      const divisions = Math.max(2, Math.min(32, +document.getElementById('gg-div').value || 8));
      window.LUN.GANNTOOLS.boxChoice = { type, divisions };
      const bg = document.querySelector('.lun-modal-bg'); if (bg) bg.remove();
      if (type === 'grid') startOverlay('lun_gannsquare', { divisions }); else startOverlay('lun_gannbox');
    };
  }
  function startOverlay(name, extendData) { closeMenus(); const ev = overlayEvents(); state.chart.createOverlay(Object.assign({ name, extendData: Object.assign({ style: defOvStyle() }, extendData) }, ev)); }
  // масштаб 1×1 (цена на бар) для сквоузинга: авто / ручной
  function scaleModal() {
    const cfg = window.LUN.GANNTOOLS.scale || (window.LUN.GANNTOOLS.scale = {});
    let autoHint = '';
    try { const l = state.chart.getDataList(); const r = state.chart.getVisibleRange(); const f = Math.max(0, r.from), t = Math.min(l.length, Math.ceil(r.to)); let hi = -Infinity, lo = Infinity; for (let i = f; i < t; i++) { if (l[i].high > hi) hi = l[i].high; if (l[i].low < lo) lo = l[i].low; } if (hi > lo) autoHint = ((hi - lo) / Math.max(1, t - f)).toFixed(3); } catch (e) {}
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    openModal('Масштаб 1×1 (цена на бар)', `
      <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">
        <label>Цена на 1 бар (пусто = авто)<br><input id="sc-val" type="number" step="any" value="${cfg.unitPerBar != null ? cfg.unitPerBar : ''}" placeholder="авто ≈ ${autoHint}" style="${inp};width:180px"></label>
        <button id="sc-apply" style="${btn};border-color:#26a69a">Применить</button>
      </div>
      <p style="color:#8b93a7;margin:10px 0 0">Линия 1×1 — баланс цены и времени по Ганну. «Авто» берёт диапазон/бары видимого окна (≈ ${autoHint}). Впишите точное значение для классического масштаба (напр. 1 пункт = 1 бар).</p>`);
    document.getElementById('sc-apply').onclick = () => {
      const v = document.getElementById('sc-val').value.trim();
      cfg.unitPerBar = v === '' ? null : (+v || null);
      if (state.candleInds.GannSquaring) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'GannSquaring' }); state.chart.createIndicator({ name: 'GannSquaring', paneId: 'candle_pane' }, true); } catch (e) {} }
    };
  }

  // Timing Solutions-стиль: какие астро-события реально совпадают с разворотами
  function astroFitModal() {
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 60 || !window.LunTS) { alert('Мало истории для анализа. Поставьте период больше (D1, 1–3 года) в меню «🗓 Период».'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    openModal('Астро-фит — что реально работает на инструменте', `
      <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">
        <label>Орб (дней)<br><input id="af-orb" type="number" min="1" max="10" value="3" style="${inp};width:80px"></label>
        <label>Свинг ±баров<br><input id="af-k" type="number" min="2" max="10" value="3" style="${inp};width:80px"></label>
        <button id="af-run" style="${btn}">Пересчитать</button>
      </div>
      <div id="af-out" style="color:#8b93a7">Считаю…</div>`);
    const vcol = { 'значимо': '#26a69a', 'слабо': '#e0a030', 'шум': '#8b93a7', 'мало данных': '#8b93a7' };
    const run = () => {
      const orbDays = +document.getElementById('af-orb').value || 3, k = +document.getElementById('af-k').value || 3;
      const R = window.LunTS.computeAstroFit(bars, { orbDays, pivotK: k });
      lastFit = R;
      const rows = R.features.map((f, idx) => `<tr>`
        + `<td style="padding:2px 8px 2px 0"><span class="af-mark" data-i="${idx}" title="Показать на графике" style="cursor:pointer;color:#c77dff">📍</span></td>`
        + `<td style="padding:2px 10px 2px 0">${f.name}</td>`
        + `<td style="padding:2px 10px 2px 0;color:#8b93a7">${f.count}</td>`
        + `<td style="padding:2px 10px 2px 0">${f.hits}/${R.pivots}</td>`
        + `<td style="padding:2px 10px 2px 0">${(f.hitRate * 100).toFixed(0)}%</td>`
        + `<td style="padding:2px 10px 2px 0;color:#8b93a7">${(f.coverage * 100).toFixed(0)}%</td>`
        + `<td style="padding:2px 10px 2px 0"><b>${f.lift.toFixed(2)}×</b></td>`
        + `<td style="padding:2px 10px 2px 0">${f.z.toFixed(1)}</td>`
        + `<td style="padding:2px 0;color:${vcol[f.verdict]}">${f.verdict}</td></tr>`).join('');
      const fromS = new Date(R.from).toISOString().slice(0, 10), tillS = new Date(R.till).toISOString().slice(0, 10);
      document.getElementById('af-out').innerHTML = `<p style="margin:0 0 8px">${fromS} … ${tillS} · разворотов: <b style="color:#d7deea">${R.pivots}</b> · орб ±${R.orbDays}д. <b>lift>1</b> и <b>z≥2</b> = событие реально притягивает развороты. 📍 — вынести событие на график. <span id="af-clear" style="cursor:pointer;color:#8b93a7;text-decoration:underline">убрать метки</span></p>`
        + `<div style="max-height:340px;overflow:auto"><table style="border-collapse:collapse;font-size:12px">`
        + `<thead><tr style="color:#8b93a7;text-align:left"><th></th><th style="padding-right:10px">Астро-событие</th><th style="padding-right:10px">шт</th><th style="padding-right:10px">попад.</th><th style="padding-right:10px">hit%</th><th style="padding-right:10px">охват</th><th style="padding-right:10px">lift</th><th style="padding-right:10px">z</th><th>вердикт</th></tr></thead>`
        + `<tbody>${rows}</tbody></table></div>`;
      [...document.querySelectorAll('.af-mark')].forEach((el) => { el.onclick = () => { const f = lastFit.features[+el.dataset.i]; showAstroMarks(f.name, f.events); }; });
      const cl = document.getElementById('af-clear'); if (cl) cl.onclick = clearAstroMarks;
    };
    document.getElementById('af-run').onclick = run;
    setTimeout(run, 30);
  }
  let lastFit = null;
  function showAstroMarks(name, events) {
    window.LUN_ASTRO_MARKS = { name, events };
    if (!state.candleInds.AstroEventMarks) { try { state.chart.createIndicator({ name: 'AstroEventMarks', paneId: 'candle_pane' }, true); state.candleInds.AstroEventMarks = true; } catch (e) {} }
    else { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'AstroEventMarks' }); state.chart.createIndicator({ name: 'AstroEventMarks', paneId: 'candle_pane' }, true); } catch (e) {} }
  }
  function clearAstroMarks() { window.LUN_ASTRO_MARKS = null; removeCandInd('AstroEventMarks'); }

  // исследование сигналов: выбираемый бэктест на загруженных данных
  function researchModal() {
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 60 || !window.LunResearch) { alert('Мало данных. Поставьте период больше (напр. D1, 1–3 года) в меню «🗓 Период».'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const groups = {}; window.LunResearch.SIGNALS.forEach((s) => { (groups[s.group] = groups[s.group] || []).push(s); });
    const checksHtml = Object.keys(groups).map((g) => `<div style="margin:2px 0"><span style="color:#8b93a7;font-size:11px">${g}</span><br>`
      + groups[g].map((s) => `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 12px 2px 0"><input type="checkbox" class="rs-sig" value="${s.key}" checked> ${s.name}</label>`).join('') + '</div>').join('');
    openModal('🔬 Исследование сигналов (бэктест по выбору)', `
      <div style="margin-bottom:8px">${checksHtml}</div>
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
        <label>Горизонты (баров)<br><input id="rs-h" type="text" value="1, 3, 5, 10" style="${inp};width:130px"></label>
        <label>Издержки %/сделку<br><input id="rs-cost" type="number" step="any" value="0.02" style="${inp};width:90px"></label>
        <label style="display:inline-flex;align-items:center;gap:5px"><input id="rs-oos" type="checkbox"> out-of-sample (посл. ⅓)</label>
        <button id="rs-run" style="${btn};border-color:#26a69a">Прогнать</button>
        <span style="color:#8b93a7">${bars.length} баров · ${state.instrument.title || ''} · ${state.tf.title}</span>
      </div>
      <div id="rs-out" style="color:#8b93a7">…</div>`);
    const run = () => {
      const keys = [...document.querySelectorAll('.rs-sig')].filter((c) => c.checked).map((c) => c.value);
      const H = document.getElementById('rs-h').value.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => n > 0);
      const costPct = (parseFloat(document.getElementById('rs-cost').value) || 0) / 100;
      const oos = document.getElementById('rs-oos').checked;
      const R = window.LunResearch.run(bars, keys, H.length ? H : [1, 3, 5, 10], { costPct, oos });
      const head = '<tr style="color:#8b93a7;text-align:left"><th style="padding-right:10px">Сигнал</th><th style="padding-right:10px">входов</th>'
        + R.horizons.map((h) => `<th style="padding-right:10px" colspan="2">+${h}: win / ср% (t)</th>`).join('') + '</tr>';
      const rows = R.rows.map((r) => {
        let tds = `<td style="padding:2px 10px 2px 0">${r.name}</td><td style="padding:2px 10px 2px 0;color:#8b93a7">${r.count}</td>`;
        R.horizons.forEach((h) => {
          const s = r.perH[h];
          if (!s || !s.n) { tds += '<td colspan="2" style="color:#6b7280">—</td>'; return; }
          const sig = s.n >= 30 && Math.abs(s.t) >= 2;
          const wcol = s.win > 0.55 ? '#26a69a' : (s.win < 0.45 ? '#ef5350' : '#d7deea');
          // при OOS: ✓ если знак на train и test совпал (устойчиво)
          let rob = '';
          if (R.oos && r.trainH && r.trainH[h] && r.trainH[h].n) { const tr = r.trainH[h]; rob = (tr.avg > 0 && s.avg > 0) ? '<span style="color:#26a69a"> ✓</span>' : '<span style="color:#ef5350"> ✗</span>'; }
          tds += `<td style="padding:2px 4px 2px 0;color:${wcol}">${(s.win * 100).toFixed(0)}%</td>`
            + `<td style="padding:2px 12px 2px 0;color:${s.avg >= 0 ? '#26a69a' : '#ef5350'}">${(s.avg * 100).toFixed(2)}%<span style="color:${sig ? '#e0c040' : '#6b7280'}"> (${s.t.toFixed(1)})</span>${rob}</td>`;
        });
        return `<tr>${tds}</tr>`;
      }).join('');
      document.getElementById('rs-out').innerHTML = `<p style="margin:0 0 8px">Направленный вход, доходность вперёд за вычетом издержек. <b>win>55%</b> и <b>|t|≥2</b> при ≥30 входах = перевес. ${R.oos ? '<b>OOS</b>: только последняя ⅓; ✓ = знак совпал с train (устойчиво).' : ''} Считается на текущем инструменте/ТФ/периоде.</p>`
        + `<div style="max-height:340px;overflow:auto"><table style="border-collapse:collapse;font-size:12px"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    };
    document.getElementById('rs-run').onclick = run;
    setTimeout(run, 30);
  }

  // Merriman FAR: взвешенные астро-значения на экстремумах Filtered Wave
  function farModal() {
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 80 || !window.LunTS || !window.LunTS.computeFAR) { alert('Мало истории. Поставьте период больше (D1, 2–5 лет).'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    openModal('⚖ Merriman FAR — астро-факторы на экстремумах', `
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
        <label>Волна ≥ %<br><input id="far-pct" type="number" step="0.5" min="1" value="3" style="${inp};width:90px"></label>
        <button id="far-run" style="${btn};border-color:#26a69a">Прогнать</button>
      </div>
      <div id="far-out" style="color:#8b93a7">…</div>`);
    const run = () => {
      const pct = parseFloat(document.getElementById('far-pct').value) || 3;
      const R = window.LunTS.computeFAR(bars, { pct });
      const col = (rows, title, c) => {
        const body = rows.length ? rows.map((r) => `<tr><td style="padding:2px 10px 2px 0">${r.factor}</td><td style="padding:2px 10px 2px 0;color:#8b93a7">${r.count}</td><td style="padding:2px 0;color:${r.lift >= 1.3 ? c : '#8b93a7'}"><b>${r.lift.toFixed(2)}×</b></td></tr>`).join('') : '<tr><td colspan="3" style="color:#6b7280">мало экстремумов</td></tr>';
        return `<div style="flex:1;min-width:240px"><div style="color:${c};margin-bottom:4px">${title}</div><table style="border-collapse:collapse;font-size:12px"><thead><tr style="color:#8b93a7;text-align:left"><th style="padding-right:10px">Фактор</th><th style="padding-right:10px">шт</th><th>lift</th></tr></thead><tbody>${body}</tbody></table></div>`;
      };
      document.getElementById('far-out').innerHTML = `<p style="margin:0 0 8px">Волна ≥ ${R.pct}% · вершин: <b style="color:#ef5350">${R.nTops}</b> · оснований: <b style="color:#26a69a">${R.nBottoms}</b>. lift = частота фактора на экстремуме / базовой. <b>lift≥1.3</b> при ≥3 попаданиях = фактор тяготеет к развороту.</p>`
        + `<div style="display:flex;gap:24px;flex-wrap:wrap">` + col(R.tops, '▼ Вершины', '#ef5350') + col(R.bottoms, '▲ Основания', '#26a69a') + `</div>`;
    };
    document.getElementById('far-run').onclick = run;
    setTimeout(run, 30);
  }

  // прогнозная линия из циклов: тумблер (двигает офсет вправо, чтобы влезла проекция)
  function toggleProjection(on) {
    if (on) {
      try { const bar = state.chart.getBarSpace().bar || 6, proj = (window.LUN.TS && window.LUN.TS.projBars) || 120; state.chart.setOffsetRightDistance(Math.max(80, proj * bar)); } catch (e) {}
      try { state.chart.createIndicator({ name: 'CycleProjection', paneId: 'candle_pane' }, true); state.candleInds.CycleProjection = true; } catch (e) {}
    } else {
      removeCandInd('CycleProjection');
      if (!state.forecastOn) { try { state.chart.setOffsetRightDistance(80); } catch (e) {} }
    }
    try { state.chart.resize(); } catch (e) {}
  }

  // композит: среднее движение вперёд по астро-состоянию
  function compositeModal() {
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 60 || !window.LunTS) { alert('Мало истории. Поставьте период больше (D1, 1–3 года).'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const order = ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
    openModal('Композит — среднее движение по астро-состоянию', `
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">
        <label>Группировка<br><select id="cm-mode" style="${inp}"><option value="phase">Фаза Луны</option><option value="moonsign">Знак Луны</option><option value="planet">Знак планеты</option></select></label>
        <label>Планета<br><select id="cm-planet" style="${inp}">${order.map((p) => `<option value="${p}">${(window.LUN.ASTROGANN.planets[p] || {}).g || ''} ${p}</option>`).join('')}</select></label>
        <label>Горизонт (баров)<br><input id="cm-h" type="number" min="1" max="60" value="${(window.LUN.TS && window.LUN.TS.compHorizon) || 5}" style="${inp};width:90px"></label>
        <button id="cm-run" style="${btn}">Пересчитать</button>
      </div>
      <div id="cm-out" style="color:#8b93a7">…</div>`);
    const run = () => {
      const mode = document.getElementById('cm-mode').value, planet = document.getElementById('cm-planet').value, H = +document.getElementById('cm-h').value || 5;
      const R = window.LunTS.lunarComposite(bars, { mode, planet, horizon: H });
      const rows = R.rows.map((r) => {
        const col = r.avg >= 0 ? '#26a69a' : '#ef5350';
        return `<tr><td style="padding:2px 12px 2px 0">${r.key}</td>`
          + `<td style="padding:2px 12px 2px 0;color:${col}"><b>${(r.avg * 100).toFixed(2)}%</b></td>`
          + `<td style="padding:2px 12px 2px 0">${(r.winRate * 100).toFixed(0)}%</td>`
          + `<td style="padding:2px 0;color:#8b93a7">${r.cnt}</td></tr>`;
      }).join('');
      document.getElementById('cm-out').innerHTML = `<p style="margin:0 0 8px">Среднее движение за ${R.horizon} баров вперёд по группам. Отсортировано по среднему. Малые группы (мало «шт») — осторожно.</p>`
        + `<table style="border-collapse:collapse;font-size:12px"><thead><tr style="color:#8b93a7;text-align:left"><th style="padding-right:12px">Состояние</th><th style="padding-right:12px">ср. движ.</th><th style="padding-right:12px">%роста</th><th>шт</th></tr></thead><tbody>${rows}</tbody></table>`;
    };
    document.getElementById('cm-run').onclick = run;
    document.getElementById('cm-mode').onchange = run; document.getElementById('cm-planet').onchange = run;
    setTimeout(run, 30);
  }

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
    const AC = window.LUN.ASPECT_COLORS || {};
    const ASP = [{ a: 0, sym: '☌', c: AC[0] || '#e0a030' }, { a: 60, sym: '⚹', c: AC[60] || '#4bb4e6' }, { a: 90, sym: '□', c: AC[90] || '#ef5350' }, { a: 120, sym: '△', c: AC[120] || '#26a69a' }, { a: 180, sym: '☍', c: AC[180] || '#9b6bff' }];
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
    // старый лоадер помечаем stale ДО setSymbol/setPeriod: их getBars идут на него
    // и не должны загрузить/перетереть прошлый ТФ (гонка «соскока» на пред. ТФ).
    if (slot.loader) slot.loader.stale = true;
    slot.loader = window.LunData.makeDataLoader();   // держим ссылку — через неё поток толкает свечи
    c.setSymbol({
      ticker, symbol: ticker, provider: ins.provider || 'moex',
      pricePrecision: ins.pricePrecision, volumePrecision: ins.volumePrecision,
      engine: ins.engine || 'futures', market: ins.market || 'forts', type: ins.type || 'futures',
    });
    c.setPeriod({ span: tf.span, type: tf.type });
    c.setDataLoader(slot.loader);
    if (slot === state) document.getElementById('sym-title').textContent = `${ins.title}  ·  ${ticker}  ·  ${tf.title}`;
    // подключить/переподключить поток после подгрузки истории
    if (window.LunStream) setTimeout(() => window.LunStream.attach(slot), 700);
    // авто-коннектор: включить поток нужного рынка для активного графика
    if (slot === state) setTimeout(applyAutoConnect, 750);
    // новости: обновить список/метку настроения под новый инструмент
    if (slot === state && (newsOpen || newsMoodEnabled)) setTimeout(() => loadNews(), 400);
    // обновить наложение 2-го графика под новый ТФ/инструмент
    if (slot.compareInstrument) setTimeout(() => refreshCompare(slot), 800);
    // обновить ОИ под новый инструмент
    if (slot.oiPane) setTimeout(() => rebuildOI(slot), 900);
    // пересчитать арбитражный спред под новый ТФ
    if (slot.arbBundle) setTimeout(() => buildArb(slot, slot.arbBundle), 1000);
    // пересчитать базис к споту
    if (slot.basisPane) setTimeout(() => rebuildBasis(slot), 1100);
    if (slot === state) scheduleWsSave();   // авто-сохранение рабочего стола
  }

  function reloadAllSlots() { slots.forEach((s) => load(s)); }
  // модалка выбора диапазона дат «от–до»
  function historyModal(onApply) {
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const today = new Date().toISOString().slice(0, 10);
    const yearAgo = new Date(Date.now() - 366 * 86400000).toISOString().slice(0, 10);
    openModal('Период графика — от и до', `
      <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">
        <label>От<br><input id="hm-from" type="date" value="${yearAgo}" max="${today}" style="${inp}"></label>
        <label>До<br><input id="hm-till" type="date" value="${today}" max="${today}" style="${inp}"></label>
        <button id="hm-apply" style="${btn};border-color:#26a69a">Загрузить</button>
      </div>
      <p style="color:#8b93a7;margin:10px 0 0">Диапазон применяется ко всем окнам. Для глубокой истории используйте D1/H1 — внутридневные M5/M15 у MOEX ограничены доступной 1-минутной историей.</p>`);
    document.getElementById('hm-apply').onclick = () => {
      const f = document.getElementById('hm-from').value, t = document.getElementById('hm-till').value;
      if (!f || !t || f >= t) { alert('Проверьте даты: «от» должно быть раньше «до».'); return; }
      onApply(f, t);
      const bg = document.querySelector('.lun-modal-bg'); if (bg) bg.remove();
    };
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
  // учёт нарисованных объектов для сохранения рабочего стола
  function recordOverlay(ov) { if (!ov || !ov.id) return; state.drawings[ov.id] = { name: ov.name, points: clonePoints(ov.points), extendData: ov.extendData, styles: ov.styles, lock: !!ov.lock }; scheduleWsSave(); }
  function forgetOverlay(id) { if (id && state.drawings[id]) { delete state.drawings[id]; scheduleWsSave(); } }
  function overlayEvents() {
    const sel = (event) => { const ov = ovOf(event); if (ov) { state.selectedOverlayId = ov.id; state.selectedOverlay = ov; showStylePanel(ov); } return false; };
    const rec = (event) => { const ov = ovOf(event); if (ov) recordOverlay(ov); return false; };
    // при перетаскивании т2 у линии Ганна с фикс-углом — пересчитываем угол по
    // новому положению, чтобы т2 всегда лежала на луче, а поле угла совпадало.
    const moveEnd = (event) => {
      const ov = ovOf(event); if (!ov) return false;
      if (ov.name === 'lun_gann' && ov.extendData && typeof ov.extendData === 'object' && typeof ov.extendData.gannAngle === 'number') {
        const a = gannAngleOf(ov);
        if (a != null) { ov.extendData = Object.assign({}, ov.extendData, { gannAngle: a }); try { state.chart.overrideOverlay({ id: ov.id, extendData: ov.extendData }); } catch (e) {} }
      }
      recordOverlay(ov);
      if (state.selectedOverlay && state.selectedOverlay.id === ov.id) showStylePanel(ov);
      return false;
    };
    return {
      onSelected: sel, onClick: sel,
      onDrawEnd: rec, onPressedMoveEnd: moveEnd,
      onRemoved: (event) => { const ov = ovOf(event); if (ov) forgetOverlay(ov.id); return false; },
      onDeselected: () => { state.selectedOverlayId = null; state.selectedOverlay = null; hideStylePanel(); return false; },
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
    forgetOverlay(id);
    state.selectedOverlayId = null; state.selectedOverlay = null;
    if (stylePanelEl) stylePanelEl.style.display = 'none';
  }
  function copySelected() {
    const ov = state.selectedOverlay || (state.chart.getOverlayById && state.chart.getOverlayById(state.selectedOverlayId));
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

  /* ---------- панель свойств выделенного объекта ---------- */
  let stylePanelEl = null;
  function hexToRgba(hex, a) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return 'rgba(240,192,64,' + a + ')'; return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')'; }
  function ensureStylePanel() {
    if (stylePanelEl) return stylePanelEl;
    const p = document.createElement('div');
    p.id = 'lun-style-panel';
    p.style.cssText = 'position:fixed;top:96px;right:12px;z-index:45;width:214px;background:#121722;border:1px solid #232b3a;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:10px 12px;font-size:12px;color:#d7deea;display:none';
    const row = 'display:flex;justify-content:space-between;align-items:center;margin:5px 0';
    p.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b id="sp-name">Объект</b><span id="sp-close" style="cursor:pointer;color:#8b93a7;font-size:16px">×</span></div>
      <label style="${row}">Цвет <input id="sp-color" type="color" style="width:44px;height:24px;background:none;border:1px solid #232b3a;border-radius:4px"></label>
      <label style="${row}">Толщина <input id="sp-size" type="range" min="1" max="6" step="0.5" style="width:110px"></label>
      <label style="${row}">Линия <select id="sp-dash" style="background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:4px;padding:3px"><option value="solid">сплошная</option><option value="dashed">пунктир</option><option value="dotted">точки</option></select></label>
      <label style="${row}">Заливка <input id="sp-fill" type="checkbox"></label>
      <label style="${row}">🔒 Блокировка <input id="sp-lock" type="checkbox"></label>
      <div id="sp-angle-row" style="${row};display:none;border-top:1px solid #232b3a;margin-top:6px;padding-top:8px">Угол ∠ <span><input id="sp-angle" type="number" step="any" style="width:96px;background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:4px;padding:3px"> <span id="sp-angle-clr" title="Вернуть по 2 точкам" style="cursor:pointer;color:#8b93a7">↺</span></span></div>
      <button id="sp-del" style="width:100%;margin-top:8px;background:#2a1720;color:#ef8a88;border:1px solid #5a2b33;border-radius:6px;padding:6px;cursor:pointer">Удалить (Del)</button>`;
    document.body.appendChild(p);
    p.querySelector('#sp-close').onclick = hideStylePanel;
    p.querySelector('#sp-del').onclick = () => { deleteSelected(); hideStylePanel(); };
    ['#sp-color', '#sp-size', '#sp-dash', '#sp-fill', '#sp-lock'].forEach((id) => { const el = p.querySelector(id); el.oninput = applySelStyle; el.onchange = applySelStyle; });
    p.querySelector('#sp-angle').oninput = applyGannAngle;
    p.querySelector('#sp-angle-clr').onclick = () => { p.querySelector('#sp-angle').value = ''; applyGannAngle(); };
    stylePanelEl = p; return p;
  }
  const OV_NAMES = { lun_rect: 'Прямоугольник', lun_gann: 'Линия Ганна', lun_arrow: 'Стрелка', lun_hray: 'Луч ⨯N', lun_vprofile: 'Профиль объёма', lun_gannbox: 'Gann Box', lun_gannsquare: 'Квадрат Ганна', lun_text: 'Текст', horizontalStraightLine: 'Уровень', segment: 'Трендовая' };
  function showStylePanel(ov) {
    const p = ensureStylePanel();
    const ed = ov.extendData && typeof ov.extendData === 'object' ? ov.extendData : {};
    const st = Object.assign(defOvStyle(), ed.style || {});
    p.querySelector('#sp-name').textContent = OV_NAMES[ov.name] || 'Объект';
    p.querySelector('#sp-color').value = /^#([0-9a-f]{6})$/i.test(st.color) ? st.color : '#f0c040';
    p.querySelector('#sp-size').value = st.size || 1.4;
    p.querySelector('#sp-dash').value = st.dash || 'solid';
    p.querySelector('#sp-fill').checked = !!st.fill;
    p.querySelector('#sp-lock').checked = !!ov.lock;
    // строка угла — только для линии Ганна; показываем текущий (перс./общий/по 2 точкам)
    const angleRow = p.querySelector('#sp-angle-row');
    if (ov.name === 'lun_gann') {
      angleRow.style.display = '';
      const ai = p.querySelector('#sp-angle');
      if (typeof ed.gannAngle === 'number' && ed.gannAngle > 0) ai.value = ed.gannAngle;
      else { const cur = gannAngleOf(ov); ai.value = cur != null ? +cur.toFixed(cur < 10 ? 3 : 1) : ''; ai.placeholder = 'по 2 точкам'; }
    } else angleRow.style.display = 'none';
    p.style.display = 'block';
  }
  // текущий угол линии Ганна (цена/бар) по её двум точкам
  function gannAngleOf(ov) {
    const pts = ov.points || []; if (pts.length < 2) return null;
    const v0 = pts[0].value, v1 = pts[1].value, i0 = pts[0].dataIndex, i1 = pts[1].dataIndex;
    if (v0 == null || v1 == null || i0 == null || i1 == null) return null;
    const bars = Math.abs(i1 - i0) || 1; return Math.abs((v1 - v0) / bars);
  }
  function applyGannAngle() {
    const id = state.selectedOverlayId, ov = state.selectedOverlay; if (!id || !ov || !stylePanelEl) return;
    const v = stylePanelEl.querySelector('#sp-angle').value.trim();
    const ed = Object.assign({}, (ov.extendData && typeof ov.extendData === 'object') ? ov.extendData : {});
    const pts = (ov.points || []).map((p) => ({ timestamp: p.timestamp, dataIndex: p.dataIndex, value: p.value }));
    let newPoints = null;
    if (v === '' || !(+v > 0)) { delete ed.gannAngle; }
    else {
      ed.gannAngle = +v;
      // т2 ДВИГАЕТСЯ вслед за углом: ставим её значение точно на луч от т1.
      if (pts.length >= 2 && pts[0].value != null && pts[0].dataIndex != null && pts[1].dataIndex != null) {
        const dir = (pts[1].value != null && pts[1].value < pts[0].value) ? -1 : 1;
        const bars = Math.abs(pts[1].dataIndex - pts[0].dataIndex) || 1;
        pts[1].value = pts[0].value + dir * (+v) * bars;
        newPoints = pts;
      }
    }
    ov.extendData = ed; if (newPoints) ov.points = newPoints;
    try { state.chart.overrideOverlay(newPoints ? { id, extendData: ed, points: newPoints } : { id, extendData: ed }); } catch (e) {}
    recordOverlay(ov);
  }
  function hideStylePanel() { if (stylePanelEl) stylePanelEl.style.display = 'none'; }
  function applySelStyle() {
    const id = state.selectedOverlayId, ov = state.selectedOverlay; if (!id || !ov || !stylePanelEl) return;
    const color = stylePanelEl.querySelector('#sp-color').value;
    const size = +stylePanelEl.querySelector('#sp-size').value;
    const dash = stylePanelEl.querySelector('#sp-dash').value;
    const fill = stylePanelEl.querySelector('#sp-fill').checked;
    const lock = stylePanelEl.querySelector('#sp-lock').checked;
    const ed = Object.assign({}, (ov.extendData && typeof ov.extendData === 'object') ? ov.extendData : {});
    ed.style = { color, size, dash, fill, fillColor: hexToRgba(color, 0.14) };
    ov.extendData = ed; ov.lock = lock;
    try { state.chart.overrideOverlay({ id, extendData: ed, lock }); } catch (e) {}
    recordOverlay(ov);
  }

  /* ---------- новости по инструменту (правая колонка) ---------- */
  let newsOpen = false, newsEl = null, newsReqId = 0;
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function ensureNews() {
    if (newsEl) return newsEl;
    const p = document.createElement('div');
    p.id = 'lun-news';
    p.style.cssText = 'position:fixed;top:0;right:0;height:100%;width:340px;max-width:86vw;background:#0f1420;border-left:1px solid #232b3a;box-shadow:-8px 0 24px rgba(0,0,0,.45);z-index:60;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .2s ease';
    p.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #232b3a">
        <b id="nw-title" style="flex:1;font-size:13px">Новости</b>
        <span id="nw-refresh" title="Обновить" style="cursor:pointer;color:#8b93a7;font-size:15px">⟳</span>
        <span id="nw-close" style="cursor:pointer;color:#8b93a7;font-size:18px">×</span></div>
      <div id="nw-list" style="flex:1;overflow:auto;padding:6px 10px"></div>
      <div style="padding:7px 10px;border-top:1px solid #232b3a;color:#6b7280;font-size:11px">СМИ часто ведут толпу не туда — читайте как контр-сигнал, а не руководство.</div>`;
    document.body.appendChild(p);
    p.querySelector('#nw-close').onclick = () => toggleNews(false);
    p.querySelector('#nw-refresh').onclick = () => loadNews(true);
    newsEl = p; return p;
  }
  let newsMoodEnabled = false;
  function toggleNews(on) { ensureNews(); newsOpen = on; if (on) newsMoodEnabled = true; newsEl.style.transform = on ? 'translateX(0)' : 'translateX(100%)'; if (on) loadNews(); }
  function newsKeywords() {
    const ins = state.instrument, K = (window.LUN.NEWS && window.LUN.NEWS.keywords) || {};
    if (K[ins.id]) return K[ins.id];
    const words = (ins.title || ins.symbol || '').toLowerCase().split(/[^a-zа-яё0-9]+/).filter((w) => w.length > 2);
    return words.length ? words : (window.LUN.NEWS && window.LUN.NEWS.default) || [];
  }
  function newsFeeds() {
    const N = window.LUN.NEWS || {}, ins = state.instrument, prov = ins.provider || 'moex';
    const feeds = (N.feeds || []).slice();
    // профильные товарные ленты по исходному товару (нефть/золото/доллар…)
    if (N.commodityFeeds && N.commodityFeeds[ins.id]) N.commodityFeeds[ins.id].forEach((f) => feeds.push(f));
    if (prov === 'yahoo' && (ins.symbol || ins.ticker)) feeds.push({ name: 'Yahoo', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=' + encodeURIComponent(ins.symbol || ins.ticker) + '&region=US&lang=en-US' });
    if (prov === 'bybit' || prov === 'binance') (N.cryptoEnFeeds || []).forEach((f) => feeds.push(f));
    return feeds;
  }
  function newsMoodBadge() {
    let el = document.getElementById('news-mood');
    if (!el) { const bar = document.querySelector('.statusbar'); if (!bar) return null; el = document.createElement('span'); el.id = 'news-mood'; el.style.cssText = 'cursor:pointer;font-weight:600'; el.title = 'Настроение СМИ по инструменту (клик — открыть новости)'; el.onclick = () => toggleNews(!newsOpen); const anchor = document.getElementById('stream-status'); bar.insertBefore(el, anchor || null); }
    return el;
  }
  function updateNewsMood(res, insTitle) {
    const el = newsMoodBadge(); if (!el) return;
    if (!res || !res.items.length) { el.style.display = 'none'; return; }
    const m = res.mood, net = Math.round(m.net * 100), col = m.net > 0.1 ? '#26a69a' : (m.net < -0.1 ? '#ef5350' : '#8b93a7');
    el.style.display = ''; el.style.color = col;
    el.textContent = '📰 ' + (insTitle || '') + ': ' + (net > 0 ? '▲+' : (net < 0 ? '▼' : '•')) + Math.abs(net) + '% (' + m.pos + '/' + m.neg + ')';
  }
  const SENT_TAG = (s) => s > 0 ? '<span style="color:#26a69a">▲</span>' : (s < 0 ? '<span style="color:#ef5350">▼</span>' : '<span style="color:#6b7280">•</span>');
  async function loadNews(force) {
    if (!window.LunNews) return;
    const ins = state.instrument, rid = ++newsReqId, list = newsEl && newsEl.querySelector('#nw-list');
    if (newsEl) newsEl.querySelector('#nw-title').textContent = 'Новости · ' + (ins.title || ins.id);
    if (newsOpen && list) list.innerHTML = '<div style="color:#8b93a7;padding:8px 4px">Загрузка…</div>';
    let res = null; try { res = await window.LunNews.fetch({ keywords: newsKeywords(), feeds: newsFeeds() }); } catch (e) {}
    if (rid !== newsReqId) return;
    updateNewsMood(res, ins.title || ins.id);
    if (!newsOpen || !list) return;
    if (!res || !res.items.length) {
      list.innerHTML = '<div style="color:#8b93a7;padding:8px 4px">' + (res ? 'По инструменту ничего не нашлось (просмотрено ' + res.total + ' новостей). Обновите позже.' : 'Источники новостей недоступны из этого окружения.') + '</div>';
      return;
    }
    const m = res.mood, net = Math.round(m.net * 100), mcol = m.net > 0.1 ? '#26a69a' : (m.net < -0.1 ? '#ef5350' : '#8b93a7');
    const fbHtml = res.fallback ? `<div style="padding:5px 4px;color:#e0a030;font-size:11px">Нет точных совпадений по инструменту — последние новости по рынку.</div>` : '';
    const moodHtml = fbHtml + `<div style="padding:6px 4px 8px;margin-bottom:4px;border-bottom:1px solid #232b3a;color:${mcol};font-size:12px">Настроение СМИ: ▲${m.pos} ▼${m.neg} • ${m.neu} · нетто <b>${net > 0 ? '+' : ''}${net}%</b></div>`;
    list.innerHTML = moodHtml + res.items.map((it) => {
      const t = it.ts ? new Date(it.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      return `<a href="${escapeHtml(it.link)}" target="_blank" rel="noopener" style="display:block;padding:7px 4px;border-bottom:1px solid #1a2130;color:#d7deea;text-decoration:none;font-size:12px;line-height:1.35">`
        + `<div>${SENT_TAG(it.sent)} ${escapeHtml(it.title)}</div><div style="color:#6b7280;font-size:11px;margin-top:2px">${escapeHtml(it.source)} · ${t}</div></a>`;
    }).join('');
  }

  /* ---------- астро-календарь (правая колонка) ---------- */
  let calOpen = false, calEl = null;
  function ensureCal() {
    if (calEl) return calEl;
    const p = document.createElement('div');
    p.id = 'lun-cal';
    p.style.cssText = 'position:fixed;top:0;right:0;height:100%;width:320px;max-width:86vw;background:#0f1420;border-left:1px solid #232b3a;box-shadow:-8px 0 24px rgba(0,0,0,.45);z-index:60;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .2s ease';
    p.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #232b3a"><b style="flex:1;font-size:13px">🗓 Астро-календарь</b><span id="cal-close" style="cursor:pointer;color:#8b93a7;font-size:18px">×</span></div>
      <div id="cal-list" style="flex:1;overflow:auto;padding:6px 10px"></div>
      <div style="padding:7px 10px;border-top:1px solid #232b3a;color:#6b7280;font-size:11px">Ближайшие 90 дней · гео. Проверяйте влияние в «Астро-фит».</div>`;
    document.body.appendChild(p);
    p.querySelector('#cal-close').onclick = () => toggleCalendar(false);
    calEl = p; return p;
  }
  function toggleCalendar(on) { ensureCal(); calOpen = on; calEl.style.transform = on ? 'translateX(0)' : 'translateX(100%)'; if (on) renderCalendar(); }
  function renderCalendar() {
    if (!calEl || !window.LunTS || !window.LunTS.upcomingEvents) return;
    const list = calEl.querySelector('#cal-list'), now = Date.now();
    list.innerHTML = '<div style="color:#8b93a7;padding:8px 4px">Считаю…</div>';
    setTimeout(() => {
      let ev = []; try { ev = window.LunTS.upcomingEvents(now, 90); } catch (e) {}
      if (!ev.length) { list.innerHTML = '<div style="color:#8b93a7;padding:8px 4px">Событий не найдено.</div>'; return; }
      let html = '', lastD = '';
      ev.slice(0, 140).forEach((e) => {
        const d = new Date(e.ts), ds = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', weekday: 'short' });
        if (ds !== lastD) { html += `<div style="color:#3aa0ff;font-size:11px;margin:9px 0 2px">${ds}</div>`; lastD = ds; }
        const da = Math.max(0, Math.round((e.ts - now) / 86400000));
        html += `<div style="padding:3px 4px;border-bottom:1px solid #1a2130;font-size:12px;color:#d7deea">${e.name} <span style="color:#6b7280">· через ${da}д</span></div>`;
      });
      list.innerHTML = html;
    }, 20);
  }

  /* ---------- алерты ---------- */
  async function authApi(fn, body) {
    const res = await fetch('auth.php?fn=' + fn, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = {}; try { j = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
    return j;
  }
  /* ---------- рабочий стол: авто-сохранение/восстановление ---------- */
  let applyingWs = false, wsTimer = null, wsApplied = false;
  function scheduleWsSave() {
    if (applyingWs || !window.LunAuth || !window.LunAuth.user) return;
    clearTimeout(wsTimer);
    wsTimer = setTimeout(() => { authApi('ws_save', { ws: captureWorkspace() }).catch(() => {}); }, 1500);
  }
  function captureWorkspace() {
    const s = state;
    return {
      v: 1, instrument: s.instrument, tf: s.tf.id, history: window.LUN_HISTORY || null, look: LOOK, favs: window.LUN_FAVS,
      inds: {
        candle: Object.keys(s.candleInds || {}), overlays: Object.keys(s.overlayIds || {}),
        volume: !!s.volumePane, delta: !!s.deltaPane, markov: !!s.markovPanes, oi: !!s.oiPane,
        basis: !!s.basisPane, retro: !!s.retroPane, bradley: !!s.bradleyPane,
        signs: Object.keys(s.signPanes || {}), cycles: Object.keys(s.cyclePanes || {}),
        aspects: Object.keys(s.aspectPanes || {}), allAspect: !!s.allAspectPane,
      },
      drawings: Object.values(s.drawings || {}),
    };
  }
  const IND_SKIP = { GannSquareLevels: 1, OIExtremes: 1, AstroEventMarks: 1, CycleProjection: 1, GannSquaring: 1, GannRetr: 1, GannCycles: 1 };
  function applyWsIndicators(ind) {
    if (!ind) return;
    (ind.candle || []).forEach((n) => { if (IND_SKIP[n]) return; try { state.chart.createIndicator({ name: n, paneId: 'candle_pane' }, true); state.candleInds[n] = true; } catch (e) {} });
    (ind.overlays || []).forEach((k) => { try { toggleOverlay(k, true); } catch (e) {} });
    try { if (ind.volume && !state.volumePane) createVolumePane(); } catch (e) {}
    try { if (ind.delta && !state.deltaPane) createDeltaPane(); } catch (e) {}
    try { if (ind.markov && !state.markovPanes) createMarkov(); } catch (e) {}
    try { if (ind.oi && !state.oiPane) rebuildOI(state); } catch (e) {}
    try { if (ind.basis && !state.basisPane) rebuildBasis(state); } catch (e) {}
    try { if (ind.retro && !state.retroPane) createRetroPane(); } catch (e) {}
    try { if (ind.bradley && !state.bradleyPane) createBradleyPane(); } catch (e) {}
    (ind.signs || []).forEach((b, i) => { if (state.signPanes[b]) return; try { if (b === 'Moon') toggleMoonSign(true); else createSignPane(b, 25 + i); } catch (e) {} });
    (ind.cycles || []).forEach((id, i) => { const cy = window.LUN.CYCLES.find((c) => c.id === id); if (cy && !state.cyclePanes[id]) try { createCyclePane(cy, 11 + i); } catch (e) {} });
    (ind.aspects || []).forEach((b, i) => { const pl = window.LUN.ASPECT_PLANETS.find((p) => p.body === b); if (pl && !state.aspectPanes[b]) try { createSunAspect(pl, 15 + i); } catch (e) {} });
    try { if (ind.allAspect && !state.allAspectPane) createAllAspect(); } catch (e) {}
  }
  function applyWsDrawings(list) {
    (list || []).forEach((d) => { try { const id = state.chart.createOverlay(Object.assign({ name: d.name, points: clonePoints(d.points), extendData: d.extendData, styles: d.styles, lock: d.lock }, overlayEvents())); const oid = (typeof id === 'string') ? id : (Array.isArray(id) ? id[0] : null); if (oid) state.drawings[oid] = d; } catch (e) {} });
  }
  async function applyWorkspace(ws) {
    if (!ws || applyingWs) return;
    applyingWs = true;
    try {
      if (ws.look) LOOK = Object.assign(LOOK, ws.look);
      if (Array.isArray(ws.favs) && ws.favs.length) { window.LUN_FAVS = ws.favs; try { localStorage.setItem('lun_favs', JSON.stringify(ws.favs)); } catch (e) {} buildInstruments(); }
      if (ws.history !== undefined) window.LUN_HISTORY = ws.history;
      if (ws.instrument) state.instrument = ws.instrument;
      if (ws.tf) { const tf = window.LUN.TIMEFRAMES.find((t) => t.id === ws.tf); if (tf) state.tf = tf; }
      await load(state);
      applyChartLook();
      setTimeout(() => { applyWsIndicators(ws.inds); applyWsDrawings(ws.drawings); syncToolbar(); applyingWs = false; }, 1000);
    } catch (e) { applyingWs = false; }
  }
  // вызывается из auth.js при входе/восстановлении сессии
  window.LUN_APPLY_WS = async function () {
    if (wsApplied) return; wsApplied = true;
    try { const r = await authApi('ws_load'); if (r && r.ws) applyWorkspace(r.ws); } catch (e) {}
  };
  window.LUN_SCHEDULE_WS = scheduleWsSave;

  function alertsModal() {
    if (!window.LunAuth || !window.LunAuth.user) { alert('Чтобы ставить алерты, войдите в аккаунт (кнопка 👤 справа).'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    let last = 0; try { const l = state.chart.getDataList(); last = l.length ? l[l.length - 1].close : 0; } catch (e) {}
    const now = Date.now();
    let evs = []; try { evs = (window.LunTS && window.LunTS.upcomingEvents) ? window.LunTS.upcomingEvents(now, 120) : []; } catch (e) {}
    const evOpts = evs.slice(0, 120).map((e, i) => `<option value="${i}">${new Date(e.ts).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })} · ${e.name}</option>`).join('');
    openModal('🔔 Алерты', `
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px">
        <label>Тип<br><select id="al-kind" style="${inp}"><option value="price">Ценовой уровень</option><option value="astro">Астро-событие</option></select></label>
        <span id="al-price-box">
          <label>Условие<br><select id="al-op" style="${inp}"><option value=">=">≥ (вверх)</option><option value="<=">≤ (вниз)</option></select></label>
          <label>Уровень<br><input id="al-level" type="number" step="any" value="${last}" style="${inp};width:120px"></label>
        </span>
        <span id="al-astro-box" style="display:none"><label>Событие<br><select id="al-ev" style="${inp};max-width:260px">${evOpts}</select></label></span>
        <label>Канал<br><select id="al-ch" style="${inp}"><option value="email">E-mail</option><option value="telegram">Telegram</option></select></label>
        <label style="display:inline-flex;align-items:center;gap:5px"><input id="al-rpt" type="checkbox"> повторять</label>
        <button id="al-add" style="${btn};border-color:#26a69a">Создать</button>
      </div>
      <div id="al-tg" style="color:#8b93a7;font-size:12px;margin-bottom:8px"></div>
      <div id="al-list">…</div>`);
    const $ = (id) => document.getElementById(id);
    $('al-kind').onchange = () => { const a = $('al-kind').value === 'astro'; $('al-astro-box').style.display = a ? '' : 'none'; $('al-price-box').style.display = a ? 'none' : ''; };
    const refresh = async () => {
      try {
        const r = await authApi('alert_list');
        const rows = (r.alerts || []).map((a) => `<tr><td style="padding:2px 10px 2px 0">${a.kind === 'price' ? (a.instrument + ' ' + a.op + ' ' + a.level) : ('⭐ ' + a.title)}</td><td style="padding:2px 10px 2px 0;color:#8b93a7">${a.channel}${+a.rpt ? ' · повтор' : ''}</td><td style="padding:2px 10px 2px 0;color:${a.status === 'active' ? '#26a69a' : '#8b93a7'}">${a.status}</td><td><span class="al-del" data-id="${a.id}" style="cursor:pointer;color:#ef8a88">✕</span></td></tr>`).join('');
        $('al-list').innerHTML = rows ? `<table style="border-collapse:collapse;font-size:12px;width:100%"><tbody>${rows}</tbody></table>` : '<div style="color:#8b93a7">Пока нет алертов.</div>';
        [...document.querySelectorAll('.al-del')].forEach((x) => x.onclick = async () => { await authApi('alert_del', { id: +x.dataset.id }); refresh(); });
        // Telegram
        if ($('al-ch').value === 'telegram' || (r.alerts || []).some((a) => a.channel === 'telegram')) {
          try { const t = await authApi('tg_code'); const bot = window.LUN.TG_BOT; $('al-tg').innerHTML = t.linked ? '✅ Telegram привязан.' : ('Telegram: отправьте боту ' + (bot ? '<a href="https://t.me/' + bot + '?start=' + t.code + '" target="_blank" style="color:#3aa0ff">@' + bot + '</a>' : '(бот ещё не настроен)') + ' сообщение <b>/start ' + t.code + '</b>, затем «Создать».'); } catch (e) {}
        } else $('al-tg').innerHTML = '';
      } catch (e) { $('al-list').innerHTML = '<div style="color:#e0a030">' + e.message + '</div>'; }
    };
    $('al-ch').onchange = refresh;
    $('al-add').onclick = async () => {
      const kind = $('al-kind').value, channel = $('al-ch').value, rpt = $('al-rpt').checked;
      try {
        if (kind === 'astro') {
          const e = evs[+$('al-ev').value]; if (!e) return;
          await authApi('alert_add', { kind: 'astro', title: e.name, fire_ts: e.ts, channel, rpt });
        } else {
          const ins = state.instrument, ticker = await window.LunData.resolveTicker(ins);
          await authApi('alert_add', { kind: 'price', title: (ins.title || ins.id) + ' ' + $('al-op').value + ' ' + $('al-level').value, instrument: ticker, provider: ins.provider || 'moex', op: $('al-op').value, level: +$('al-level').value, channel, rpt });
        }
        refresh();
      } catch (e) { alert(e.message); }
    };
    refresh();
  }

  function startDraw(toolId) {
    closeMenus();
    const ev = overlayEvents();
    if (toolId === 'lun_text') {
      const t = window.prompt('Текст метки:', '');
      if (t === null) return;
      state.chart.createOverlay(Object.assign({ name: 'lun_text', extendData: { text: t, style: defOvStyle() } }, ev));
    } else if (toolId === 'lun_hray') {
      const n = (window.LUN.HRAY && window.LUN.HRAY.maxCrossings) || 2;
      state.chart.createOverlay(Object.assign({ name: 'lun_hray', extendData: { maxCrossings: n, style: defOvStyle() } }, ev));
    } else {
      state.chart.createOverlay(Object.assign({ name: toolId, extendData: { style: defOvStyle() } }, ev));
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

  /* ---------- избранные инструменты (звёздочка) ---------- */
  const favId = (ins) => ins.id || ((ins.provider || 'moex') + ':' + (ins.ticker || ins.symbol || ins.title));
  function loadFavs() {
    try { const s = JSON.parse(localStorage.getItem('lun_favs') || 'null'); if (Array.isArray(s) && s.length) { window.LUN_FAVS = s; return; } } catch (e) {}
    window.LUN_FAVS = window.LUN.INSTRUMENTS.slice();
  }
  function saveFavs() { try { localStorage.setItem('lun_favs', JSON.stringify(window.LUN_FAVS || [])); } catch (e) {} if (typeof scheduleWsSave === 'function') scheduleWsSave(); }
  const findFav = (id) => (window.LUN_FAVS || []).find((x) => favId(x) === id);
  function addFav(ins) { const id = favId(ins); if (findFav(id)) return; const c = Object.assign({}, ins); if (!c.provider) c.provider = 'moex'; window.LUN_FAVS.push(c); saveFavs(); buildInstruments(); }
  function removeFav(id) { window.LUN_FAVS = (window.LUN_FAVS || []).filter((x) => favId(x) !== id); saveFavs(); buildInstruments(); }
  function favApi() { return { isFav: (x) => !!findFav(favId(x)), toggle: (x) => { const id = favId(x); if (findFav(id)) removeFav(id); else addFav(x); } }; }
  function buildInstruments() {
    const insWrap = document.getElementById('instruments'); if (!insWrap) return;
    const MARKET = { moex: 'MOEX', bybit: 'Крипта', binance: 'Крипта', yahoo: 'США' };
    insWrap.innerHTML = ''; let curMarket = null;
    const clearActive = () => [...insWrap.querySelectorAll('button')].forEach((x) => x.classList.remove('active'));
    (window.LUN_FAVS || []).forEach((ins) => {
      const grp = MARKET[ins.provider || 'moex'] || 'Прочее';
      if (grp !== curMarket) { const h = document.createElement('div'); h.className = 'menu-sub'; h.textContent = grp; insWrap.appendChild(h); curMarket = grp; }
      const b = document.createElement('button'); b.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%';
      b.innerHTML = '<span style="flex:1;text-align:left">' + (ins.title || ins.id) + '</span><span class="fav-star" title="убрать из избранного" style="color:#e0c040">★</span>';
      if (favId(ins) === favId(state.instrument)) b.classList.add('active');
      b.onclick = () => { state.instrument = ins; load(); closeMenus(); clearActive(); b.classList.add('active'); };
      b.querySelector('.fav-star').onclick = (e) => { e.stopPropagation(); removeFav(favId(ins)); };
      insWrap.appendChild(b);
    });
    const findBtn = mkBtn(insWrap, '🔍 Поиск / добавить в избранное…', () => { closeMenus(); window.LunInstruments.open((instr) => { state.instrument = instr; load(); }, favApi()); }, false, 'Поиск инструмента; звёздочка ★ добавит в избранное');
    findBtn.classList.add('find-btn');
    mkBtn(insWrap, '➕ 2-й график (линией)', () => { closeMenus(); window.LunInstruments.open((instr) => addCompare(instr)); }, false, 'Наложить второй инструмент линией на активный график');
    mkBtn(insWrap, '✕ убрать 2-й график', () => { closeMenus(); removeCompare(); }, false, 'Убрать наложение');
  }

  function buildUI() {
    loadFavs();
    buildInstruments();

    const tfWrap = document.getElementById('timeframes');
    window.LUN.TIMEFRAMES.forEach((tf, i) => {
      const b = mkBtn(tfWrap, tf.title, (bb) => {
        state.tf = tf; load(); closeMenus();
        [...tfWrap.children].forEach((x) => x.classList.remove('active')); bb.classList.add('active');
      }, tf === state.tf, tf.title + ' (' + (i + 1) + ')');
      b.dataset.sync = 'tf:' + tf.id;
      regHotkey(String(i + 1), () => b.click());   // 1..4 → ТФ
    });

    // ---- меню «🗓 Период» (глубина истории для исследований) ----
    const histWrap = document.getElementById('history');
    if (histWrap) {
      const clearHist = () => [...histWrap.querySelectorAll('button')].forEach((x) => x.classList.remove('active'));
      const setHist = (h, btn) => { window.LUN_HISTORY = h; clearHist(); if (btn) btn.classList.add('active'); reloadAllSlots(); };
      const PRESETS = [['Авто (по умолчанию)', null], ['3 месяца', { days: 92 }], ['6 месяцев', { days: 183 }],
        ['1 год', { days: 366 }], ['3 года', { days: 1096 }], ['5 лет', { days: 1827 }], ['Максимум', { days: 4000 }]];
      PRESETS.forEach(([label, h], i) => { const b = mkBtn(histWrap, label, (bb) => setHist(h, bb), i === 0,
        'Глубина загружаемой истории графика'); });
      mkBtn(histWrap, '📅 От–до…', () => { closeMenus(); historyModal((from, till, btnLabel) => {
        window.LUN_HISTORY = { from, till }; clearHist();
        [...histWrap.querySelectorAll('button')].forEach((x) => { if (x.textContent === '📅 От–до…') x.classList.add('active'); });
        reloadAllSlots();
      }); }, false, 'Задать точный диапазон дат');
      const hnote = document.createElement('div'); hnote.className = 'menu-note';
      hnote.textContent = 'Глубоко: D1/H1 (годы). M5/M15 у MOEX ограничены доступной 1-мин историей.';
      histWrap.appendChild(hnote);
    }

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
    // базис к споту исходного товара (фьюч − спот, регрессией) + z-score
    const basisBtn = mkBtn(indWrap, 'Базис к споту', (b) => {
      const on = !b.classList.contains('active');
      if (on) rebuildBasis(state).then((ok) => b.classList.toggle('active', ok !== false));
      else { b.classList.remove('active'); removeBasis(state); }
    }, false, 'Базис фьюч − спот исходного товара (Si↔USD/RUB, золото, CNY…): остаток регрессии + z');
    basisBtn.dataset.sync = 'basis';
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
      gsub('Геометрия (2 клика: пивот → охват)');
      mkBtn(gannWrap, '▱ Gann Box / Квадрат…', () => { closeMenus(); gannGeomModal(); }, false, 'Единая форма: Box с делениями или квадрат-сетка N×N (8/12/своё)');
      mkBtn(gannWrap, '⟋ Сквоузинг 1×1 (панель)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) { state.chart.createIndicator({ name: 'GannSquaring', paneId: 'candle_pane' }, true); state.candleInds.GannSquaring = true; }
        else removeCandInd('GannSquaring');
      }, false, 'Линии 1×1 от пивота + отметки сквоузинга цены/времени');
      mkBtn(gannWrap, '⚖ Масштаб 1×1…', () => { closeMenus(); scaleModal(); }, false, 'Цена на 1 бар: авто или вручную');
      mkBtn(gannWrap, '🔒 Ганн-режим (фикс масштаба)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleGannSpace(on);
      }, false, 'Колесо не искажает геометрию углов (масштаб зафиксирован). Двойной клик в правый-нижний угол осей — последняя цена в центр');
      gsub('Квадраты');
      mkBtn(gannWrap, '⊞ Калькулятор квадратов…', () => { closeMenus(); gannSquareModal(); }, false, 'Квадрат 9 / шестиугольник / круг 360° / натуральные — уровни поддержки и сопротивления');
      mkBtn(gannWrap, '✕ убрать уровни квадрата', () => { closeMenus(); removeCandInd('GannSquareLevels'); }, false, 'Убрать нанесённые уровни квадрата');
      gsub('Уровни и циклы');
      mkBtn(gannWrap, '📏 Ганн-ретрейсменты', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) { state.chart.createIndicator({ name: 'GannRetr', paneId: 'candle_pane' }, true); state.candleInds.GannRetr = true; }
        else removeCandInd('GannRetr');
      }, false, 'Горизонтали 1/8·1/3·1/2 диапазона видимого окна');
      mkBtn(gannWrap, '⏲ Мастер-циклы (клик = пивот)', () => startOverlay('lun_cycles'), false, 'Клик ставит пивот на ЛЮБОЙ экстремум истории (потом можно перетащить). Вертикали 30·45·60·90·120·144·180·270·360 баров');
      mkBtn(gannWrap, '⏲ Мастер-циклы (авто, посл. экстремум)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) { state.chart.createIndicator({ name: 'GannCycles', paneId: 'candle_pane' }, true); state.candleInds.GannCycles = true; }
        else removeCandInd('GannCycles');
      }, false, 'Авто-пивот на последнем видимом экстремуме');
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
      gsub('Прогностика');
      mkBtn(gannWrap, '🎯 Астро-фит: что работает…', () => { closeMenus(); astroFitModal(); }, false, 'Ранжирование астро-событий по совпадению с разворотами ЭТОГО инструмента (нужна история — D1, 1–3 года)');
      mkBtn(gannWrap, '📈 Прогноз циклов (линия)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleProjection(on);
      }, false, 'Прогнозная линия из доминирующих циклов цены, продлённая вперёд');
      mkBtn(gannWrap, '📊 Композит по астро-состоянию…', () => { closeMenus(); compositeModal(); }, false, 'Среднее движение вперёд по фазе Луны / знаку планеты (сезонность)');
      mkBtn(gannWrap, '⚖ Merriman FAR (экстремумы)…', () => { closeMenus(); farModal(); }, false, 'Взвешенные астро-факторы на вершинах/основаниях волны (Filtered Wave)');
      const gnote = document.createElement('div'); gnote.className = 'menu-note';
      gnote.textContent = 'Инструменты Ганна: геометрия · квадраты · циклы · астро-Ганн';
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
    mkBtn(setWrap, '🔬 Исследование сигналов', () => { closeMenus(); researchModal(); }, false, 'Выбираемый бэктест: объём, EMA, пробой, RSI, лунные зоны — на текущих данных');
    mkBtn(setWrap, '📰 Новости по инструменту', () => { closeMenus(); toggleNews(!newsOpen); }, false, 'Правая колонка новостей по текущему инструменту (СМИ как контр-индикатор)');
    mkBtn(setWrap, '❓ Справка', () => { closeMenus(); helpModal(); }, false, 'Что умеет терминал');
    mkBtn(setWrap, '📚 Как пользоваться', () => { closeMenus(); guideModal(); }, false, 'Пошагово: Астро, Ганн, Бэктест');
    mkBtn(setWrap, '🌗 Тема: тёмная/светлая', () => { closeMenus(); setTheme(LOOK.theme === 'dark' ? 'light' : 'dark'); }, false, 'Переключить оформление');
    mkBtn(setWrap, '🕯 Тип: свечи/бары', () => { closeMenus(); setCandleType(LOOK.candle === 'candle_solid' ? 'ohlc' : 'candle_solid'); }, false, 'Свечи ↔ бары (OHLC)');
    mkBtn(setWrap, '⌨ Горячие клавиши', () => { closeMenus(); hotkeysModal(); }, false, 'Список горячих клавиш');

    // Алерты
    const alWrap = document.getElementById('alerts');
    if (alWrap) {
      mkBtn(alWrap, '🔔 Алерты…', () => { closeMenus(); alertsModal(); }, false, 'Создать/смотреть алерты (цена/астро), e-mail или Telegram. Работают на сервере — терминал можно закрыть');
      const note = document.createElement('div'); note.className = 'menu-note'; note.textContent = 'Нужен вход в аккаунт (👤). Проверка — на сервере (cron).'; alWrap.appendChild(note);
    }

    // Коннекторы — в Настройках, все ВКЛ по умолчанию (цена всегда движется)
    const conSub = document.createElement('div'); conSub.className = 'menu-sub'; conSub.textContent = 'Коннекторы (реалтайм)'; conSub.style.marginTop = '6px'; setWrap.appendChild(conSub);
    [['crypto', 'Крипта · Bybit', 'Настоящий поток (WebSocket)'],
     ['us', 'Америка · Yahoo', 'Опрос ~15–30с'],
     ['moex', 'MOEX · псевдо', 'Опрос (истинный realtime у биржи платный)']].forEach(([name, label, tip]) => {
      connBtns[name] = mkBtn(setWrap, label, (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (window.LunStream) window.LunStream.setConnector(name, on, slots);
      }, true, tip);   // active по умолчанию
    });

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
      cell.addEventListener('dblclick', (e) => { const r = cell.getBoundingClientRect(); if (e.clientX > r.right - 150 && e.clientY > r.bottom - 70) { activateSlot(i); recenterLastPrice(slots[i]); } });
      slots.push(slot);
      if (L.cells > 1) wireSync(slot);
    }
    activeIdx = 0; state = slots[0]; window.LUN_CHART = state.chart;
    slots.forEach((s) => { state = s; buildPanes(); });   // buildPanes синхронно, по активному state
    state = slots[0];
    applyChartLook();                                      // тема + тип свечей
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
  function toggleMoonSign(on) {
    if (on) {
      if (state.signPanes.Moon) return;
      state.signPane = 'pane_sign_Moon';
      state.chart.createIndicator({ name: 'SignStrip', paneId: state.signPane, shortName: BODY_LABEL.Moon, extendData: { body: 'Moon', frame: 'geo' } }, false);
      state.signPanes.Moon = state.signPane;
      wishPane(state.signPane, { height: window.LUN.PANE_HEIGHTS.moonSign, minHeight: 26, order: 10 });
    } else if (state.signPanes.Moon) {
      try { state.chart.removeIndicator({ paneId: state.signPanes.Moon }); } catch (e) {}
      delete state.signPanes.Moon; state.signPane = null;
    }
  }
  function buildCycleButtons() {
    const cycWrap = document.getElementById('cycles');
    cycWrap.innerHTML = '';
    mkBtn(cycWrap, '☾ Луна в знаках', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleMoonSign(on);
    }, true, 'Верхняя лента знаков Луны (цвет по знаку, градус). Тумблер показать/скрыть');
    mkBtn(cycWrap, '🗓 Астро-календарь', () => { closeMenus(); toggleCalendar(!calOpen); }, false, 'Правая панель: ближайшие ингрессии, аспекты, ретро, фазы, затмения (90 дней)');
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
    // коннекторы — все включены по умолчанию (цена всегда движется)
    if (window.LunStream) setTimeout(() => { ['crypto', 'us', 'moex'].forEach((n) => window.LunStream.setConnector(n, true, slots)); }, 1200);
    updateMoonStatus();
    setInterval(updateMoonStatus, 60000);
    setInterval(() => scheduleWsSave(), 25000);   // страховочное авто-сохранение рабочего стола
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
