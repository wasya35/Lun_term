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

  /* --- горизонтальный луч с обрезкой по пересечениям ---
   * От точки вправо; обрывается на N-м баре, чей диапазон low..high накрывает
   * уровень (пересечение с ценой). N берётся из extendData.maxCrossings (или
   * LUN.HRAY). Если пересечений меньше N — луч до правого края. */
  kc.registerOverlay({
    name: 'lun_hray',
    totalStep: 2,
    needDefaultPointFigure: false,
    createPointFigures: ({ coordinates, overlay, chart, xAxis, bounding }) => {
      if (!coordinates.length) return [];
      const p0 = coordinates[0];
      const ed = overlay.extendData || {};
      const maxX = ed.maxCrossings || (window.LUN.HRAY && window.LUN.HRAY.maxCrossings) || 2;
      const pt = overlay.points && overlay.points[0];
      const level = pt ? pt.value : null;
      const startIdx = pt && pt.dataIndex != null ? Math.floor(pt.dataIndex) : null;
      const list = chart.getDataList();
      let endX = bounding.width, crossings = 0, hit = false;
      if (level != null && startIdx != null) {
        for (let i = Math.max(0, startIdx + 1); i < list.length; i++) {
          const b = list[i];
          if (b.low <= level && b.high >= level) {
            crossings++;
            if (crossings >= maxX) { endX = xAxis.convertToPixel(i); hit = true; break; }
          }
        }
      }
      const end = { x: endX, y: p0.y };
      return [
        { type: 'line', attrs: { coordinates: [{ x: p0.x, y: p0.y }, end] }, styles: { color: ACCENT, size: 1.6 } },
        { type: 'text', attrs: { x: end.x - 3, y: p0.y - 6, text: hit ? '⨯' + maxX : '→', baseline: 'bottom', align: 'right' }, ignoreEvent: true, styles: { color: ACCENT, size: 11 } },
      ];
    },
  });

  /* --- профиль объёма (горизонтальный объём) по диапазону ---
   * 2 точки задают ВРЕМЕННОЕ окно (цена точек не важна — рамка «натягивается»
   * на тренд). Берём загруженные свечи в окне, ценовой диапазон low..high бьём
   * на bins уровней, объём каждой свечи распределяем по перекрытым уровням.
   * Рисуем гистограмму от левого края рамки вправо. POC — макс. уровень;
   * зона стоимости (VA, ~70% объёма) — светлее. */
  kc.registerOverlay({
    name: 'lun_vprofile',
    totalStep: 3,
    needDefaultPointFigure: false,
    createPointFigures: ({ coordinates, overlay, chart, xAxis, yAxis }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const box = {
        type: 'rect',
        attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) },
        styles: { style: 'stroke', color: 'transparent', borderColor: 'rgba(240,192,64,0.35)', size: 1 },
      };
      const pts = overlay.points || [];
      const i0 = pts[0] && pts[0].dataIndex != null ? Math.round(pts[0].dataIndex) : null;
      const i1 = pts[1] && pts[1].dataIndex != null ? Math.round(pts[1].dataIndex) : null;
      const list = chart.getDataList();
      if (i0 == null || i1 == null || !list.length) return [box];
      const lo = Math.max(0, Math.min(i0, i1)), hi = Math.min(list.length - 1, Math.max(i0, i1));
      let minL = Infinity, maxH = -Infinity;
      for (let i = lo; i <= hi; i++) { const bar = list[i]; if (!bar) continue; minL = Math.min(minL, bar.low); maxH = Math.max(maxH, bar.high); }
      if (!(maxH > minL)) return [box];

      const cfg = window.LUN.VPROFILE || { bins: 24, maxWidthPx: 150, valueAreaPct: 0.70 };
      const N = Math.max(4, cfg.bins || 24);
      const binH = (maxH - minL) / N;
      const vol = new Array(N).fill(0);
      for (let i = lo; i <= hi; i++) {
        const bar = list[i]; if (!bar) continue; const v = bar.volume || 0; if (v <= 0) continue;
        const k0 = Math.max(0, Math.floor((bar.low - minL) / binH));
        const k1 = Math.min(N - 1, Math.floor((bar.high - minL) / binH));
        const span = Math.max(1, k1 - k0 + 1), share = v / span;
        for (let k = k0; k <= k1; k++) vol[k] += share;
      }
      const maxV = Math.max.apply(null, vol) || 1;
      let pocK = 0; for (let k = 1; k < N; k++) if (vol[k] > vol[pocK]) pocK = k;

      // зона стоимости (VA): растём от POC в обе стороны, пока не наберём долю объёма
      const totV = vol.reduce((s, x) => s + x, 0);
      const target = (cfg.valueAreaPct || 0.7) * totV;
      let loK = pocK, hiK = pocK, acc = vol[pocK];
      while (acc < target && (loK > 0 || hiK < N - 1)) {
        const down = loK > 0 ? vol[loK - 1] : -1, up = hiK < N - 1 ? vol[hiK + 1] : -1;
        if (up >= down) { hiK++; acc += Math.max(0, up); } else { loK--; acc += Math.max(0, down); }
      }

      const xLeft = Math.min(a.x, b.x);
      const maxW = Math.min(cfg.maxWidthPx || 150, Math.max(60, Math.abs(b.x - a.x) * 0.6));
      const figs = [box];
      for (let k = 0; k < N; k++) {
        const yTop = yAxis.convertToPixel(minL + (k + 1) * binH);
        const yBot = yAxis.convertToPixel(minL + k * binH);
        const w = Math.max(1, maxW * (vol[k] / maxV));
        const inVA = k >= loK && k <= hiK;
        const color = k === pocK ? 'rgba(240,140,40,0.9)' : (inVA ? 'rgba(90,150,200,0.7)' : 'rgba(90,150,200,0.4)');
        figs.push({ type: 'rect', attrs: { x: xLeft, y: yTop, width: w, height: Math.max(1, yBot - yTop - 1) }, styles: { style: 'fill', color } });
      }
      const pocPrice = minL + (pocK + 0.5) * binH;
      figs.push({ type: 'text', attrs: { x: xLeft + maxW + 4, y: yAxis.convertToPixel(pocPrice), text: 'POC ' + (pocPrice >= 1000 ? pocPrice.toFixed(0) : pocPrice.toFixed(3)), baseline: 'middle' }, ignoreEvent: true, styles: { color: '#e08a2a', size: 11 } });
      return figs;
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
