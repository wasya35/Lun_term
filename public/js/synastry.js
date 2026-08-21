/* =============================================================================
 *  synastry.js — синастрия (window.LunSynastry): сравнение натальных карт
 * =============================================================================
 *  У трейдера, биржи и инструмента есть
 *  «карта рождения» (дата/время). Синастрия — межаспекты между двумя картами
 *  (гармония +, напряжение −). Динамика во времени — как транзиты неба
 *  активируют обе карты (RI(t)). Всё ГЕОцентр, только долготы (без домов).
 *  ЭКСПЕРИМЕНТ финансовой астрологии — не доказанная методика.
 * ===========================================================================*/
(function () {
  const PL = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  const POT = { Sun: 6, Moon: 6, Mercury: 1, Venus: 2, Mars: 3, Jupiter: 4, Saturn: 5, Uranus: 7, Neptune: 8, Pluto: 9 };
  const G = (p) => ((window.LUN.ASTROGANN && window.LUN.ASTROGANN.planets[p]) || { g: p }).g;
  const ASP = [{ a: 0, s: 1, n: '☌' }, { a: 60, s: 1, n: '⚹' }, { a: 90, s: -1, n: '□' }, { a: 120, s: 1, n: '△' }, { a: 180, s: -1, n: '☍' }];
  const sep = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  function natal(ts) { const o = {}; PL.forEach((p) => { o[p] = window.LunAstro.bodyInfo(p, ts, 'geo').lon; }); return o; }
  function synastry(A, B, orb) {
    orb = orb || 6; const pairs = []; let score = 0;
    PL.forEach((a) => PL.forEach((b) => {
      const s = sep(A[a], B[b]);
      for (const x of ASP) { const off = Math.abs(s - x.a); if (off <= orb) { const w = x.s * ((POT[a] || 1) + (POT[b] || 1)) * (1 - off / orb); score += w; pairs.push({ a, b, asp: x.n, angle: x.a, sign: x.s, w }); break; } }
    }));
    pairs.sort((u, v) => Math.abs(v.w) - Math.abs(u.w));
    return { pairs: pairs.slice(0, 24), score };
  }
  // небо на момент ts (можно исключить Луну — на длинных горизонтах она «рябит»)
  function sky(ts, noMoon) { const o = {}; PL.forEach((p) => { if (noMoon && p === 'Moon') return; o[p] = window.LunAstro.bodyInfo(p, ts, 'geo').lon; }); return o; }
  // РАЗДЕЛЬНО: гармония (pos, зелёная) и напряжение (neg, красная) — по Свиридову
  function riSplit(ts, points, orb, noMoon) {
    orb = orb || 6; const s = sky(ts, noMoon); let pos = 0, neg = 0;
    Object.keys(s).forEach((k) => points.forEach((n) => { const d = sep(s[k], n); for (const x of ASP) { const off = Math.abs(d - x.a); if (off <= orb) { const w = (POT[k] || 1) * (1 - off / orb); if (x.s > 0) pos += w; else neg += w; break; } } }));
    return { pos: pos, neg: neg };
  }
  // ЗНАКОВАЯ активация обеих карт транзитами (гармония + / напряжение −)
  function riAt(ts, points, orb, noMoon) { const r = riSplit(ts, points, orb, noMoon); return r.pos - r.neg; }
  window.LunSynastry = { PL, POT, G, natal, synastry, riAt, riSplit };
})();
