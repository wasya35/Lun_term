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
LUN.INSTRUMENTS = [
  { id: 'Si',  title: 'Si · USD/RUB',  assetCode: 'Si',  ticker: 'SiU6', pricePrecision: 0, volumePrecision: 0 },
  { id: 'CNY', title: 'CNY · CNY/RUB', assetCode: 'CNY', ticker: 'CRU6', pricePrecision: 3, volumePrecision: 0 },
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

/* --- 5. Индикаторы --------------------------------------------------------- */
LUN.INDICATORS = {
  sma:  { periods: [20, 50] },
  ema:  { periods: [9, 21] },
  vwap: {
    reset: 'day',            // 'day' — внутридневной VWAP, 'none' — сплошной
    sigma: [1, 2],           // полосы ±1σ и ±2σ
    color: '#f0c040',
    bandColor: 'rgba(240,192,64,0.35)',
  },
};

/* Разбивка знака на деканы по 10° в ленте (тонкие разделители) */
LUN.SIGN_SUBDIVISION = 10;

/* Высоты панелей (px) */
LUN.PANE_HEIGHTS = { moonSign: 42, cycle: 26, volume: 90 };
