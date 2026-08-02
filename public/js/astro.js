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

  function longitude(body, date) {
    const vec = A.GeoVector(A.Body[body], date, true);   // геоцентрический, «на дату»
    const ecl = A.Ecliptic(vec);
    return ((ecl.elon % 360) + 360) % 360;
  }

  function bodyInfo(body, tsMillis) {
    const key = body + ':' + Math.floor(tsMillis / 60000);
    let v = cache.get(key);
    if (v) return v;
    const lon = longitude(body, new Date(Math.floor(tsMillis / 60000) * 60000));
    const signIndex = Math.floor(lon / 30) % 12;
    v = { lon, signIndex, degInSign: lon - signIndex * 30 };
    cache.set(key, v);
    return v;
  }

  const moonInfo = (ts) => bodyInfo('Moon', ts);

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

  window.LunAstro = { bodyInfo, moonInfo, zoneOf };
})();
