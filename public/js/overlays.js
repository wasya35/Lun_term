/* =============================================================================
 *  overlays.js — свои инструменты рисования (в ядре KLineChart v10 их нет)
 * =============================================================================
 *   lun_rect   — прямоугольник (2 точки)
 *   lun_oval   — овал/эллипс по описанному прямоугольнику (2 точки)
 *   lun_arrow  — стрелка с наконечником (2 точки)
 *   lun_text   — текстовая метка (1 точка; текст берётся из extendData)
 * ===========================================================================*/
(function () {
  const kc = window.klinecharts;
  const ACCENT = '#f0c040';

  const strokeStyle = (color) => ({ style: 'stroke', color: 'transparent', borderColor: color, borderSize: 1.4, size: 1.4 });

  /* --- прямоугольник --- */
  kc.registerOverlay({
    name: 'lun_rect',
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      return [{
        type: 'rect',
        attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) },
        styles: strokeStyle(ACCENT),
      }];
    },
  });

  /* --- линия Ганна (2 точки) ---
   * LUN.GANN.unitPerBar: число — «угол» (цена за бар) задан вручную; null —
   *   наклон берётся по двум точкам.
   * LUN.GANN.extendRight: true — луч до края; false — отрезок между точками. */
  kc.registerOverlay({
    name: 'lun_gann',
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay, chart }) => {
      if (coordinates.length < 2) return [];
      const [p0, p1] = coordinates;
      const G = overlay.extendData || window.LUN.GANN || {};   // угол/режим зафиксированы на линии
      const style = { color: '#e08a2a', size: 1.4 };
      const dirX = (p1.x - p0.x) >= 0 ? 1 : -1;
      const manual = (G.unitPerBar != null && G.unitPerBar !== '' && isFinite(+G.unitPerBar));

      if (!manual) {
        // наклон по двум точкам
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        if (!G.extendRight || dx === 0) return [{ type: 'line', attrs: { coordinates: [p0, p1] }, styles: style }];
        const targetX = dirX > 0 ? bounding.width : 0;
        const end = { x: targetX, y: p0.y + dy * ((targetX - p0.x) / dx) };
        return [{ type: 'line', attrs: { coordinates: [p0, end] }, styles: style }];
      }

      // ручной угол: цена за бар -> пиксельный наклон.
      // масштаб цена→пиксели берём из самих двух точек линии (надёжно).
      const barPx = chart.getBarSpace().bar || 6;
      const pts = overlay.points || [];
      const v0 = pts[0] ? pts[0].value : null, v1 = pts[1] ? pts[1].value : null;
      let dyPerPrice = -0.05;                                  // запас, если точек нет
      if (v0 != null && v1 != null && v1 !== v0) dyPerPrice = (p1.y - p0.y) / (v1 - v0);
      const signUp = (p1.y <= p0.y) ? 1 : -1;                 // куда тянем — вверх/вниз
      const unit = Math.abs(+G.unitPerBar);
      const targetX = G.extendRight ? (dirX > 0 ? bounding.width : 0) : p1.x;
      const bars = Math.abs(targetX - p0.x) / barPx;
      const end = { x: targetX, y: p0.y + signUp * unit * bars * dyPerPrice };
      return [{ type: 'line', attrs: { coordinates: [p0, end] }, styles: style }];
    },
  });

  /* --- стрелка с наконечником --- */
  kc.registerOverlay({
    name: 'lun_arrow',
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [p0, p1] = coordinates;
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const L = 12, spread = 0.42;
      const h1 = { x: p1.x - L * Math.cos(ang - spread), y: p1.y - L * Math.sin(ang - spread) };
      const h2 = { x: p1.x - L * Math.cos(ang + spread), y: p1.y - L * Math.sin(ang + spread) };
      const line = { color: ACCENT, size: 1.6 };
      return [
        { type: 'line', attrs: { coordinates: [p0, p1] }, styles: line },
        { type: 'line', attrs: { coordinates: [h1, p1, h2] }, styles: line },
      ];
    },
  });

  /* --- текстовая метка --- */
  kc.registerOverlay({
    name: 'lun_text',
    totalStep: 2,
    needDefaultPointFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 1) return [];
      const text = (overlay.extendData && String(overlay.extendData)) || 'текст';
      return [{
        type: 'text',
        attrs: { x: coordinates[0].x, y: coordinates[0].y, text, baseline: 'bottom' },
        styles: { color: ACCENT, size: 14, family: 'system-ui, sans-serif' },
      }];
    },
  });
})();
