/* =============================================================================
 *  screener.js — вид «Скриннер»: таблица инструментов с базовыми колонками
 *  (цена, Δ%, объём, Δоб.%) + выбираемые параметры доп-колонками.
 * =============================================================================
 *  Переключатель видов (Графики / Скриннер / Опционы) — вверху справа. Данные
 *  берём лёгким хвостом баров по выбранному ТФ (LunData.fetchTail) с ограничением
 *  параллельности; результат кэшируем на сессию. Клик по строке открывает
 *  инструмент в графике. Звезда — избранное (мост LUN_FAV_API из app.js).
 *
 *  Дешёвый костяк v1. Тяжёлые колонки (макс-объём в трети, VWAP±σ, ОИ/дельта
 *  бид-аск, физ/юр, SQ9, циклы) подключаются позже как compute-функции.
 * ===========================================================================*/
(function () {
  const S = { view: 'charts', built: false, universe: 'fav', tfId: 'D1', params: new Set(),
              rows: [], sortId: 'dvol', sortDir: -1, loading: false, seq: 0 };
  const barsCache = new Map();   // ticker|tfId -> bars
  const $ = (id) => document.getElementById(id);

  /* ---------- формат ---------- */
  const fmtPrice = (v, p) => v == null ? '—' : (v >= 1000 ? v.toFixed(Math.min(p || 0, 2)) : v.toFixed(p != null ? p : 2));
  const fmtVol = (v) => { if (v == null) return '—'; const a = Math.abs(v); if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B'; if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k'; return '' + Math.round(v); };
  const pctHtml = (v) => v == null ? '<span class="scr-muted">—</span>' : '<span class="' + (v > 0 ? 'scr-pos' : v < 0 ? 'scr-neg' : 'scr-muted') + '">' + (v > 0 ? '+' : '') + v.toFixed(2) + '%</span>';
  const num2 = (v) => v == null ? '—' : v.toFixed(2);

  /* ---------- вычислители по барам (bars: по возрастанию времени) ---------- */
  const lastN = (b) => b && b.length ? b[b.length - 1] : null;
  function momN(b, n) { if (!b || b.length <= n) return null; const a = b[b.length - 1 - n].close, c = b[b.length - 1].close; return a ? (c - a) / a * 100 : null; }
  function posInBar(b) { const x = lastN(b); if (!x) return null; const rng = x.high - x.low; return rng > 0 ? (x.close - x.low) / rng : 0.5; }
  function newExt(b, n) { if (!b || b.length < 3) return null; const w = b.slice(-Math.min(n, b.length)); const x = w[w.length - 1]; const hi = Math.max.apply(null, w.map((k) => k.high)), lo = Math.min.apply(null, w.map((k) => k.low)); if (x.high >= hi) return 1; if (x.low <= lo) return -1; return 0; }
  function volZ(b, n) { if (!b || b.length < 4) return null; const w = b.slice(-Math.min(n + 1, b.length)); const prev = w.slice(0, -1).map((k) => k.volume || 0); const x = (w[w.length - 1].volume || 0); const m = prev.reduce((s, v) => s + v, 0) / prev.length; const sd = Math.sqrt(prev.reduce((s, v) => s + (v - m) * (v - m), 0) / prev.length) || 1; return (x - m) / sd; }
  function rangeX(b, n) { if (!b || b.length < 3) return null; const w = b.slice(-Math.min(n + 1, b.length)); const prev = w.slice(0, -1).map((k) => (k.high - k.low) || 0); const x = (w[w.length - 1].high - w[w.length - 1].low) || 0; const m = prev.reduce((s, v) => s + v, 0) / prev.length || 1; return x / m; }

  /* ---------- реестр параметров (доп-колонки) ---------- */
  const posFmt = (v) => v == null ? '—' : (v >= 0.66 ? '<span class="scr-neg">▲ верх ' : v <= 0.34 ? '<span class="scr-pos">▼ низ ' : '<span class="scr-muted">= сер ') + Math.round(v * 100) + '%</span>';
  const extFmt = (v) => v == null ? '—' : v > 0 ? '<span class="scr-pos">▲ hi</span>' : v < 0 ? '<span class="scr-neg">▼ lo</span>' : '<span class="scr-muted">—</span>';
  const PARAMS = [
    { id: 'mom', label: 'Δ% за 5', group: 'Цена', calc: (b) => momN(b, 5), html: (v) => pctHtml(v) },
    { id: 'posbar', label: 'Закрытие в баре', group: 'Цена', calc: (b) => posInBar(b), html: posFmt },
    { id: 'ext', label: 'Новый hi/lo (20)', group: 'Цена', calc: (b) => newExt(b, 20), html: extFmt },
    { id: 'volz', label: 'Объём Z (20)', group: 'Объём', calc: (b) => volZ(b, 20), html: (v) => v == null ? '—' : '<span class="' + (v >= 2 ? 'scr-pos' : v <= -1 ? 'scr-neg' : 'scr-muted') + '">' + num2(v) + '</span>' },
    { id: 'rng', label: 'Диапазон ×ср', group: 'Объём', calc: (b) => rangeX(b, 14), html: (v) => v == null ? '—' : '<span class="' + (v >= 1.5 ? 'scr-pos' : 'scr-muted') + '">' + num2(v) + '×</span>' },
  ];
  // Роадмап-параметры (подключим позже — микроструктура/астро). Пока в списке серым.
  const SOON = [
    { id: 'thirds', label: 'Макс-объём в трети дня/нед', note: 'нужен суб-бар (M5/M15/H1)' },
    { id: 'vwap', label: 'VWAP ±1σ/±2σ', note: 'нужен внутридневной VWAP' },
    { id: 'doi', label: 'Прирост ОИ (фьюч)', note: 'AlgoPack tradestats' },
    { id: 'delta', label: 'Перевес бид/аск дня/нед (фьюч)', note: 'AlgoPack tradestats' },
    { id: 'fizyur', label: 'Перевес физ/юр (фьюч)', note: 'FUTOI' },
    { id: 'sq9', label: 'SQ9: цена на градусе планеты', note: 'астро-расчёт' },
    { id: 'cycle', label: 'Отн. прогноза циклов', note: 'астро-расчёт' },
  ];
  const paramDef = (id) => PARAMS.find((p) => p.id === id);

  /* ---------- CSS ---------- */
  function css() {
    if ($('scr-css')) return;
    const s = document.createElement('style'); s.id = 'scr-css';
    s.textContent = `
    #screener{flex:1 1 auto;min-height:0;overflow:hidden;display:none;flex-direction:column;background:var(--bg,#0b0e14);color:var(--text,#d7deea)}
    #screener.on{display:flex}
    .scr-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:8px 14px;border-bottom:1px solid #232b3a;background:#121722}
    .scr-bar label{font-size:11px;color:#8b93a7;text-transform:uppercase;letter-spacing:.4px}
    .scr-sel,.scr-btn{background:#1a2130;color:#d7deea;border:1px solid #2a3446;border-radius:6px;padding:5px 9px;font-size:12px;cursor:pointer}
    .scr-btn:hover{border-color:#3aa0ff}
    .scr-btn.run{background:#1f2b3d;border-color:#3aa0ff;font-weight:600}
    .scr-status{color:#7f8aa0;font-size:12px;margin-left:auto}
    .scr-pdrop{position:relative}
    .scr-pmenu{display:none;position:absolute;top:110%;left:0;z-index:60;background:#121722;border:1px solid #2a3446;border-radius:8px;padding:8px;min-width:260px;max-height:60vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.55)}
    .scr-pdrop.open .scr-pmenu{display:block}
    .scr-pmenu .sub{color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin:6px 2px 2px}
    .scr-pmenu label{display:flex;gap:7px;align-items:center;padding:4px 4px;font-size:12px;color:#d7deea;text-transform:none;letter-spacing:0;cursor:pointer;border-radius:5px}
    .scr-pmenu label:hover{background:#1a2130}
    .scr-pmenu label.soon{color:#5b6470;cursor:not-allowed}
    .scr-wrap{flex:1 1 auto;overflow:auto;padding:0 8px 20px}
    table.scr-tbl{width:100%;border-collapse:collapse;font-size:12px}
    .scr-tbl th{position:sticky;top:0;background:#0f1420;color:#8b93a7;font-weight:500;text-align:right;padding:8px 8px;border-bottom:1px solid #2a3446;cursor:pointer;white-space:nowrap;z-index:2}
    .scr-tbl th.l{text-align:left}
    .scr-tbl th.sort{color:#d7deea}
    .scr-tbl td{padding:5px 8px;border-bottom:1px solid #171e2a;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    .scr-tbl td.l{text-align:left}
    .scr-tbl tbody tr:hover{background:#172033}
    .scr-tk{font-weight:600;color:#d7deea;cursor:pointer}
    .scr-nm{color:#8b93a7;cursor:pointer;max-width:220px;overflow:hidden;text-overflow:ellipsis}
    .scr-star{cursor:pointer;color:#e0c040;width:20px;text-align:center}
    .scr-star.off{color:#39414f}
    .scr-pos{color:#34c98a}.scr-neg{color:#ef5c6a}.scr-muted{color:#7f8aa0}
    .scr-empty{padding:40px;text-align:center;color:#7f8aa0}
    #options-view{flex:1 1 auto;display:none;align-items:center;justify-content:center;color:#7f8aa0;font-size:14px;background:var(--bg,#0b0e14)}
    #options-view.on{display:flex}`;
    document.head.appendChild(s);
  }

  /* ---------- переключение видов ---------- */
  function setView(v) {
    S.view = v;
    const chart = $('chart'), scr = $('screener'), opt = $('options-view'), sym = $('sym-title');
    const isCh = v === 'charts';
    if (chart) chart.style.display = isCh ? '' : 'none';
    if (sym) sym.style.display = isCh ? '' : 'none';
    if (scr) scr.style.display = v === 'screener' ? 'flex' : 'none';
    if (opt) opt.style.display = v === 'options' ? 'flex' : 'none';
    const vb = $('view-btn'); if (vb) vb.textContent = (v === 'screener' ? '📊 Скриннер ▾' : v === 'options' ? '⛓ Опционы ▾' : '📈 Графики ▾');
    document.querySelectorAll('#view-drop [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    if (isCh) { setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (e) {} try { window.LUN_RESIZE_CHARTS && window.LUN_RESIZE_CHARTS(); } catch (e) {} }, 30); }
    else if (v === 'screener') { buildUI(); if (!S.rows.length && !S.loading) refresh(); }
    else if (v === 'options') { const o = $('options-view'); if (o && !o.dataset.f) { o.dataset.f = 1; o.textContent = '⛓ Опционы — раздел в разработке (уровни, греки, объёмы по страйкам).'; } }
  }

  /* ---------- построение UI ---------- */
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
        <label>ТФ</label>
        <select class="scr-sel" id="scr-tf">${tfOpts}</select>
        <div class="scr-pdrop" id="scr-pdrop">
          <button class="scr-btn" id="scr-pbtn">Параметры ▾</button>
          <div class="scr-pmenu" id="scr-pmenu"></div>
        </div>
        <button class="scr-btn run" id="scr-run">Обновить</button>
        <span class="scr-status" id="scr-status"></span>
      </div>
      <div class="scr-wrap"><table class="scr-tbl"><thead id="scr-head"></thead><tbody id="scr-body"></tbody></table></div>`;
    // меню параметров
    const pm = $('scr-pmenu'); const groups = {};
    PARAMS.forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
    let h = '';
    Object.keys(groups).forEach((g) => { h += `<div class="sub">${g}</div>`; groups[g].forEach((p) => { h += `<label><input type="checkbox" data-p="${p.id}"${S.params.has(p.id) ? ' checked' : ''}> ${p.label}</label>`; }); });
    h += '<div class="sub">Скоро (микроструктура / астро)</div>';
    SOON.forEach((p) => { h += `<label class="soon" title="${p.note}"><input type="checkbox" disabled> ${p.label}</label>`; });
    pm.innerHTML = h;
    pm.querySelectorAll('input[data-p]').forEach((c) => { c.onchange = () => { if (c.checked) S.params.add(c.dataset.p); else S.params.delete(c.dataset.p); render(); }; });
    $('scr-pbtn').onclick = (e) => { e.stopPropagation(); $('scr-pdrop').classList.toggle('open'); };
    document.addEventListener('click', (e) => { const d = $('scr-pdrop'); if (d && !e.target.closest('#scr-pdrop')) d.classList.remove('open'); });
    $('scr-uni').onchange = (e) => { S.universe = e.target.value; refresh(); };
    $('scr-tf').onchange = (e) => { S.tfId = e.target.value; refresh(); };
    $('scr-run').onclick = () => refresh();
    S.built = true;
  }

  /* ---------- данные ---------- */
  async function resolveUniverse() {
    if (S.universe === 'fav') return (window.LUN_FAVS || []).slice();
    if (S.universe === 'crypto') return (window.LUN.INSTRUMENTS || []).filter((i) => ['bybit', 'binance'].indexOf(i.provider) >= 0);
    try {
      if (S.universe === 'stocks') return await window.LunInstruments.stocks();
      if (S.universe === 'futures') return await window.LunInstruments.futures();
    } catch (e) { return []; }
    return [];
  }
  const tfById = (id) => ((window.LUN && window.LUN.TIMEFRAMES) || []).find((t) => t.id === id) || { id: 'D1', type: 'day', iss: 24, span: 1 };
  function lookbackMs(tf) { const d = tf.type === 'week' ? 500 : tf.type === 'day' ? 120 : tf.type === 'hour' ? 30 : 8; return d * 86400000; }
  async function fetchBars(ins, tf) {
    const key = (ins.ticker || ins.symbol || ins.id) + '|' + tf.id;
    if (barsCache.has(key)) return barsCache.get(key);
    let bars = null;
    try { bars = await window.LunData.fetchTail(ins, tf, Date.now() - lookbackMs(tf)); } catch (e) { bars = null; }
    if (bars && bars.length) barsCache.set(key, bars);
    return bars;
  }
  async function mapLimit(items, limit, fn, onProg) {
    const out = new Array(items.length); let i = 0, done = 0;
    const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); done++; if (onProg) onProg(done, items.length); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
    return out;
  }
  async function refresh() {
    if (!S.built) return; const my = ++S.seq; S.loading = true;
    const tf = tfById(S.tfId);
    const st = $('scr-status'); const setSt = (t) => { if (st && my === S.seq) st.textContent = t; };
    setSt('загрузка вселенной…');
    const uni = await resolveUniverse(); if (my !== S.seq) return;
    if (!uni.length) { S.rows = []; render(); setSt('пусто'); S.loading = false; return; }
    setSt('0 / ' + uni.length);
    const res = await mapLimit(uni, 6, async (ins) => {
      const bars = await fetchBars(ins, tf); return buildRow(ins, bars);
    }, (d, n) => setSt(d + ' / ' + n));
    if (my !== S.seq) return;
    S.rows = res.filter(Boolean); S.loading = false;
    setSt(S.rows.length + ' инстр. · ' + tf.title + (window.LUN_FUTOI_SRC ? '' : ''));
    render();
  }
  function buildRow(ins, bars) {
    const x = lastN(bars), prev = bars && bars.length > 1 ? bars[bars.length - 2] : null;
    const price = x ? x.close : null;
    const dpr = (x && prev && prev.close) ? (x.close - prev.close) / prev.close * 100 : null;
    const vol = x ? (x.volume || 0) : null;
    const dvol = (x && prev && prev.volume) ? ((x.volume || 0) - prev.volume) / prev.volume * 100 : null;
    const params = {};
    S.params.forEach((id) => { const d = paramDef(id); if (d) { const v = bars ? d.calc(bars) : null; params[id] = { v, html: d.html(v) }; } });
    return { ins, ticker: ins.ticker || ins.symbol || ins.id, name: ins.title || '', price, dpr, vol, dvol, prec: ins.pricePrecision, params, bars: !!(bars && bars.length) };
  }

  /* ---------- отрисовка ---------- */
  function cols() {
    const base = [
      { id: 'star', label: '★', l: true, nosort: true },
      { id: 'ticker', label: 'Тикер', l: true, sort: (r) => r.ticker },
      { id: 'name', label: 'Название', l: true, sort: (r) => r.name },
      { id: 'price', label: 'Цена', sort: (r) => r.price },
      { id: 'dpr', label: 'Δ%', sort: (r) => r.dpr },
      { id: 'vol', label: 'Объём', sort: (r) => r.vol },
      { id: 'dvol', label: 'ΔОб.%', sort: (r) => r.dvol },
    ];
    const extra = [...S.params].map((id) => { const d = paramDef(id); return { id, label: d.label, sort: (r) => (r.params[id] ? r.params[id].v : null) }; });
    return base.concat(extra);
  }
  function sortRows(c) {
    const col = c.find((x) => x.id === S.sortId) || c[4];
    const f = col.sort || (() => 0), dir = S.sortDir;
    S.rows.sort((a, b) => { const va = f(a), vb = f(b); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; if (typeof va === 'string') return dir * va.localeCompare(vb); return dir * (va - vb); });
  }
  function cellHtml(c, r) {
    if (c.id === 'star') { const on = favIs(r.ins); return `<span class="scr-star${on ? '' : ' off'}" data-star="1">${on ? '★' : '☆'}</span>`; }
    if (c.id === 'ticker') return `<span class="scr-tk" data-open="1">${r.ticker}</span>`;
    if (c.id === 'name') return `<span class="scr-nm" data-open="1" title="${r.name}">${r.name}</span>`;
    if (c.id === 'price') return r.price == null ? '<span class="scr-muted">—</span>' : fmtPrice(r.price, r.prec);
    if (c.id === 'dpr') return pctHtml(r.dpr);
    if (c.id === 'vol') return r.vol == null ? '<span class="scr-muted">—</span>' : fmtVol(r.vol);
    if (c.id === 'dvol') return pctHtml(r.dvol);
    return r.params[c.id] ? r.params[c.id].html : '—';
  }
  function favIs(ins) { try { return !!(window.LUN_FAV_API && window.LUN_FAV_API().isFav(ins)); } catch (e) { return false; } }
  function render() {
    if (!S.built) return; const c = cols(); sortRows(c);
    const head = $('scr-head'), body = $('scr-body'); if (!head || !body) return;
    head.innerHTML = '<tr>' + c.map((col) => `<th class="${col.l ? 'l' : ''}${col.id === S.sortId ? ' sort' : ''}"${col.nosort ? '' : ` data-col="${col.id}"`}>${col.label}${col.id === S.sortId ? (S.sortDir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('') + '</tr>';
    if (!S.rows.length) { body.innerHTML = `<tr><td class="scr-empty" colspan="${c.length}">${S.loading ? 'загрузка…' : 'нет данных — нажмите «Обновить»'}</td></tr>`; }
    else body.innerHTML = S.rows.map((r) => '<tr>' + c.map((col) => `<td class="${col.l ? 'l' : ''}">${cellHtml(col, r)}</td>`).join('') + '</tr>').join('');
    head.querySelectorAll('th[data-col]').forEach((th) => { th.onclick = () => { const id = th.dataset.col; if (S.sortId === id) S.sortDir *= -1; else { S.sortId = id; S.sortDir = -1; } render(); }; });
    body.querySelectorAll('tr').forEach((tr, i) => {
      const r = S.rows[i]; if (!r) return;
      const star = tr.querySelector('[data-star]'); if (star) star.onclick = (e) => { e.stopPropagation(); try { window.LUN_FAV_API().toggle(r.ins); } catch (x) {} star.classList.toggle('off'); star.textContent = star.classList.contains('off') ? '☆' : '★'; };
      tr.querySelectorAll('[data-open]').forEach((o) => { o.onclick = () => openInChart(r.ins); });
    });
  }
  function openInChart(ins) { setView('charts'); try { window.LUN_OPEN_INSTRUMENT(ins); } catch (e) {} }

  /* ---------- init ---------- */
  function init() {
    css();
    document.querySelectorAll('#view-drop [data-view]').forEach((b) => {
      b.addEventListener('click', () => { setView(b.dataset.view); document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.LunScreener = { setView, refresh };
})();
