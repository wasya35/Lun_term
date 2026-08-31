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

/* Цвета аспектов (по углу) — общие, редактируются в ⚙ Настройках.
 * соединение оранжевый · секстиль голубой · квадрат красный · трин зелёный ·
 * оппозиция фиолетовый. */
LUN.ASPECT_COLORS = { 0: '#e0a030', 60: '#4bb4e6', 90: '#ef5350', 120: '#26a69a', 180: '#9b6bff' };

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

/* Юзернейм Telegram-бота для привязки алертов (без @). Пусто = показываем
 * только код, ссылку не строим. Токен бота кладётся на СЕРВЕР (lun_data/tg_token.txt). */
LUN.TG_BOT = '';

/* Экстремальные изменения открытого интереса (ΔОИ день-к-дню). Три порога
 * по КОНТРАКТУ (по коду актива): [заметный, крупный, экстремальный]. Крупный
 * приток/отток ОИ часто предшествует сильному движению. Для неизвестного кода
 * пороги считаются автоматически по квантилям |ΔОИ| (autoPct). */
LUN.OI_EXTREMES = {
  thresholds: {
    Si:   [5000, 40000, 100000],
    CNY:  [10000, 80000, 200000],
    GOLD: [3000, 20000, 60000], GD: [3000, 20000, 60000],
    BR:   [2000, 15000, 40000],
    ED:   [2000, 10000, 30000],
    SILV: [1000, 6000, 15000], SV: [1000, 6000, 15000],
  },
  autoPct: [0.85, 0.95, 0.99],
};

/* Спот исходного товара для базиса (фьюч − спот). Базис считаем регрессией
 * fut ~ spot (МНК), остаток = «дорого/дёшево» фьюча к споту — так множитель
 * контракта подбирается сам, не надо знать номинал. Экстремум остатка = сдвиг
 * керри / хедж-давление (в т.ч. внебиржевое). */
LUN.SPOT_MAP = {
  Si:   { secid: 'USD000UTSTOM', engine: 'currency', market: 'selt', title: 'USD/RUB спот' },
  CNY:  { secid: 'CNYRUB_TOM',   engine: 'currency', market: 'selt', title: 'CNY/RUB спот' },
  GOLD: { secid: 'GLDRUB_TOM',   engine: 'currency', market: 'selt', title: 'Золото спот' },
  GD:   { secid: 'GLDRUB_TOM',   engine: 'currency', market: 'selt', title: 'Золото спот' },
  SILV: { secid: 'SLVRUB_TOM',   engine: 'currency', market: 'selt', title: 'Серебро спот' },
};
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
LUN.FORECAST = { bodyA: 'Sun', bodyB: 'Uranus', frame: 'helio', maxBars: 500, quarters: 1 };

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

/* Модуль «Прогностика»: прогнозная линия циклов + композит. */
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

/* --- Синастрия / «Личные данные» -------------------------------------------
 * Даты «рождения» бирж (первые торги / основание) для синастрии.
 *   ts   — UTC-миллисекунды момента рождения (примерно, но стабильно).
 *   note — пояснение.
 * Трейдер задаётся в UI и хранится в аккаунте/localStorage.
 * Инструмент — по дате первой свечи (или вручную). ЭКСПЕРИМЕНТ. */
/* Синастрия-динамика: режим отрисовки RI(t).
 *   'signed' — одна знаковая кривая (гармония + / напряжение −);
 *   'polar'  — две полярности (🟢 поддержка / 🔴 напряжение), по Свиридову;
 *   'both'   — знаковая линия + фон полярностей. */
LUN.SYN = { mode: 'both' };

/* Барометр аспектов: 'signed' (1 знаковая линия) | 'polar' (2 полярности, Свиридов). */
LUN.BAR = { mode: 'signed' };

/* Свиридов: набор планет и распределение аспектов на зелёные (гармония) и
 * красные (напряжение). neutral0 — куда относить соединение (green/red/off).
 * Правится в «Астро → Свиридов: настройки». */
LUN.SVIR = {
  planets: ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'NNode'],
  green: [60, 120],
  red: [90, 180],
  neutral0: 'green',
  orb: 2,
  frame: 'geo',
  windowDays: 1,
};

/* Позиция (paper): R:R по умолчанию (риск = вознаграждение / rr). */
LUN.POS = { rr: 2 };

/* Стиль инструментов Ганна (ручная настройка): размер подписей/цифр уровней,
 * толщина линий, тип линии (solid/dashed), цвет уровней. Индикаторы Ганна
 * читают это. Правится в «Ганн → Настройки стиля». */
LUN.GSTYLE = { textSize: 11, lineWidth: 1, lineStyle: 'solid', levelColor: '#e0d060' };

/* Каркас Маслова: какой цикл рисуем — 'merc' (Меркурий–Солнце, товары/акции)
 * или 'moon' (Луна–Солнце, валюты). Индикатор читает window.LUN_MASLOV. */
window.LUN_MASLOV = window.LUN_MASLOV || { cycle: 'merc' };

LUN.NATAL = {
  exchanges: [
    { id: 'moex',    title: 'MOEX (ММВБ)',   date: '1992-01-09T10:00:00Z', note: 'первые торги ММВБ' },
    { id: 'rts',     title: 'РТС',           date: '1995-09-01T10:00:00Z', note: 'старт РТС' },
    { id: 'nyse',    title: 'NYSE',          date: '1792-05-17T14:00:00Z', note: 'Buttonwood Agreement' },
    { id: 'nasdaq',  title: 'NASDAQ',        date: '1971-02-08T14:30:00Z', note: 'первые торги' },
    { id: 'cme',     title: 'CME',           date: '1898-04-01T14:00:00Z', note: 'основание' },
    { id: 'binance', title: 'Binance',       date: '2017-07-14T00:00:00Z', note: 'запуск' },
    { id: 'bybit',   title: 'Bybit',         date: '2018-11-01T00:00:00Z', note: 'запуск' },
  ],
};

