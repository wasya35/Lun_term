/* =============================================================================
 *  Lun_term — конфигурация (правь здесь, это «пульт» приложения)
 * =============================================================================
 *    1) INSTRUMENTS — инструменты MOEX (+ авто-подбор ближнего контракта)
 *    2) TIMEFRAMES  — таймфреймы
 *    3) SIGNS       — 12 знаков зодиака: имя, глиф, стихия, ЦВЕТ ленты
 *    4) CYCLES      — до 6 торговых циклов (зоны лонг/шорт/рэндж по градусам)
 *    5) INDICATORS  — параметры EMA/SMA/VWAP
 * ===========================================================================*/

window.LUN = window.LUN || {};

/* --- 1. Инструменты --------------------------------------------------------
 * assetCode — код базового актива на MOEX FORTS: сервер по нему сам находит
 *   БЛИЖНИЙ (ближайший неистёкший) контракт, поэтому тикер не устаревает.
 * ticker    — запасной тикер, если авто-подбор недоступен (нет сети и т.п.).
 *   Формат: буква месяца (H=март, M=июнь, U=сентябрь, Z=декабрь) + цифра года.
 *   На 08.2026 ближний квартальный: Si → SiU6, CNY → CRU6 (сентябрь 2026). */
/* Избранное сверху. assetCode — код базового актива на MOEX FORTS (по нему ISS
 * находит ближний контракт). ЕСЛИ инструмент не грузится — сверь assetCode/ticker
 * с ISS (коды металлов/нефти могут отличаться: золото GOLD/GD, серебро SILV/SV,
 * Brent BR — месячные контракты, ED — EUR/USD). */
LUN.INSTRUMENTS = [
  // MOEX FORTS (provider 'moex' — по умолчанию)
  { id: 'Si',   title: 'Si · USD/RUB',  provider: 'moex', assetCode: 'Si',   ticker: 'SiU6', pricePrecision: 0, volumePrecision: 0 },
  { id: 'CNY',  title: 'CNY · CNY/RUB', provider: 'moex', assetCode: 'CNY',  ticker: 'CRU6', pricePrecision: 3, volumePrecision: 0 },
  { id: 'GOLD', title: 'GD · Золото',   provider: 'moex', assetCode: 'GOLD', ticker: 'GDU6', pricePrecision: 1, volumePrecision: 0 },
  { id: 'BR',   title: 'BR · Brent',    provider: 'moex', assetCode: 'BR',   ticker: 'BRV6', pricePrecision: 2, volumePrecision: 0 },
  { id: 'ED',   title: 'ED · EUR/USD',  provider: 'moex', assetCode: 'ED',   ticker: 'EDU6', pricePrecision: 4, volumePrecision: 0 },
  { id: 'SILV', title: 'SV · Серебро',  provider: 'moex', assetCode: 'SILV', ticker: 'SVU6', pricePrecision: 3, volumePrecision: 0 },
  // Крипта (Bybit spot — публично, без ключей, CORS открыт)
  { id: 'BTC',  title: 'BTC/USDT', provider: 'bybit', symbol: 'BTCUSDT', market: 'spot', pricePrecision: 1, volumePrecision: 3 },
  { id: 'ETH',  title: 'ETH/USDT', provider: 'bybit', symbol: 'ETHUSDT', market: 'spot', pricePrecision: 2, volumePrecision: 3 },
  { id: 'SOL',  title: 'SOL/USDT', provider: 'bybit', symbol: 'SOLUSDT', market: 'spot', pricePrecision: 3, volumePrecision: 2 },
  // США (Yahoo — бесплатно, через шлюзы, ~15 мин задержка)
  { id: 'SPY',  title: 'SPY · S&P 500', provider: 'yahoo', symbol: 'SPY',  pricePrecision: 2, volumePrecision: 0 },
  { id: 'QQQ',  title: 'QQQ · Nasdaq',  provider: 'yahoo', symbol: 'QQQ',  pricePrecision: 2, volumePrecision: 0 },
  { id: 'NVDA', title: 'NVDA',          provider: 'yahoo', symbol: 'NVDA', pricePrecision: 2, volumePrecision: 0 },
];

