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

  /* --- линия Ганна 1×1 (2 точки): p0 — старт, p1 задаёт угол (цена/бар);
   *     луч продлевается до правого края. --- */
  kc.registerOverlay({
    name: 'lun_gann',
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, bounding }) => {
      if (coordinates.length < 2) return [];
      const [p0, p1] = coordinates;
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      if (dx === 0) return [{ type: 'line', attrs: { coordinates: [p0, p1] }, styles: { color: '#e08a2a', size: 1.4 } }];
      const targetX = dx > 0 ? bounding.width : 0;         // до края в сторону наклона
      const t = (targetX - p0.x) / dx;
      const end = { x: targetX, y: p0.y + dy * t };
      return [{ type: 'line', attrs: { coordinates: [p0, end] }, styles: { color: '#e08a2a', size: 1.4 } }];
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
