/* =============================================================================
 *  stream.js — реалтайм-поток (window.LunStream), Этап 4 ТЗ
 * =============================================================================
 *  Коннекторы (вкл/выкл пользователем):
 *    crypto → Bybit WebSocket (настоящий realtime, тик последней свечи)
 *    us     → Yahoo опросом (псевдо, ~15 мин задержка)
 *    moex   → ISS опросом (псевдо, ~15 мин задержка; истинный поток у MOEX платный)
 *  Один WS-сокет на биржу, подписки мультиплексируются. Автопереподключение с
 *  экспоненциальной задержкой + пинг. Обновление свечи через chart.updateData
 *  (точечно). При возврате вкладки — разовая дозагрузка REST (закрыть дыру).
 *  Заглушка «свой коннектор» (Finam/MOEX API) — в UI, здесь не реализуется.
 * ===========================================================================*/
(function () {
  const PROV2CONN = { moex: 'moex', bybit: 'crypto', binance: 'crypto', yahoo: 'us' };
  const enabled = { crypto: false, us: false, moex: false };
  const subs = new Map();                 // slotId -> { kind, topic?, handler?, timer?, refresh }
  let statusCb = null;
  const setStatus = (txt, color) => { if (statusCb) statusCb(txt, color); };

  /* ---- Bybit spot WebSocket (мультиплекс) ---- */
  const bybit = { ws: null, ready: false, topics: new Map(), backoff: 1000, ping: null };
  function bybitConnect() {
    if (bybit.ws) return;
    try { bybit.ws = new WebSocket('wss://stream.bybit.com/v5/public/spot'); } catch (e) { return; }
    bybit.ws.onopen = () => {
      bybit.ready = true; bybit.backoff = 1000; setStatus('поток: Bybit realtime', '#26a69a');
      const args = [...bybit.topics.keys()]; if (args.length) try { bybit.ws.send(JSON.stringify({ op: 'subscribe', args })); } catch (e) {}
      bybit.ping = setInterval(() => { try { bybit.ws.send(JSON.stringify({ op: 'ping' })); } catch (e) {} }, 20000);
    };
    bybit.ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m.topic || !m.data) return;
      const set = bybit.topics.get(m.topic); if (!set) return;
      const arr = Array.isArray(m.data) ? m.data : [m.data];
      for (const d of arr) {
        const bar = { timestamp: +d.start, open: +d.open, high: +d.high, low: +d.low, close: +d.close, volume: +d.volume };
        if (Number.isFinite(bar.timestamp)) set.forEach((h) => h(bar));
      }
    };
    bybit.ws.onclose = () => {
      bybit.ready = false; clearInterval(bybit.ping); bybit.ws = null;
      if (bybit.topics.size) { setStatus('поток: переподключение…', '#e0a030'); setTimeout(bybitConnect, bybit.backoff); bybit.backoff = Math.min(30000, bybit.backoff * 2); }
    };
    bybit.ws.onerror = () => { try { bybit.ws.close(); } catch (e) {} };
  }
  function bybitSub(topic, handler) {
    let set = bybit.topics.get(topic);
    if (!set) { set = new Set(); bybit.topics.set(topic, set); if (bybit.ready) try { bybit.ws.send(JSON.stringify({ op: 'subscribe', args: [topic] })); } catch (e) {} }
    set.add(handler); bybitConnect();
  }
  function bybitUnsub(topic, handler) {
    const set = bybit.topics.get(topic); if (!set) return;
    set.delete(handler);
    if (!set.size) { bybit.topics.delete(topic); if (bybit.ready) try { bybit.ws.send(JSON.stringify({ op: 'unsubscribe', args: [topic] })); } catch (e) {} }
  }

  /* ---- подписка/отписка на слот ---- */
  async function attach(slot) {
    detach(slot);
    if (!slot || !slot.instrument || !slot.chart) return;
    const provId = slot.instrument.provider || 'moex';
    const conn = PROV2CONN[provId];
    if (!conn || !enabled[conn]) return;                 // коннектор выключен
    // провайдер из реестра (crypto/us). У MOEX своего провайдера нет —
    // данные тянет iss-client через LunData.fetchFor, поэтому prov может быть null.
    const prov = window.LunProviders && window.LunProviders.get(provId);
    const ins = slot.instrument, tf = slot.tf;
    // KLineChart v10: свечу отдаём в колбэк subscribeBar (loader.pushBar),
    // он делает _addData(bar,"update") — обновляет последнюю или добавляет новую.
    const push = (bar) => { try { if (slot.loader && slot.loader.pushBar) slot.loader.pushBar(bar); } catch (e) {} };
    // REST-обновление последних баров (опрос и дозагрузка после фона). Один
    // источник на всех: LunData.fetchFor (умеет и MOEX, и провайдеры реестра).
    let symbolObj = { provider: provId, symbol: ins.symbol, ticker: ins.ticker, engine: ins.engine, market: ins.market };
    try { symbolObj.ticker = await window.LunData.resolveTicker(ins); if (!symbolObj.symbol) symbolObj.symbol = symbolObj.ticker; } catch (e) {}
    const pull = async () => {
      if (prov && prov.fetchCandles) return prov.fetchCandles(symbolObj, tf);
      return window.LunData.fetchFor(ins, tf);
    };
    const refresh = async () => { try { const b = await pull(); if (b && b.length) { push(b[b.length - 1]); if (b.length > 1) push(b[b.length - 2]); } } catch (e) {} };

    if (provId === 'bybit' && prov && prov.tfMap) {       // настоящий WS + страховочный опрос
      const iv = prov.tfMap[tf.id] || '60', sym = ins.symbol || symbolObj.ticker, topic = 'kline.' + iv + '.' + sym;
      bybitSub(topic, push);
      refresh();                                          // мгновенно подтянуть текущую свечу
      const timer = setInterval(refresh, 15000);          // резерв, если WS замолчит
      subs.set(slot.slotId, { kind: 'ws', topic, handler: push, refresh, timer });
      return;
    }
    // опрос (псевдо-реалтайм): MOEX и US
    const stepMs = ({ minute: 60000, hour: 3600000, day: 86400000 }[tf.type] || 3600000) * tf.span;
    const period = Math.max(5000, Math.min(30000, Math.floor(stepMs / 4)));
    const timer = setInterval(refresh, period); refresh();
    subs.set(slot.slotId, { kind: 'poll', timer, refresh });
    setStatus(conn === 'moex' ? 'поток: MOEX псевдо (опрос ~' + Math.round(period / 1000) + 'с)' : 'поток: ' + (prov ? prov.title : conn) + ' опрос', '#e0a030');
  }
  function detach(slot) {
    if (!slot) return; const s = subs.get(slot.slotId); if (!s) return;
    if (s.kind === 'ws') bybitUnsub(s.topic, s.handler);
    if (s.timer) clearInterval(s.timer);
    subs.delete(slot.slotId);
  }
  function detachAll() { subs.forEach((s) => { if (s.kind === 'ws') bybitUnsub(s.topic, s.handler); if (s.timer) clearInterval(s.timer); }); subs.clear(); }

  function setConnector(name, on, slots) {
    if (!(name in enabled)) return;
    enabled[name] = on;
    (slots || []).forEach((sl) => attach(sl));
    const any = Object.keys(enabled).some((k) => enabled[k]);
    if (!any) { setStatus('поток: выкл', '#6b7280'); return; }
    // включили коннектор, но среди открытых графиков нет подходящего инструмента —
    // подсказать, а не молчать (иначе выглядит как «не работает»)
    const matches = (slots || []).some((sl) => sl && sl.instrument && PROV2CONN[sl.instrument.provider || 'moex'] === name);
    if (on && !matches) {
      const human = { crypto: 'крипто (Bybit)', us: 'США (Yahoo)', moex: 'MOEX' }[name] || name;
      setStatus('поток: ' + human + ' вкл — откройте график этого рынка', '#e0a030');
    }
  }
  function isOn(provId) { const c = PROV2CONN[provId]; return !!(c && enabled[c]); }
  const connFor = (provId) => PROV2CONN[provId];
  const onStatus = (fn) => { statusCb = fn; setStatus('поток: выкл', '#6b7280'); };

  // возврат вкладки из фона — разовая дозагрузка (закрыть дыру)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') subs.forEach((s) => s.refresh && s.refresh()); });

  window.LunStream = { attach, detach, detachAll, setConnector, isOn, onStatus, connFor, enabled };
})();