/* --- 2. Таймфреймы ---------------------------------------------------------
 * M5/M15 MOEX ISS напрямую не отдаёт — собираются агрегацией из 1-мин (server.js). */
LUN.TIMEFRAMES = [
  { id: 'M5',  title: 'M5',  span: 5,  type: 'minute', iss: 5  },
  { id: 'M15', title: 'M15', span: 15, type: 'minute', iss: 15 },
  { id: 'H1',  title: 'H1',  span: 1,  type: 'hour',   iss: 60 },
  { id: 'D1',  title: 'D1',  span: 1,  type: 'day',    iss: 24 },
];
LUN.DEFAULT_TIMEFRAME = 'H1';

/* --- 3. Знаки зодиака ------------------------------------------------------
 * Индекс 0 = Овен (долгота 0°..30°), далее по 30°. color — цвет ленты знака.
 * Сейчас — ПО СТИХИЯМ (правь под себя):
 *   Огонь красный · Земля зелёный · Воздух жёлтый · Вода синий. */
LUN.SIGNS = [
  { name: 'Овен',     glyph: '♈', element: 'fire',  color: '#c0392b' },
  { name: 'Телец',    glyph: '♉', element: 'earth', color: '#2e7d5b' },
  { name: 'Близнецы', glyph: '♊', element: 'air',   color: '#c9a227' },
  { name: 'Рак',      glyph: '♋', element: 'water', color: '#2c6fb0' },
  { name: 'Лев',      glyph: '♌', element: 'fire',  color: '#d35400' },
  { name: 'Дева',     glyph: '♍', element: 'earth', color: '#3a9d6e' },
  { name: 'Весы',     glyph: '♎', element: 'air',   color: '#d4b13a' },
  { name: 'Скорпион', glyph: '♏', element: 'water', color: '#1f5f97' },
  { name: 'Стрелец',  glyph: '♐', element: 'fire',  color: '#e0562a' },
  { name: 'Козерог',  glyph: '♑', element: 'earth', color: '#256b4d' },
  { name: 'Водолей',  glyph: '♒', element: 'air',   color: '#bf9b30' },
  { name: 'Рыбы',     glyph: '♓', element: 'water', color: '#356fa3' },
];

LUN.BIAS_COLORS = { long: '#1f8a4c', short: '#c0392b', range: '#8a8f3a' };

/* --- 4. Торговые циклы ------------------------------------------------------
 * Каждый цикл — отдельная полоса под графиком со своей разметкой зон.
 *   id       — служебный id панели
 *   title    — подпись
 *   body     — небесное тело, по которому строится цикл ('Moon'; позже Sun,
 *              Mercury, Venus, Mars, Jupiter, Saturn ... — уже поддержаны в astro.js)
 *   enabled  — показывать ли полосу по умолчанию
 *   zones[]  — { from, to, bias, color, label }
 *              from→to — интервал долготы тела (по часовой, можно через 360°)
 *              bias    — 'long' | 'short' | 'range'
 *
 * Ориентиры по градусам (0° = 0° Овна): 15° Близнецов = 75°, 15° Весов = 195°,
 * 15° Козерога = 285°.
 *
 * ЦИКЛ 1 — лунный цикл: 4 зоны из твоего описания
 *   (Близнецы→Весы лонг · Весы→Скорпион шорт · Стрелец→Козерог лонг · Козерог→Близнецы шорт).
 * ЦИКЛ 2 — заготовка под второй цикл (другое тело/гармоника), редактируется в «⚙ Настройки». */
