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
      const barPx = chart.getBarSpace().bar || 6;
      const pts = overlay.points || [];
      const v0 = pts[0] ? pts[0].value : null, v1 = pts[1] ? pts[1].value : null;

      let end, pricePerBar;
      if (!manual) {
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const barsBetween = Math.abs(dx) / barPx || 1;
        pricePerBar = (v0 != null && v1 != null) ? (v1 - v0) / barsBetween : 0;
        end = (G.extendRight && dx !== 0)
          ? { x: dirX > 0 ? bounding.width : 0, y: p0.y + dy * (((dirX > 0 ? bounding.width : 0) - p0.x) / dx) }
          : { x: p1.x, y: p1.y };
      } else {
        // ручной угол: масштаб цена→пиксели берём из самих точек линии
        let dyPerPrice = -0.05;
        if (v0 != null && v1 != null && v1 !== v0) dyPerPrice = (p1.y - p0.y) / (v1 - v0);
        const signUp = (p1.y <= p0.y) ? 1 : -1;
        const unit = Math.abs(+G.unitPerBar);
        pricePerBar = signUp * unit;
        const targetX = G.extendRight ? (dirX > 0 ? bounding.width : 0) : p1.x;
        end = { x: targetX, y: p0.y + signUp * unit * (Math.abs(targetX - p0.x) / barPx) * dyPerPrice };
      }

      // живой «угол»: цена за бар + градусы луча (как в MT4/5)
      const deg = Math.atan2(-(end.y - p0.y), (end.x - p0.x)) * 180 / Math.PI;
      const app = Math.abs(pricePerBar);
      const label = `${app < 10 ? app.toFixed(2) : app.toFixed(0)}/бар · ${deg.toFixed(1)}°`;
      return [
        { type: 'line', attrs: { coordinates: [p0, end] }, styles: style },
        { type: 'text', attrs: { x: p1.x + 6, y: p1.y - 6, text: label, baseline: 'bottom' }, ignoreEvent: true, styles: { color: '#e08a2a', size: 11 } },
      ];
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
