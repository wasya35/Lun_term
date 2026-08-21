/* =============================================================================
 *  astro.js — положение небесных тел через astronomy-engine (window.Astronomy)
 * =============================================================================
 *  bodyInfo(body, tsMillis) -> { lon, signIndex, degInSign }
 *    body       — 'Moon' | 'Sun' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' |
 *                 'Saturn' | 'Uranus' | 'Neptune' | 'Pluto'
 *    lon        — эклиптическая долгота «на дату», 0..360 (0° = 0° Овна)
 *    signIndex  — индекс знака 0..11 (0 = Овен) = floor(lon/30)
 *    degInSign  — градусы в текущем знаке, 0..30
 *  moonInfo(ts) — то же для Луны (короткий алиас).
 *  zoneOf(lon, zones) — зона цикла, в которую попадает долгота (или null).
 *
 *  Кэш по (тело, время до минуты): за минуту даже Луна смещается на ~0.009°.
 * ===========================================================================*/
(function () {
  const A = window.Astronomy;
  if (!A) { console.error('[astro] astronomy-engine (window.Astronomy) не загружен'); }

  const cache = new Map();

  // frame: 'geo' (геоцентр, как видно с Земли — знаки зодиака) |
  //        'helio' (гелиоцентр; «Солнце» = позиция Земли, Луна — только гео)
  // Средний узел Луны (Раху, восходящий) — попятный. Кету = Раху + 180°.
  // Долгота даётся в тропическом зодиаке (как остальные тела здесь).
  function meanNodeLon(date) {
    const jd = date.getTime() / 86400000 + 2440587.5, T = (jd - 2451545.0) / 36525;
    let om = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000;
    return ((om % 360) + 360) % 360;
  }
  function longitude(body, date, frame) {
    if (body === 'NNode' || body === 'Rahu') return meanNodeLon(date);
    if (body === 'SNode' || body === 'Ketu') return (meanNodeLon(date) + 180) % 360;
    let vec;
    if (frame === 'helio' && body !== 'Moon') {
      const b = (body === 'Sun') ? 'Earth' : body;      // гелио-«Солнце» = направление на Землю
      vec = A.HelioVector(A.Body[b], date);
    } else {
      vec = A.GeoVector(A.Body[body], date, true);
    }
    const ecl = A.Ecliptic(vec);
    return ((ecl.elon % 360) + 360) % 360;
  }

  function bodyInfo(body, tsMillis, frame) {
    frame = frame || 'geo';
    const min = Math.floor(tsMillis / 60000);
    const key = body + ':' + frame + ':' + min;
    let v = cache.get(key);
    if (v) return v;
    const lon = longitude(body, new Date(min * 60000), frame);
    const signIndex = Math.floor(lon / 30) % 12;
    v = { lon, signIndex, degInSign: lon - signIndex * 30 };
    cache.set(key, v);
    return v;
  }

  const moonInfo = (ts) => bodyInfo('Moon', ts, 'geo');

  // Долгота в зоне [from,to) с учётом перехода через 360°
  function inZone(lon, z) {
    if (z.from <= z.to) return lon >= z.from && lon < z.to;
    return lon >= z.from || lon < z.to;
  }
  function zoneOf(lon, zones) {
    if (!zones) return null;
    for (let i = 0; i < zones.length; i++) if (inZone(lon, zones[i])) return zones[i];
    return null;
  }

  /* Следующий МАЖОРНЫЙ аспект пары тел (0/60/90/120/180) строго после fromTs.
   * Возвращает timestamp точного аспекта (локальный минимум орб-дистанции) или
   * null, если в пределах горизонта не нашли. Шаг 6ч — Солнце/планеты движутся
   * медленно, этого хватает. По умолчанию гелио (как полосы аспектов к Солнцу). */
  const MAJORS = [0, 60, 90, 120, 180];
  function nextAspect(bodyA, bodyB, fromTs, frame, opts) {
    opts = opts || {};
    frame = frame || 'helio';
    const step = opts.stepMs || 6 * 3600 * 1000;
    const horizon = opts.horizonMs || 500 * 86400000;   // ~16 месяцев
    const tight = opts.tightOrb || 0.5;
    const sepAt = (ts) => {
      let d = Math.abs(longitude(bodyA, new Date(ts), frame) - longitude(bodyB, new Date(ts), frame)) % 360;
      return d > 180 ? 360 - d : d;
    };
    const distAt = (ts) => { const s = sepAt(ts); let m = 1e9; for (const x of MAJORS) m = Math.min(m, Math.abs(s - x)); return m; };
    let prevPrev = distAt(fromTs), prev = distAt(fromTs + step);
    for (let ts = fromTs + 2 * step; ts <= fromTs + horizon; ts += step) {
      const cur = distAt(ts);
      // локальный минимум орб-дистанции на середине (prev) и достаточно точный
      if (prev <= prevPrev && prev < cur && prev < tight) return ts - step;
      prevPrev = prev; prev = cur;
    }
    return null;
  }

  /* Затмения (солнечные/лунные) в интервале [fromTs, toTs]. Использует
   * встроенный поиск astronomy-engine. Возвращает [{ ts, kind, sub }]. */
  function eclipsesBetween(fromTs, toTs) {
    const out = [];
    const peakMs = (e) => (e && e.peak && e.peak.date ? e.peak.date.getTime() : NaN);
    try {
      let e = A.SearchLunarEclipse(new Date(fromTs)), guard = 0;
      while (e && guard++ < 400) { const t = peakMs(e); if (!(t <= toTs)) break; if (t >= fromTs) out.push({ ts: t, kind: 'lunar', sub: e.kind }); e = A.NextLunarEclipse(e.peak); }
    } catch (er) { /* нет данных — пропускаем */ }
    try {
      let s = A.SearchGlobalSolarEclipse(new Date(fromTs)), guard = 0;
      while (s && guard++ < 400) { const t = peakMs(s); if (!(t <= toTs)) break; if (t >= fromTs) out.push({ ts: t, kind: 'solar', sub: s.kind }); s = A.NextGlobalSolarEclipse(s.peak); }
    } catch (er) { /* нет данных — пропускаем */ }
    return out.sort((a, b) => a.ts - b.ts);
  }

  // «сырая» долгота на момент (для расчётов без объекта bodyInfo)
  const lonOf = (body, tsMillis, frame) => longitude(body, new Date(tsMillis), frame || 'geo');

  // Аянамша Лахири (Читрапакша): смещение тропического зодиака к сидерическому.
  // На J2000 ≈ 23.8523°, прецессия ~50.2388″/год. sid = trop − ayanamsha.
  function ayanamsha(tsMillis) {
    const jd = tsMillis / 86400000 + 2440587.5;
    return 23.8523 + (50.2388 / 3600) * ((jd - 2451545.0) / 365.25);
  }
  const sidLonOf = (body, tsMillis, frame) => { const l = longitude(body, new Date(tsMillis), frame || 'geo') - ayanamsha(tsMillis); return ((l % 360) + 360) % 360; };
  // накшатра (0..26) и пада (1..4) по сидерической долготе
  const NAK = 360 / 27;                                  // 13°20′
  const nakshatraOf = (sidLon) => { const n = Math.floor((((sidLon % 360) + 360) % 360) / NAK); return { index: n, pada: Math.floor(((sidLon % NAK) / (NAK / 4))) + 1 }; };

  window.LunAstro = { bodyInfo, moonInfo, zoneOf, nextAspect, eclipsesBetween, lonOf, ayanamsha, sidLonOf, nakshatraOf };
})();