LUN.CYCLES = [
  {
    id: 'cycle1', title: 'Цикл 1 · Луна в знаках', body: 'Moon', enabled: true,
    zones: [
      { from: 75,  to: 135, bias: 'long',  color: '#1f6f43', label: 'ЛОНГ (сильный старт)' },
      { from: 135, to: 195, bias: 'range', color: '#5a6b2f', label: 'ЛОНГ / рэндж' },
      { from: 195, to: 240, bias: 'short', color: '#8a2f2f', label: 'ШОРТ' },
      { from: 240, to: 285, bias: 'long',  color: '#2a7a52', label: 'ЛОНГ / коррекция' },
      { from: 285, to: 75,  bias: 'short', color: '#7a2b2b', label: 'ШОРТ' },
    ],
  },
  { id: 'cycle2', title: 'Цикл 2', body: 'Moon', enabled: false, zones: [] },
];

/* --- Аспекты между планетами -----------------------------------------------
 * Полоса, отмечающая словами аспекты пары тел с допуском (орб).
 * Аспекты: соединение 0°, секстиль 60°, квадрат 90°, трин 120°, оппозиция 180°.
 * frame: 'helio' — гелиоцентр (Солнце = позиция Земли; у Меркурия с Солнцем
 *   при этом реальны ВСЕ мажорные аспекты), 'geo' — геоцентр. */
LUN.ASPECTS = { enabled: false, bodyA: 'Sun', bodyB: 'Mercury', orb: 3, frame: 'helio' };

/* Линейки аспектов планеты к СОЛНЦУ — по одной полосе на планету (тумблер).
 * Луна — геоцентр (фазы: соед.=новолуние, оппоз.=полнолуние), планеты — гелио
 * (Солнце = позиция Земли; у Меркурия с Солнцем реальны все мажорные аспекты).
 * По умолчанию включён ☉/☿ (основа системы). */
LUN.ASPECT_PLANETS = [
  { body: 'Moon',    glyph: '☾', frame: 'geo',   enabled: false },
  { body: 'Mercury', glyph: '☿', frame: 'helio', enabled: true },
  { body: 'Venus',   glyph: '♀', frame: 'helio', enabled: false },
  { body: 'Mars',    glyph: '♂', frame: 'helio', enabled: false },
  { body: 'Jupiter', glyph: '♃', frame: 'helio', enabled: false },
  { body: 'Saturn',  glyph: '♄', frame: 'helio', enabled: false },
  { body: 'Uranus',  glyph: '♅', frame: 'helio', enabled: false },
  { body: 'Neptune', glyph: '♆', frame: 'helio', enabled: false },
  { body: 'Pluto',   glyph: '♇', frame: 'helio', enabled: false },
];
/* 11-я сводная полоса: все аспекты всех пар (планеты + Солнце). Подробные подписи
 * на M5/M15, на H1/D — только цветные отметки. */
LUN.ALL_ASPECTS = { enabled: false };
/* Сила = всплеск объёма: объём бара ≥ forceMult × среднего объёма предыдущих
 * lookback (мелких) баров. Силища = сила, после которой объём держится высоким
 * (среднее следующих sustainBars ≥ sustainMult × базового). */
LUN.STRONGBAR = { lookback: 12, forceMult: 2, sustainBars: 5, sustainMult: 1.5 };
/* Орб (°) для узлов 0°/15° знака в бэктесте силы. */
LUN.NODE_ORB = 4;
/* Издержки на круг (в ПУНКТАХ цены инструмента): комиссия + спред +
 * проскальзывание, вход+выход. Вычитаются из результата каждой сделки в
 * бэктесте автоторговли, чтобы видеть ЧИСТОЕ ожидание в R. Для Si реалистично
 * ~6–10 п.; правь под своего брокера/ликвидность. */
