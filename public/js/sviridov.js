/* =============================================================================
 *  sviridov.js — аспекты у точки/на разворотах + двухполярная динамика (Свиридов)
 * =============================================================================
 *  Идея П. Свиридова: гармоничные (зелёные) и напряжённые (красные) аспекты —
 *  два ОТДЕЛЬНЫХ ряда на одной шкале, которые пересекаются (баланс поддержки и
 *  напряжения), а не гасят друг друга в одной сумме (как у Bradley).
 *
 *  window.LunSvir:
 *    aspectsAround(ts, days, cfg) — точные аспекты в окне ±days вокруг даты;
 *    dynAt(ts, cfg)              — {green, red} суммарная сила в момент ts.
 *  Классификация зелёный/красный, набор планет и аспектов — настраиваемы
 *  (window.LUN.SVIR). Всё гео, только долготы. ЭКСПЕРИМЕНТ.
 * ===========================================================================*/
(function () {
  const ALLP = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'NNode'];
  const POT = { Sun: 6, Moon: 6, Mercury: 1, Venus: 2, Mars: 3, Jupiter: 4, Saturn: 5, Uranus: 7, Neptune: 8, Pluto: 9, NNode: 4 };
  const SYM = { 0: '☌', 60: '⚹', 90: '□', 120: '△', 180: '☍', 30: '⚺', 45: '∠', 135: '⚼', 150: '⚻', 72: 'Q' };
  const G = (p) => ((window.LUN.ASTROGANN && window.LUN.ASTROGANN.planets[p]) || { g: p }).g;
  const sep = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const cfg0 = () => window.LUN.SVIR || { planets: ALLP, green: [60, 120], red: [90, 180], neutral0: 'green', orb: 2, frame: 'geo' };
  // через bodyInfo — он кэширует по минуте (быстрые перерисовки не пересчитывают)
  const lon = (p, ts, frame) => window.LunAstro.bodyInfo(p, ts, frame || 'geo').lon;

  // цвет аспекта по настройкам: 'green' | 'red' | null
  function colorOf(angle, cfg) {
    if (angle === 0) return cfg.neutral0 === 'off' ? null : cfg.neutral0;
    if ((cfg.green || []).indexOf(angle) >= 0) return 'green';
    if ((cfg.red || []).indexOf(angle) >= 0) return 'red';
    return null;
  }

  // все точные аспекты в окне ±days вокруг ts (пересечение долготной разницы с углом)
  function aspectsAround(ts, days, cfg) {
    cfg = cfg || cfg0(); const frame = cfg.frame || 'geo';
    const PL = cfg.planets || ALLP;
    const angles = []; (cfg.green || []).concat(cfg.red || []).forEach((a) => { if (angles.indexOf(a) < 0) angles.push(a); });
    if (cfg.neutral0 !== 'off' && angles.indexOf(0) < 0) angles.push(0);
    const from = ts - days * 86400000, to = ts + days * 86400000, step = 6 * 3600000;
    const out = [];
    for (let i = 0; i < PL.length; i++) for (let j = i + 1; j < PL.length; j++) {
      const a = PL[i], b = PL[j];
      angles.forEach((ang) => {
        let prevDiff = null, prevT = null;
        for (let t = from; t <= to; t += step) {
          const s = sep(lon(a, t, frame), lon(b, t, frame));
          const diff = s - ang;
          if (prevDiff != null && (prevDiff < 0) !== (diff < 0) && Math.abs(diff - prevDiff) < 30) {
            const frac = prevDiff / (prevDiff - diff);           // линейная интерполяция момента
            const exT = prevT + frac * step;
            const col = colorOf(ang, cfg); if (!col) continue;
            out.push({ a, b, angle: ang, sym: SYM[ang] || (ang + '°'), color: col, exactTs: exT });
          }
          prevDiff = diff; prevT = t;
        }
      });
    }
    out.sort((u, v) => u.exactTs - v.exactTs);
    return out;
  }

  // суммарная сила поддержки/напряжения в момент ts (транзит-транзит, в орбе)
  function dynAt(ts, cfg) {
    cfg = cfg || cfg0(); const frame = cfg.frame || 'geo', orb = cfg.orb || 2;
    const PL = cfg.planets || ALLP; let green = 0, red = 0;
    for (let i = 0; i < PL.length; i++) for (let j = i + 1; j < PL.length; j++) {
      const a = PL[i], b = PL[j], s = sep(lon(a, ts, frame), lon(b, ts, frame));
      const all = (cfg.green || []).map((x) => [x, 'green']).concat((cfg.red || []).map((x) => [x, 'red']));
      if (cfg.neutral0 !== 'off') all.push([0, cfg.neutral0]);
      for (const [ang, col] of all) {
        const off = Math.abs(s - ang);
        if (off <= orb) { const w = ((POT[a] || 1) + (POT[b] || 1)) * (1 - off / orb); if (col === 'green') green += w; else red += w; break; }
      }
    }
    return { green, red };
  }

  window.LunSvir = { ALLP, POT, G, aspectsAround, dynAt, colorOf, SYM };
})();
