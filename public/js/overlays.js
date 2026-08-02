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

  /* --- поворотный овал (3 точки): p0,p1 — ось (направление вдоль тренда),
   *     p2 — ширина. Эллипс наклоняется вдоль оси p0→p1. --- */
  kc.registerOverlay({
    name: 'lun_oval',
    totalStep: 4,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [p0, p1, p2] = coordinates;
      const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2;
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;         // единичный вектор оси
      const a = len / 2;                          // полуось вдоль тренда
      // пока 2 точки — показываем направляющую линию оси
      if (coordinates.length < 3) return [{ type: 'line', attrs: { coordinates: [p0, p1] }, styles: { color: ACCENT, size: 1, style: 'dashed' } }];
      // ширина = перпендикулярное расстояние от p2 до оси
      const b = Math.abs((p2.x - cx) * (-uy) + (p2.y - cy) * ux) || 1;
      const pts = []; const N = 72;
      for (let i = 0; i <= N; i++) {
        const t = (2 * Math.PI * i) / N;
        const lx = a * Math.cos(t), ly = b * Math.sin(t);       // локальные координаты
        pts.push({ x: cx + lx * ux - ly * uy, y: cy + lx * uy + ly * ux }); // поворот вдоль оси
      }
      return [{ type: 'polygon', attrs: { coordinates: pts }, styles: strokeStyle(ACCENT) }];
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