/* --- Аспекты по выбору (пользовательский аспектариум) -----------------------
 * Тела, доступные для выбора (с глифами), включая узлы Луны (Раху/Кету).
 * Блоки задаются в UI: {who:'Sun', whom:['Moon','Saturn']} — до 5 блоков,
 * в каждом до 3 «с кем». Индикатор AspectSelect рисует ленты аспектов во
 * времени. Орб — общий. */
LUN.ASPSEL = {
  bodies: [
    { id: 'Sun', g: '☉' }, { id: 'Moon', g: '☾' }, { id: 'Mercury', g: '☿' }, { id: 'Venus', g: '♀' },
    { id: 'Mars', g: '♂' }, { id: 'Jupiter', g: '♃' }, { id: 'Saturn', g: '♄' }, { id: 'Uranus', g: '♅' },
    { id: 'Neptune', g: '♆' }, { id: 'Pluto', g: '♇' }, { id: 'NNode', g: '☊' }, { id: 'SNode', g: '☋' },
  ],
  orb: 5,
  frame: 'geo',
  blocks: [],
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
  // Мульти-VWAP: до трёх одновременных якорей (день/неделя/месяц/все бары).
  // Осевой цвет — по типу якоря; полосы 1σ/2σ пунктирные, вдвое/вчетверо светлее
  // оси (считаются в indicators.js). День и неделя — без сигм по умолчанию.
  vwapList: [
    { on: true,  reset: 'day',   bands: false, sigma: [1, 2], color: '#1f9fe0' }, // сине-голубой
    { on: false, reset: 'week',  bands: false, sigma: [1, 2], color: '#15803a' }, // тёмно-зелёный
    { on: false, reset: 'month', bands: true,  sigma: [1, 2], color: '#d23af0' }, // ярко розово-фиолетовый
  ],
};
// осевые цвета VWAP по типу якоря (для миграции старых сохранённых наборов)
LUN.VWAP_AXIS_COLOR = { day: '#1f9fe0', week: '#15803a', month: '#d23af0', all: '#e0a030' };
LUN.VWAP_OLD_DEFAULTS = ['#f0c040', '#4aa3df', '#26a69a'];

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
  { name: 'codetabs',   wrap: (u) => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u) },
  { name: 'thingproxy', wrap: (u) => 'https://thingproxy.freeboard.io/fetch/' + u },
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
    { name: 'Финам',  url: 'https://www.finam.ru/analysis/conews/rsspoint/' },
    { name: 'Investing', url: 'https://ru.investing.com/rss/news.rss' },
  ],
  // Ключи описывают ИСХОДНЫЙ ТОВАР/актив (нефть, золото, доллар…), а НЕ тикер
  // фьюча: по SiU6/BRV6 прессы почти нет, а по нефти/золоту/доллару — вагон.
  keywords: {
    Si:   ['доллар', 'рубл', 'usd/rub', 'usd ', 'валют', 'цб ', 'курс', 'бакс', 'ключевая ставка', 'минфин'],
    CNY:  ['юан', 'рубл', 'кита', 'cny', 'народный банк кита'],
    GOLD: ['золот', 'драгмет', 'xau', 'gold', 'унци', 'слитк'],
    BR:   ['нефт', 'brent', 'brent', 'urals', 'опек', 'opec', 'oil', 'баррел', 'wti', 'нефтян', 'котировк нефт'],
    ED:   ['евро', 'eur', 'ецб', 'ecb', 'eur/usd'],
    SILV: ['серебр', 'silver', 'xag', 'драгмет'],
    BTC:  ['биткоин', 'bitcoin', 'btc', 'крипт'],
    ETH:  ['эфир', 'ethereum', 'eth', 'крипт'],
    SOL:  ['solana', 'sol ', 'крипт'],
  },
  default: ['экономик', 'рынок', 'ставк', 'инфляц', 'фрс', 'цб ', 'нефт', 'рубл', 'золот'],
  // Профильные ТОВАРНЫЕ ленты — добавляются к общим по инструменту (нефть/золото).
  commodityFeeds: {
    BR:   [{ name: 'OilPrice', url: 'https://oilprice.com/rss/main' }, { name: 'Investing-Нефть', url: 'https://ru.investing.com/rss/commodities_Crude%20Oil.rss' }],
    GOLD: [{ name: 'Mining.com', url: 'https://www.mining.com/feed/' }, { name: 'Investing-Золото', url: 'https://ru.investing.com/rss/commodities_Gold.rss' }],
    GD:   [{ name: 'Mining.com', url: 'https://www.mining.com/feed/' }, { name: 'Investing-Золото', url: 'https://ru.investing.com/rss/commodities_Gold.rss' }],
    SILV: [{ name: 'Mining.com', url: 'https://www.mining.com/feed/' }],
    Si:   [{ name: 'Investing-USD/RUB', url: 'https://ru.investing.com/rss/currencies_USD-RUB.rss' }],
  },
  // ленты крипто-рынка (RU+EN); для акций США добавляется Yahoo по тикеру
  cryptoEnFeeds: [
    { name: 'РБК-Крипто', url: 'https://www.rbc.ru/crypto/rss' },
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  ],
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