LUN.TRADECOST = { pointsRoundTrip: 6 };
LUN.BODY_GLYPH = { Sun: '☉', Moon: '☾', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇' };

/* --- Горизонтальный луч с обрезкой по пересечениям --------------------------
 * Луч идёт от точки вправо и ОБРЫВАЕТСЯ на N-м пересечении с ценой (бар, чей
 * диапазон low..high накрывает уровень). maxCrossings = 2 или 3. */
LUN.HRAY = { maxCrossings: 3 };

/* --- Горизонтальный объём (профиль объёма по диапазону) ---------------------
 * Натяжка рамкой на 2 точки: считает объём по УЖЕ загруженным свечам внутри
 * временного окна, бьёт ценовой диапазон на bins уровней, строит гистограмму
 * влево→вправо от левого края рамки. POC — уровень макс. объёма. Для детали
 * грузи M5/M15 (месяц таких баров тянется). maxWidthPx — макс. длина столбца. */
LUN.VPROFILE = { bins: 24, maxWidthPx: 150, valueAreaPct: 0.70 };

/* --- Прогноз шкал вперёд ----------------------------------------------------
 * «🔮 Прогноз» продлевает астро-полосы (знаки, циклы, аспекты) ВПРАВО за
 * последнюю свечу — до следующего мажорного аспекта Солнце–Уран. Так виден
 * весь астро-фон на горизонт до этого события. Тело/пара и рамка ниже. */
LUN.FORECAST = { bodyA: 'Sun', bodyB: 'Uranus', frame: 'helio', maxBars: 500 };

/* --- Линия Ганна -----------------------------------------------------------
 * Луч ИЗ точки 1 (база/опора) ЧЕРЕЗ точку 2 (задаёт направление): тянешь т2 —
 * луч поворачивается вокруг т1. Угол (цена/бар и градусы) считается по т1→т2 и
 * показывается подписью вживую.
 * extendRight — true: луч до правого края; false: отрезок т1..т2.
 * unitPerBar — устар. (числовой угол больше не задаёт геометрию). */
LUN.GANN = { unitPerBar: null, extendRight: true };

/* Инструменты У.Д. Ганна (меню «📐 Ганн»).
 *  square  — калькулятор квадратов: turns = число «оборотов» (колец) в каждую
 *            сторону; base по умолчанию 9. Считается по √-спирали (полный оборот
 *            = +2 к √цены); base меняет число делений: 9→45°, hex→60°, 360→15°,
 *            natural→квадраты натуральных чисел и их серединные точки.
 *  retr    — уровни ретрейсмента (доли диапазона), % от минимума видимого окна.
 *  cycles  — мастер-циклы времени: вертикали через N баров от пивота. */
LUN.GANNTOOLS = {
  square: { base: '9', turns: 3 },
  retr:   { levels: [12.5, 25, 33.33, 37.5, 50, 62.5, 66.67, 75, 87.5] },
  cycles: { nums: [30, 45, 60, 90, 120, 144, 180, 270, 360] },
  // геометрия: масштаб 1×1 (цена на 1 бар; null = авто из видимого окна),
  // деления Gann Box (доли рамки по цене и времени).
  scale:  { unitPerBar: null },
  box:    { levels: [0, 0.25, 0.3333, 0.5, 0.6667, 0.75, 1] },
};

/* Timing Solutions-модуль: прогнозная линия циклов + композит. */
LUN.TS = { cycleK: 4, projBars: 120, compHorizon: 5 };

/* Астро-Ганн (двигатель эфемерид уже стоит — astro.js).
 *  frame        — 'geo' (зодиак с Земли) | 'helio'.
 *  pricePerDeg  — цена на 1° долготы для «планетарных линий». null = авто:
 *                 один оборот (360°) разворачивается на весь видимый диапазон.
 *  linePlanets / ingressPlanets / retroPlanets — какие тела показывать.
 *  planets      — глиф и цвет для отрисовки. */
LUN.ASTROGANN = {
  frame: 'geo',
  pricePerDeg: null,
  linePlanets:    ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'],
  ingressPlanets: ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'],
  retroPlanets:   ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'],
  fanPlanets:     ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'],
  sq9Planets:     ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'],
  // Bradley-стиль (сидерограф): набор тел, орб и потенциалы (медленные = сильнее)
  bradley: { planets: ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'], orb: 6,
             pot: { Sun: 6, Mercury: 1, Venus: 1, Mars: 2, Jupiter: 4, Saturn: 5, Uranus: 7, Neptune: 8, Pluto: 9 } },
  planets: {
    Sun:    { g: '☉', c: '#f0c040' }, Moon:    { g: '☾', c: '#cfd6e6' },
    Mercury:{ g: '☿', c: '#9aa7ff' }, Venus:   { g: '♀', c: '#7ad3a0' },
    Mars:   { g: '♂', c: '#ef6b6b' }, Jupiter: { g: '♃', c: '#e0a030' },
    Saturn: { g: '♄', c: '#b0803a' }, Uranus:  { g: '♅', c: '#59c3d0' },
    Neptune:{ g: '♆', c: '#6b8bd0' }, Pluto:   { g: '♇', c: '#a06bd0' },
  },
};

/* --- 5. Индикаторы --------------------------------------------------------- */
LUN.INDICATORS = {
  sma:  { periods: [20, 50], colors: ['#e0a030', '#e06040'] },
  ema:  { periods: [9, 21],  colors: ['#3aa0ff', '#9b6bff'] },
  vwap: {
    reset: 'month',          // 'month' — месячный, 'day' — внутридневной, 'none' — сплошной
    sigma: [1, 2],           // полосы ±1σ и ±2σ
    color: '#f0c040',
    bandColor: 'rgba(240,192,64,0.35)',
  },
};

/* Разделитель половины знака: 15° (середина). Ставится одна тонкая линия на 15°,
 * граница знака (30°/0°) — ярче. */
LUN.SIGN_SUBDIVISION = 15;

/* --- Шлюзы к MOEX ISS -------------------------------------------------------
 * Браузер не может ходить на ISS напрямую (нет CORS), поэтому пробуем по порядку:
 *   ''  — прямой запрос (сработает, если у сети/хостинга CORS всё же открыт);
 *   публичные CORS-шлюзы — оборачивают запрос и добавляют CORS (без своего сервера).
 * Первый рабочий запоминается. Порядок можно менять; можно вписать СВОЙ шлюз
 * (напр. Cloudflare Worker) — тогда данные пойдут надёжно и без задержек шлюзов.
 * wrap: (issUrl) => готовый URL. */
LUN.ISS_GATEWAYS = [
  { name: 'прямой',     wrap: (u) => u },
  { name: 'allorigins', wrap: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
  { name: 'corsproxy',  wrap: (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u) },
];

/* --- Новости (правая колонка, по текущему инструменту) ----------------------
 * RSS крупных СМИ тянутся через шлюзы, парсятся как XML и фильтруются по
 * ключевым словам инструмента. keywords по id инструмента; default — общий
 * экономический фон, если инструмент не в списке. Недоступные ленты молча
 * пропускаются. СМИ как контр-индикатор: часто ведут толпу не туда. */
LUN.NEWS = {
  feeds: [
    { name: 'РБК',    url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss' },
    { name: 'РИА',    url: 'https://ria.ru/export/rss2/economy/index.xml' },
    { name: '1ПРАЙМ', url: 'https://1prime.ru/export/rss2/index.xml' },
    { name: 'Лента',  url: 'https://lenta.ru/rss/news/economics' },
  ],
  keywords: {
    Si:   ['доллар', 'рубль', 'usd', 'валют', 'цб ', 'курс'],
    CNY:  ['юань', 'рубл', 'кита'],
    GOLD: ['золот', 'драгмет'],
    BR:   ['нефт', 'brent', 'опек', 'oil'],
    ED:   ['евро', 'eur', 'ецб'],
    SILV: ['серебр', 'silver'],
    BTC:  ['биткоин', 'bitcoin', 'крипт'],
    ETH:  ['эфир', 'ethereum', 'крипт'],
    SOL:  ['solana', 'крипт'],
  },
  default: ['экономик', 'рынок', 'ставк', 'инфляц', 'фрс', 'цб ', 'нефт', 'рубл'],
};

/* --- Марковские режимы -------------------------------------------------------
 * Состояние бара = доходность за window баров, разложенная на BEAR/SIDE/BULL.
 * Пороги: 'sigma' (k×сигма, адаптивно), 'quantile' (квантили распределения),
 * 'fixed' (жёсткий %, только для сверки с первоисточником).
 * astroProvider — вторая ось состояния: 'none' (чистая цена, базовая линия),
 * 'cycleZone' (bias зоны цикла), 'moonElement' (стихия знака Луны),
 * 'moonHalf' (половина знака), 'aspect' (аспект пары в орбе).
 * ВАЖНО: число состояний = 3 × размер астро-оси. Держать в пределах 9,
 * иначе матрица разреженная и статистики нет.
 * sampleMode: 'allLag' — все пары с лагом step (больше данных, наблюдения
 * перекрываются, поэтому n_эфф = n/step); 'grid' — несмежная сетка.
 * minObs — ниже этого эффективного числа наблюдений сигнал не выдаётся.
 * deadZone — модуль сигнала ниже порога считается отсутствием сигнала. */
LUN.MARKOV = {
  window: 20, step: 0,                 // step 0 = равен window
  thrMode: 'sigma', sigmaK: 1.0,
  qLow: 33, qHigh: 67, fixedPct: 5,
  thrLookback: 500,
  astroProvider: 'cycleZone', cycleId: 'cycle1',
  sampleMode: 'allLag',
  minObs: 20, horizon: 5, deadZone: 0.10,
};

/* --- Торговые сессии (фон на цене, интрадей) --------------------------------
 * from/to — часы в UTC (МСК = UTC+3). Полосы полупрозрачные; перекрытия
 * (Лондон+Нью-Йорк 13–16 UTC — самая ликвидность) видны как более тёмная зона.
 * На дневках/неделях не рисуется. Правь под себя (можно добавить MOEX
 * 07:00–15:45 UTC = 10:00–18:45 МСК). */
LUN.SESSIONS = [
  { name: 'Сидней',   from: 22, to: 6,  color: '#2a6f6f' },
  { name: 'Азия',     from: 0,  to: 9,  color: '#2c6fb0' },
  { name: 'Лондон',   from: 8,  to: 16, color: '#d19a2a' },
  { name: 'Нью-Йорк', from: 13, to: 22, color: '#3a9d5d' },
];

/* --- Арбитражные связки (синтетика + спред + z-score) ----------------------
 * formula:
 *   'triangle' — синтетика A/B×scale, спред = C − синтетика (расхождение = арб);
 *   'ratio'    — синтетический курс A/B×scale (нет эталона, просто синтетика);
 *   'diff'     — A − B.
 * legs: инструменты как в INSTRUMENTS (provider/assetCode/ticker). Считается по
 * текущему ТФ активного графика, выравнивание по времени. z=|спред−среднее|/σ. */
LUN.ARB = [
  { id: 'eurusd', title: 'EUR/USD: Eu/Si ↔ ED', formula: 'triangle', scale: 1,
    legs: { A: { provider: 'moex', assetCode: 'Eu', ticker: 'EuU6', pricePrecision: 0 },
            B: { provider: 'moex', assetCode: 'Si', ticker: 'SiU6', pricePrecision: 0 },
            C: { provider: 'moex', assetCode: 'ED', ticker: 'EDU6', pricePrecision: 4 } } },
  { id: 'usdcnh', title: 'USD/CNH синт.: Si/CNY', formula: 'ratio', scale: 1,
    legs: { A: { provider: 'moex', assetCode: 'Si', ticker: 'SiU6' },
            B: { provider: 'moex', assetCode: 'CNY', ticker: 'CRU6' } } },
];

/* Высоты панелей (px) */
LUN.PANE_HEIGHTS = { moonSign: 42, cycle: 26, volume: 90 };
