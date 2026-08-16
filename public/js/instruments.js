/* =============================================================================
 *  instruments.js — поиск и выбор инструмента MOEX (как окно в TradingView)
 * =============================================================================
 *  Вкладки Фьючерсы / Акции, строка поиска, список с фильтрацией, клик — выбор.
 *  Списки тянутся с ISS один раз и кэшируются. Возвращает объект инструмента:
 *    { type, engine, market, ticker, assetCode?, title, pricePrecision, volumePrecision }
 * ===========================================================================*/
(function () {
  const cache = {};
  const today = () => new Date().toISOString().slice(0, 10);

  async function stocks() {
    if (cache.stocks) return cache.stocks;
    const rows = await window.LunISS.fetchSecuritiesList('stock', 'shares', 'SECID,SHORTNAME,BOARDID,DECIMALS');
    const seen = new Set(); const list = [];
    for (const r of rows) {
      if (r.BOARDID !== 'TQBR' || seen.has(r.SECID)) continue;      // основная секция акций
      seen.add(r.SECID);
      list.push({ type: 'stock', engine: 'stock', market: 'shares', ticker: r.SECID, title: r.SHORTNAME || r.SECID, pricePrecision: (+r.DECIMALS >= 0 ? +r.DECIMALS : 2), volumePrecision: 0 });
    }
    list.sort((a, b) => a.ticker.localeCompare(b.ticker));
    cache.stocks = list; return list;
  }

  async function futures() {
    if (cache.futures) return cache.futures;
    const rows = await window.LunISS.fetchSecuritiesList('futures', 'forts', 'SECID,SHORTNAME,ASSETCODE,LASTDELDATE,DECIMALS');
    const futRe = /^[A-Za-z]{1,3}[FGHJKMNQUVXZ]\d$/, t = today();
    const byAsset = new Map();                                       // ближний контракт на актив
    for (const r of rows) {
      if (!futRe.test(r.SECID || '') || !r.LASTDELDATE || r.LASTDELDATE < t) continue;
      const cur = byAsset.get(r.ASSETCODE);
      if (!cur || r.LASTDELDATE < cur.LASTDELDATE) byAsset.set(r.ASSETCODE, r);
    }
    const list = [...byAsset.values()].map((r) => ({
      type: 'futures', engine: 'futures', market: 'forts', assetCode: r.ASSETCODE, ticker: r.SECID,
      title: (r.SHORTNAME || r.SECID), pricePrecision: (+r.DECIMALS >= 0 ? +r.DECIMALS : 0), volumePrecision: 0,
    }));
    list.sort((a, b) => a.assetCode.localeCompare(b.assetCode));
    cache.futures = list; return list;
  }

  /* ---------- модалка ---------- */
  const css = `
  .in-search{width:100%;padding:8px 10px;font-size:14px;background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px}
  .in-tabs{display:flex;gap:6px;padding:8px 0}
  .in-list{max-height:52vh;overflow:auto;border-top:1px solid #1c2230}
  .in-row{display:flex;gap:10px;align-items:center;padding:6px 8px;cursor:pointer;border-bottom:1px solid #141a24}
  .in-row:hover{background:#1a2130}
  .in-tk{font-weight:600;min-width:88px;color:#d7deea}
  .in-nm{color:#8b93a7;font-size:12px;flex:1}
  .in-badge{font-size:10px;color:#6b7280;border:1px solid #2a3242;border-radius:4px;padding:0 5px}
  .lun-modal h2{display:flex;align-items:center;gap:6px}
  .in-ex{display:inline-flex;gap:4px}`;
  let cssAdded = false;
  function addCss() { if (cssAdded) return; const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); cssAdded = true; }

  const prov = (id) => window.LunProviders && window.LunProviders.get(id);

  async function open(onPick) {
    addCss();
    const bg = document.createElement('div'); bg.className = 'lun-modal-bg';
    const modal = document.createElement('div'); modal.className = 'lun-modal'; modal.style.width = 'min(560px,94vw)';
    modal.innerHTML = `<h2>Инструмент<span style="flex:1"></span>
        <span class="in-ex">
          <button class="lun-btn mini active" data-ex="moex">MOEX</button>
          <button class="lun-btn mini" data-ex="crypto">Крипта</button>
          <button class="lun-btn mini" data-ex="us">США</button>
        </span><span class="x" title="закрыть" style="margin-left:10px">×</span></h2>
      <div class="lun-sec">
        <input class="in-search" placeholder="Поиск по тикеру или названию…" />
        <div class="in-tabs" id="in-tabs">
          <button class="lun-btn mini active" data-t="futures">Фьючерсы</button>
          <button class="lun-btn mini" data-t="stocks">Акции</button>
        </div>
      </div>
      <div class="in-list" id="in-list"></div>`;
    bg.appendChild(modal); document.body.appendChild(bg);
    const close = () => bg.remove();
    modal.querySelector('.x').onclick = close; bg.onclick = (e) => { if (e.target === bg) close(); };

    const input = modal.querySelector('.in-search'), listEl = modal.querySelector('#in-list'), tabsEl = modal.querySelector('#in-tabs');
    let ex = 'moex', tab = 'futures', items = [], searchTimer = null;
    const cacheMoex = { futures: null, stocks: null };
    const info = (t) => { listEl.innerHTML = '<div style="padding:12px;color:#8b93a7">' + t + '</div>'; };
    const badge = { futures: 'фьюч', stock: 'акция', crypto: 'crypto', us: 'US' };

    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const shown = (ex === 'us' ? items : items.filter((x) => !q || (x.ticker || '').toLowerCase().includes(q) || (x.title || '').toLowerCase().includes(q))).slice(0, 300);
      if (!shown.length) { info(ex === 'us' && !q ? 'введите тикер (напр. NVDA, AAPL, SPY)…' : 'ничего не найдено'); return; }
      const bk = (x) => badge[x._kind] || badge[x.type] || '';
      listEl.innerHTML = shown.map((x, i) => `<div class="in-row" data-i="${i}"><span class="in-tk">${x.ticker}</span><span class="in-nm">${x.title}</span><span class="in-badge">${bk(x)}</span></div>`).join('');
      [...listEl.querySelectorAll('.in-row')].forEach((row) => { row.onclick = () => { close(); onPick(shown[+row.dataset.i]); }; });
    };
    const loadMoex = async () => {
      if (!cacheMoex[tab]) { info('загрузка списка…'); try { cacheMoex[tab] = tab === 'futures' ? await futures() : await stocks(); } catch (e) { info('не удалось: ' + e.message); return; } }
      items = cacheMoex[tab]; draw();
    };
    const loadCrypto = async () => {
      const p = prov('bybit'); if (!p) { info('провайдер крипты не подключён'); return; }
      info('загрузка списка Bybit…'); try { items = await p.searchSymbols(''); draw(); } catch (e) { info('не удалось: ' + e.message); }
    };
    const loadUs = async () => {
      const q = input.value.trim();
      if (!q) { items = []; draw(); return; }
      const p = prov('yahoo'); if (!p) { info('провайдер США не подключён'); return; }
      info('поиск…'); try { items = await p.searchSymbols(q); draw(); } catch (e) { info('не удалось: ' + e.message); }
    };
    const reload = () => { if (ex === 'moex') loadMoex(); else if (ex === 'crypto') loadCrypto(); else loadUs(); };

    input.oninput = () => {
      if (ex === 'us') { clearTimeout(searchTimer); searchTimer = setTimeout(loadUs, 300); }   // Yahoo — поиск по вводу
      else draw();
    };
    // биржи
    modal.querySelectorAll('.in-ex .lun-btn').forEach((btn) => btn.onclick = () => {
      ex = btn.dataset.ex; modal.querySelectorAll('.in-ex .lun-btn').forEach((x) => x.classList.remove('active')); btn.classList.add('active');
      tabsEl.style.display = ex === 'moex' ? 'flex' : 'none';
      input.placeholder = ex === 'us' ? 'тикер США (NVDA, AAPL, SPY)…' : (ex === 'crypto' ? 'символ (BTC, ETH, SOL)…' : 'тикер MOEX (SBER, GAZP, BR)…');
      items = []; reload();
    });
    // вкладки MOEX
    tabsEl.querySelectorAll('.lun-btn').forEach((btn) => btn.onclick = () => { tab = btn.dataset.t; tabsEl.querySelectorAll('.lun-btn').forEach((x) => x.classList.remove('active')); btn.classList.add('active'); loadMoex(); });

    input.focus();
    loadMoex();
  }

  window.LunInstruments = { open };
})();
