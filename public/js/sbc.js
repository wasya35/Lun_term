/* =============================================================================
 *  sbc.js — Сарватобхадра-чакра (window.LunSBC): ведха-скаляр в сидерике (джйотиш)
 * =============================================================================
 *  Порт логики авторского Python-бота (sbc_auto_v5) на JS, с ЧЕСТНЫМИ едиными
 *  настройками: без подгонки под конкретный инструмент, без «торговых сигналов».
 *  Выход — гладкий скаляр SBC(t) ≈ −5…+5 (как барометр Bradley), который
 *  проверяется Монте-Карло (LunMC), а не выдаётся как сигнал ЛОНГ/ШОРТ.
 *
 *  Механика (чисто арифметическая):
 *   • сидерические долготы = тропические (astronomy-engine) − аянамша Лахири;
 *   • накшатра = floor(sid/13°20′); джанма = накшатра натальной Луны инструмента;
 *   • ведха по скорости: норма→Агра(фронт), быстро→Пара(право), ретро→Приштха
 *     (лево); Солнце/Луна→все три; Раху/Кету→Приштха;
 *   • сила: экзальт ×3, дебил ×0.5(×1 ретро), ретро усиливает, узлы ×2;
 *   • бенефик (Юпитер/Венера, Луна в растущей фазе) +, малефик −;
 *   • +1/−1 за фазу Луны, +полбалла если натальная Луна инструмента активна.
 *  Абхиджит включён в таблицы ведх как цель (как в оригинале). ЭКСПЕРИМЕНТ.
 * ===========================================================================*/
