/* =============================================================================
 *  astro.js — положение Луны через astronomy-engine (window.Astronomy)
 * =============================================================================
 *  moonInfo(tsMillis) -> { lon, signIndex, degInSign, zone }
 *    lon        — эклиптическая долгота Луны «на дату», 0..360 (0° = 0° Овна)
 *    signIndex  — индекс знака 0..11 (0 = Овен), = floor(lon/30)
 *    degInSign  — градусы, пройденные в текущем знаке, 0..30
 *    zone       — объект зоны цикла из LUN.MOON_ZONES (или null)
 *
 *  Результаты кэшируются по времени, округлённому до минуты — за минуту Луна
 *  смещается на ~0.009°, для ленты это незаметно, а расчётов кратно меньше.
 * ===========================================================================*/
(function () {
  const A = window.Astronomy;
  if (!A) { console.error('[astro] astronomy-engine (window.Astronomy) не загружен'); }

  const cache = new Map();

  function moonLongitude(date) {
    // Геоцентрический истинный вектор Луны -> эклиптические координаты «на дату».
    const vec = A.GeoVector(A.Body.Moon, date, true);
    const ecl = A.Ecliptic(vec);
    return ((ecl.elon % 360) + 360) % 360;
  }

  // Принадлежит ли долгота lon зоне [from,to) с учётом перехода через 360°.
  function inZone(lon, z) {
    if (z.from <= z.to) return lon >= z.from && lon < z.to;
    return lon >= z.from || lon < z.to;         // зона пересекает 0° Овна
  }

  function zoneFor(lon) {
    const zones = window.LUN.MOON_ZONES;
    for (let i = 0; i < zones.length; i++) if (inZone(lon, zones[i])) return zones[i];
    return null;
  }

  function moonInfo(tsMillis) {
    const key = Math.floor(tsMillis / 60000);   // округление до минуты
    let v = cache.get(key);
    if (v) return v;
    const lon = moonLongitude(new Date(key * 60000));
    const signIndex = Math.floor(lon / 30) % 12;
    const degInSign = lon - signIndex * 30;
    v = { lon, signIndex, degInSign, zone: zoneFor(lon) };
    cache.set(key, v);
    return v;
  }

  window.LunAstro = { moonInfo, moonLongitude };
})();
