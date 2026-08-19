/* =============================================================================
 *  settings.js — настройки знаков и циклов прямо в интерфейсе
 * =============================================================================
 *  Меняет цвета знаков и зоны циклов без правки файлов; сохраняет в браузер
 *  (localStorage). Применяется к window.LUN.SIGNS / window.LUN.CYCLES до сборки
 *  графика, а по кнопке «Применить» перестраивает лунные панели.
 * ===========================================================================*/
(function () {
  const KEY = 'lun_settings_v1';
  const BODIES = ['Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const BIASES = [['long', 'ЛОНГ'], ['short', 'ШОРТ'], ['range', 'рэндж']];

  /* ---------- хранение ---------- */
  function loadStored() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function saveStored() {
    const I = window.LUN.INDICATORS;
    const data = {
      signs: window.LUN.SIGNS.map((s) => ({ color: s.color })),
      cycles: window.LUN.CYCLES.map((c) => ({ id: c.id, title: c.title, body: c.body, enabled: c.enabled, zones: c.zones })),
      indicators: { smaPeriods: I.sma.periods, emaPeriods: I.ema.periods, vwapSigma: I.vwap.sigma, vwapReset: I.vwap.reset },
      aspects: { planets: window.LUN.ASPECT_PLANETS.map((p) => ({ body: p.body, enabled: p.enabled })), all: window.LUN.ALL_ASPECTS.enabled, orb: window.LUN.ASPECTS.orb },
      gann: { unitPerBar: window.LUN.GANN.unitPerBar, extendRight: window.LUN.GANN.extendRight },
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  }
  function applyStored() {
    const d = loadStored(); if (!d) return;
    if (Array.isArray(d.signs)) d.signs.forEach((s, i) => { if (window.LUN.SIGNS[i] && s && s.color) window.LUN.SIGNS[i].color = s.color; });
    if (Array.isArray(d.cycles)) window.LUN.CYCLES.forEach((c) => {
      const sv = d.cycles.find((x) => x.id === c.id);
      if (sv) { c.title = sv.title || c.title; c.body = sv.body || c.body; c.enabled = !!sv.enabled; if (Array.isArray(sv.zones)) c.zones = sv.zones; }
    });
    const di = d.indicators, I = window.LUN.INDICATORS;
    if (di) {
      if (Array.isArray(di.smaPeriods)) I.sma.periods = di.smaPeriods;
      if (Array.isArray(di.emaPeriods)) I.ema.periods = di.emaPeriods;
      if (Array.isArray(di.vwapSigma)) I.vwap.sigma = di.vwapSigma;
      if (di.vwapReset) I.vwap.reset = di.vwapReset;
    }
    if (d.aspects) {
      if (Array.isArray(d.aspects.planets)) d.aspects.planets.forEach((sp) => { const pl = window.LUN.ASPECT_PLANETS.find((p) => p.body === sp.body); if (pl) pl.enabled = !!sp.enabled; });
      if (typeof d.aspects.all === 'boolean') window.LUN.ALL_ASPECTS.enabled = d.aspects.all;
      if (typeof d.aspects.orb === 'number') window.LUN.ASPECTS.orb = d.aspects.orb;
    }
    if (d.gann) {
      window.LUN.GANN.unitPerBar = (typeof d.gann.unitPerBar === 'number') ? d.gann.unitPerBar : null;
      window.LUN.GANN.extendRight = d.gann.extendRight !== false;
    }
  }
  applyStored();     // до сборки графика

  /* ---------- вёрстка модалки ---------- */
  const css = `
  .lun-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1000}
  .lun-modal{background:#121722;border:1px solid #232b3a;border-radius:10px;width:min(860px,94vw);max-height:88vh;overflow:auto;color:#d7deea;font:13px system-ui,sans-serif}
  .lun-modal h2{margin:0;padding:12px 16px;border-bottom:1px solid #232b3a;font-size:15px;display:flex;align-items:center}
  .lun-modal h2 .x{margin-left:auto;cursor:pointer;color:#8b93a7;font-size:20px;line-height:1}
  .lun-sec{padding:12px 16px;border-bottom:1px solid #1c2230}
  .lun-sec h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#8b93a7}
  .lun-signs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .lun-sign{display:flex;align-items:center;gap:6px;background:#1a2130;border:1px solid #232b3a;border-radius:6px;padding:4px 6px}
  .lun-sign span{flex:1}
  .lun-cy{border:1px solid #232b3a;border-radius:8px;padding:10px;margin-bottom:10px;background:#0f141d}
  .lun-cy-head{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
  .lun-cy-head input[type=text]{flex:1;min-width:120px}
  .lun-zones{width:100%;border-collapse:collapse}
  .lun-zones th,.lun-zones td{padding:3px 4px;text-align:left;font-weight:400}
  .lun-zones th{color:#8b93a7;font-size:11px}
  .lun-modal input,.lun-modal select{background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:5px;padding:3px 5px;font:12px system-ui}
  .lun-modal input[type=number]{width:56px}
  .lun-modal input[type=color]{padding:0;width:34px;height:24px}
  .lun-btn{background:#1a2130;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 10px;cursor:pointer}
  .lun-btn:hover{border-color:#3aa0ff}
  .lun-btn.primary{background:#3aa0ff;color:#04121f;border-color:#3aa0ff;font-weight:600}
  .lun-btn.mini{padding:1px 7px}
  .lun-foot{display:flex;gap:8px;padding:12px 16px;position:sticky;bottom:0;background:#121722;border-top:1px solid #232b3a}
  .lun-hint{color:#6b7280;font-size:11px;margin:4px 0 0}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (k === 'class') e.className = v; else if (k in e) e[k] = v; else e.setAttribute(k, v); });
    (children || []).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }
  const select = (opts, val) => el('select', {}, opts.map(([v, t]) => {
    const o = el('option', { value: v }, [t]); if (v === val) o.selected = true; return o;
  }));

  function zoneRow(z) {
    const from = el('input', { type: 'number', min: 0, max: 360, value: z.from });
    const to = el('input', { type: 'number', min: 0, max: 360, value: z.to });
    const bias = select(BIASES, z.bias);
    const color = el('input', { type: 'color', value: z.color || '#888888' });
    const label = el('input', { type: 'text', value: z.label || '' });
    const del = el('button', { class: 'lun-btn mini', title: 'удалить' }, ['✕']);
    const tr = el('tr', {}, [el('td', {}, [from]), el('td', {}, [to]), el('td', {}, [bias]), el('td', {}, [color]), el('td', {}, [label]), el('td', {}, [del])]);
    tr._read = () => ({ from: +from.value, to: +to.value, bias: bias.value, color: color.value, label: label.value });
    del.onclick = () => tr.remove();
    return tr;
  }

  function cycleBlock(cy) {
    const en = el('input', { type: 'checkbox', checked: cy.enabled });
    const title = el('input', { type: 'text', value: cy.title });
    const body = select(BODIES.map((b) => [b, b]), cy.body);
    const tbody = el('tbody', {}, cy.zones.map(zoneRow));
    const table = el('table', { class: 'lun-zones' }, [
      el('thead', {}, [el('tr', {}, [['от°'], ['до°'], ['bias'], ['цвет'], ['подпись'], ['']].map((h) => el('th', {}, h)))]),
      tbody,
    ]);
    const add = el('button', { class: 'lun-btn mini' }, ['+ зона']);
    add.onclick = () => tbody.appendChild(zoneRow({ from: 0, to: 30, bias: 'long', color: '#2a7a52', label: '' }));
    const block = el('div', { class: 'lun-cy' }, [
      el('div', { class: 'lun-cy-head' }, [el('label', {}, [en, ' показывать']), title, el('label', {}, ['тело: ', body])]),
      table, add,
    ]);
    block._read = () => ({ id: cy.id, title: title.value, body: body.value, enabled: en.checked, zones: [...tbody.children].map((tr) => tr._read()) });
    return block;
  }

  function open(onApply) {
    const signInputs = window.LUN.SIGNS.map((s) => {
      const inp = el('input', { type: 'color', value: s.color });
      return { inp, row: el('div', { class: 'lun-sign' }, [inp, el('span', {}, [`${s.glyph} ${s.name}`])]) };
    });
    const cycleBlocks = window.LUN.CYCLES.map(cycleBlock);

    // блок индикаторов
    const I = window.LUN.INDICATORS;
    const inSma = el('input', { type: 'text', value: I.sma.periods.join(', ') });
    const inEma = el('input', { type: 'text', value: I.ema.periods.join(', ') });
    const inSig = el('input', { type: 'text', value: I.vwap.sigma.join(', ') });
    const inReset = select([['day', 'внутридневной (сброс в 0:00 МСК)'], ['none', 'сплошной']], I.vwap.reset);
    const numList = (s) => String(s).split(',').map((x) => parseFloat(x.trim())).filter((n) => !isNaN(n));
    const indSection = el('div', { class: 'lun-sec' }, [
      el('h3', {}, ['Индикаторы']),
      el('div', { class: 'lun-cy-head' }, [el('label', {}, ['SMA периоды: ', inSma]), el('label', {}, ['EMA периоды: ', inEma])]),
      el('div', { class: 'lun-cy-head' }, [el('label', {}, ['VWAP σ: ', inSig]), el('label', {}, ['VWAP сессия: ', inReset])]),
      el('p', { class: 'lun-hint' }, ['Периоды через запятую (напр. 20, 50). Изменения применятся к включённым индикаторам.']),
    ]);

    // блок аспектов: полосы ☉/планета (галочки) + сводная «все» + общий орб 2–6°
    const aspChecks = window.LUN.ASPECT_PLANETS.map((pl) => {
      const cb = el('input', { type: 'checkbox', checked: pl.enabled });
      return { pl, cb, row: el('label', { class: 'lun-sign' }, [cb, el('span', {}, [pl.glyph + ' ' + pl.body])]) };
    });
    const cbAll = el('input', { type: 'checkbox', checked: window.LUN.ALL_ASPECTS.enabled });
    const inOrb = el('input', { type: 'number', min: 2, max: 6, step: 0.5, value: Math.min(6, Math.max(2, +window.LUN.ASPECTS.orb || 3)) });
    const aspSection = el('div', { class: 'lun-sec' }, [
      el('h3', {}, ['Аспекты к Солнцу (☉/планета)']),
      el('div', { class: 'lun-signs' }, aspChecks.map((x) => x.row)),
      el('div', { class: 'lun-cy-head' }, [el('label', {}, ['общий орб °: ', inOrb]), el('label', {}, [cbAll, ' сводная полоса всех аспектов ∀'])]),
      el('p', { class: 'lun-hint' }, ['☉/планета — своя полоса на планету (Луна = фазы). ∀ — все пары одной строкой (подробно на M5/M15, на H1/D — отметки). Орб 2–6°.']),
    ]);

    // блок линии Ганна
    const G = window.LUN.GANN;
    const inUnit = el('input', { type: 'number', min: 0, max: 100000, step: 'any', value: G.unitPerBar == null ? '' : G.unitPerBar });
    const inExt = el('input', { type: 'checkbox', checked: G.extendRight !== false });
    const gannSection = el('div', { class: 'lun-sec' }, [
      el('h3', {}, ['Линия Ганна']),
      el('div', { class: 'lun-cy-head' }, [
        el('label', {}, ['угол (цена за бар): ', inUnit]),
        el('label', {}, [inExt, ' продолжение вправо (иначе отрезок)']),
      ]),
      el('p', { class: 'lun-hint' }, ['Пусто/0 = наклон по двум точкам. Число = ТОЧНЫЙ угол от т1 (т1 закреплена, т2 задаёт лишь направление вверх/вниз). Величина — цена на 1 бар (напр. Si ≈ 50–200, золото ≈ 2–10). Рисуется кнопкой «Ган 1×1».']),
    ]);

    const bg = el('div', { class: 'lun-modal-bg' });
    const close = () => bg.remove();
    const modal = el('div', { class: 'lun-modal' }, [
      el('h2', {}, ['⚙ Настройки', el('span', { class: 'x', title: 'закрыть' }, ['×'])]),
      el('div', { class: 'lun-sec' }, [el('h3', {}, ['Цвета знаков']), el('div', { class: 'lun-signs' }, signInputs.map((s) => s.row)),
        el('p', { class: 'lun-hint' }, ['Сейчас по стихиям. Меняй под себя — сохранится в браузере.'])]),
      el('div', { class: 'lun-sec' }, [el('h3', {}, ['Циклы и торговые зоны']), ...cycleBlocks,
        el('p', { class: 'lun-hint' }, ['Долгота 0°=Овен. 15° Близнецов=75°, 15° Весов=195°, 15° Козерога=285°. Зона может идти через 360° (напр. 285→75). Тело: Луна/Солнце/Меркурий/... — для второго цикла.'])]),
      indSection,
      aspSection,
      gannSection,
    ]);
    const apply = el('button', { class: 'lun-btn primary' }, ['Применить']);
    const reset = el('button', { class: 'lun-btn' }, ['Сбросить к стандартным']);
    const cancel = el('button', { class: 'lun-btn' }, ['Отмена']);
    modal.appendChild(el('div', { class: 'lun-foot' }, [apply, reset, el('span', { style: 'flex:1' }), cancel]));
    bg.appendChild(modal); document.body.appendChild(bg);

    modal.querySelector('.x').onclick = close;
    cancel.onclick = close;
    bg.onclick = (e) => { if (e.target === bg) close(); };
    apply.onclick = () => {
      signInputs.forEach((s, i) => { window.LUN.SIGNS[i].color = s.inp.value; });
      window.LUN.CYCLES = cycleBlocks.map((b) => b._read());
      const I = window.LUN.INDICATORS;
      if (numList(inSma.value).length) I.sma.periods = numList(inSma.value);
      if (numList(inEma.value).length) I.ema.periods = numList(inEma.value);
      if (numList(inSig.value).length) I.vwap.sigma = numList(inSig.value);
      I.vwap.reset = inReset.value;
      aspChecks.forEach((x) => { x.pl.enabled = x.cb.checked; });
      window.LUN.ALL_ASPECTS.enabled = cbAll.checked;
      const orb = parseFloat(inOrb.value); if (!isNaN(orb)) window.LUN.ASPECTS.orb = Math.min(6, Math.max(2, orb));
      const G2 = window.LUN.GANN;
      G2.unitPerBar = inUnit.value.trim() === '' ? null : parseFloat(inUnit.value);
      G2.extendRight = inExt.checked;
      saveStored();
      close();
      if (onApply) onApply();
    };
    reset.onclick = () => { if (confirm('Сбросить все настройки к стандартным?')) { localStorage.removeItem(KEY); location.reload(); } };
  }

  window.LunSettings = { open, applyStored, saveStored };
})();
