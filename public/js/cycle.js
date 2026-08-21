/* =============================================================================
 *  cycle.js — астрономические каркасы-таймеры (window.LunCycle)
 * =============================================================================
 *  Метод Маслова: цикл Меркурий–Солнце как скелет волн (для валют — Луна–Солнце).
 *  Здесь — только ВЫЧИСЛИМАЯ часть: точные события этапов. Никакой интерпретации
 *  «рост/падение» тут нет (направление проверяется Монте-Карло, а не постулируется).
 *
 *  Цикл Меркурий–Солнце, 4 события этапа:
 *    retro     — Меркурий → ретроградное движение (стоянка);
 *    inferior  — нижнее соединение с Солнцем (Меркурий ретро);
 *    direct    — Меркурий → директное движение (стоянка);
 *    superior  — верхнее соединение с Солнцем (Меркурий директ).
 *  Цикл Луна–Солнце: 4 фазы (new / fq / full / lq).
 * ===========================================================================*/
(function () {
  const D = 86400000;
  const lon = (b, ts) => window.LunAstro.lonOf(b, ts, 'geo');
  const signedSep = (a, b) => { let d = (a - b) % 360; if (d > 180) d -= 360; else if (d < -180) d += 360; return d; };
  function speed(b, ts) { let d = signedSep(lon(b, ts + 0.25 * D), lon(b, ts - 0.25 * D)); return d / 0.5; }   // °/сут
  const norm = (x) => ((x % 360) + 360) % 360;

  const _cache = new Map();
  // события этапов цикла Меркурий–Солнце в [fromTs,toTs]
  function mercSunStages(fromTs, toTs) {
    const key = 'm|' + Math.floor(fromTs / D) + '|' + Math.floor(toTs / D);
    const hit = _cache.get(key); if (hit) return hit;
    const ev = [];
    let prevSpd = speed('Mercury', fromTs), prevE = signedSep(lon('Mercury', fromTs), lon('Sun', fromTs));
    for (let ts = fromTs + D; ts <= toTs; ts += D) {
      const spd = speed('Mercury', ts), e = signedSep(lon('Mercury', ts), lon('Sun', ts));
      if (prevSpd < 0 !== spd < 0) ev.push({ ts: ts - D / 2, kind: spd < 0 ? 'retro' : 'direct' });   // смена знака скорости = стоянка
      if (prevE < 0 !== e < 0 && Math.abs(e - prevE) < 180) ev.push({ ts: ts - D / 2, kind: spd < 0 ? 'inferior' : 'superior' });  // прохождение соединения
      prevSpd = spd; prevE = e;
    }
    ev.sort((a, b) => a.ts - b.ts);
    if (_cache.size > 200) _cache.clear(); _cache.set(key, ev); return ev;
  }
  // фазы Луны (new/fq/full/lq) в [fromTs,toTs]
  function moonSunStages(fromTs, toTs) {
    const key = 'l|' + Math.floor(fromTs / D) + '|' + Math.floor(toTs / D);
    const hit = _cache.get(key); if (hit) return hit;
    const ev = []; const phase = (ts) => norm(lon('Moon', ts) - lon('Sun', ts));
    const targets = [[0, 'new'], [90, 'fq'], [180, 'full'], [270, 'lq']];
    let prev = phase(fromTs);
    for (let ts = fromTs + D; ts <= toTs; ts += D) {
      const cur = phase(ts);
      targets.forEach(([deg, name]) => {
        // пересечение целевого угла (с учётом оборота 360→0)
        const a = norm(prev - deg), b = norm(cur - deg);
        if (a > 270 && b < 90) ev.push({ ts: ts - D / 2, kind: name });
      });
      prev = cur;
    }
    ev.sort((a, b) => a.ts - b.ts);
    if (_cache.size > 200) _cache.clear(); _cache.set(key, ev); return ev;
  }
  function stages(cycle, fromTs, toTs) { return cycle === 'moon' ? moonSunStages(fromTs, toTs) : mercSunStages(fromTs, toTs); }

  window.LunCycle = { mercSunStages, moonSunStages, stages };
})();