(function () {
  const NAK = ['Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира', 'Ардра',
    'Пунарвасу', 'Пушья', 'Ашлеша', 'Магха', 'П.Фалгуни', 'У.Фалгуни',
    'Хаста', 'Читра', 'Свати', 'Вишакха', 'Анурадха', 'Джьештха',
    'Мула', 'П.Ашадха', 'У.Ашадха', 'Шравана', 'Дхаништха', 'Шатабхиша',
    'П.Бхадра', 'У.Бхадра', 'Ревати'];                  // 27; Абхиджит — только как цель ведхи
  const NUM_NAK = (n) => NAK[((n - 1) % 27 + 27) % 27]; // 1..27 → имя
  const RASI = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
  const THRESH = { Mars: 0.650, Mercury: 1.746, Jupiter: 0.206, Venus: 1.229, Saturn: 0.091 };
  const DIGNITY = { Sun: { e: 'Овен', d: 'Весы' }, Moon: { e: 'Телец', d: 'Скорпион' },
    Mars: { e: 'Козерог', d: 'Рак' }, Mercury: { e: 'Дева', d: 'Рыбы' },
    Jupiter: { e: 'Рак', d: 'Козерог' }, Venus: { e: 'Рыбы', d: 'Дева' },
    Saturn: { e: 'Весы', d: 'Овен' }, Rahu: { e: 'Телец', d: 'Скорпион' }, Ketu: { e: 'Скорпион', d: 'Телец' } };
  const ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  const BODY = { Sun: 'Sun', Moon: 'Moon', Mars: 'Mars', Mercury: 'Mercury', Jupiter: 'Jupiter', Venus: 'Venus', Saturn: 'Saturn', Rahu: 'NNode', Ketu: 'SNode' };

  const VEDHA = {
    'Агра': [['Криттика', 'Анурадха'], ['Рохини', 'Джьештха'], ['Мригашира', 'Мула'],
      ['Ардра', 'П.Ашадха'], ['Пунарвасу', 'У.Ашадха'], ['Пушья', 'Абхиджит'],
      ['Ашлеша', 'Шравана'], ['Дхаништха', 'Магха'], ['Шатабхиша', 'П.Фалгуни'],
      ['П.Бхадра', 'У.Фалгуни'], ['У.Бхадра', 'Хаста'], ['Ревати', 'Читра'],
      ['Ашвини', 'Свати'], ['Бхарани', 'Вишакха']],
    'Пара': [['Криттика', 'Дхаништха'], ['Рохини', 'Шатабхиша'], ['Мригашира', 'П.Бхадра'],
      ['Ардра', 'У.Бхадра'], ['Пунарвасу', 'Ревати'], ['Пушья', 'Ашвини'],
      ['Ашлеша', 'Бхарани'], ['Магха', 'Анурадха'], ['П.Фалгуни', 'Джьештха'],
      ['У.Фалгуни', 'Мула'], ['Хаста', 'П.Ашадха'], ['Читра', 'У.Ашадха'],
      ['Свати', 'Абхиджит'], ['Вишакха', 'Шравана']],
    'Приштха': [['Криттика', 'Вишакха'], ['Рохини', 'Свати'], ['Мригашира', 'Читра'],
      ['Ардра', 'Хаста'], ['Пунарвасу', 'У.Фалгуни'], ['Пушья', 'П.Фалгуни'],
      ['Ашлеша', 'Магха'], ['Анурадха', 'Бхарани'], ['Джьештха', 'Ашвини'],
      ['Мула', 'Ревати'], ['П.Ашадха', 'У.Бхадра'], ['У.Ашадха', 'П.Бхадра'],
      ['Абхиджит', 'Шатабхиша'], ['Шравана', 'Дхаништха']],
  };
  const VMAP = {};
  Object.keys(VEDHA).forEach((vt) => VEDHA[vt].forEach((pair) => {
    [[pair[0], pair[1]], [pair[1], pair[0]]].forEach(([a, b]) => {
      (VMAP[a] = VMAP[a] || {}); (VMAP[a][vt] = VMAP[a][vt] || new Set()).add(b);
    });
  }));

  // 9 чувствительных накшатр от джанмы (Tara-схема), с весами (по умолч. 1.0)
  const SENS_POS = [1, 10, 16, 18, 19, 23, 25, 26, 27];
  const SENS_LBL = ['Джанма', 'Карма', 'Сангхатика', 'Удайа', 'Адхана', 'Винаша', 'Манас', 'Раджа', 'Абхишека'];
  function sensOf(janma, weights) {
    weights = weights || {}; const o = {};
    SENS_POS.forEach((p, i) => { o[NUM_NAK((janma - 1 + p - 1) % 27 + 1)] = { lbl: SENS_LBL[i], w: weights[SENS_LBL[i]] || 1.0 }; });
    return o;
  }

  const norm = (x) => ((x % 360) + 360) % 360;
  // положение планеты в сидерике на ts: {lon, speed(°/сут), nak, rasi}
  function planet(ts, body) {
    const A = window.LunAstro, b = BODY[body];
    const lon = A.sidLonOf(b, ts, 'geo');
    const dt = 0.25;                                     // ±6ч для скорости
    let l1 = A.sidLonOf(b, ts - dt * 86400000, 'geo'), l2 = A.sidLonOf(b, ts + dt * 86400000, 'geo');
    let d = l2 - l1; if (d > 180) d -= 360; else if (d < -180) d += 360;
    const speed = d / (2 * dt);
    return { lon: lon, speed: speed, nak: NAK[Math.floor(norm(lon) / (360 / 27))], rasi: RASI[Math.floor(norm(lon) / 30)] };
  }
  const _pcache = new Map();                            // положения планет по дню (не зависят от джанмы)
  function allPlanets(ts) {
    const key = Math.floor(ts / 86400000);
    const hit = _pcache.get(key); if (hit) return hit;
    const o = {}; ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'].forEach((p) => { o[p] = planet(ts, p); });
    if (_pcache.size > 8000) _pcache.clear(); _pcache.set(key, o); return o;
  }
  function vtypeOf(pl, speed, sunMode) {
    if (pl === 'Sun') return sunMode === 'agra' ? ['Агра'] : ['Агра', 'Пара', 'Приштха'];
    if (pl === 'Moon') return ['Агра', 'Пара', 'Приштха'];
    if (pl === 'Rahu' || pl === 'Ketu') return ['Приштха'];
    if (speed < 0) return ['Приштха'];
    const t = THRESH[pl]; if (t && speed > t) return ['Пара'];
    return ['Агра'];
  }
  function multOf(pl, rasi, spd) {
    if (pl === 'Rahu' || pl === 'Ketu') return 2.0;
    const d = DIGNITY[pl] || {}, retro = spd < 0;
    if (rasi === d.e) return 3.0;
    if (rasi === d.d) return retro ? 1.0 : 0.5;
    return retro ? 2.0 : 1.0;
  }
  // основной балл на момент ts (кэш по дню — СБЧ суточная величина)
  const _cache = new Map();
  function scoreAt(ts, cfg) {
    cfg = cfg || {}; const sunMode = cfg.sunVedha || 'all3';
    const key = Math.floor(ts / 86400000) + '|' + (cfg.janma || 1) + '|' + sunMode;
    const hit = _cache.get(key); if (hit !== undefined) return hit;
    const v = _scoreAt(ts, cfg, sunMode); if (_cache.size > 20000) _cache.clear(); _cache.set(key, v); return v;
  }
  function _scoreAt(ts, cfg, sunMode) {
    const sens = sensOf(cfg.janma || 1, cfg.weights);
    const P = allPlanets(ts);
    const ml = P.Moon.lon, sl = P.Sun.lon;
    const tithi = Math.floor(norm(ml - sl) / 12) + 1, mb = tithi >= 5 && tithi <= 25;
    let b = 0, m = 0;
    ORDER.forEach((pl) => {
      const p = P[pl], nak = p.nak, vts = vtypeOf(pl, p.speed, sunMode), mul = multOf(pl, p.rasi, p.speed);
      const isBen = pl === 'Moon' ? mb : (pl === 'Jupiter' || pl === 'Venus');
      vts.forEach((v) => {
        const targets = (VMAP[nak] && VMAP[nak][v]) || null; if (!targets) return;
        targets.forEach((tgt) => { if (sens[tgt]) { const c = mul * sens[tgt].w; if (isBen) b += c; else m += c; } });
      });
    });
    const mp = mb ? 1 : -1;
    let ms = 0; const mnak = P.Moon.nak; if (sens[mnak]) ms = 0.5 * mp * sens[mnak].w;
    return Math.round((b - m + mp + ms) * 100) / 100;
  }
  // джанма-накшатра (1..27) = накшатра натальной Луны инструмента
  function janmaOf(natalTs) { return Math.floor(norm(window.LunAstro.sidLonOf('Moon', natalTs, 'geo')) / (360 / 27)) + 1; }

  window.LunSBC = { NAK, RASI, scoreAt, janmaOf, planet, allPlanets, sensOf };
})();
