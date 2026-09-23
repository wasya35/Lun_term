/* =============================================================================
 *  screener.js — вид «Скриннер»: таблица инструментов, выбираемые параметры
 *  доп-колонками и ФИЛЬТРАЦИЯ ПО ДИАПАЗОНАМ (не только сортировка).
 * =============================================================================
 *  Переключатель видов (Графики / Скриннер / Опционы). В режиме скринера меню
 *  графика скрыто (body.scr-mode). Данные по инструменту: свечи выбранного ТФ
 *  (LunData.fetchTail) + при активных микро-параметрах — tradestats/FUTOI (MOEX)
 *  или суб-свечи (крипта). Параметры: цена/объём, VWAP±σ, макс-объём в трети,
 *  перевес агрессора, ΔОИ, физ/юр (фьюч), Sq9 планет, отклонение от циклов.
 *  Клик по строке открывает инструмент в графике; звезда — избранное.
 * ===========================================================================*/
(function () {
  const S = { view: 'charts', built: false, universe: 'fav', tfId: 'D1', params: new Set(),
              rows: [], sortId: 'dvol', sortDir: -1, loading: false, seq: 0, filters: {} };
  const cacheBars = new Map(), cacheTS = new Map(), cacheFutoi = new Map(), cacheSub = new Map();
  const $ = (id) => document.getElementById(id);
  const algoMkt = (ins) => ins.engine === 'stock' ? 'eq' : (ins.engine === 'currency' ? 'fx' : 'fo');
  const isMoex = (ins) => (ins.provider || 'moex') === 'moex';
  const isFut = (ins) => (ins.engine || ins.type) === 'futures';
  const futoiCode = (ins) => { const t = ins.ticker || ''; return (t.length > 2 && /[FGHJKMNQUVXZ]\d$/.test(t)) ? t.slice(0, -2) : (ins.assetCode || t); };

  /* ---------- формат ---------- */
  const fmtPrice = (v, p) => v == null ? '—' : (v >= 1000 ? v.toFixed(Math.min(p || 0, 2)) : v.toFixed(p != null ? p : 2));
  const fmtVol = (v) => { if (v == null) return '—'; const a = Math.abs(v); if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k'; return '' + Math.round(v); };
  const pctHtml = (v) => v == null ? '<span class="scr-muted">—</span>' : '<span class="' + (v > 0 ? 'scr-pos' : v < 0 ? 'scr-neg' : 'scr-muted') + '">' + (v > 0 ? '+' : '') + v.toFixed(2) + '%</span>';
  const num2 = (v) => v == null ? '—' : v.toFixed(2);
  const signHtml = (v, unit, good) => v == null ? '<span class="scr-muted">—</span>' : '<span class="' + ((good ? v > 0 : v > 0) ? 'scr-pos' : v < 0 ? 'scr-neg' : 'scr-muted') + '">' + (v > 0 ? '+' : '') + (Math.abs(v) >= 1000 ? fmtVol(v) : num2(v)) + (unit || '') + '</span>';

  /* ---------- базовые вычислители (bars asc) ---------- */
  const lastN = (b) => b && b.length ? b[b.length - 1] : null;
  function momN(b, n) { if (!b || b.length <= n) return null; const a = b[b.length - 1 - n].close, c = b[b.length - 1].close; return a ? (c - a) / a * 100 : null; }
  function posInBar(b) { const x = lastN(b); if (!x) return null; const r = x.high - x.low; return r > 0 ? (x.close - x.low) / r * 100 : 50; }
  function newExt(b, n) { if (!b || b.length < 3) return null; const w = b.slice(-Math.min(n, b.length)); const x = w[w.length - 1]; const hi = Math.max.apply(null, w.map((k) => k.high)), lo = Math.min.apply(null, w.map((k) => k.low)); if (x.high >= hi) return 1; if (x.low <= lo) return -1; return 0; }
  function volZ(b, n) { if (!b || b.length < 4) return null; const w = b.slice(-Math.min(n + 1, b.length)); const prev = w.slice(0, -1).map((k) => k.volume || 0); const x = (w[w.length - 1].volume || 0); const m = prev.reduce((s, v) => s + v, 0) / prev.length; const sd = Math.sqrt(prev.reduce((s, v) => s + (v - m) * (v - m), 0) / prev.length) || 1; return (x - m) / sd; }
  function rangeX(b, n) { if (!b || b.length < 3) return null; const w = b.slice(-Math.min(n + 1, b.length)); const prev = w.slice(0, -1).map((k) => (k.high - k.low) || 0); const x = (w[w.length - 1].high - w[w.length - 1].low) || 0; const m = prev.reduce((s, v) => s + v, 0) / prev.length || 1; return x / m; }
  function vwapSigma(b, n) { if (!b || b.length < 5) return null; const w = b.slice(-Math.min(n, b.length)); let pv = 0, vv = 0; for (const x of w) { const tp = (x.high + x.low + x.close) / 3; pv += tp * (x.volume || 0); vv += (x.volume || 0); } if (vv <= 0) return null; const vwap = pv / vv; let s = 0; for (const x of w) { const tp = (x.high + x.low + x.close) / 3; s += (x.volume || 0) * (tp - vwap) * (tp - vwap); } const sd = Math.sqrt(s / vv) || 1; return (b[b.length - 1].close - vwap) / sd; }

  /* ---------- астро ---------- */
  function sq9Scale(p) { if (!(p > 0)) return 1; let S1 = 1; while (p * S1 < 100) S1 *= 10; while (p * S1 > 100000) S1 /= 10; return S1; }
  function sq9Nearest(price, ts) {
    if (!(price > 0) || !window.LunAstro) return null;
    const AG = window.LUN.ASTROGANN || {}, pls = AG.sq9Planets || [], frame = AG.frame || 'geo';
    const ang = 180 * Math.sqrt(price * sq9Scale(price));
    let best = 999;
    for (const p of pls) { let L; try { L = window.LunAstro.bodyInfo(p, ts, frame).lon; } catch (e) { continue; } let d = ((ang - L) % 360 + 360) % 360; d = Math.min(d, 360 - d); if (d < best) best = d; }
    return best === 999 ? null : best;
  }
  const cycCache = new Map();
  function cycleDev(b, key) {
    if (!window.LunTS || !window.LunTS.cycleProjection || !b || b.length < 40) return null;
    let r = cycCache.get(key); if (r === undefined) { try { r = window.LunTS.cycleProjection(b, {}); } catch (e) { r = null; } cycCache.set(key, r); }
    if (!r) return null; const fit = r.recon(b.length - 1), c = b[b.length - 1].close; return fit ? (c - fit) / fit * 100 : null;
  }

  /* ---------- микроструктура (последний бар) ---------- */
  function tsLast(tsRows, bars) {
    const nb = bars.length; if (nb < 1 || !tsRows || !tsRows.length) return null;
    const t0 = bars[nb - 1].timestamp, tPrev = bars[nb - 2] ? bars[nb - 2].timestamp : t0;
    let volB = 0, volS = 0, oi = null, prevOi = null;
    for (const r of tsRows) { if (r.ts >= t0) { volB += r.volB || 0; volS += r.volS || 0; if (r.oi) oi = r.oi; } else if (r.ts >= tPrev && r.ts < t0) { if (r.oi) prevOi = r.oi; } }
    return { net: volB - volS, doi: (oi != null && prevOi != null) ? oi - prevOi : null };
  }
  function thirdsLast(subBars, bars) {
    const nb = bars.length; if (nb < 1 || !subBars || !subBars.length) return null;
    const bar = bars[nb - 1], t0 = bar.timestamp; let mv = -1, ms = null;
    for (const s of subBars) { if (s.ts >= t0 && (s.vol || 0) > mv) { mv = s.vol || 0; ms = s; } }
    if (!ms) return null; const rng = bar.high - bar.low; if (rng <= 0) return null;
    return (0.5 - (ms.close - bar.low) / rng) * 2;   // +1 = у низа (покупатели), −1 = у верха (продавцы)
  }
  function fizyurLast(snaps) { if (!snaps || !snaps.length) return null; const s = snaps[snaps.length - 1]; return (s.dFizL || 0) - (s.dFizS || 0); }

  /* ---------- реестр параметров ---------- */
  const extFmt = (v) => v == null ? '—' : v > 0 ? '<span class="scr-pos">▲ hi</span>' : v < 0 ? '<span class="scr-neg">▼ lo</span>' : '<span class="scr-muted">—</span>';
  const thirdsFmt = (v) => v == null ? '—' : Math.abs(v) < 0.34 ? '<span class="scr-muted">= сер ' + num2(v) + '</span>' : v > 0 ? '<span class="scr-pos">▼ покуп ' + num2(v) + '</span>' : '<span class="scr-neg">▲ прод ' + num2(v) + '</span>';
  const PARAMS = [
    { id: 'mom', label: 'Δ% за 5', group: 'Цена', need: 'bars', applies: () => true, calc: (B) => momN(B.bars, 5), html: pctHtml, ft: 'num' },
    { id: 'posbar', label: 'Закр. в баре %', group: 'Цена', need: 'bars', applies: () => true, calc: (B) => posInBar(B.bars), html: (v) => v == null ? '—' : (v >= 66 ? '<span class="scr-neg">' : v <= 34 ? '<span class="scr-pos">' : '<span class="scr-muted">') + Math.round(v) + '%</span>', ft: 'num' },
    { id: 'ext', label: 'Новый hi/lo(20)', group: 'Цена', need: 'bars', applies: () => true, calc: (B) => newExt(B.bars, 20), html: extFmt, ft: 'sel3' },
    { id: 'vwap', label: 'VWAP σ', group: 'Цена', need: 'bars', applies: () => true, calc: (B) => vwapSigma(B.bars, 20), html: (v) => v == null ? '—' : '<span class="' + (v >= 2 ? 'scr-neg' : v <= -2 ? 'scr-pos' : 'scr-muted') + '">' + (v > 0 ? '+' : '') + num2(v) + 'σ</span>', ft: 'num' },
    { id: 'volz', label: 'Объём Z(20)', group: 'Объём', need: 'bars', applies: () => true, calc: (B) => volZ(B.bars, 20), html: (v) => v == null ? '—' : '<span class="' + (v >= 2 ? 'scr-pos' : v <= -1 ? 'scr-neg' : 'scr-muted') + '">' + num2(v) + '</span>', ft: 'num' },
    { id: 'rng', label: 'Диапазон ×ср', group: 'Объём', need: 'bars', applies: () => true, calc: (B) => rangeX(B.bars, 14), html: (v) => v == null ? '—' : '<span class="' + (v >= 1.5 ? 'scr-pos' : 'scr-muted') + '">' + num2(v) + '×</span>', ft: 'num' },
    { id: 'thirds', label: 'Макс-объём треть', group: 'Объём', need: 'sub', applies: () => true, calc: (B) => thirdsLast(B.sub, B.bars), html: thirdsFmt, ft: 'num' },
    { id: 'delta', label: 'Перевес агрессора', group: 'Микро (MOEX)', need: 'ts', applies: (i) => isMoex(i), calc: (B) => { const t = B.ts ? tsLast(B.ts, B.bars) : null; return t ? t.net : null; }, html: (v) => signHtml(v, '', true), ft: 'num' },
    { id: 'doi', label: 'ΔОИ', group: 'Микро (MOEX)', need: 'ts', applies: (i) => isMoex(i) && isFut(i), calc: (B) => { const t = B.ts && tsLast(B.ts, B.bars); return t ? t.doi : null; }, html: (v) => signHtml(v, '', true), ft: 'num' },
    { id: 'fizyur', label: 'Перевес физ (фьюч)', group: 'Микро (MOEX)', need: 'futoi', applies: (i) => isMoex(i) && isFut(i), calc: (B) => fizyurLast(B.futoi), html: (v) => signHtml(v, '', true), ft: 'num' },
    { id: 'sq9', label: 'Δ° Sq9 планет', group: 'Астро', need: 'bars', applies: () => true, calc: (B) => { const x = lastN(B.bars); return x ? sq9Nearest(x.close, x.timestamp) : null; }, html: (v) => v == null ? '—' : '<span class="' + (v <= 3 ? 'scr-pos' : 'scr-muted') + '">' + v.toFixed(1) + '°</span>', ft: 'num' },
    { id: 'cyc', label: 'Откл. циклов %', group: 'Астро', need: 'bars', applies: () => true, calc: (B) => cycleDev(B.bars, B.key), html: pctHtml, ft: 'num' },
  ];
  const paramDef = (id) => PARAMS.find((p) => p.id === id);

  /* ---------- CSS ---------- */
  function css() {
    if ($('scr-css')) return;
    const s = document.createElement('style'); s.id = 'scr-css';
    s.textContent = `
    body.scr-mode .menubar > .menu:not(#view-menu){display:none}
    #screener{flex:1 1 auto;min-height:0;overflow:hidden;flex-direction:column;background:var(--bg,#0b0e14);color:var(--text,#d7deea)}
    .scr-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:8px 14px;border-bottom:1px solid #232b3a;background:#121722}
    .scr-bar label{font-size:11px;color:#8b93a7;text-transform:uppercase;letter-spacing:.4px}
    .scr-sel,.scr-btn{background:#1a2130;color:#d7deea;border:1px solid #2a3446;border-radius:6px;padding:5px 9px;font-size:12px;cursor:pointer}
    .scr-btn:hover{border-color:#3aa0ff}
    .scr-btn.run{background:#1f2b3d;border-color:#3aa0ff;font-weight:600}
    .scr-btn.ghost{background:transparent}
    .scr-status{color:#7f8aa0;font-size:12px;margin-left:auto}
    .scr-pdrop{position:relative}
    .scr-pmenu{display:none;position:absolute;top:110%;left:0;z-index:60;background:#121722;border:1px solid #2a3446;border-radius:8px;padding:8px;min-width:260px;max-height:60vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.55)}
    .scr-pdrop.open .scr-pmenu{display:block}
    .scr-pmenu .sub{color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin:6px 2px 2px}
    .scr-pmenu label{display:flex;gap:7px;align-items:center;padding:4px;font-size:12px;color:#d7deea;text-transform:none;letter-spacing:0;cursor:pointer;border-radius:5px}
    .scr-pmenu label:hover{background:#1a2130}
    .scr-wrap{flex:1 1 auto;overflow:auto;padding:0 8px 20px}
    table.scr-tbl{width:100%;border-collapse:collapse;font-size:12px}
    .scr-tbl th{position:sticky;top:0;background:#0f1420;color:#8b93a7;font-weight:500;text-align:right;padding:7px 8px;border-bottom:1px solid #2a3446;cursor:pointer;white-space:nowrap;z-index:2}
    .scr-tbl th.l{text-align:left}
    .scr-tbl th.sort{color:#d7deea}
    .scr-tbl tr.scr-filt th{position:sticky;top:31px;background:#0d111a;padding:3px 5px;border-bottom:1px solid #1c2432;cursor:default;z-index:2}
    .scr-fmin,.scr-fmax{width:52px;background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:4px;padding:2px 3px;font-size:11px;text-align:right}
    .scr-fsel{background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:4px;font-size:11px}
    .scr-tbl td{padding:5px 8px;border-bottom:1px solid #171e2a;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .scr-tbl td.l{text-align:left}
    .scr-tbl tbody tr:hover{background:#172033}
    .scr-tk{font-weight:600;color:#d7deea;cursor:pointer}
    .scr-nm{color:#8b93a7;cursor:pointer;max-width:200px;overflow:hidden;text-overflow:ellipsis}
    .scr-star{cursor:pointer;color:#e0c040;width:20px;text-align:center}
    .scr-star.off{color:#39414f}
    .scr-pos{color:#34c98a}.scr-neg{color:#ef5c6a}.scr-muted{color:#7f8aa0}
    .scr-empty{padding:40px;text-align:center;color:#7f8aa0}
    #options-view{flex:1 1 auto;align-items:center;justify-content:center;color:#7f8aa0;font-size:14px;background:var(--bg,#0b0e14)}`;
    document.head.appendChild(s);
  }

  /* ---------- переключение видов ---------- */
  function setView(v) {
    S.view = v; css();
    const chart = $('chart'), scr = $('screener'), opt = $('options-view'), sym = $('sym-title');
    const isCh = v === 'charts';
    if (chart) chart.style.display = isCh ? '' : 'none';
    if (sym) sym.style.display = isCh ? '' : 'none';
    if (scr) scr.style.display = v === 'screener' ? 'flex' : 'none';
    if (opt) opt.style.display = v === 'options' ? 'flex' : 'none';
    document.body.classList.toggle('scr-mode', !isCh);
    const vb = $('view-btn'); if (vb) vb.textContent = (v === 'screener' ? '📊 Скриннер ▾' : v === 'options' ? '⛓ Опционы ▾' : '📈 Графики ▾');
    document.querySelectorAll('#view-drop [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    if (isCh) { setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (e) {} try { window.LUN_RESIZE_CHARTS && window.LUN_RESIZE_CHARTS(); } catch (e) {} }, 30); }
    else if (v === 'screener') { buildUI(); if (!S.rows.length && !S.loading) refresh(); }
    else if (v === 'options') { const o = $('options-view'); if (o && !o.dataset.f) { o.dataset.f = 1; o.textContent = '⛓ Опционы — раздел в разработке (уровни, греки, объёмы по страйкам).'; } }
  }

  /* ---------- UI ---------- */
  function buildUI() {
    if (S.built) return; css();
    const el = $('screener'); if (!el) return;
    const tfs = (window.LUN && window.LUN.TIMEFRAMES) || [];
    const tfOpts = tfs.map((t) => `<option value="${t.id}"${t.id === S.tfId ? ' selected' : ''}>${t.title}</option>`).join('');
    el.innerHTML = `
      <div class="scr-bar">
        <label>Вселенная</label>
        <select class="scr-sel" id="scr-uni">
          <option value="fav">★ Избранное</option>
          <option value="stocks">Все акции MOEX</option>
          <option value="futures">Все фьючерсы MOEX</option>
          <option value="crypto">Крипта</option>
        </select>
        <label>ТФ</label><select class="scr-sel" id="scr-tf">${tfOpts}</select>
        <div class="scr-pdrop" id="scr-pdrop"><button class="scr-btn" id="scr-pbtn">Параметры ▾</button><div class="scr-pmenu" id="scr-pmenu"></div></div>
        <button class="scr-btn run" id="scr-run">Обновить</button>
        <button class="scr-btn ghost" id="scr-clf">Сброс фильтров</button>
        <span class="scr-status" id="scr-status"></span>
      </div>
      <div class="scr-wrap"><table class="scr-tbl"><thead id="scr-head"></thead><tbody id="scr-body"></tbody></table></div>`;
    const pm = $('scr-pmenu'); const groups = {};
    PARAMS.forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
    let h = '';
    Object.keys(groups).forEach((g) => { h += `<div class="sub">${g}</div>`; groups[g].forEach((p) => { h += `<label><input type="checkbox" data-p="${p.id}"${S.params.has(p.id) ? ' checked' : ''}> ${p.label}</label>`; }); });
    pm.innerHTML = h;
    pm.querySelectorAll('input[data-p]').forEach((c) => { c.onchange = () => { if (c.checked) S.params.add(c.dataset.p); else { S.params.delete(c.dataset.p); delete S.filters[c.dataset.p]; } refresh(); }; });
    $('scr-pbtn').onclick = (e) => { e.stopPropagation(); $('scr-pdrop').classList.toggle('open'); };
    document.addEventListener('click', (e) => { const d = $('scr-pdrop'); if (d && !e.target.closest('#scr-pdrop')) d.classList.remove('open'); });
    $('scr-uni').onchange = (e) => { S.universe = e.target.value; refresh(); };
    $('scr-tf').onchange = (e) => { S.tfId = e.target.value; refresh(); };
    $('scr-run').onclick = () => refresh();
    $('scr-clf').onclick = () => { S.filters = {}; render(); };
    S.built = true;
  }

  /* ---------- вселенная + данные ---------- */
  async function resolveUniverse() {
    if (S.universe === 'fav') return (window.LUN_FAVS || []).slice();
    if (S.universe === 'crypto') return (window.LUN.INSTRUMENTS || []).filter((i) => ['bybit', 'binance'].indexOf(i.provider) >= 0);
    try { if (S.universe === 'stocks') return await window.LunInstruments.stocks(); if (S.universe === 'futures') return await window.LunInstruments.futures(); } catch (e) { return []; }
    return [];
  }
  const tfById = (id) => ((window.LUN && window.LUN.TIMEFRAMES) || []).find((t) => t.id === id) || { id: 'D1', type: 'day', iss: 24, span: 1 };
  const lookbackMs = (tf) => (tf.type === 'week' ? 500 : tf.type === 'day' ? 120 : tf.type === 'hour' ? 30 : 8) * 86400000;
  const tsWinMs = (tf) => (tf.type === 'week' ? 120 : tf.type === 'day' ? 45 : 20) * 86400000;
  function subTfOf(tf) { if (tf.type === 'hour') return { id: 'M5s', type: 'minute', span: 5, iss: 5 }; if (tf.type === 'day') return { id: 'M15s', type: 'minute', span: 15, iss: 15 }; if (tf.type === 'week') return { id: 'H1s', type: 'hour', span: 1, iss: 60 }; if (tf.type === 'minute' && tf.span >= 15) return { id: 'M5s', type: 'minute', span: 5, iss: 5 }; return null; }
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
  const kOf = (ins, tf, p) => p + '|' + (ins.ticker || ins.symbol || ins.id) + '|' + tf.id;

  async function getBars(ins, tf) { const k = kOf(ins, tf, 'b'); if (cacheBars.has(k)) return cacheBars.get(k); let b = null; try { b = await window.LunData.fetchTail(ins, tf, Date.now() - lookbackMs(tf)); } catch (e) {} if (b && b.length) cacheBars.set(k, b); return b; }
  async function getTS(ins, tf) { const k = kOf(ins, tf, 't'); if (cacheTS.has(k)) return cacheTS.get(k); let out = null; try { const sec = await window.LunData.resolveTicker(ins); const rows = await window.LunISS.fetchTradeStats(sec, fmt(Date.now() - tsWinMs(tf)), fmt(Date.now() + 86400000), algoMkt(ins)); out = window.LunFutoi.normalizeTradeStats(rows); } catch (e) { out = null; } if (out) cacheTS.set(k, out); return out; }
  async function getFutoi(ins) { const k = 'f|' + (ins.assetCode || ins.ticker); if (cacheFutoi.has(k)) return cacheFutoi.get(k); let out = null; try { const rows = await window.LunISS.fetchFUTOI(futoiCode(ins), fmt(Date.now() - 20 * 86400000), fmt(Date.now() + 86400000), { daily: true }); out = window.LunFutoi.normalize(rows); } catch (e) { out = null; } if (out) cacheFutoi.set(k, out); return out; }
  async function getSub(ins, tf) { const k = kOf(ins, tf, 's'); if (cacheSub.has(k)) return cacheSub.get(k); let out = null; if (isMoex(ins)) { const ts = await getTS(ins, tf); if (ts) out = ts.map((r) => ({ ts: r.ts, close: r.close, vol: (r.volB || 0) + (r.volS || 0) })); } else { const stf = subTfOf(tf); if (stf) { try { const b = await window.LunData.fetchTail(ins, stf, Date.now() - lookbackMs(tf)); out = (b || []).map((x) => ({ ts: x.timestamp, close: x.close, vol: x.volume || 0 })); } catch (e) {} } } if (out) cacheSub.set(k, out); return out; }

  async function mapLimit(items, limit, fn, onProg) {
    const out = new Array(items.length); let i = 0, done = 0;
    const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); done++; if (onProg) onProg(done, items.length); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
    return out;
  }
  function activeNeeds() { const n = new Set(); S.params.forEach((id) => { const d = paramDef(id); if (d) n.add(d.need); }); return n; }

  async function refresh() {
    if (!S.built) return; const my = ++S.seq; S.loading = true; render();
    const tf = tfById(S.tfId), needs = activeNeeds();
    const st = $('scr-status'); const setSt = (t) => { if (st && my === S.seq) st.textContent = t; };
    setSt('загрузка вселенной…');
    const uni = await resolveUniverse(); if (my !== S.seq) return;
    if (!uni.length) { S.rows = []; S.loading = false; render(); setSt('пусто'); return; }
    setSt('0 / ' + uni.length);
    const res = await mapLimit(uni, 6, async (ins) => {
      const B = { key: kOf(ins, tf, 'k') };
      B.bars = await getBars(ins, tf);
      if (needs.has('ts') && isMoex(ins)) B.ts = await getTS(ins, tf);
      if (needs.has('futoi') && isMoex(ins) && isFut(ins)) B.futoi = await getFutoi(ins);
      if (needs.has('sub')) B.sub = await getSub(ins, tf);
      return buildRow(ins, B);
    }, (d, n) => setSt(d + ' / ' + n));
    if (my !== S.seq) return;
    S.rows = res.filter(Boolean); S.loading = false;
    setSt(S.rows.length + ' инстр. · ' + tf.title);
    render();
  }
  function buildRow(ins, B) {
    const b = B.bars, x = lastN(b), prev = b && b.length > 1 ? b[b.length - 2] : null;
    const price = x ? x.close : null;
    const dpr = (x && prev && prev.close) ? (x.close - prev.close) / prev.close * 100 : null;
    const vol = x ? (x.volume || 0) : null;
    const avg = b && b.length > 1 ? b.slice(-Math.min(20, b.length), -1).reduce((s, k) => s + (k.volume || 0), 0) / Math.max(1, Math.min(20, b.length) - 1) : null;
    const dvol = (vol != null && avg) ? (vol - avg) / avg * 100 : null;
    const params = {};
    S.params.forEach((id) => { const d = paramDef(id); if (d && d.applies(ins)) { let v = null; try { v = d.calc(B); } catch (e) {} params[id] = { v, html: d.html(v) }; } else if (d) params[id] = { v: null, html: '<span class="scr-muted">—</span>' }; });
    return { ins, ticker: ins.ticker || ins.symbol || ins.id, name: ins.title || '', price, dpr, vol, dvol, prec: ins.pricePrecision, params };
  }

  /* ---------- колонки / фильтры / отрисовка ---------- */
  function cols() {
    const base = [
      { id: 'star', label: '★', l: true, nof: true, nos: true },
      { id: 'ticker', label: 'Тикер', l: true, sort: (r) => r.ticker, nof: true },
      { id: 'name', label: 'Название', l: true, sort: (r) => r.name, nof: true },
      { id: 'price', label: 'Цена', sort: (r) => r.price, ft: 'num', get: (r) => r.price },
      { id: 'dpr', label: 'Δ%', sort: (r) => r.dpr, ft: 'num', get: (r) => r.dpr },
      { id: 'vol', label: 'Объём', sort: (r) => r.vol, ft: 'num', get: (r) => r.vol },
      { id: 'dvol', label: 'ΔОб.%', sort: (r) => r.dvol, ft: 'num', get: (r) => r.dvol },
    ];
    const extra = [...S.params].map((id) => { const d = paramDef(id); return { id, label: d.label, sort: (r) => (r.params[id] ? r.params[id].v : null), ft: d.ft, get: (r) => (r.params[id] ? r.params[id].v : null) }; });
    return base.concat(extra);
  }
  function passFilters(r, c) {
    for (const col of c) { const f = S.filters[col.id]; if (!f) continue; const v = col.get ? col.get(r) : null;
      if (col.ft === 'sel3') { if (f.sel !== '' && f.sel != null && String(v) !== f.sel) return false; }
      else { if (f.min != null && (v == null || v < f.min)) return false; if (f.max != null && (v == null || v > f.max)) return false; }
    }
    return true;
  }
  function cellHtml(col, r) {
    if (col.id === 'star') { const on = favIs(r.ins); return `<span class="scr-star${on ? '' : ' off'}" data-star="1">${on ? '★' : '☆'}</span>`; }
    if (col.id === 'ticker') return `<span class="scr-tk" data-open="1">${r.ticker}</span>`;
    if (col.id === 'name') return `<span class="scr-nm" data-open="1" title="${r.name}">${r.name}</span>`;
    if (col.id === 'price') return r.price == null ? '<span class="scr-muted">—</span>' : fmtPrice(r.price, r.prec);
    if (col.id === 'dpr') return pctHtml(r.dpr);
    if (col.id === 'vol') return r.vol == null ? '<span class="scr-muted">—</span>' : fmtVol(r.vol);
    if (col.id === 'dvol') return pctHtml(r.dvol);
    return r.params[col.id] ? r.params[col.id].html : '—';
  }
  function favIs(ins) { try { return !!(window.LUN_FAV_API && window.LUN_FAV_API().isFav(ins)); } catch (e) { return false; } }
  function render() {
    if (!S.built) return; const c = cols();
    const head = $('scr-head'), body = $('scr-body'); if (!head || !body) return;
    const col = c.find((x) => x.id === S.sortId) || c[4], f = col.sort || (() => 0), dir = S.sortDir;
    let rows = S.rows.filter((r) => passFilters(r, c));
    rows.sort((a, b) => { const va = f(a), vb = f(b); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; if (typeof va === 'string') return dir * va.localeCompare(vb); return dir * (va - vb); });
    // строка заголовков
    let hh = '<tr>' + c.map((col) => `<th class="${col.l ? 'l' : ''}${col.id === S.sortId ? ' sort' : ''}"${col.nos ? '' : ` data-col="${col.id}"`}>${col.label}${col.id === S.sortId ? (S.sortDir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('') + '</tr>';
    // строка фильтров
    hh += '<tr class="scr-filt">' + c.map((col) => {
      if (col.nof) return '<th></th>';
      const f2 = S.filters[col.id] || {};
      if (col.ft === 'sel3') return `<th><select class="scr-fsel" data-fsel="${col.id}"><option value="">все</option><option value="1"${f2.sel === '1' ? ' selected' : ''}>▲hi</option><option value="-1"${f2.sel === '-1' ? ' selected' : ''}>▼lo</option><option value="0"${f2.sel === '0' ? ' selected' : ''}>—</option></select></th>`;
      return `<th><input class="scr-fmin" data-fmin="${col.id}" placeholder="min" value="${f2.min != null ? f2.min : ''}"><input class="scr-fmax" data-fmax="${col.id}" placeholder="max" value="${f2.max != null ? f2.max : ''}"></th>`;
    }).join('') + '</tr>';
    head.innerHTML = hh;
    if (!rows.length) body.innerHTML = `<tr><td class="scr-empty" colspan="${c.length}">${S.loading ? 'загрузка…' : (S.rows.length ? 'нет строк под фильтры' : 'нажмите «Обновить»')}</td></tr>`;
    else body.innerHTML = rows.map((r) => '<tr>' + c.map((col) => `<td class="${col.l ? 'l' : ''}">${cellHtml(col, r)}</td>`).join('') + '</tr>').join('');
    // события заголовков
    head.querySelectorAll('th[data-col]').forEach((th) => { th.onclick = () => { const id = th.dataset.col; if (S.sortId === id) S.sortDir *= -1; else { S.sortId = id; S.sortDir = -1; } render(); }; });
    head.querySelectorAll('[data-fmin]').forEach((el) => { el.oninput = () => setFilt(el.dataset.fmin, 'min', el.value); });
    head.querySelectorAll('[data-fmax]').forEach((el) => { el.oninput = () => setFilt(el.dataset.fmax, 'max', el.value); });
    head.querySelectorAll('[data-fsel]').forEach((el) => { el.onchange = () => { S.filters[el.dataset.fsel] = { sel: el.value }; render(); }; });
    // события строк
    body.querySelectorAll('tr').forEach((tr, i) => {
      const r = rows[i]; if (!r) return;
      const star = tr.querySelector('[data-star]'); if (star) star.onclick = (e) => { e.stopPropagation(); try { window.LUN_FAV_API().toggle(r.ins); } catch (x) {} star.classList.toggle('off'); star.textContent = star.classList.contains('off') ? '☆' : '★'; };
      tr.querySelectorAll('[data-open]').forEach((o) => { o.onclick = () => { setView('charts'); try { window.LUN_OPEN_INSTRUMENT(r.ins); } catch (e) {} }; });
    });
  }
  function setFilt(id, kind, val) { const f = S.filters[id] || {}; const n = val === '' ? null : +val; if (n == null || isNaN(n)) delete f[kind]; else f[kind] = n; if (f.min == null && f.max == null && f.sel == null) delete S.filters[id]; else S.filters[id] = f; renderBodyOnly(); }
  // при вводе в фильтр не пересобираем заголовки (чтобы не терять фокус) — только тело
  function renderBodyOnly() {
    const c = cols(); const col = c.find((x) => x.id === S.sortId) || c[4], f = col.sort || (() => 0), dir = S.sortDir;
    let rows = S.rows.filter((r) => passFilters(r, c));
    rows.sort((a, b) => { const va = f(a), vb = f(b); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; if (typeof va === 'string') return dir * va.localeCompare(vb); return dir * (va - vb); });
    const body = $('scr-body'); if (!body) return;
    if (!rows.length) { body.innerHTML = `<tr><td class="scr-empty" colspan="${c.length}">нет строк под фильтры</td></tr>`; return; }
    body.innerHTML = rows.map((r) => '<tr>' + c.map((col) => `<td class="${col.l ? 'l' : ''}">${cellHtml(col, r)}</td>`).join('') + '</tr>').join('');
    body.querySelectorAll('tr').forEach((tr, i) => { const r = rows[i]; if (!r) return; const star = tr.querySelector('[data-star]'); if (star) star.onclick = (e) => { e.stopPropagation(); try { window.LUN_FAV_API().toggle(r.ins); } catch (x) {} star.classList.toggle('off'); star.textContent = star.classList.contains('off') ? '☆' : '★'; }; tr.querySelectorAll('[data-open]').forEach((o) => { o.onclick = () => { setView('charts'); try { window.LUN_OPEN_INSTRUMENT(r.ins); } catch (e) {} }; }); });
  }

  function init() { css(); document.querySelectorAll('#view-drop [data-view]').forEach((b) => { b.addEventListener('click', () => { setView(b.dataset.view); document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); }); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.LunScreener = { setView, refresh };
})();
