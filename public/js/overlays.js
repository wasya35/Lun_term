/* =============================================================================
 *  overlays.js — свои инструменты рисования (в ядре KLineChart v10 их нет)
 * =============================================================================
 *  Каждый оверлей читает СВОЙ стиль из extendData.style:
 *    { color, size, dash:'solid'|'dashed'|'dotted', fill, fillColor }
 *  Панель свойств (app.js) правит этот стиль и блокировку (lock) выделенного
 *  объекта через chart.overrideOverlay. Прочие данные — там же в extendData
 *  (text — для метки, maxCrossings — для луча, divisions — для квадрата).
 * ===========================================================================*/
(function () {
  const kc = window.klinecharts;
  const DEF = { color: '#f0c040', size: 1.4, dash: 'solid', fill: false, fillColor: 'rgba(240,192,64,0.14)' };
  const styleOf = (overlay) => Object.assign({}, DEF, (overlay && overlay.extendData && overlay.extendData.style) || {});
  function lineStyle(st) {
    const b = { color: st.color, size: st.size || 1.4 };
    if (st.dash === 'dashed') { b.style = 'dashed'; b.dashedValue = [6, 4]; }
    else if (st.dash === 'dotted') { b.style = 'dashed'; b.dashedValue = [2, 3]; }
    else b.style = 'solid';
    return b;
  }
  const rectStyle = (st) => st.fill
    ? { style: 'stroke_fill', color: st.fillColor, borderColor: st.color, borderSize: st.size || 1.2 }
    : { style: 'stroke', color: 'transparent', borderColor: st.color, borderSize: st.size || 1.2 };
  window.LUN_OVERLAY_DEF_STYLE = DEF;   // app.js берёт дефолт отсюда

  /* --- прямоугольник --- */
  kc.registerOverlay({
    name: 'lun_rect', totalStep: 3, needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates, st = styleOf(overlay);
      return [{ type: 'rect', attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }, styles: rectStyle(st) }];
    },
  });

  /* --- линия Ганна (2 точки) ---
   * LUN.GANN.unitPerBar: число > 0 — ТОЧНЫЙ угол (цена за бар) от т1 (т1
   *   закреплена!), т2 задаёт лишь направление вверх/вниз. Пусто/0 — по 2 точкам.
   * LUN.GANN.extendRight: true — луч до края; false — отрезок. */
  kc.registerOverlay({
    name: 'lun_gann', totalStep: 3, needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay, chart, yAxis }) => {
      if (coordinates.length < 2) return [];
      const [p0, p1] = coordinates, G = window.LUN.GANN || {}, st = styleOf(overlay);
      const barPx = chart.getBarSpace().bar || 6;
      const pts = overlay.points || [];
      const v0 = pts[0] ? pts[0].value : null, v1 = pts[1] ? pts[1].value : null;
      const fixed = (typeof G.unitPerBar === 'number' && G.unitPerBar > 0 && v0 != null && yAxis);
      const segA = { x: p0.x, y: p0.y };
      let segB, pricePerBar;
      if (fixed) {
        const dir = (v1 != null && v1 < v0) ? -1 : 1;
        const dyPerBar = yAxis.convertToPixel(v0 + dir * G.unitPerBar) - yAxis.convertToPixel(v0);
        const endX = (G.extendRight !== false) ? (p1.x >= p0.x ? bounding.width : 0) : p1.x;
        segB = { x: endX, y: p0.y + dyPerBar * ((endX - p0.x) / barPx) };
        pricePerBar = dir * G.unitPerBar;
      } else {
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        if (G.extendRight !== false && dx !== 0) { const edgeX = dx > 0 ? bounding.width : 0; segB = { x: edgeX, y: p0.y + dy * ((edgeX - p0.x) / dx) }; }
        else segB = { x: p1.x, y: p1.y };
        const barsBetween = Math.abs(dx) / barPx || 1;
        pricePerBar = (v0 != null && v1 != null) ? (v1 - v0) / barsBetween : 0;
      }
      const deg = Math.atan2(-(segB.y - segA.y), (segB.x - segA.x)) * 180 / Math.PI;
      const app = Math.abs(pricePerBar);
      const label = `${app < 10 ? app.toFixed(2) : app.toFixed(0)}/бар · ${deg.toFixed(1)}°` + (fixed ? ' ⚲' : '');
      return [
        { type: 'line', attrs: { coordinates: [segA, segB] }, styles: lineStyle(st) },
        { type: 'text', attrs: { x: p1.x + 6, y: p1.y - 6, text: label, baseline: 'bottom' }, ignoreEvent: true, styles: { color: st.color, size: 11 } },
      ];
    },
  });

  /* --- стрелка с наконечником --- */
  kc.registerOverlay({
    name: 'lun_arrow', totalStep: 3, needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [p0, p1] = coordinates, st = styleOf(overlay), ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      const L = 12, spread = 0.42;
      const h1 = { x: p1.x - L * Math.cos(ang - spread), y: p1.y - L * Math.sin(ang - spread) };
      const h2 = { x: p1.x - L * Math.cos(ang + spread), y: p1.y - L * Math.sin(ang + spread) };
      const ls = lineStyle(st);
      return [
        { type: 'line', attrs: { coordinates: [p0, p1] }, styles: ls },
        { type: 'line', attrs: { coordinates: [h1, p1, h2] }, styles: ls },
      ];
    },
  });

  /* --- горизонтальный луч с обрезкой по пересечениям ---
   * extendData.maxCrossings — на N-м касании ценой луч обрывается. */
  kc.registerOverlay({
    name: 'lun_hray', totalStep: 2, needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay, chart, xAxis, bounding }) => {
      if (!coordinates.length) return [];
      const p0 = coordinates[0], ed = overlay.extendData || {}, st = styleOf(overlay);
      const maxX = ed.maxCrossings || (window.LUN.HRAY && window.LUN.HRAY.maxCrossings) || 2;
      const pt = overlay.points && overlay.points[0];
      const level = pt ? pt.value : null, startIdx = pt && pt.dataIndex != null ? Math.floor(pt.dataIndex) : null;
      const list = chart.getDataList();
      let endX = bounding.width, crossings = 0, hit = false;
      if (level != null && startIdx != null) {
        for (let i = Math.max(0, startIdx + 1); i < list.length; i++) {
          const b = list[i];
          if (b.low <= level && b.high >= level) { crossings++; if (crossings >= maxX) { endX = xAxis.convertToPixel(i); hit = true; break; } }
        }
      }
      const end = { x: endX, y: p0.y };
      return [
        { type: 'line', attrs: { coordinates: [{ x: p0.x, y: p0.y }, end] }, styles: lineStyle(st) },
        { type: 'text', attrs: { x: end.x - 3, y: p0.y - 6, text: hit ? '⨯' + maxX : '→', baseline: 'bottom', align: 'right' }, ignoreEvent: true, styles: { color: st.color, size: 11 } },
      ];
    },
  });

  /* --- профиль объёма (горизонтальный объём) по диапазону --- */
  kc.registerOverlay({
    name: 'lun_vprofile', totalStep: 3, needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay, chart, xAxis, yAxis }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates, st = styleOf(overlay);
      const box = { type: 'rect', attrs: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }, styles: { style: 'stroke', color: 'transparent', borderColor: 'rgba(240,192,64,0.35)', size: 1 } };
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
      const N = Math.max(4, cfg.bins || 24), binH = (maxH - minL) / N, vol = new Array(N).fill(0);
      for (let i = lo; i <= hi; i++) {
        const bar = list[i]; if (!bar) continue; const v = bar.volume || 0; if (v <= 0) continue;
        const k0 = Math.max(0, Math.floor((bar.low - minL) / binH)), k1 = Math.min(N - 1, Math.floor((bar.high - minL) / binH));
        const span = Math.max(1, k1 - k0 + 1), share = v / span;
        for (let k = k0; k <= k1; k++) vol[k] += share;
      }
      const maxV = Math.max.apply(null, vol) || 1;
      let pocK = 0; for (let k = 1; k < N; k++) if (vol[k] > vol[pocK]) pocK = k;
      const totV = vol.reduce((s, x) => s + x, 0), target = (cfg.valueAreaPct || 0.7) * totV;
      let loK = pocK, hiK = pocK, acc = vol[pocK];
      while (acc < target && (loK > 0 || hiK < N - 1)) {
        const down = loK > 0 ? vol[loK - 1] : -1, up = hiK < N - 1 ? vol[hiK + 1] : -1;
        if (up >= down) { hiK++; acc += Math.max(0, up); } else { loK--; acc += Math.max(0, down); }
      }
      const xLeft = Math.min(a.x, b.x), maxW = Math.min(cfg.maxWidthPx || 150, Math.max(60, Math.abs(b.x - a.x) * 0.6));
      const figs = [box];
      for (let k = 0; k < N; k++) {
        const yTop = yAxis.convertToPixel(minL + (k + 1) * binH), yBot = yAxis.convertToPixel(minL + k * binH);
        const w = Math.max(1, maxW * (vol[k] / maxV)), inVA = k >= loK && k <= hiK;
        const color = k === pocK ? 'rgba(240,140,40,0.9)' : (inVA ? 'rgba(90,150,200,0.7)' : 'rgba(90,150,200,0.4)');
        figs.push({ type: 'rect', attrs: { x: xLeft, y: yTop, width: w, height: Math.max(1, yBot - yTop - 1) }, styles: { style: 'fill', color } });
      }
      const pocPrice = minL + (pocK + 0.5) * binH;
      figs.push({ type: 'text', attrs: { x: xLeft + maxW + 4, y: yAxis.convertToPixel(pocPrice), text: 'POC ' + (pocPrice >= 1000 ? pocPrice.toFixed(0) : pocPrice.toFixed(3)), baseline: 'middle' }, ignoreEvent: true, styles: { color: st.color, size: 11 } });
      return figs;
    },
  });

  /* --- Gann Box (2 точки — противоположные углы) --- */
  kc.registerOverlay({
    name: 'lun_gannbox', totalStep: 3, needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates, st = styleOf(overlay);
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y), W = x1 - x0, H = y1 - y0;
      const L = (window.LUN.GANNTOOLS.box && window.LUN.GANNTOOLS.box.levels) || [0, 0.25, 0.5, 0.75, 1];
      const col = st.color, mid = st.color, diag = 'rgba(58,160,255,0.75)';
      const figs = [{ type: 'rect', attrs: { x: x0, y: y0, width: W, height: H }, styles: st.fill ? { style: 'stroke_fill', color: st.fillColor, borderColor: col, borderSize: st.size } : { style: 'stroke', color: 'transparent', borderColor: col, borderSize: st.size } }];
      const ls = (m) => ({ color: m ? mid : col, size: m ? (st.size || 1) : 1, style: 'solid' });
      L.forEach((f) => { const y = y0 + H * f; figs.push({ type: 'line', attrs: { coordinates: [{ x: x0, y }, { x: x1, y }] }, styles: ls(Math.abs(f - 0.5) < 0.02) }); });
      L.forEach((f) => { const x = x0 + W * f; figs.push({ type: 'line', attrs: { coordinates: [{ x, y: y0 }, { x, y: y1 }] }, styles: ls(Math.abs(f - 0.5) < 0.02) }); });
      figs.push({ type: 'line', attrs: { coordinates: [{ x: x0, y: y1 }, { x: x1, y: y0 }] }, styles: { color: diag, size: 1.2 } });
      figs.push({ type: 'line', attrs: { coordinates: [{ x: x0, y: y0 }, { x: x1, y: y1 }] }, styles: { color: diag, size: 1.2 } });
      return figs;
    },
  });

  /* --- Квадрат Ганна (сетка N×N; extendData.divisions: 8 или 12) --- */
  kc.registerOverlay({
    name: 'lun_gannsquare', totalStep: 3, needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates, st = styleOf(overlay);
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y), W = x1 - x0, H = y1 - y0;
      const N = (overlay.extendData && overlay.extendData.divisions) || 8;
      const grid = 'rgba(240,192,64,0.25)', cross = st.color, diag = 'rgba(58,160,255,0.7)';
      const figs = [{ type: 'rect', attrs: { x: x0, y: y0, width: W, height: H }, styles: { style: 'stroke', color: 'transparent', borderColor: st.color, borderSize: st.size } }];
      for (let k = 1; k < N; k++) {
        const x = x0 + W * k / N, y = y0 + H * k / N, m = (k === N / 2);
        figs.push({ type: 'line', attrs: { coordinates: [{ x, y: y0 }, { x, y: y1 }] }, styles: { color: m ? cross : grid, size: m ? 1.4 : 1 } });
        figs.push({ type: 'line', attrs: { coordinates: [{ x: x0, y }, { x: x1, y }] }, styles: { color: m ? cross : grid, size: m ? 1.4 : 1 } });
      }
      figs.push({ type: 'line', attrs: { coordinates: [{ x: x0, y: y1 }, { x: x1, y: y0 }] }, styles: { color: diag, size: 1.2 } });
      figs.push({ type: 'line', attrs: { coordinates: [{ x: x0, y: y0 }, { x: x1, y: y1 }] }, styles: { color: diag, size: 1.2 } });
      figs.push({ type: 'text', attrs: { x: x0 + 3, y: y0 + 2, text: '□' + N, baseline: 'top' }, ignoreEvent: true, styles: { color: st.color, size: 11 } });
      return figs;
    },
  });

  /* --- текстовая метка (extendData.text) --- */
  kc.registerOverlay({
    name: 'lun_text', totalStep: 2, needDefaultPointFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 1) return [];
      const ed = overlay.extendData, st = styleOf(overlay);
      const text = (ed && typeof ed === 'object' ? ed.text : ed) || 'текст';
      return [{ type: 'text', attrs: { x: coordinates[0].x, y: coordinates[0].y, text: String(text), baseline: 'bottom' }, styles: { color: st.color, size: 14, family: 'system-ui, sans-serif' } }];
    },
  });
})();
